import AppKit
import ApplicationServices
import Foundation

@MainActor
final class MetaflowMacCompanion: NSObject, NSApplicationDelegate {
    private let endpoint = URL(string: ProcessInfo.processInfo.environment["INFO_CONTEXT_INGEST_ENDPOINT"] ?? "http://localhost:3111/context/ingest")!
    private let pollSeconds = TimeInterval(ProcessInfo.processInfo.environment["METAFLOW_MAC_POLL_SECONDS"].flatMap(Double.init) ?? 1.2)
    private let minWritingCharacters = Int(ProcessInfo.processInfo.environment["METAFLOW_MAC_MIN_WRITING_CHARS"].flatMap(Int.init) ?? 24)
    private let maxWritingCharacters = Int(ProcessInfo.processInfo.environment["METAFLOW_MAC_MAX_WRITING_CHARS"].flatMap(Int.init) ?? 4_000)
    private let allowExternalLlm = ProcessInfo.processInfo.environment["METAFLOW_MAC_ALLOW_EXTERNAL_LLM"] == "1"
    private let startedAt = isoNow()

    private var statusItem: NSStatusItem!
    private var panel: NSWindow!
    private var statusLabel: NSTextField!
    private var detailLabel: NSTextField!
    private var suggestionTitleLabel: NSTextField!
    private var suggestionBodyLabel: NSTextField!
    private var copyButton: NSButton!
    private var dismissButton: NSButton!
    private var timer: Timer?
    private var running = true
    private var lastFocusKey = ""
    private var lastWritingText = ""
    private var lastWritingSentAt = Date.distantPast
    private var lastViewPollAt = Date.distantPast
    private var latestSuggestion: WritingSuggestion?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        buildStatusItem()
        buildPanel()
        refreshAccessibilityStatus(prompt: false)
        startPolling()
        showPanel()
        NSApp.activate(ignoringOtherApps: true)
    }

    private func buildStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "M"
        statusItem.button?.target = self
        statusItem.button?.action = #selector(togglePanel)

        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Show Floating Window", action: #selector(showPanel), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Request Accessibility Permission", action: #selector(requestAccessibilityPermission), keyEquivalent: ""))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Pause Capture", action: #selector(toggleCapture), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q"))
        statusItem.menu = menu
    }

    private func buildPanel() {
        panel = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: 320),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        panel.title = "Metaflow"
        panel.level = .normal
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.titleVisibility = .visible
        panel.titlebarAppearsTransparent = false
        panel.isReleasedWhenClosed = false
        panel.backgroundColor = NSColor.windowBackgroundColor

        let root = NSStackView()
        root.orientation = .vertical
        root.spacing = 10
        root.edgeInsets = NSEdgeInsets(top: 18, left: 18, bottom: 16, right: 18)
        root.translatesAutoresizingMaskIntoConstraints = false

        let title = NSTextField(labelWithString: "metaflow mac companion")
        title.font = .systemFont(ofSize: 15, weight: .semibold)

        statusLabel = NSTextField(labelWithString: "Starting...")
        statusLabel.font = .systemFont(ofSize: 13, weight: .medium)

        detailLabel = NSTextField(wrappingLabelWithString: "Watching focused macOS controls and sending local Observations to Info.")
        detailLabel.font = .systemFont(ofSize: 12)
        detailLabel.textColor = .secondaryLabelColor

        let separator = NSBox()
        separator.boxType = .separator

        suggestionTitleLabel = NSTextField(labelWithString: "AI writing suggestion")
        suggestionTitleLabel.font = .systemFont(ofSize: 13, weight: .semibold)

        suggestionBodyLabel = NSTextField(wrappingLabelWithString: "Waiting for current-session writing. Type in a local app after enabling Accessibility permission.")
        suggestionBodyLabel.font = .systemFont(ofSize: 13)
        suggestionBodyLabel.textColor = .labelColor
        suggestionBodyLabel.maximumNumberOfLines = 6

        let actions = NSStackView()
        actions.orientation = .horizontal
        actions.spacing = 8

        let permission = NSButton(title: "Permission", target: self, action: #selector(requestAccessibilityPermission))
        let pause = NSButton(title: "Pause", target: self, action: #selector(toggleCapture))
        actions.addArrangedSubview(permission)
        actions.addArrangedSubview(pause)

        let suggestionActions = NSStackView()
        suggestionActions.orientation = .horizontal
        suggestionActions.spacing = 8
        copyButton = NSButton(title: "Copy", target: self, action: #selector(copySuggestion))
        dismissButton = NSButton(title: "Dismiss", target: self, action: #selector(dismissSuggestion))
        copyButton.isEnabled = false
        dismissButton.isEnabled = false
        suggestionActions.addArrangedSubview(copyButton)
        suggestionActions.addArrangedSubview(dismissButton)

        root.addArrangedSubview(title)
        root.addArrangedSubview(statusLabel)
        root.addArrangedSubview(detailLabel)
        root.addArrangedSubview(actions)
        root.addArrangedSubview(separator)
        root.addArrangedSubview(suggestionTitleLabel)
        root.addArrangedSubview(suggestionBodyLabel)
        root.addArrangedSubview(suggestionActions)

        let content = NSView()
        content.addSubview(root)
        panel.contentView = content
        NSLayoutConstraint.activate([
            root.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            root.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            root.topAnchor.constraint(equalTo: content.topAnchor),
            root.bottomAnchor.constraint(equalTo: content.bottomAnchor)
        ])
        positionPanel()
    }

    private func startPolling() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: pollSeconds, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.tick()
            }
        }
        RunLoop.main.add(timer!, forMode: .common)
    }

    private func tick() {
        pollFocusedContext()
        if latestSuggestion == nil {
            pollWritingViewsIfDue()
        }
    }

    private func pollFocusedContext() {
        guard running else { return }
        guard accessibilityTrusted(prompt: false) else {
            refreshAccessibilityStatus(prompt: false)
            return
        }
        guard let app = NSWorkspace.shared.frontmostApplication else { return }

        let snapshot = AccessibilitySnapshot.capture(app: app)
        if snapshot.focusKey != lastFocusKey {
            lastFocusKey = snapshot.focusKey
            postFocusChanged(snapshot)
        }

        guard let text = snapshot.bestEditableText else {
            updateStatus("Watching \(snapshot.appName)", detail: snapshot.roleDescription)
            return
        }
        let normalized = normalize(text)
        guard shouldSendWritingText(normalized, snapshot: snapshot) else {
            updateStatus("Watching \(snapshot.appName)", detail: snapshot.roleDescription)
            return
        }
        lastWritingText = normalized
        lastWritingSentAt = Date()
        postEditorTextChanged(snapshot, text: normalized)
        updateStatus("Writing captured in \(snapshot.appName)", detail: snapshot.roleDescription)
    }

    private func shouldSendWritingText(_ text: String, snapshot: AccessibilitySnapshot) -> Bool {
        guard text.count >= minWritingCharacters && text.count <= maxWritingCharacters else { return false }
        guard text != lastWritingText else { return false }
        guard Date().timeIntervalSince(lastWritingSentAt) >= 2.5 else { return false }
        guard !snapshot.isSensitive else { return false }
        return true
    }

    private func postFocusChanged(_ snapshot: AccessibilitySnapshot) {
        let record = ContextRecord(
            schema: Schema(name: "observation.local_app.focus_changed", version: 1),
            source: Source(type: "local_app", connector: "metaflow-mac-companion"),
            scope: Scope(app: snapshot.bundleIdentifier, domain: nil),
            time: RecordTime(observed_at: isoNow(), captured_at: isoNow()),
            content: Content(title: snapshot.windowTitle ?? snapshot.appName, url: nil, text: snapshot.focusSummary),
            acquisition: Acquisition(mode: "passive", actor: "user", reason: "macOS focused accessibility element changed"),
            signal: Signal(importance: 0.32, confidence: 0.72, status: "inbox"),
            privacy: Privacy(level: "private", retention: "local", allow_external_llm: allowExternalLlm),
            payload: snapshot.payload(kind: "focus_changed")
        )
        post(record, process: false)
    }

    private func postEditorTextChanged(_ snapshot: AccessibilitySnapshot, text: String) {
        var payload = snapshot.payload(kind: "editor_text_changed")
        payload["text"] = .string(String(text.prefix(maxWritingCharacters)))
        payload["text_length"] = .number(Double(text.count))
        payload["writing_surface"] = .string("mac_accessibility")

        let record = ContextRecord(
            schema: Schema(name: "observation.editor.text_changed", version: 1),
            source: Source(type: "local_app", connector: "metaflow-mac-companion"),
            scope: Scope(app: snapshot.bundleIdentifier, domain: nil),
            time: RecordTime(observed_at: isoNow(), captured_at: isoNow()),
            content: Content(title: snapshot.windowTitle ?? snapshot.appName, url: nil, text: String(text.prefix(maxWritingCharacters))),
            acquisition: Acquisition(mode: "passive", actor: "user", reason: "macOS focused editor text changed"),
            signal: Signal(importance: 0.74, confidence: 0.7, status: "inbox"),
            privacy: Privacy(level: "private", retention: "local", allow_external_llm: allowExternalLlm),
            payload: payload
        )
        post(record, process: true)
    }

    private func post(_ record: ContextRecord, process: Bool) {
        var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false)!
        if process {
            components.queryItems = [
                URLQueryItem(name: "process", value: "true"),
                URLQueryItem(name: "cascade_views", value: "true")
            ]
        }
        guard let url = components.url else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder.contextEncoder.encode(record)

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            Task { @MainActor in
                if let error {
                    self?.updateStatus("Info offline", detail: error.localizedDescription)
                    return
                }
                if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                    self?.updateStatus("Info ingest rejected", detail: "HTTP \(http.statusCode)")
                    return
                }
                if process {
                    if let data, let viewIds = IngestResponse.writingViewIds(from: data), !viewIds.isEmpty {
                        self?.pollWritingViews(ids: viewIds)
                    } else {
                        self?.pollWritingViews(force: true)
                    }
                }
            }
        }.resume()
    }

    private func pollWritingViewsIfDue() {
        guard Date().timeIntervalSince(lastViewPollAt) >= 3 else { return }
        pollWritingViews(force: false)
    }

    private func pollWritingViews(force: Bool) {
        if !force && Date().timeIntervalSince(lastViewPollAt) < 3 { return }
        lastViewPollAt = Date()
        guard let url = contextViewsURL() else { return }
        URLSession.shared.dataTask(with: URLRequest(url: url)) { [weak self] data, response, error in
            Task { @MainActor in
                if let error {
                    self?.suggestionBodyLabel?.stringValue = "Could not load suggestions: \(error.localizedDescription)"
                    return
                }
                if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                    self?.suggestionBodyLabel?.stringValue = "Could not load suggestions: HTTP \(http.statusCode)"
                    return
                }
                guard let data, let suggestion = WritingSuggestion.latest(from: data) else { return }
                self?.showSuggestion(suggestion)
            }
        }.resume()
    }

    private func pollWritingViews(ids: [String]) {
        let orderedIds = ids.sorted { lhs, rhs in
            if lhs.contains(":inline") && !rhs.contains(":inline") { return true }
            if !lhs.contains(":inline") && rhs.contains(":inline") { return false }
            return lhs < rhs
        }
        let urls = orderedIds.compactMap(contextViewURL)
        guard !urls.isEmpty else { return }
        let lock = NSLock()
        var suggestionsById: [String: WritingSuggestion] = [:]
        let group = DispatchGroup()
        for url in urls {
            group.enter()
            URLSession.shared.dataTask(with: URLRequest(url: url)) { data, _, _ in
                defer { group.leave() }
                if let data, let suggestion = WritingSuggestion.single(from: data) {
                    lock.lock()
                    suggestionsById[suggestion.id] = suggestion
                    lock.unlock()
                }
            }.resume()
        }
        group.notify(queue: .main) { [weak self] in
            let suggestion = orderedIds.compactMap { suggestionsById[$0] }.first
            guard let suggestion else { return }
            Task { @MainActor in
                self?.showSuggestion(suggestion)
            }
        }
    }

    private func contextViewsURL() -> URL? {
        guard var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false) else { return nil }
        components.path = "/context/views"
        components.queryItems = [
            URLQueryItem(name: "limit", value: "8"),
            URLQueryItem(name: "view_types", value: "draft.writing_continuation,advice.writing_assist"),
            URLQueryItem(name: "active_only", value: "true"),
            URLQueryItem(name: "updated_after", value: startedAt),
        ]
        return components.url
    }

    private func contextViewURL(id: String) -> URL? {
        guard var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false) else { return nil }
        components.path = "/context/views/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)"
        components.queryItems = nil
        return components.url
    }

    private func feedbackURL() -> URL? {
        guard var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false) else { return nil }
        components.path = "/feedback"
        components.queryItems = [URLQueryItem(name: "process", value: "true")]
        return components.url
    }

    private func showSuggestion(_ suggestion: WritingSuggestion) {
        latestSuggestion = suggestion
        suggestionTitleLabel.stringValue = suggestion.title
        suggestionBodyLabel.stringValue = suggestion.text
        copyButton.isEnabled = true
        dismissButton.isEnabled = true
        if !panel.isVisible {
            showPanel()
        }
    }

    private func refreshAccessibilityStatus(prompt: Bool) {
        if accessibilityTrusted(prompt: prompt) {
            updateStatus("Accessibility enabled", detail: "Watching focused controls.")
        } else {
            updateStatus("Accessibility permission needed", detail: "Grant permission in System Settings to observe local app focus and text.")
        }
    }

    private func accessibilityTrusted(prompt: Bool) -> Bool {
        let options = ["AXTrustedCheckOptionPrompt": prompt] as CFDictionary
        return AXIsProcessTrustedWithOptions(options)
    }

    private func updateStatus(_ status: String, detail: String) {
        statusLabel?.stringValue = status
        detailLabel?.stringValue = detail
    }

    private func positionPanel() {
        panel.center()
    }

    @objc private func togglePanel() {
        panel.isVisible ? panel.orderOut(nil) : showPanel()
    }

    @objc private func showPanel() {
        positionPanel()
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func requestAccessibilityPermission() {
        refreshAccessibilityStatus(prompt: true)
        showPanel()
    }

    @objc private func toggleCapture(_ sender: Any? = nil) {
        running.toggle()
        updateStatus(running ? "Capture running" : "Capture paused", detail: running ? "Watching focused controls." : "No local app Observations will be sent.")
    }

    @objc private func copySuggestion() {
        guard let suggestion = latestSuggestion else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(suggestion.text, forType: .string)
        postFeedback(for: suggestion, type: "analysis.useful", value: "copied", reason: "Copied mac writing suggestion.")
        updateStatus("Suggestion copied", detail: "Paste it into the target app when ready.")
    }

    @objc private func dismissSuggestion() {
        guard let suggestion = latestSuggestion else { return }
        postFeedback(for: suggestion, type: "analysis.dismissed", value: "dismissed", reason: "Dismissed mac writing suggestion.")
        latestSuggestion = nil
        suggestionTitleLabel.stringValue = "AI writing suggestion"
        suggestionBodyLabel.stringValue = "Suggestion dismissed. Keep typing to generate a new one."
        copyButton.isEnabled = false
        dismissButton.isEnabled = false
    }

    private func postFeedback(for suggestion: WritingSuggestion, type: String, value: String, reason: String) {
        guard let url = feedbackURL() else { return }
        let payload: [String: Any] = [
            "type": type,
            "application_id": "mac.companion",
            "view_id": suggestion.id,
            "value": value,
            "reason": reason,
            "payload": [
                "surface": "mac_companion",
                "target_view_type": suggestion.viewType,
                "suggestion_text": suggestion.text,
            ],
        ]
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        URLSession.shared.dataTask(with: request).resume()
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }
}

