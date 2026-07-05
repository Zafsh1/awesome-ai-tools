import SwiftUI
import Speech

struct SettingsView: View {
    @EnvironmentObject private var state: AppState
    @ObservedObject private var settings = AppSettings.shared

    var body: some View {
        Form {
            Section("Hotkeys") {
                Picker("Dictation key", selection: $settings.dictationKey) {
                    ForEach(HotkeyMonitor.Key.allCases) { key in
                        Text(key.displayName).tag(key)
                    }
                }
                Picker("Command Mode key", selection: $settings.commandKey) {
                    ForEach(HotkeyMonitor.Key.allCases) { key in
                        Text(key.displayName).tag(key)
                    }
                }
                Text("Hold to talk, double-tap for hands-free, Esc to cancel. The fn key only works on Apple-built keyboards — pick Right ⌘ or Right ⌥ for third-party keyboards.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Language") {
                Picker("Dictation language", selection: $settings.localeIdentifier) {
                    ForEach(AppleSpeechEngine.supportedLocales, id: \.identifier) { locale in
                        Text(localeLabel(locale)).tag(locale.identifier)
                    }
                }
                Toggle("Prefer on-device recognition (private, works offline)",
                       isOn: $settings.onDeviceOnly)
            }

            Section("Auto-edits") {
                Toggle("Remove filler words (um, uh, you know…)",
                       isOn: $settings.removeFillers)
                Toggle("Apply self-corrections (“Tuesday — wait, Wednesday”)",
                       isOn: $settings.applySelfCorrections)
                Toggle("Match tone to the app (casual in chat, polished in email)",
                       isOn: $settings.toneMatching)
                Toggle("Add a trailing space after inserted text",
                       isOn: $settings.trailingSpace)
            }

            Section("AI (optional)") {
                SecureField("Anthropic API key", text: $settings.anthropicAPIKey)
                Toggle("AI formatting pass on every dictation",
                       isOn: $settings.aiFormatting)
                    .disabled(settings.anthropicAPIKey.isEmpty)
                Text("Powers free-form Command Mode edits (“make this more professional”, “translate to French”) and an optional deeper cleanup pass. Common transforms (uppercase, bullet list…) work offline without a key.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("General") {
                Toggle("Play sounds", isOn: $settings.playSounds)
                Toggle("Launch at login", isOn: $settings.launchAtLogin)
            }

            Section("Permissions") {
                PermissionRow(name: "Microphone", granted: Permissions.microphoneGranted) {
                    Task { _ = await Permissions.requestMicrophone() }
                }
                PermissionRow(name: "Speech Recognition", granted: Permissions.speechGranted) {
                    Task { _ = await Permissions.requestSpeech() }
                }
                PermissionRow(name: "Accessibility", granted: Permissions.accessibilityGranted) {
                    Permissions.promptAccessibility()
                    Permissions.openAccessibilitySettings()
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Settings")
    }

    private func localeLabel(_ locale: Locale) -> String {
        let name = Locale.current.localizedString(forIdentifier: locale.identifier)
        return name.map { "\($0) (\(locale.identifier))" } ?? locale.identifier
    }
}

struct PermissionRow: View {
    let name: String
    let granted: Bool
    let request: () -> Void

    var body: some View {
        HStack {
            Image(systemName: granted ? "checkmark.circle.fill" : "xmark.circle")
                .foregroundStyle(granted ? .green : .orange)
            Text(name)
            Spacer()
            if !granted {
                Button("Grant…", action: request)
            }
        }
    }
}
