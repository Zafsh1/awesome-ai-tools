import Foundation

/// Composition root: owns every store and the dictation controller.
@MainActor
final class AppState: ObservableObject {
    static let shared = AppState()

    let settings = AppSettings.shared
    let history = HistoryStore()
    let dictionary = DictionaryStore()
    let snippets = SnippetStore()
    let notes = NotesStore()
    let dictation: DictationController

    private init() {
        dictation = DictationController(settings: settings,
                                        history: history,
                                        dictionary: dictionary,
                                        snippets: snippets)
    }
}