struct WritingSuggestion {
    let id: String
    let viewType: String
    let title: String
    let text: String

    static func latest(from data: Data) -> WritingSuggestion? {
        guard
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let views = json["views"] as? [[String: Any]]
        else { return nil }

        for view in views {
            guard
                let id = view["id"] as? String,
                let viewType = view["view_type"] as? String
            else { continue }
            let content = view["content"] as? [String: Any] ?? [:]
            let title = (view["title"] as? String) ?? (viewType == "draft.writing_continuation" ? "AI draft" : "AI writing")
            let draft = content["draft_text"] as? String
            let suggestions = content["suggestions"] as? [String]
            let summary = view["summary"] as? String
            let text = [draft, suggestions?.first, summary]
                .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
                .first { !$0.isEmpty }
            if let text {
                return WritingSuggestion(id: id, viewType: viewType, title: title, text: text)
            }
        }
        return nil
    }

    static func single(from data: Data) -> WritingSuggestion? {
        guard
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let view = json["view"] as? [String: Any]
        else { return nil }
        return from(view: view)
    }

    private static func from(view: [String: Any]) -> WritingSuggestion? {
        guard
            let id = view["id"] as? String,
            let viewType = view["view_type"] as? String
        else { return nil }
        let content = view["content"] as? [String: Any] ?? [:]
        let title = (view["title"] as? String) ?? (viewType == "draft.writing_continuation" ? "AI draft" : "AI writing")
        let draft = content["draft_text"] as? String
        let suggestions = content["suggestions"] as? [String]
        let summary = view["summary"] as? String
        let text = [draft, suggestions?.first, summary]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty }
        guard let text else { return nil }
        return WritingSuggestion(id: id, viewType: viewType, title: title, text: text)
    }
}

