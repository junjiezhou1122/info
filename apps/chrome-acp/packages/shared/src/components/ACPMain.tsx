import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  Columns2,
  FolderOpen,
  Globe2,
  History,
  MessageSquare,
  PanelRightClose,
  RefreshCw,
  TextQuote,
} from "lucide-react";
import type { ACPClient } from "../acp/client";
import type { AgentSessionInfo } from "../acp/types";
import { ChatInterface, type PromptContextPreview } from "./ChatInterface";
import { FileExplorer } from "./FileExplorer";
import { ThreadHistory } from "./ThreadHistory";
import { Button } from "./ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";

export interface ACPMainExtraTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  render: () => React.ReactNode;
}

interface ACPMainProps {
  client: ACPClient;
  // Forwarded to ChatInterface. The chrome extension uses it to inject
  // the active tab's url/title/text excerpt so the agent can answer
  // "what is on this page" without first calling browser_tabs.
  prependContext?: () => Promise<string | null>;
  previewContext?: () => Promise<PromptContextPreview | null>;
  dangerouslyAutoApprovePermissions?: boolean;
  incomingPrompt?: string | null;
  onIncomingPromptConsumed?: () => void;
  activeTabOverride?: string | null;
  onActiveTabOverrideConsumed?: () => void;
  // Optional extra tabs appended after the built-in chat/history/files tabs.
  // The chrome extension uses this to mount a Tasks tab that reads from
  // /context/views without coupling shared UI to chrome.* APIs.
  extraTabs?: ACPMainExtraTab[];
}

const TAB_ORDER = ["chat", "history", "files"] as const;
type BuiltinTabValue = (typeof TAB_ORDER)[number];
type TabValue = BuiltinTabValue | (string & {});

interface PanelDescriptor {
  id: TabValue;
  label: string;
  icon: React.ReactNode;
  render: () => React.ReactNode;
  singlePaneClassName?: string;
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(query);
    const handleChange = () => setMatches(media.matches);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}

