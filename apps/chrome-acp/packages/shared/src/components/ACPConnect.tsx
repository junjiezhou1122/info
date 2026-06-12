import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui/button";
import { StatusDot } from "./ui/connection-status";
import { ThemeToggle } from "./ui/theme-toggle";
import { Label } from "./ui/label";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "./ui/input-group";
import { ACPClient, DEFAULT_SETTINGS, DisconnectRequestedError } from "../acp";
import type { ACPSettings, ConnectionState, BrowserToolParams, BrowserToolResult } from "../acp";
import { ChevronDown, FolderOpen, Globe, Image, KeyRound, ScanLine, ShieldCheck, X } from "lucide-react";
import { useQRScanner, type QRCodeData } from "../hooks";

const ADVANCED_BROWSER_CONTROL_KEY = "advanced_browser_control";

type AdvancedBrowserControlSettings = {
  enabled: boolean;
  allowedDomains: string[];
  deniedDomains: string[];
  requireConfirmForHighRisk: boolean;
};

const DEFAULT_ADVANCED_BROWSER_CONTROL: AdvancedBrowserControlSettings = {
  enabled: false,
  allowedDomains: [],
  deniedDomains: [],
  requireConfirmForHighRisk: true,
};

function getChromeStorage() {
  const maybeChrome = globalThis.chrome as typeof chrome | undefined;
  return maybeChrome?.storage?.local;
}

function normalizeDomains(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
    .filter((domain, index, all) => all.indexOf(domain) === index);
}

function domainFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// Get token from URL query param (for pre-filled URLs from server)
function getTokenFromUrl(): string | undefined {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("token") || undefined;
  } catch {
    return undefined;
  }
}

