import SwiftUI

/// Main window: sidebar navigation, with onboarding shown until the user has
/// completed the initial setup.
struct RootView: View {
    @EnvironmentObject private var settings: AppSettings

    enum SidebarSection: String, CaseIterable, Identifiable {
        case home = "Home"
        case history = "History"
        case dictionary = "Dictionary"
        case snippets = "Snippets"
        case notes = "Notes"
        case settings = "Settings"

        var id: String { rawValue }

        var symbol: String {
            switch self {
            case .home: return "house"
            case .history: return "clock.arrow.circlepath"
            case .dictionary: return "character.book.closed"
            case .snippets: return "text.badge.plus"
            case .notes: return "note.text"
            case .settings: return "gearshape"
            }
        }
    }

    @State private var selection: SidebarSection = .home

    var body: some View {
        if settings.onboardingComplete {
            NavigationSplitView {
                List(SidebarSection.allCases, selection: $selection) { section in
                    Label(section.rawValue, systemImage: section.symbol)
                        .tag(section)
                }
                .navigationSplitViewColumnWidth(min: 170, ideal: 190)
            } detail: {
                switch selection {
                case .home: HomeView()
                case .history: HistoryView()
                case .dictionary: DictionaryView()
                case .snippets: SnippetsView()
                case .notes: NotesView()
                case .settings: SettingsView()
                }
            }
        } else {
            OnboardingView()
        }
    }
}
