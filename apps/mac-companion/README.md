# metaflow mac companion

macOS native observation surface for local apps.

This companion is the desktop equivalent of the browser content script:

```text
macOS Accessibility
  -> frontmost app / focused control / selected text / text value
  -> observation.local_app.focus_changed
  -> observation.editor.text_changed
  -> Info Program runtime
  -> advice.writing_assist / draft.writing_continuation Views
```

It is intentionally a separate app package. Chrome extension capture, ACP, and the Info runtime do not depend on it.

## Run

Start the Info server first:

```bash
pnpm run http
```

Then run the mac companion:

```bash
pnpm run mac:run
```

The app appears in the macOS menu bar as `metaflow`. Use the menu to open the floating window or request Accessibility permission.

## Permission

macOS requires Accessibility permission before one process can inspect another app's focused UI element.

If the floating window says permission is needed, grant permission in:

```text
System Settings -> Privacy & Security -> Accessibility
```

For a SwiftPM debug run, the executable path is under:

```text
apps/mac-companion/.build/debug/metaflow-mac
```

## Configuration

Environment variables:

```bash
INFO_CONTEXT_INGEST_ENDPOINT=http://localhost:3111/context/ingest
METAFLOW_MAC_POLL_SECONDS=1.2
METAFLOW_MAC_MIN_WRITING_CHARS=24
METAFLOW_MAC_MAX_WRITING_CHARS=4000
METAFLOW_MAC_ALLOW_EXTERNAL_LLM=1
```

`METAFLOW_MAC_ALLOW_EXTERNAL_LLM` defaults to off. Enable it only when you want local app text to be eligible for external agent runtimes such as Claude Code.

## Current Boundaries

The first version observes and suggests. It does not write text back into local apps automatically.

That boundary is deliberate:

- reading focused controls and selected text uses Accessibility;
- writing back into WPS, Word, Mail, WeChat, or other apps needs stricter per-app behavior;
- user-gated insert should be implemented per surface after we know each app's safest API.

For WPS/Office, the preferred long-term path is still an app-specific add-in. The mac companion is the broad fallback layer for local apps that expose useful Accessibility text.