struct IngestResponse {
    static func writingViewIds(from data: Data) -> [String]? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        var ids: [String] = []
        collectRunViewIds(json["processing"], into: &ids)
        if let cascade = json["cascade_processing"] as? [[String: Any]] {
            for item in cascade {
                collectRunViewIds(item, into: &ids)
            }
        }
        let writingIds = ids.filter { $0.contains("writing") }
        return writingIds.isEmpty ? nil : Array(Set(writingIds))
    }

    private static func collectRunViewIds(_ value: Any?, into ids: inout [String]) {
        guard let object = value as? [String: Any], let runs = object["runs"] as? [[String: Any]] else { return }
        for run in runs {
            if let runIds = run["written_views"] as? [String] {
                ids.append(contentsOf: runIds)
            }
        }
    }
}

@main
@MainActor
enum MetaflowMacMain {
    private static var delegate: MetaflowMacCompanion?

    static func main() {
        let app = NSApplication.shared
        let appDelegate = MetaflowMacCompanion()
        delegate = appDelegate
        app.delegate = appDelegate
        app.run()
    }
}

struct AccessibilitySnapshot {
    let appName: String
    let bundleIdentifier: String
    let processIdentifier: pid_t
    let windowTitle: String?
    let role: String?
    let subrole: String?
    let focusedValue: String?
    let selectedText: String?
    let description: String?
    let placeholder: String?

