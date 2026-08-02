import SwiftUI

/// First-run setup: explains the app, walks through the three permissions,
/// and lets the user pick a hotkey before trying their first dictation.
struct OnboardingView: View {
    @EnvironmentObject private var settings: AppSettings
    @State private var step = 0
    /// Scratch field for the "try it" step — must be real state, not a
    /// constant binding, or the user cannot dictate (or type) into it.
    @State private var trialText = ""
    /// Poll permission state so the checkmarks update after the user visits
    /// System Settings.
    @State private var permissionsTick = 0
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            stepContent
            Spacer()
            controls
        }
        .padding(40)
        .onReceive(timer) { _ in permissionsTick += 1 }
    }

    @ViewBuilder
    private var stepContent: some View {
        switch step {
        case 0: welcome
        case 1: permissions
        case 2: hotkeyPick
        default: tryIt
        }
    }

    private var welcome: some View {
        VStack(spacing: 14) {
            Image(systemName: "waveform.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(.tint)
            Text("Welcome to FreeFlow")
                .font(.largeTitle.bold())
            Text("Effortless voice dictation in every app. Hold a key, speak naturally, and clean, formatted text appears wherever your cursor is — Slack, Mail, your editor, anywhere.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 440)
        }
    }

    private var permissions: some View {
        VStack(spacing: 18) {
            Text("Three permissions")
                .font(.title.bold())
            Text("FreeFlow listens with the microphone, transcribes with on-device speech recognition, and needs Accessibility to watch the hotkey and type into other apps.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 460)
            VStack(spacing: 10) {
                // The tick forces re-evaluation as permissions change.
                let _ = permissionsTick
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
            .frame(maxWidth: 380)
            .padding(16)
            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private var hotkeyPick: some View {
        VStack(spacing: 18) {
            Text("Pick your dictation key")
                .font(.title.bold())
            Text("Hold it to talk, release to insert. Double-tap for hands-free. The fn key is the classic choice on MacBooks; use Right ⌘ if you're on a third-party keyboard.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 460)
            Picker("Dictation key", selection: $settings.dictationKey) {
                ForEach(HotkeyMonitor.Key.allCases) { key in
                    Text(key.displayName).tag(key)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(maxWidth: 420)
        }
    }

    private var tryIt: some View {
        VStack(spacing: 18) {
            Image(systemName: "mic.fill")
                .font(.system(size: 44))
                .foregroundStyle(.tint)
            Text("Try your first dictation")
                .font(.title.bold())
            Text("Click into the field below, hold **\(settings.dictationKey.displayName)**, and say something like “This is my first dictation with FreeFlow — um, I mean, it actually works.” Watch the fillers disappear.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 480)
            TextEditor(text: $trialText)
                .font(.body)
                .frame(maxWidth: 480, minHeight: 90, maxHeight: 110)
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.quaternary))
            Text(trialText.isEmpty
                 ? "Waiting for your voice…"
                 : "\(trialText.split(whereSeparator: \.isWhitespace).count) words — nice.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var controls: some View {
        HStack {
            if step > 0 {
                Button("Back") { step -= 1 }
            }
            Spacer()
            if step < 3 {
                Button("Continue") { step += 1 }
                    .buttonStyle(.borderedProminent)
                    .disabled(step == 1 && !Permissions.allGranted)
            } else {
                Button("Start Flowing") {
                    settings.onboardingComplete = true
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .frame(maxWidth: 480)
    }
}
