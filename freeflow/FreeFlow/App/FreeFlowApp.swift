import SwiftUI

@main
struct FreeFlowApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var state = AppState.shared

    var body: some Scene {
        Window("FreeFlow", id: "main") {
            RootView()
                .injectStores(state)
                .frame(minWidth: 780, minHeight: 520)
        }
        .defaultSize(width: 900, height: 620)

        MenuBarExtra {
            MenuBarContent()
                .injectStores(state)
        } label: {
            // Must be a View that observes the controller directly — reading
            // state.dictation.mode here would not re-render, because the
            // controller is a nested ObservableObject.
            MenuBarLabel(dictation: state.dictation)
        }
    }
}

/// Every store is injected separately. SwiftUI only re-renders a view when an
/// object it *directly* observes changes, so injecting `AppState` alone would
/// leave views blind to changes inside `history`, `dictionary`, etc.
private extension View {
    @MainActor
    func injectStores(_ state: AppState) -> some View {
        environmentObject(state)
            .environmentObject(state.settings)
            .environmentObject(state.history)
            .environmentObject(state.dictionary)
            .environmentObject(state.snippets)
            .environmentObject(state.notes)
            .environmentObject(state.dictation)
    }
}

private struct MenuBarLabel: View {
    @ObservedObject var dictation: DictationController

    var body: some View {
        Image(systemName: symbol)
    }

    private var symbol: String {
        switch dictation.mode {
        case .idle: return "waveform"
        case .recording, .commandRecording: return "waveform.circle.fill"
        case .processing: return "waveform.circle"
        }
    }
}

private struct MenuBarContent: View {
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var dictation: DictationController
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Button(dictationTitle) {
            dictation.toggleHandsFree()
        }
        Divider()
        Button("Open FreeFlow") {
            openWindow(id: "main")
            NSApp.activate(ignoringOtherApps: true)
        }
        Divider()
        Text("Hold \(settings.dictationKey.displayName) to dictate")
        Text("Hold \(settings.commandKey.displayName) to edit selection")
        Divider()
        Button("Quit FreeFlow") {
            NSApp.terminate(nil)
        }
        .keyboardShortcut("q")
    }

    private var dictationTitle: String {
        if case .recording = dictation.mode {
            return "Stop Dictation"
        }
        return "Start Hands-Free Dictation"
    }
}
