---
name: current-page-browser
description: Use when an agent needs to inspect or operate the page the user is currently viewing in Chrome through Chrome ACP. Prefer current-page browser tools and avoid external Chrome DevTools MCP sessions that open a separate browser.
---

# Current Page Browser

Use Chrome ACP current-page tools for any request about the user's visible Chrome page.

## Tool Policy

Prefer these tools:

```text
browser_current_read
browser_current_observe
browser_current_act
browser_current_vision_act
browser_current_debugger
```

Fallback to lower-level Chrome ACP tools only when a specific `tabId` is required:

```text
browser_tabs
browser_read
browser_observe
browser_act
browser_debugger
browser_vision_act
```

Do not use external Chrome DevTools MCP tools for current-page operation:

```text
mcp__chrome_devtools__*
```

Those tools may launch or attach to a separate debug browser/profile and can operate `about:blank` instead of the user's real page.

## Workflow

For reading:

```text
browser_current_read
```

For normal actions:

```text
browser_current_observe
browser_current_act
```

For visually complex pages or DOM failures:

```text
browser_current_vision_act
```

For screenshots, layout, PDF, or CDP diagnostics:

```text
browser_current_debugger
```

Do not open a new tab or browser unless the user explicitly asks.