// Infer WebSocket URL from current page URL (for pre-filled links from server)
// e.g., http://localhost:9315/app?token=xxx -> ws://localhost:9315/ws
function inferProxyUrlFromPage(): string | undefined {
  try {
    const url = new URL(window.location.href);
    // Only infer if we have a token param (indicates user came from server-printed URL)
    if (!url.searchParams.has("token")) {
      return undefined;
    }
    const protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${url.host}/ws`;
  } catch {
    return undefined;
  }
}

// Get initial settings from defaults, with optional URL overrides
function getInitialSettings(inferFromUrl: boolean, initialSettings?: Partial<ACPSettings>): ACPSettings {
  const settings = { ...DEFAULT_SETTINGS, ...initialSettings };

  // Override from URL if enabled (for pre-filled links from server)
  if (inferFromUrl) {
    const urlToken = getTokenFromUrl();
    const inferredUrl = inferProxyUrlFromPage();

    if (urlToken) {
      settings.token = urlToken;
    }
    if (inferredUrl) {
      settings.proxyUrl = inferredUrl;
    }
  }

  return settings;
}

export interface ACPConnectProps {
  onClientReady?: (client: ACPClient | null) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Handler for browser tool calls (only Chrome extension can execute these) */
  browserToolHandler?: (params: BrowserToolParams) => Promise<BrowserToolResult>;
  /** Show token input field (for remote access) */
  showTokenInput?: boolean;
  /** Infer proxy URL and token from page URL (for PWA) */
  inferFromUrl?: boolean;
  /** Placeholder for proxy URL input */
  placeholder?: string;
  /** Show QR code scan button (for mobile) */
  showScanButton?: boolean;
  /** Automatically connect on mount with the current settings. */
  autoConnect?: boolean;
  /** Initial settings supplied by host shells such as the Chrome extension. */
  initialSettings?: Partial<ACPSettings>;
}

export function ACPConnect({
  onClientReady,
  expanded,
  onExpandedChange,
  browserToolHandler,
  showTokenInput = false,
  inferFromUrl = false,
  placeholder = "Proxy server URL",
  showScanButton = false,
  autoConnect = false,
  initialSettings,
}: ACPConnectProps) {
  const [settings, setSettings] = useState<ACPSettings>(() => getInitialSettings(inferFromUrl, initialSettings));
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [client, setClient] = useState<ACPClient | null>(null);
  const [maxHeight, setMaxHeight] = useState<number>(200);
  const [advancedControl, setAdvancedControl] = useState<AdvancedBrowserControlSettings>(DEFAULT_ADVANCED_BROWSER_CONTROL);
  const [advancedControlLoaded, setAdvancedControlLoaded] = useState(false);
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hasAutoCollapsedRef = useRef(false);
  const pendingAutoConnectRef = useRef(false);
  const hasAttemptedInitialAutoConnectRef = useRef(false);
  // Store initial settings in a ref to avoid eslint warning about empty deps
  const initialSettingsRef = useRef<ACPSettings>(settings);

  // QR Scanner hook
  const handleQRScan = useCallback((data: QRCodeData) => {
    // Mark for auto-connect (will be triggered by settings useEffect)
    pendingAutoConnectRef.current = true;
    // Update settings - this will trigger auto-connect via useEffect
    setSettings((prev) => ({
      ...prev,
      proxyUrl: data.url,
      token: data.token,
    }));
  }, []);

  const handleQRError = useCallback((errorMsg: string) => {
    setError(errorMsg);
  }, []);

  const { isScanning, videoRef, startScanning, stopScanning, scanFromFile } = useQRScanner({
    onScan: handleQRScan,
    onError: handleQRError,
  });

  const showAdvancedBrowserControl = Boolean(browserToolHandler && getChromeStorage());

  // Recalculate maxHeight after DOM updates (when expanded or isScanning changes)
  useLayoutEffect(() => {
    if (expanded && contentRef.current) {
      setMaxHeight(contentRef.current.scrollHeight);
    }
  }, [expanded, isScanning, showAdvancedBrowserControl, advancedControl, activeDomain]);

  // File input ref for album scanning
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection from album
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        await scanFromFile(file);
        stopScanning(); // Close the scanner overlay after album scan
      }
      // Reset input to allow re-selecting the same file
      e.target.value = "";
    },
    [scanFromFile, stopScanning]
  );

  // Open file picker
  const handleSelectFromAlbum = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Initialize client once on mount using initial settings from ref
  useEffect(() => {
    const acpClient = new ACPClient(initialSettingsRef.current);
    acpClient.setConnectionStateHandler((state, err) => {
      setConnectionState(state);
      setError(err || null);
    });

    setClient(acpClient);

    return () => {
      acpClient.disconnect();
    };
  }, []);

  // Register browser tool handler when it changes
  useEffect(() => {
    if (client && browserToolHandler) {
      client.setBrowserToolCallHandler(browserToolHandler);
    }
  }, [client, browserToolHandler]);

  useEffect(() => {
    if (!showAdvancedBrowserControl) return;
    const storage = getChromeStorage();
    if (!storage) return;
    let cancelled = false;
    storage.get(ADVANCED_BROWSER_CONTROL_KEY).then((stored) => {
      if (cancelled) return;
      const value = stored?.[ADVANCED_BROWSER_CONTROL_KEY] as Partial<AdvancedBrowserControlSettings> | undefined;
      setAdvancedControl({
        enabled: value?.enabled === true,
        allowedDomains: Array.isArray(value?.allowedDomains) ? value.allowedDomains : [],
        deniedDomains: Array.isArray(value?.deniedDomains) ? value.deniedDomains : [],
        requireConfirmForHighRisk: value?.requireConfirmForHighRisk !== false,
      });
      setAdvancedControlLoaded(true);
    }).catch(() => setAdvancedControlLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [showAdvancedBrowserControl]);

  useEffect(() => {
    if (!showAdvancedBrowserControl) return;
    const maybeChrome = globalThis.chrome as typeof chrome | undefined;
    maybeChrome?.tabs?.query?.({ active: true, lastFocusedWindow: true }).then(([tab]) => {
      setActiveDomain(domainFromUrl(tab?.url));
    }).catch(() => setActiveDomain(null));
  }, [showAdvancedBrowserControl, expanded]);

  // Update client settings when settings change, and auto-connect if pending
  useEffect(() => {
    if (client) {
      client.updateSettings(settings);

      // Auto-connect after QR scan (when pendingAutoConnectRef is set)
      if (pendingAutoConnectRef.current) {
        pendingAutoConnectRef.current = false;
        client.connect().catch((e) => {
          // Ignore disconnect requested - user cancelled intentionally
          if (e instanceof DisconnectRequestedError) {
            return;
          }
          setError((e as Error).message);
          setIsShaking(true);
          setTimeout(() => setIsShaking(false), 500);
          onExpandedChange(true);
        });
      }
    }
  }, [settings, client, onExpandedChange]);

  // Notify parent when client is ready and auto-collapse on connect
  useEffect(() => {
    const isConnected = connectionState === "connected";
    onClientReady?.(isConnected ? client : null);

    // Auto-collapse when connected for the first time
    if (isConnected && !hasAutoCollapsedRef.current) {
      hasAutoCollapsedRef.current = true;
      onExpandedChange(false);
    }

    // Reset auto-collapse flag when disconnected
    if (connectionState === "disconnected") {
      hasAutoCollapsedRef.current = false;
    }
  }, [connectionState, client, onClientReady, onExpandedChange]);

  const handleConnect = useCallback(async () => {
    // Prevent duplicate connect calls if already connecting or connected
    if (!client || connectionState === "connecting" || connectionState === "connected") {
      return;
    }
    setError(null);
    setIsShaking(false);
    try {
      await client.connect();
    } catch (e) {
      // Ignore disconnect requested - user cancelled intentionally
      if (e instanceof DisconnectRequestedError) {
        return;
      }
      const errorMessage = (e as Error).message;
      setError(errorMessage);
      // Trigger shake animation
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      // Ensure panel is expanded to show error
      onExpandedChange(true);
    }
  }, [client, connectionState, onExpandedChange]);

  useEffect(() => {
    if (!autoConnect || hasAttemptedInitialAutoConnectRef.current) return;
    if (!client || connectionState !== "disconnected") return;

    hasAttemptedInitialAutoConnectRef.current = true;
    handleConnect();
  }, [autoConnect, client, connectionState, handleConnect]);

  const handleDisconnect = useCallback(() => {
    client?.disconnect();
  }, [client]);

  const updateSetting = <K extends keyof ACPSettings>(key: K, value: ACPSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateAdvancedControl = useCallback((patch: Partial<AdvancedBrowserControlSettings>) => {
    setAdvancedControl((prev) => {
      const next = { ...prev, ...patch };
      getChromeStorage()?.set({ [ADVANCED_BROWSER_CONTROL_KEY]: next }).catch((saveError) => {
        setError(saveError instanceof Error ? saveError.message : String(saveError));
      });
      return next;
    });
  }, []);

  const allowActiveDomain = useCallback(() => {
    if (!activeDomain) return;
    updateAdvancedControl({
      allowedDomains: [...advancedControl.allowedDomains, activeDomain]
        .filter((domain, index, all) => all.indexOf(domain) === index),
    });
  }, [activeDomain, advancedControl.allowedDomains, updateAdvancedControl]);

  // Clear error when starting to scan
  const handleStartScanning = useCallback(() => {
    setError(null);
    startScanning();
  }, [startScanning]);

  const isConnected = connectionState === "connected";
  const isConnecting = connectionState === "connecting";

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isConnected && !isConnecting) {
      e.preventDefault();
      handleConnect();
    }
  }, [isConnected, isConnecting, handleConnect]);

  // Format URL for display
  const displayUrl = settings.proxyUrl.replace(/^wss?:\/\//, "").replace(/\/ws$/, "");

  // Get status label
  const statusLabels: Record<ConnectionState, string> = {
    disconnected: "Disconnected",
    connecting: "Connecting...",
    connected: "Connected",
    error: "Error",
  };

  return (
    <div className="bg-background/80 backdrop-blur-sm">
      <div className="max-w-md mx-auto border-b">
      {/* Status Bar - Always visible */}
      <button
        onClick={() => onExpandedChange(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <StatusDot state={connectionState} />
          <span className="text-sm font-medium">{statusLabels[connectionState]}</span>
          {isConnected && displayUrl && (
            <span className="text-xs text-muted-foreground">• {displayUrl}</span>
          )}
          {showAdvancedBrowserControl && (
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${
                advancedControl.enabled
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-border bg-muted/60 text-muted-foreground"
              }`}
              title="Click this bar to open Advanced Browser Control settings"
            >
              <ShieldCheck className="h-3 w-3" />
              Control {advancedControl.enabled ? "On" : "Off"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div onClick={(e) => e.stopPropagation()}>
            <ThemeToggle />
          </div>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {/* Expandable Settings Panel */}
      <div
        className="overflow-hidden transition-all duration-200 ease-out"
        style={{
          maxHeight: expanded ? maxHeight : 0,
          opacity: expanded ? 1 : 0,
        }}
      >
        <div ref={contentRef} className={`px-3 pb-3 pt-1 space-y-3 ${isShaking ? "animate-shake" : ""}`}>
          {/* Hidden file input for album scanning */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* QR Scanner View - Portal to body to escape backdrop-blur containing block */}
          {isScanning && createPortal(
            <div className="fixed inset-0 z-50 bg-black flex flex-col">
              <video
                ref={videoRef}
                className="flex-1 w-full object-cover"
              />
              <Button
                onClick={stopScanning}
                variant="ghost"
                size="sm"
                className="absolute top-4 right-4 h-10 w-10 p-0 bg-black/50 hover:bg-black/70 text-white rounded-full"
              >
                <X className="h-5 w-5" />
              </Button>
              <div className="absolute bottom-16 left-0 right-0 flex flex-col items-center gap-3">
                <Button
                  onClick={handleSelectFromAlbum}
                  variant="secondary"
                  size="sm"
                  className="h-9 px-4"
                >
                  <Image className="h-4 w-4 mr-2" />
                  Select from Album
                </Button>
                <span className="text-sm text-white/80">
                  or point camera at QR code
                </span>
              </div>
            </div>,
            document.body
          )}

          {/* Connection Settings - use invisible (not hidden) to preserve scrollHeight for animation */}
          <div className={`space-y-3 ${isScanning ? "invisible" : ""}`}>
              {/* Server URL */}
              <div className="space-y-1.5">
                <Label htmlFor="proxy-url">Server</Label>
                <div className="flex gap-2">
                  {showScanButton && !isConnected && !isConnecting && (
                    <Button
                      onClick={handleStartScanning}
                      variant="outline"
                      size="sm"
                      className="h-9 px-3"
                      title="Scan QR code"
                      type="button"
                    >
                      <ScanLine className="h-4 w-4" />
                    </Button>
                  )}
                  <InputGroup className="flex-1" data-disabled={isConnected || isConnecting}>
                    <InputGroupAddon>
                      <Globe />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="proxy-url"
                      value={settings.proxyUrl}
                      onChange={(e) => updateSetting("proxyUrl", e.target.value)}
                      onKeyDown={handleInputKeyDown}
                      placeholder={placeholder}
                      disabled={isConnected || isConnecting}
                      aria-invalid={!!error}
                    />
                  </InputGroup>
                  {!isConnected ? (
                    <Button
                      onClick={handleConnect}
                      disabled={isConnecting}
                      size="sm"
                      className="h-9 px-4"
                      type="button"
                    >
                      {isConnecting ? "..." : "Connect"}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleDisconnect}
                      variant="destructive"
                      size="sm"
                      className="h-9 px-4"
                      type="button"
                    >
                      Disconnect
                    </Button>
                  )}
                </div>
              </div>

              {/* Auth Token - only shown if enabled */}
              {showTokenInput && (
                <div className="space-y-1.5">
                  <Label htmlFor="auth-token">
                    Auth Token
                    <span className="text-muted-foreground font-normal ml-1.5">optional</span>
                  </Label>
                  <InputGroup data-disabled={isConnected || isConnecting}>
                    <InputGroupAddon>
                      <KeyRound />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="auth-token"
                      value={settings.token || ""}
                      onChange={(e) => updateSetting("token", e.target.value || undefined)}
                      onKeyDown={handleInputKeyDown}
                      placeholder="For remote access"
                      disabled={isConnected || isConnecting}
                      type="password"
                      aria-invalid={!!error}
                      className="font-mono"
                    />
                  </InputGroup>
                </div>
              )}

              {/* Working Directory */}
              <div className="space-y-1.5">
                <Label htmlFor="working-dir">
                  Working Directory
                  <span className="text-muted-foreground font-normal ml-1.5">optional</span>
                </Label>
                <InputGroup data-disabled={isConnected || isConnecting}>
                  <InputGroupAddon>
                    <FolderOpen />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="working-dir"
                    value={settings.cwd || ""}
                    onChange={(e) => updateSetting("cwd", e.target.value || undefined)}
                    onKeyDown={handleInputKeyDown}
                    placeholder="/path/to/project"
                    disabled={isConnected || isConnecting}
                    aria-invalid={!!error}
                    className="font-mono"
                  />
                </InputGroup>
              </div>

              {showAdvancedBrowserControl && (
                <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <Label htmlFor="advanced-browser-control" className="gap-1.5">
                        <ShieldCheck className="h-4 w-4" />
                        Advanced Browser Control
                      </Label>
                      <p className="text-xs leading-5 text-muted-foreground">
                        Enables approved Chrome debugger commands such as full-page capture, layout snapshot, and PDF export.
                      </p>
                    </div>
                    <button
                      id="advanced-browser-control"
                      type="button"
                      role="switch"
                      aria-checked={advancedControl.enabled}
                      disabled={!advancedControlLoaded}
                      onClick={() => updateAdvancedControl({ enabled: !advancedControl.enabled })}
                      className={`flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition-colors disabled:opacity-50 ${
                        advancedControl.enabled ? "bg-primary border-primary" : "bg-muted border-border"
                      }`}
                    >
                      <span
                        className={`block h-5 w-5 rounded-full bg-background shadow-sm transition-[margin] ${
                          advancedControl.enabled ? "ml-auto" : "ml-0"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 rounded-md bg-background/60 px-2 py-1.5 text-xs">
                    <span className="truncate text-muted-foreground">
                      Current domain: {activeDomain ?? "unknown"}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      disabled={!activeDomain || advancedControl.allowedDomains.includes(activeDomain)}
                      onClick={allowActiveDomain}
                    >
                      Allow
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="advanced-browser-allowed-domains">
                      Allowed Domains
                      <span className="text-muted-foreground font-normal ml-1.5">comma or newline separated</span>
                    </Label>
                    <textarea
                      id="advanced-browser-allowed-domains"
                      value={advancedControl.allowedDomains.join("\n")}
                      onChange={(event) => updateAdvancedControl({ allowedDomains: normalizeDomains(event.target.value) })}
                      placeholder="github.com&#10;localhost&#10;127.0.0.1"
                      className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-20 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                    />
                  </div>

                  <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={advancedControl.requireConfirmForHighRisk}
                      onChange={(event) => updateAdvancedControl({ requireConfirmForHighRisk: event.target.checked })}
                      className="mt-1 h-4 w-4"
                    />
                    <span>Block high-risk commands by default: evaluate_js, dispatch_input, and network log.</span>
                  </label>
                </div>
              )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 px-2 py-1.5 rounded">
              {error}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
