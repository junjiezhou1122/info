import { useCallback, useEffect, useState } from "react";
import { BookOpen, Sparkles } from "lucide-react";
import { ACPConnect } from "@/components/ACPConnect";
import { ACPMain } from "@chrome-acp/shared/components";
import { TasksView } from "@/components/TasksView";
import { LanguageReviewView } from "@/components/LanguageReviewView";
import { ThemeProvider } from "@chrome-acp/shared/lib";
import type { ACPClient } from "@chrome-acp/shared/acp";
import { buildActiveTabContext, previewActiveTabContext } from "@/lib/active-tab-context";
import "./index.css";

const DANGEROUSLY_AUTO_APPROVE_PERMISSIONS = true;

export function App() {
  const [client, setClient] = useState<ACPClient | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [incomingPrompt, setIncomingPrompt] = useState<string | null>(null);
  const [activeTabOverride, setActiveTabOverride] = useState<string | null>(null);

  // Active tab context is collected on every send. The chrome-acp
  // session by itself does not know about the user's current tab, so
  // we inject url/title/excerpt before the agent sees the prompt.
  const prependContext = useCallback(async (): Promise<string | null> => {
    try {
      return await buildActiveTabContext();
    } catch (error) {
      console.warn("[App] buildActiveTabContext failed:", error);
      return null;
    }
  }, []);

  const previewContext = useCallback(async () => {
    try {
      return await previewActiveTabContext();
    } catch (error) {
      console.warn("[App] previewActiveTabContext failed:", error);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const consumePendingPrompt = async () => {
      try {
        const response = await chrome.runtime.sendMessage({ type: "sidepanel.consume-pending-prompt" });
        if (cancelled || !response?.ok || !response.pending?.payload?.selected_text) return;
        const payload = response.pending.payload;
        const action = response.pending.action;
        const selected = String(payload.selected_text).trim();
        const title = payload.title ? `Page: ${payload.title}` : "";
        const url = payload.url ? `URL: ${payload.url}` : "";
        const instruction = typeof action?.prompt === "string" && action.prompt.trim()
          ? action.prompt.trim()
          : "Explain this selected text in plain language. Keep it concise, and mention the page context if it matters.";
        const prompt = [
          instruction,
          title,
          url,
          "",
          "Selected text:",
          selected,
        ].filter(Boolean).join("\n");
        setIncomingPrompt(prompt);
        setActiveTabOverride("chat");
      } catch (error) {
        console.warn("[App] consume pending sidepanel prompt failed:", error);
      }
    };

    void consumePendingPrompt();
    const timer = window.setInterval(() => void consumePendingPrompt(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <ThemeProvider>
      <div className="flex flex-col h-dvh w-full">
        {/* Unified Connection Bar */}
        <ACPConnect
          onClientReady={setClient}
          expanded={expanded}
          onExpandedChange={setExpanded}
          dangerouslyAutoApprovePermissions={DANGEROUSLY_AUTO_APPROVE_PERMISSIONS}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          {client ? (
            <ACPMain
              client={client}
              prependContext={prependContext}
              previewContext={previewContext}
              dangerouslyAutoApprovePermissions={DANGEROUSLY_AUTO_APPROVE_PERMISSIONS}
              incomingPrompt={incomingPrompt}
              onIncomingPromptConsumed={() => setIncomingPrompt(null)}
              activeTabOverride={activeTabOverride}
              onActiveTabOverrideConsumed={() => setActiveTabOverride(null)}
              extraTabs={[
                {
                  id: "tasks",
                  label: "Tasks",
                  icon: <Sparkles className="h-4 w-4" />,
                  render: () => <TasksView />,
                },
                {
                  id: "learn",
                  label: "Learn",
                  icon: <BookOpen className="h-4 w-4" />,
                  render: () => <LanguageReviewView />,
                },
              ]}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground p-4">
              <div className="text-center">
                <p className="text-lg mb-2">No agent connected</p>
                <p className="text-sm">Click the status bar above to configure connection</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </ThemeProvider>
  );
}

export default App;
