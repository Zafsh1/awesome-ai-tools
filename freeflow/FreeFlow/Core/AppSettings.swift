import Foundation
import Combine
import ServiceManagement

/// User-configurable behavior, persisted in UserDefaults.
@MainActor
final class AppSettings: ObservableObject {
    static let shared = AppSettings()

    // MARK: Hotkeys

    /// Which key starts dictation (hold = push-to-talk, double-tap = hands-free).
    @Published var dictationKey: HotkeyMonitor.Key {
        didSet { defaults.set(dictationKey.rawValue, forKey: "dictationKey") }
    }

    /// Which key activates Command Mode (hold while speaking an instruction).
    @Published var commandKey: HotkeyMonitor.Key {
        didSet { defaults.set(commandKey.rawValue, forKey: "commandKey") }
    }

    // MARK: Dictation behavior

    /// BCP-47 identifier of the dictation language, e.g. "en-US".
    @Published var localeIdentifier: String {
        didSet { defaults.set(localeIdentifier, forKey: "localeIdentifier") }
    }

    /// Prefer fully on-device recognition when the locale supports it.
    @Published var onDeviceOnly: Bool {
        didSet { defaults.set(onDeviceOnly, forKey: "onDeviceOnly") }
    }

    /// Strip filler words (um, uh, you know, ...).
    @Published var removeFillers: Bool {
        didSet { defaults.set(removeFillers, forKey: "removeFillers") }
    }

    /// Apply "meet Tuesday — wait, Wednesday" style self-corrections.
    @Published var applySelfCorrections: Bool {
        didSet { defaults.set(applySelfCorrections, forKey: "applySelfCorrections") }
    }

    /// Adapt tone/punctuation to the app being dictated into.
    @Published var toneMatching: Bool {
        didSet { defaults.set(toneMatching, forKey: "toneMatching") }
    }

    /// Append a trailing space after inserted text, ready for the next thought.
    @Published var trailingSpace: Bool {
        didSet { defaults.set(trailingSpace, forKey: "trailingSpace") }
    }

    /// Play start/stop sounds.
    @Published var playSounds: Bool {
        didSet { defaults.set(playSounds, forKey: "playSounds") }
    }

    // MARK: AI (optional, off unless a key is provided)

    /// Route final formatting through Claude for a deeper cleanup pass.
    @Published var aiFormatting: Bool {
        didSet { defaults.set(aiFormatting, forKey: "aiFormatting") }
    }

    /// Anthropic API key for Command Mode free-form edits and AI formatting.
    @Published var anthropicAPIKey: String {
        didSet { defaults.set(anthropicAPIKey, forKey: "anthropicAPIKey") }
    }

    // MARK: App state

    @Published var onboardingComplete: Bool {
        didSet { defaults.set(onboardingComplete, forKey: "onboardingComplete") }
    }

    @Published var launchAtLogin: Bool {
        didSet {
            defaults.set(launchAtLogin, forKey: "launchAtLogin")
            updateLoginItem()
        }
    }

    private let defaults = UserDefaults.standard

    private init() {
        dictationKey = HotkeyMonitor.Key(rawValue: defaults.string(forKey: "dictationKey") ?? "") ?? .fn
        commandKey = HotkeyMonitor.Key(rawValue: defaults.string(forKey: "commandKey") ?? "") ?? .rightCommand
        localeIdentifier = defaults.string(forKey: "localeIdentifier") ?? "en-US"
        onDeviceOnly = defaults.object(forKey: "onDeviceOnly") as? Bool ?? true
        removeFillers = defaults.object(forKey: "removeFillers") as? Bool ?? true
        applySelfCorrections = defaults.object(forKey: "applySelfCorrections") as? Bool ?? true
        toneMatching = defaults.object(forKey: "toneMatching") as? Bool ?? true
        trailingSpace = defaults.object(forKey: "trailingSpace") as? Bool ?? true
        playSounds = defaults.object(forKey: "playSounds") as? Bool ?? true
        aiFormatting = defaults.bool(forKey: "aiFormatting")
        anthropicAPIKey = defaults.string(forKey: "anthropicAPIKey") ?? ""
        onboardingComplete = defaults.bool(forKey: "onboardingComplete")
        launchAtLogin = defaults.bool(forKey: "launchAtLogin")
    }

    private func updateLoginItem() {
        do {
            if launchAtLogin {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
        } catch {
            NSLog("FreeFlow: launch-at-login update failed: \(error)")
        }
    }
}
