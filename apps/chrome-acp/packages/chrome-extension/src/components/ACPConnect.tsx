// Re-export from shared with browser tool handler configured.
//
// In addition to the upstream wiring, the chrome-acp extension remembers
// a per-browser "workspace cwd" in chrome.storage.local and forces the
// ACPClient's settings.cwd to track it. This way every new session
// defaults to that workspace unless the user has explicitly set their
// own "Working Directory" in the connection settings.

import { useEffect, useRef } from "react";
import { ACPConnect as SharedACPConnect, type ACPConnectProps as SharedACPConnectProps } from "@chrome-acp/shared/components";
import { executeBrowserTool } from "@/tools/browser";
import type { ACPClient } from "@chrome-acp/shared/acp";

// Default workspace for Chrome ACP sessions. The user can change this from the
// connection settings panel and the new value is persisted under WORKSPACE_CWD_KEY.
const DEFAULT_WORKSPACE_CWD = "/Users/junjie/info";
const LEGACY_DEFAULT_WORKSPACE_CWD = "/Users/junjie/info/.metaflow";
const WORKSPACE_CWD_KEY = "workspaceCwd";

function readStoredWorkspaceCwdSync(): string {
  // chrome.storage.local is async; for the very first paint we fall back
  // to the default. The async hydration in the effect below replaces it
  // before the first session/new message goes out.
  if (typeof chrome === "undefined" || !chrome.storage?.local) return DEFAULT_WORKSPACE_CWD;
  return DEFAULT_WORKSPACE_CWD;
}

function applyWorkspaceCwd(client: ACPClient, cwd: string): void {
  const current = client.getSettings();
  // Don't clobber an explicit user choice on the connection panel.
  if (current.cwd && current.cwd !== DEFAULT_WORKSPACE_CWD && current.cwd !== LEGACY_DEFAULT_WORKSPACE_CWD) return;
  if (current.cwd === cwd) return;
  client.updateSettings({ ...current, cwd });
}

function normalizeStoredWorkspaceCwd(value: unknown): string {
  if (typeof value !== "string" || value === LEGACY_DEFAULT_WORKSPACE_CWD) {
    return DEFAULT_WORKSPACE_CWD;
  }
  return value;
}

interface ChromeACPConnectProps {
  onClientReady?: (client: ACPClient | null) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  dangerouslyAutoApprovePermissions?: boolean;
}

export function ACPConnect({ onClientReady, expanded, onExpandedChange, dangerouslyAutoApprovePermissions = false }: ChromeACPConnectProps) {
  // Track the latest ACPClient so storage changes can re-apply the cwd.
  const clientRef = useRef<ACPClient | null>(null);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;

    // Async-hydrate the workspace cwd from storage and apply it to the
    // current client (if any). This covers the very first mount before
    // SharedACPConnect has created a client.
    chrome.storage.local.get([WORKSPACE_CWD_KEY], (items) => {
      const stored = normalizeStoredWorkspaceCwd(items?.[WORKSPACE_CWD_KEY]);
      if (clientRef.current) applyWorkspaceCwd(clientRef.current, stored);
    });

    // Listen for changes to the workspace cwd while the side panel is
    // open and re-apply them.
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return;
      const change = changes[WORKSPACE_CWD_KEY];
      if (!change || !clientRef.current) return;
      const next = normalizeStoredWorkspaceCwd(change.newValue);
      applyWorkspaceCwd(clientRef.current, next);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  return (
    <SharedACPConnect
      onClientReady={(client) => {
        clientRef.current = client;
        if (client) applyWorkspaceCwd(client, readStoredWorkspaceCwdSync());
        onClientReady?.(client);
      }}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      browserToolHandler={executeBrowserTool}
      showTokenInput
      autoConnect
      initialSettings={{ cwd: readStoredWorkspaceCwdSync(), dangerouslyAutoApprovePermissions }}
    />
  );
}
