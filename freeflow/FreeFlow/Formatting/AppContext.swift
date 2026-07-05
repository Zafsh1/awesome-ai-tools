import AppKit

/// Identifies the app the user is dictating into and maps it to a writing
/// style — the "tone matching" feature: casual in Slack, full sentences in
/// email, hands-off in code editors.
enum AppContext {
    struct FrontApp {
        let bundleID: String?
        let name: String?
    }

    static func frontmostApp() -> FrontApp {
        let app = NSWorkspace.shared.frontmostApplication
        return FrontApp(bundleID: app?.bundleIdentifier, name: app?.localizedName)
    }

    private static let casualApps: Set<String> = [
        "com.tinyspeck.slackmacgap",          // Slack
        "com.apple.MobileSMS",                // Messages
        "net.whatsapp.WhatsApp",              // WhatsApp
        "com.hnc.Discord",                    // Discord
        "org.telegram.desktop",               // Telegram
        "ru.keepcoder.Telegram",              // Telegram (App Store)
        "com.facebook.archon",                // Messenger
        "com.microsoft.teams2",               // Teams
        "com.signal.Signal",                  // Signal
    ]

    private static let technicalApps: Set<String> = [
        "com.apple.dt.Xcode",
        "com.microsoft.VSCode",
        "com.todesktop.230313mzl4w4u92",      // Cursor
        "dev.zed.Zed",
        "com.jetbrains.intellij",
        "com.googlecode.iterm2",
        "com.apple.Terminal",
        "com.github.wez.wezterm",
        "net.kovidgoyal.kitty",
        "com.mitchellh.ghostty",
        "com.sublimetext.4",
        "org.vim.MacVim",
    ]

    static func style(for bundleID: String?) -> TextFormatter.AppStyle {
        guard let bundleID else { return .standard }
        if casualApps.contains(bundleID) { return .casual }
        if technicalApps.contains(bundleID) { return .technical }
        return .standard
    }
}