    var focusKey: String {
        [bundleIdentifier, windowTitle, role, subrole, description, placeholder].compactMap { $0 }.joined(separator: "|")
    }

    var focusSummary: String {
        [appName, windowTitle, roleDescription].compactMap { $0 }.joined(separator: " · ")
    }

    var roleDescription: String {
        [role, subrole, description, placeholder].compactMap { value in
            guard let value else { return nil }
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }.joined(separator: " · ")
    }

    var bestEditableText: String? {
        let roleValue = (role ?? "").lowercased()
        if let selectedText, normalize(selectedText).count >= 8 { return selectedText }
        if let focusedValue, normalize(focusedValue).count >= 8 { return focusedValue }
        guard roleValue.contains("text") || roleValue.contains("area") else { return nil }
        return nil
    }

    var isSensitive: Bool {
        let haystack = [windowTitle, role, subrole, description, placeholder, bundleIdentifier]
            .compactMap { $0 }
            .joined(separator: " ")
        return haystack.range(of: #"password|token|secret|api[_-]?key|credit card|验证码|密码|one-time|otp"#, options: [.regularExpression, .caseInsensitive]) != nil
    }

    static func capture(app: NSRunningApplication) -> AccessibilitySnapshot {
        let appElement = AXUIElementCreateApplication(app.processIdentifier)
        let window: AXUIElement? = axValue(appElement, kAXFocusedWindowAttribute)
        let focused: AXUIElement? = axValue(appElement, kAXFocusedUIElementAttribute)
        return AccessibilitySnapshot(
            appName: app.localizedName ?? "Unknown app",
            bundleIdentifier: app.bundleIdentifier ?? "unknown",
            processIdentifier: app.processIdentifier,
            windowTitle: axString(window, kAXTitleAttribute),
            role: axString(focused, kAXRoleAttribute),
            subrole: axString(focused, kAXSubroleAttribute),
            focusedValue: axString(focused, kAXValueAttribute),
            selectedText: axString(focused, kAXSelectedTextAttribute),
            description: axString(focused, kAXDescriptionAttribute),
            placeholder: axString(focused, kAXPlaceholderValueAttribute)
        )
    }

    func payload(kind: String) -> [String: JSONValue] {
        var value: [String: JSONValue] = [
            "kind": .string(kind),
            "app_name": .string(appName),
            "bundle_identifier": .string(bundleIdentifier),
            "process_id": .number(Double(processIdentifier)),
            "observed_at": .string(isoNow())
        ]
        if let windowTitle { value["window_title"] = .string(windowTitle) }
        if let role { value["role"] = .string(role) }
        if let subrole { value["subrole"] = .string(subrole) }
        if let description { value["field_description"] = .string(description) }
        if let placeholder { value["field_placeholder"] = .string(placeholder) }
        if let selectedText { value["selected_text"] = .string(String(selectedText.prefix(2_000))) }
        value["role_description"] = .string(roleDescription)
        return value
    }
}

struct ContextRecord: Encodable {
    let schema: Schema
    let source: Source
    let scope: Scope
    let time: RecordTime
    let content: Content
    let acquisition: Acquisition
    let signal: Signal
    let privacy: Privacy
    let payload: [String: JSONValue]
}

struct Schema: Encodable {
    let name: String
    let version: Int
}

struct Source: Encodable {
    let type: String
    let connector: String
}

struct Scope: Encodable {
    let app: String?
    let domain: String?
}

struct RecordTime: Encodable {
    let observed_at: String
    let captured_at: String
}

struct Content: Encodable {
    let title: String?
    let url: String?
    let text: String?
}

struct Acquisition: Encodable {
    let mode: String
    let actor: String
    let reason: String
}

struct Signal: Encodable {
    let importance: Double
    let confidence: Double
    let status: String
}

struct Privacy: Encodable {
    let level: String
    let retention: String
    let allow_external_llm: Bool
}

enum JSONValue: Encodable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

extension JSONEncoder {
    static let contextEncoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()
}

private func axValue<T>(_ element: AXUIElement?, _ attribute: String) -> T? {
    guard let element else { return nil }
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    guard result == .success else { return nil }
    return value as? T
}

private func axString(_ element: AXUIElement?, _ attribute: String) -> String? {
    let value: AnyObject? = axValue(element, attribute)
    if let string = value as? String { return string }
    if let attributed = value as? NSAttributedString { return attributed.string }
    return nil
}

private func normalize(_ text: String) -> String {
    text.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

private func isoNow() -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date())
}
