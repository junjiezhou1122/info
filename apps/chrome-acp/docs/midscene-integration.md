# Midscene Vision Automation Integration

Chrome ACP can optionally use Midscene behind its built-in HTTP MCP server.

This gives the agent a visual automation fallback for pages where DOM selectors are brittle, such as ChatGPT, Gemini, Xianyu, Notion, Google Docs, canvas-heavy apps, and icon-only controls.

## Enable

1. Install and enable the Midscene Chrome extension.
2. In the Midscene extension, enable Bridge Mode and allow current-tab control when prompted.
3. Export model configuration:

```bash
export CHROME_ACP_MIDSCENE=1
export MIDSCENE_MODEL_BASE_URL="https://openrouter.ai/api/v1"
export MIDSCENE_MODEL_API_KEY="..."
export MIDSCENE_MODEL_NAME="qwen/qwen3.7-plus"
export MIDSCENE_MODEL_FAMILY="qwen3"
```

4. Restart the Chrome ACP proxy:

```bash
node /Users/junjie/info/apps/chrome-acp/packages/proxy-server/dist/cli/bin.js \
  --host localhost \
  --port 9315 \
  --no-auth \
  --cwd /Users/junjie/info/.metaflow \
  claude-code-acp
```

5. Reload the Chrome ACP extension from:

```text
/Users/junjie/info/apps/chrome-acp/packages/chrome-extension
```

## Runtime Shape

ACP session setup injects:

- `browser`: Chrome ACP's built-in HTTP MCP server for DOM/read/tools.

The HTTP MCP server exposes `browser_vision_act`. That tool uses `@midscene/web/bridge-mode` and `AgentOverChromeBridge` internally, then forwards natural-language visual actions to the Midscene Chrome extension Bridge.

This wrapper is necessary because the current `claude-code-acp` agent advertises HTTP/SSE MCP support but not stdio MCP support, while Midscene's official MCP server is stdio-based.

Recommended agent policy:

```text
1. Try browser_observe / browser_act for fast DOM/accessibility-based actions.
2. If the element is not found, click misses, or the page is visually complex, use browser_vision_act.
3. Verify with browser_read/browser_observe or Midscene assertions.
```

## Notes

Midscene commands need a strong vision-grounding model. If no model env is set, do not enable `CHROME_ACP_MIDSCENE`; the MCP server may start but actions will fail at inference time.
