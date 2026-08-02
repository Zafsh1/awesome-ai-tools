import AppKit
import Carbon.HIToolbox

/// Watches for the dictation and command hotkeys system-wide using NSEvent
/// global monitors (requires the app to be trusted for Accessibility).
///
/// The default dictation key is `fn` — the same hardware-level signal Wispr
/// Flow uses. Note that third-party external keyboards often don't expose a
/// true Apple fn key; users can switch to Right Command / Right Option in
/// Settings.
@MainActor
final class HotkeyMonitor {
    enum Key: String, CaseIterable, Codable, Identifiable {
        case fn
        case rightCommand
        case rightOption
        case rightControl

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .fn: return "fn (Globe)"
            case .rightCommand: return "Right ⌘"
            case .rightOption: return "Right ⌥"
            case .rightControl: return "Right ⌃"
            }
        }

        var keyCode: UInt16 {
            switch self {
            case .fn: return 63
            case .rightCommand: return 54
            case .rightOption: return 61
            case .rightControl: return 62
            }
        }

        var flag: NSEvent.ModifierFlags {
            switch self {
            case .fn: return .function
            case .rightCommand: return .command
            case .rightOption: return .option
            case .rightControl: return .control
            }
        }
    }

    var dictationKey: Key = .fn
    var commandKey: Key = .rightCommand

    var onDictationKeyDown: (() -> Void)?
    var onDictationKeyUp: (() -> Void)?
    var onCommandKeyDown: (() -> Void)?
    var onCommandKeyUp: (() -> Void)?
    var onEscape: (() -> Void)?

    private var globalMonitors: [Any] = []
    private var localMonitor: Any?
    private var dictationPressed = false
    private var commandPressed = false

    func start() {
        stop()
        let flagsMonitor = NSEvent.addGlobalMonitorForEvents(matching: .flagsChanged) { [weak self] event in
            Task { @MainActor in self?.handleFlagsChanged(event) }
        }
        let keyMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            Task { @MainActor in self?.handleKeyDown(event) }
        }
        globalMonitors = [flagsMonitor, keyMonitor].compactMap { $0 }

        // Local monitor so hotkeys also work while FreeFlow itself is frontmost.
        localMonitor = NSEvent.addLocalMonitorForEvents(matching: [.flagsChanged, .keyDown]) { [weak self] event in
            if event.type == .flagsChanged {
                Task { @MainActor in self?.handleFlagsChanged(event) }
            } else {
                Task { @MainActor in self?.handleKeyDown(event) }
            }
            return event
        }
    }

    func stop() {
        for monitor in globalMonitors { NSEvent.removeMonitor(monitor) }
        globalMonitors = []
        if let localMonitor { NSEvent.removeMonitor(localMonitor) }
        localMonitor = nil
        dictationPressed = false
        commandPressed = false
    }

    private func handleFlagsChanged(_ event: NSEvent) {
        update(key: dictationKey, event: event,
               pressed: &dictationPressed,
               onDown: onDictationKeyDown, onUp: onDictationKeyUp)
        if commandKey != dictationKey {
            update(key: commandKey, event: event,
                   pressed: &commandPressed,
                   onDown: onCommandKeyDown, onUp: onCommandKeyUp)
        }
    }

    private func update(key: Key, event: NSEvent,
                        pressed: inout Bool,
                        onDown: (() -> Void)?, onUp: (() -> Void)?) {
        // Modifier keys report presses via flagsChanged. Match on the key code
        // so Right ⌘ doesn't trigger on Left ⌘, then use the flag to tell
        // press from release. The fn key (63) only exists on Apple keyboards.
        guard event.keyCode == key.keyCode else { return }
        let isDown = event.modifierFlags.contains(key.flag)
        if isDown && !pressed {
            pressed = true
            onDown?()
        } else if !isDown && pressed {
            pressed = false
            onUp?()
        }
    }

    private func handleKeyDown(_ event: NSEvent) {
        if event.keyCode == UInt16(kVK_Escape) {
            onEscape?()
        }
    }
}