function CurrentPagePanel({
  previewContext,
}: {
  previewContext?: () => Promise<PromptContextPreview | null>;
}) {
  const [context, setContext] = useState<PromptContextPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!previewContext) {
      setContext(null);
      return;
    }

    setLoading(true);
    try {
      const next = await previewContext();
      setContext(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to read current page");
      setContext(null);
    } finally {
      setLoading(false);
    }
  }, [previewContext]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 2000);
    window.addEventListener("focus", refresh);
    window.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("visibilitychange", refresh);
    };
  }, [refresh]);

  const Icon = context?.kind === "selection" ? TextQuote : Globe2;
  const isLink = context?.detail && /^https?:\/\//.test(context.detail);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium">
              {context?.label ?? "Current page"}
            </h2>
            {context?.source && (
              <p className="truncate text-xs text-muted-foreground">
                {context.source}
              </p>
            )}
          </div>
        </div>
        <Button
          aria-label="Refresh current page"
          title="Refresh current page"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </header>

      <div className="flex-1 min-h-0 overflow-auto p-3">
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : context ? (
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                Title
              </div>
              <div className="break-words text-sm font-medium">{context.title}</div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                {context.kind === "selection" ? "Selection" : "URL"}
              </div>
              {isLink ? (
                <a
                  className="break-all text-sm text-primary underline-offset-4 hover:underline"
                  href={context.detail}
                  rel="noreferrer"
                  target="_blank"
                >
                  {context.detail}
                </a>
              ) : (
                <p className="whitespace-pre-wrap break-words text-sm leading-6">
                  {context.detail}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            No readable browser page is available.
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Main container component that provides tabs for Chat, History, and File explorer.
 * Reference: Zed's AgentPanel with ThreadHistory integration
 * This component should be rendered after successful connection.
 */
export function ACPMain({
  client,
  prependContext,
  previewContext,
  dangerouslyAutoApprovePermissions,
  incomingPrompt,
  onIncomingPromptConsumed,
  activeTabOverride,
  onActiveTabOverrideConsumed,
  extraTabs,
}: ACPMainProps) {
  const [activeTab, setActiveTab] = useState<TabValue>("chat");
  const [splitOpen, setSplitOpen] = useState(false);
  const [sidePanelId, setSidePanelId] = useState<TabValue>("files");
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    if (!activeTabOverride) return;
    setActiveTab(activeTabOverride as TabValue);
    onActiveTabOverrideConsumed?.();
  }, [activeTabOverride, onActiveTabOverrideConsumed]);

  // Handle session selection from history
  // Reference: Zed's connection_view.rs line 616-631
  // Zed prioritizes load_session (with history), falls back to resume_session (without history)
  const handleSelectSession = useCallback(async (session: AgentSessionInfo) => {
    try {
      if (client.supportsLoadSession) {
        // load_session replays full history
        await client.loadSession({ sessionId: session.sessionId, cwd: session.cwd });
      } else if (client.supportsResumeSession) {
        // resume_session starts without replaying history
        await client.resumeSession({ sessionId: session.sessionId, cwd: session.cwd });
      } else {
        throw new Error("Loading or resuming sessions is not supported by this agent.");
      }
      // Switch to chat tab after loading
      setActiveTab("chat");
    } catch (error) {
      console.error("Failed to load/resume session:", error);
    }
  }, [client]);

  // Check if an element or its ancestors can scroll horizontally
  const isInHorizontalScrollableArea = useCallback((element: HTMLElement | null): boolean => {
    while (element) {
      if (element.scrollWidth > element.clientWidth) {
        const style = window.getComputedStyle(element);
        const overflowX = style.overflowX;
        if (overflowX === "auto" || overflowX === "scroll") {
          return true;
        }
      }
      element = element.parentElement;
    }
    return false;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Don't track swipe if starting in a horizontally scrollable area
    if (isInHorizontalScrollableArea(e.target as HTMLElement)) {
      touchStartX.current = null;
      touchStartY.current = null;
      return;
    }
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, [isInHorizontalScrollableArea]);

  const panelDescriptors = useMemo<PanelDescriptor[]>(() => {
    const panels: PanelDescriptor[] = [
      {
        id: "chat",
        label: "Chat",
        icon: <MessageSquare className="h-4 w-4" />,
        singlePaneClassName: "max-w-2xl mx-auto",
        render: () => (
          <ChatInterface
            client={client}
            prependContext={prependContext}
            previewContext={previewContext}
            dangerouslyAutoApprovePermissions={dangerouslyAutoApprovePermissions}
            incomingPrompt={incomingPrompt}
            onIncomingPromptConsumed={onIncomingPromptConsumed}
          />
        ),
      },
      {
        id: "history",
        label: "History",
        icon: <History className="h-4 w-4" />,
        singlePaneClassName: "max-w-2xl mx-auto",
        render: () => (
          <ThreadHistory client={client} onSelectSession={handleSelectSession} />
        ),
      },
      {
        id: "files",
        label: "Files",
        icon: <FolderOpen className="h-4 w-4" />,
        render: () => <FileExplorer client={client} />,
      },
    ];

    for (const tab of extraTabs ?? []) {
      panels.push({
        id: tab.id,
        label: tab.label,
        icon: tab.icon,
        render: tab.render,
      });
    }

    if (previewContext) {
      panels.push({
        id: "web",
        label: "Web",
        icon: <Globe2 className="h-4 w-4" />,
        render: () => <CurrentPagePanel previewContext={previewContext} />,
      });
    }

    return panels;
  }, [
    client,
    dangerouslyAutoApprovePermissions,
    extraTabs,
    handleSelectSession,
    incomingPrompt,
    onIncomingPromptConsumed,
    prependContext,
    previewContext,
  ]);

  const sidePanel = panelDescriptors.find((panel) => panel.id === sidePanelId);
  const availableSidePanels = panelDescriptors.filter(
    (panel) => panel.id !== activeTab && panel.id !== "chat",
  );
  const primaryPanels = panelDescriptors.filter((panel) => panel.id !== "web");

  const pickFallbackSidePanel = useCallback((nextActiveTab: TabValue) => {
    const preferredOrder: TabValue[] = ["files", "web", "tasks", "learn", "history"];
    return (
      preferredOrder.find((id) => id !== nextActiveTab && panelDescriptors.some((panel) => panel.id === id)) ??
      panelDescriptors.find((panel) => panel.id !== nextActiveTab && panel.id !== "chat")?.id ??
      nextActiveTab
    );
  }, [panelDescriptors]);

  useEffect(() => {
    if (!splitOpen) return;
    const sideStillAvailable = panelDescriptors.some((panel) => panel.id === sidePanelId);
    if (sidePanelId === activeTab || sidePanelId === "chat" || !sideStillAvailable) {
      setSidePanelId(pickFallbackSidePanel(activeTab));
    }
  }, [activeTab, panelDescriptors, pickFallbackSidePanel, sidePanelId, splitOpen]);

  const handleTabChange = useCallback((value: string) => {
    const nextTab = value as TabValue;
    setActiveTab(nextTab);
    if (splitOpen && nextTab === sidePanelId) {
      setSidePanelId(pickFallbackSidePanel(nextTab));
    }
  }, [pickFallbackSidePanel, sidePanelId, splitOpen]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    // Only trigger if horizontal swipe is dominant and significant
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      const panelIds = panelDescriptors
        .filter((panel) => panel.id !== "web")
        .map((panel) => panel.id);
      const currentIndex = panelIds.indexOf(activeTab);
      if (deltaX < 0 && currentIndex >= 0 && currentIndex < panelIds.length - 1) {
        // Swipe left → next tab
        const nextTab = panelIds[currentIndex + 1];
        if (nextTab) setActiveTab(nextTab);
      } else if (deltaX > 0 && currentIndex > 0) {
        // Swipe right → previous tab
        const previousTab = panelIds[currentIndex - 1];
        if (previousTab) setActiveTab(previousTab);
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  }, [activeTab, panelDescriptors]);

  const renderPanelShell = (panel: PanelDescriptor | undefined, splitSide: "primary" | "secondary") => {
    if (!panel) return null;
    const isPrimary = splitSide === "primary";

    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        {!isPrimary && (
          <header className="flex shrink-0 items-center justify-between gap-2 border-b px-2 py-1.5">
            <div className="flex min-w-0 items-center gap-2">
              {panel.icon}
              <span className="truncate text-sm font-medium">{panel.label}</span>
            </div>
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
              {availableSidePanels.map((candidate) => (
                <Tooltip key={candidate.id}>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={`Show ${candidate.label}`}
                      title={candidate.label}
                      size="icon"
                      variant={candidate.id === panel.id ? "secondary" : "ghost"}
                      className="h-7 w-7"
                      onClick={() => setSidePanelId(candidate.id)}
                    >
                      {candidate.icon}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{candidate.label}</TooltipContent>
                </Tooltip>
              ))}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Close split"
                    title="Close split"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setSplitOpen(false)}
                  >
                    <PanelRightClose className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close split</TooltipContent>
              </Tooltip>
            </div>
          </header>
        )}
        <div className="flex-1 min-h-0 overflow-hidden">{panel.render()}</div>
      </div>
    );
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleTabChange}
      className="flex flex-col h-full min-h-0 w-full"
    >
      <div className="flex shrink-0 items-center justify-center gap-2 px-2 pt-2">
        <TabsList className="min-w-0 max-w-full overflow-x-auto">
          {panelDescriptors
            .filter((panel) => panel.id !== "web")
            .map((panel) => (
              <TabsTrigger key={panel.id} value={panel.id} className="gap-1.5">
                {panel.icon}
                <span>{panel.label}</span>
              </TabsTrigger>
            ))}
        </TabsList>
        {panelDescriptors.length > 1 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={splitOpen ? "Close split" : "Open split"}
                title={splitOpen ? "Close split" : "Open split"}
                size="icon"
                variant={splitOpen ? "secondary" : "ghost"}
                className="h-9 w-9"
                onClick={() => {
                  if (!splitOpen && sidePanelId === activeTab) {
                    setSidePanelId(pickFallbackSidePanel(activeTab));
                  }
                  setSplitOpen((open) => !open);
                }}
              >
                <Columns2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{splitOpen ? "Close split" : "Open split"}</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div
        className="flex-1 flex flex-col min-h-0 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {isDesktop ? (
          <ResizablePanelGroup direction="horizontal" className="min-h-0">
            <ResizablePanel defaultSize={splitOpen ? 58 : 100} minSize={32}>
              <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {primaryPanels.map((panel) => (
                  <TabsContent
                    key={panel.id}
                    value={panel.id}
                    forceMount
                    hidden={activeTab !== panel.id}
                    className={[
                      "flex flex-col h-full min-h-0 m-0 w-full",
                      panel.singlePaneClassName,
                    ].filter(Boolean).join(" ")}
                  >
                    {panel.render()}
                  </TabsContent>
                ))}
              </div>
            </ResizablePanel>
            {splitOpen && sidePanel && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={42} minSize={24}>
                  <aside className="flex h-full min-h-0 w-full border-l bg-background">
                    {renderPanelShell(sidePanel, "secondary")}
                  </aside>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        ) : (
          <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {primaryPanels.map((panel) => (
                <TabsContent
                  key={panel.id}
                  value={panel.id}
                  forceMount
                  hidden={activeTab !== panel.id}
                  className={[
                    "flex flex-col h-full min-h-0 m-0 w-full",
                    panel.singlePaneClassName,
                  ].filter(Boolean).join(" ")}
                >
                  {panel.render()}
                </TabsContent>
              ))}
            </div>
            {splitOpen && sidePanel && (
              <aside className="flex h-[42%] min-h-[240px] w-full shrink-0 border-t bg-background">
                {renderPanelShell(sidePanel, "secondary")}
              </aside>
            )}
          </div>
        )}
      </div>
    </Tabs>
  );
}
