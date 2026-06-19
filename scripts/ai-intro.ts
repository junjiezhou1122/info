import { exec } from "child_process";

const ASCII_ART = `
\x1b[35m███╗   ███╗███████╗████████╗ █████╗ ███████╗██╗      ██████╗ ██╗    ██╗
████╗ ████║██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║     ██╔═══██╗██║    ██║
██╔████╔██║█████╗     ██║   ███████║█████╗  ██║     ██║   ██║██║ █╗ ██║
██║╚██╔╝██║██╔══╝     ██║   ██╔══██║██╔══╝  ██║     ██║   ██║██║███╗██║
██║ ╚═╝ ██║███████╗   ██║   ██║  ██║██║     ███████╗╚██████╔╝╚███╔███╔╝
╚═╝     ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝ \x1b[0m
`;

const lines = [
  { text: "Hello, I am Antigravity, your ambient intelligence agent.", voice: "Hello, I am Antigravity, your ambient intelligence agent." },
  { text: "Welcome to Metaflow: a local-first, agent-native context runtime.", voice: "Welcome to Metaflow: a local-first, agent-native context runtime." },
  { text: "Unlike traditional RAG memory that blindly saves logs and runs expensive search,", voice: "Unlike traditional RAG memory that blindly saves logs and runs expensive search," },
  { text: "Metaflow compresses observations into a task-specific ViewGraph.", voice: "Metaflow compresses observations into a task-specific ViewGraph." },
  { text: "Today, I'll show you how we observe facts, derive Views, and empower your daily apps.", voice: "Today, I will show you how we observe facts, derive Views, and empower your daily apps." }
];

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    // macOS 'say' command to speak text
    exec(`say "${text.replace(/"/g, '\\"')}"`, () => {
      resolve();
    });
  });
}

async function printTypewriter(text: string, speed = 40) {
  for (let i = 0; i < text.length; i++) {
    process.stdout.write(text[i]);
    await sleep(speed);
  }
  process.stdout.write("\n");
}

async function run() {
  console.clear();
  console.log(ASCII_ART);
  await sleep(1000);

  console.log("\x1b[36m[Metaflow Ambient Agent Influx] Online...\x1b[0m\n");
  await sleep(1500);

  for (const line of lines) {
    process.stdout.write("\x1b[32mAgent: \x1b[0m");
    // Speak asynchronously, but write text in typewriter effect
    const speaker = speak(line.voice);
    await printTypewriter(line.text, 35);
    await speaker; // Wait for speech to finish before next line
    await sleep(400);
  }

  console.log("\n\x1b[35m[Intro sequence complete. Ready for manual control.]\x1b[0m\n");
}

run().catch(console.error);
