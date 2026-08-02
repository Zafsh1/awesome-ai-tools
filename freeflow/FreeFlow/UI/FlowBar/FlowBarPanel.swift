import AppKit
import SwiftUI

/// The floating "Flow Bar": a small always-on-top lozenge pinned to the
/// bottom-center of the screen, visible on every Space and over full-screen
/// apps. It never steals focus from the app being dictated into
/// (`.nonactivatingPanel`).
final class FlowBarPanel: NSPanel {
    static let panelSize = NSSize(width: 420, height: 110)

    init(controller: DictationController) {
        super.init(contentRect: NSRect(origin: .zero, size: Self.panelSize),
                   styleMask: [.borderless, .nonactivatingPanel],
                   backing: .buffered,
                   defer: false)
        isFloatingPanel = true
        level = .statusBar
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        backgroundColor = .clear
        isOpaque = false
        hasShadow = false
        hidesOnDeactivate = false
        isMovableByWindowBackground = false
        becomesKeyOnlyIfNeeded = true

        let hosting = NSHostingView(rootView: FlowBarView(controller: controller))
        hosting.frame = NSRect(origin: .zero, size: Self.panelSize)
        contentView = hosting

        positionAtBottomCenter()
        orderFrontRegardless()

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(screenChanged),
            name: NSApplication.didChangeScreenParametersNotification,
            object: nil)
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }

    @objc private func screenChanged() {
        positionAtBottomCenter()
    }

    func positionAtBottomCenter() {
        guard let screen = NSScreen.main else { return }
        let visible = screen.visibleFrame
        let x = visible.midX - Self.panelSize.width / 2
        let y = visible.minY + 4
        setFrame(NSRect(x: x, y: y,
                        width: Self.panelSize.width,
                        height: Self.panelSize.height),
                 display: true)
    }
}
