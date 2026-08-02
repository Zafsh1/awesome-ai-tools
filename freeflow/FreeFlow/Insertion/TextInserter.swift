import AppKit

/// Inserts text at the cursor of whatever app is frontmost, by staging the
/// text on the pasteboard and synthesizing ⌘V — the same approach Wispr Flow
/// and friends use, because it works in virtually every text field. The
/// user's clipboard is snapshotted and restored afterwards.
///
/// Requires the app to be trusted for Accessibility (to post key events).
@MainActor
final class TextInserter {
    /// Also used by Command Mode to grab the current selection via ⌘C.
    func insert(_ text: String) {
        guard !text.isEmpty else { return }
        let saved = snapshotPasteboard()
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
        postKeystroke(keyCode: 9, flags: .maskCommand) // ⌘V
        // Give the target app time to consume the paste before restoring.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            self?.restorePasteboard(saved)
        }
    }

    /// Copies the current selection in the frontmost app and returns it,
    /// or nil if nothing was selected. Restores the clipboard afterwards.
    func captureSelection() async -> String? {
        let saved = snapshotPasteboard()
        let pasteboard = NSPasteboard.general
        let changeCountBefore = pasteboard.changeCount
        postKeystroke(keyCode: 8, flags: .maskCommand) // ⌘C
        // Wait for the frontmost app to service the copy.
        try? await Task.sleep(nanoseconds: 200_000_000)
        var selection: String?
        if pasteboard.changeCount != changeCountBefore {
            selection = pasteboard.string(forType: .string)
        }
        restorePasteboard(saved)
        return selection?.isEmpty == false ? selection : nil
    }

    // MARK: - Pasteboard snapshot/restore

    private func snapshotPasteboard() -> [[NSPasteboard.PasteboardType: Data]] {
        (NSPasteboard.general.pasteboardItems ?? []).map { item in
            var contents: [NSPasteboard.PasteboardType: Data] = [:]
            for type in item.types {
                if let data = item.data(forType: type) {
                    contents[type] = data
                }
            }
            return contents
        }
    }

    private func restorePasteboard(_ saved: [[NSPasteboard.PasteboardType: Data]]) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        guard !saved.isEmpty else { return }
        let items = saved.map { contents -> NSPasteboardItem in
            let item = NSPasteboardItem()
            for (type, data) in contents {
                item.setData(data, forType: type)
            }
            return item
        }
        pasteboard.writeObjects(items)
    }

    // MARK: - Synthetic keystrokes

    private func postKeystroke(keyCode: CGKeyCode, flags: CGEventFlags) {
        let source = CGEventSource(stateID: .combinedSessionState)
        guard let down = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true),
              let up = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false)
        else { return }
        down.flags = flags
        up.flags = flags
        down.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
    }
}
