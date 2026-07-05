import SwiftUI

@main
struct FreeFlowApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var state = AppState.shared

    var body: some Scene {
        Window("FreeFlow", id: "main") {
            RootView()
                .environmentObject(state)
                .frame(minWidth: 780, minHeight: 520)
        }
        .defaultSize(width: 900, height: 620)

        MenuBarExtra {
            MenuBarContent()
                .environmentObject(state)
        } label: {
            Image(systemName: menuBarSymbol)
        }
    }

    private var menuBarSymbol: String {
        switch state.dictation.mode {
        case .idle: return "waveform"
        case .recording, .commandRecording: return "waveform.circle.fill"
        case .processing: return "waveform.circle"
        }
    }
}

private struct MenuBarContent: View {
    @EnvironmentObject private var state: AppState
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Button(dictationTitle) {
            state.dictation.toggleHandsFree()
        }
        Divider()
        Button("Open FreeFlow") {
            openWindow(id: "main")
            NSApp.activate(ignoringOtherApps: true)
        }
        Divider()
        Text("Hold \(state.settings.dictationKey.displayName) to dictate")
        Text("Hold \(state.settings.commandKey.displayName) to edit selection")
        Divider()
        Button("Quit FreeFlow") {
            NSApp.terminate(nil)
        }
        .keyboardShortcut("q")
    }

    private var dictationTitle: String {
        if case .recording = state.dictation.mode {
            return "Stop Dictation"
        }
        return "Start Hands-Free Dictation"
    }
}
