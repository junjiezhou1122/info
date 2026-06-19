---
name: ask-gemini
description: Use when the user wants to ask Gemini a question. Opens a new Gemini tab, submits the question, waits for the full response, and displays it.
---

# Ask Gemini

Open Gemini in a new browser tab, submit a question, and return the full response.

## Workflow

1. Open a new tab to `https://gemini.google.com` using `browser_open_tab` and record the `tab_id`.

2. Wait for the page to load — confirm with `browser_execute`:
   ```js
   return document.readyState;
   ```

3. Type the question using `browser_execute`:
   ```js
   const ta = document.querySelector('rich-textarea');
   ta.click(); ta.focus();
   document.execCommand('selectAll', false, null);
   document.execCommand('insertText', false, '<QUESTION>');
   return ta.textContent;
   ```

4. Click send using `browser_execute`:
   ```js
   const btn = document.querySelector('button[aria-label="Send message"]');
   btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
   return !!btn;
   ```

5. Poll until streaming stops (no "Stop response" button), then read the response:
   ```js
   const streaming = !!document.querySelector('button[aria-label="Stop response"]');
   const last = document.querySelectorAll('model-response');
   return { streaming, text: last[last.length-1]?.innerText };
   ```
   Re-run step 5 until `streaming` is `false`.

6. Display the full response text to the user.

## Notes

- Always use the `tab_id` returned by `browser_open_tab` for all subsequent `browser_execute` calls.
- If the `rich-textarea` is not found on first try, wait 1s and retry once.
- Do not call `browser_open_tab` if the user is already on `gemini.google.com` — reuse the active tab.
