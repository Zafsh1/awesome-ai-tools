import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var flowBar: FlowBarPanel?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let state = AppState.shared

        // The always-on-top lozenge at the bottom of the screen.
        flowBar = FlowBarPanel(controller: state.dictation)

        // Global hotkeys (fn / right ⌘). Works once Accessibility is granted;
        // onboarding walks the user through the permission prompts.
        state.dictation.startMonitoring()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication,
                                       hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            sender.windows
                .first { !($0 is NSPanel) && $0.canBecomeKey }?
                .makeKeyAndOrderFront(nil)
        }
        return true
    }
}
