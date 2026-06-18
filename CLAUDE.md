# Metaflow Agent Policy

## Chrome ACP current-page operation

For browser tasks in this project, operate the user's current Chrome page through Chrome ACP tools. Default to DOM-based tools.

Use these first:

- `mcp__browser__browser_current_read`
- `mcp__browser__browser_tabs`
- `mcp__browser__browser_activate_tab`
- `mcp__browser__browser_observe`
- `mcp__browser__browser_click`
- `mcp__browser__browser_type`
- `mcp__browser__browser_execute`

Do not use Chrome DevTools MCP tools:

- `mcp__chrome_devtools__*`

Do not use CDP/DevTools MCP for ordinary page interaction. Those tools can start a separate Chrome profile and operate the wrong page.

Do not call `mcp__browser__browser_open_tab` for a current-page task unless the user explicitly asks to open a new tab. If navigation is required, prefer the active tab or ask for confirmation.

Use `mcp__browser__browser_vision_act` only as a fallback when normal DOM tools cannot locate or operate the target. For normal inputs, buttons, links, and contenteditable fields, use observe/read/execute/click/type first.
