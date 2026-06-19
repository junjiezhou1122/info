import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const framesDir = join(here, "frames");
const htmlPath = join(here, "index.html");
const outPath = join(here, "info-intro-part1.mp4");
const width = 1280;
const height = 720;
const sourceFps = Number(process.env.INFO_INTRO_SOURCE_FPS ?? 6);
const outputFps = Number(process.env.INFO_INTRO_OUTPUT_FPS ?? 30);
let durationMs = 96_000;
let totalFrames = Math.round((durationMs / 1000) * sourceFps);

if (!existsSync(chrome)) {
  throw new Error(`Chrome not found at ${chrome}`);
}

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const profileDir = join(here, ".chrome-profile");
rmSync(profileDir, { recursive: true, force: true });
mkdirSync(profileDir, { recursive: true });

const chromeArgs = [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  `--user-data-dir=${profileDir}`,
  `--window-size=${width},${height}`,
  "--remote-debugging-port=9224",
  `file://${htmlPath}`,
];

const child = spawn(chrome, chromeArgs, { stdio: ["ignore", "pipe", "pipe"] });
child.stderr.on("data", (chunk) => {
  const text = String(chunk);
  if (!text.includes("DevTools listening")) process.stderr.write(text);
});

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function jsonFetch(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} failed: ${response.status}`);
  return response.json();
}

async function waitForTab() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const tabs = await jsonFetch("http://127.0.0.1:9224/json");
      const tab = tabs.find((item) => item.url?.startsWith("file://") && item.webSocketDebuggerUrl);
      if (tab) return tab;
    } catch {
      await sleep(250);
    }
  }
  throw new Error("Timed out waiting for Chrome debug tab");
}

function wsRequest(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ws.nextId++;
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      ws.removeEventListener("message", onMessage);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    ws.addEventListener("message", onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  try {
    const tab = await waitForTab();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    ws.nextId = 1;
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });

    await wsRequest(ws, "Page.enable");
    await wsRequest(ws, "Runtime.enable");
    await wsRequest(ws, "Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const duration = await wsRequest(ws, "Runtime.evaluate", {
      expression: "window.__videoDurationMs || 96000",
      returnByValue: true,
    });
    if (typeof duration.result?.value === "number" && Number.isFinite(duration.result.value)) {
      durationMs = duration.result.value;
      totalFrames = Math.round((durationMs / 1000) * sourceFps);
    }

    for (let frame = 0; frame < totalFrames; frame += 1) {
      const ms = Math.round((frame / sourceFps) * 1000);
      await wsRequest(ws, "Runtime.evaluate", {
        expression: `window.__setVideoTime(${ms})`,
        awaitPromise: true,
      });
      const shot = await wsRequest(ws, "Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
      });
      const framePath = join(framesDir, `frame-${String(frame).padStart(5, "0")}.png`);
      await writeFile(framePath, Buffer.from(shot.data, "base64"));
      if (frame % sourceFps === 0) {
        process.stdout.write(`rendered ${Math.round(frame / sourceFps)}s / ${Math.round(durationMs / 1000)}s\n`);
      }
    }

    ws.close();
  } finally {
    child.kill("SIGTERM");
  }

  const ffmpeg = spawnSync("ffmpeg", [
    "-y",
    "-framerate", String(sourceFps),
    "-i", join(framesDir, "frame-%05d.png"),
    "-r", String(outputFps),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outPath,
  ], { stdio: "inherit" });

  if (ffmpeg.status !== 0) {
    throw new Error(`ffmpeg failed with status ${ffmpeg.status}`);
  }

  console.log(`Wrote ${resolve(outPath)}`);
}

main().catch((error) => {
  child.kill("SIGTERM");
  console.error(error);
  process.exit(1);
});
