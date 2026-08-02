import Foundation
import Combine

@MainActor
final class HistoryStore: ObservableObject {
    @Published private(set) var entries: [DictationEntry] {
        didSet { JSONStore.save(entries, to: "history.json") }
    }

    init() {
        entries = JSONStore.load([DictationEntry].self, from: "history.json") ?? []
    }

    func add(_ entry: DictationEntry) {
        entries.insert(entry, at: 0)
        // Keep history bounded so the JSON file stays snappy.
        if entries.count > 2000 { entries.removeLast(entries.count - 2000) }
    }

    func delete(_ entry: DictationEntry) {
        entries.removeAll { $0.id == entry.id }
    }

    func clear() { entries.removeAll() }

    // MARK: - Stats (the Wispr-style home screen numbers)

    var totalWords: Int {
        entries.filter { !$0.cancelled }.reduce(0) { $0 + $1.wordCount }
    }

    var wordsThisWeek: Int {
        guard let weekStart = Calendar.current.date(byAdding: .day, value: -7, to: Date())
        else { return 0 }
        return entries
            .filter { !$0.cancelled && $0.date > weekStart }
            .reduce(0) { $0 + $1.wordCount }
    }

    var averageWPM: Int {
        let timed = entries.filter { !$0.cancelled && $0.duration > 1 }
        guard !timed.isEmpty else { return 0 }
        let words = timed.reduce(0) { $0 + $1.wordCount }
        let minutes = timed.reduce(0.0) { $0 + $1.duration } / 60.0
        guard minutes > 0 else { return 0 }
        return Int(Double(words) / minutes)
    }

    /// Consecutive days (ending today or yesterday) with at least one dictation.
    var streakDays: Int {
        let calendar = Calendar.current
        let days = Set(entries.filter { !$0.cancelled }
            .map { calendar.startOfDay(for: $0.date) })
        guard !days.isEmpty else { return 0 }

        var cursor = calendar.startOfDay(for: Date())
        if !days.contains(cursor) {
            // Streak can survive until the end of today; start from yesterday.
            guard let yesterday = calendar.date(byAdding: .day, value: -1, to: cursor),
                  days.contains(yesterday) else { return 0 }
            cursor = yesterday
        }
        var streak = 0
        while days.contains(cursor) {
            streak += 1
            guard let previous = calendar.date(byAdding: .day, value: -1, to: cursor)
            else { break }
            cursor = previous
        }
        return streak
    }
}

@MainActor
final class DictionaryStore: ObservableObject {
    @Published var entries: [DictionaryEntry] {
        didSet { JSONStore.save(entries, to: "dictionary.json") }
    }

    init() {
        entries = JSONStore.load([DictionaryEntry].self, from: "dictionary.json") ?? []
    }

    func add(spoken: String, replacement: String = "") {
        let spoken = spoken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !spoken.isEmpty else { return }
        guard !entries.contains(where: { $0.spoken.lowercased() == spoken.lowercased() })
        else { return }
        entries.insert(DictionaryEntry(spoken: spoken, replacement: replacement), at: 0)
    }

    func delete(_ entry: DictionaryEntry) {
        entries.removeAll { $0.id == entry.id }
    }

    /// Words fed to the speech recognizer to bias recognition.
    var contextualStrings: [String] {
        entries.flatMap { [$0.spoken, $0.written] }.filter { !$0.isEmpty }
    }

    /// spoken -> written pairs applied to the transcript after recognition.
    var replacements: [(spoken: String, written: String)] {
        entries.filter { !$0.replacement.isEmpty }
            .map { ($0.spoken, $0.written) }
    }
}

@MainActor
final class SnippetStore: ObservableObject {
    @Published var snippets: [Snippet] {
        didSet { JSONStore.save(snippets, to: "snippets.json") }
    }

    init() {
        snippets = JSONStore.load([Snippet].self, from: "snippets.json") ?? []
    }

    func add(trigger: String, content: String) {
        let trigger = trigger.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trigger.isEmpty, !content.isEmpty else { return }
        snippets.insert(Snippet(trigger: trigger, content: content), at: 0)
    }

    func delete(_ snippet: Snippet) {
        snippets.removeAll { $0.id == snippet.id }
    }

    /// Returns the snippet whose trigger matches the transcript, if any.
    /// Matching is forgiving: case-insensitive and punctuation-blind, so
    /// saying "Insert my calendar link." still fires the trigger
    /// "insert my calendar link".
    func match(_ transcript: String) -> Snippet? {
        let normalized = Self.normalize(transcript)
        guard !normalized.isEmpty else { return nil }
        return snippets.first { Self.normalize($0.trigger) == normalized }
    }

    private static func normalize(_ text: String) -> String {
        text.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }
}

@MainActor
final class NotesStore: ObservableObject {
    @Published var notes: [Note] {
        didSet { JSONStore.save(notes, to: "notes.json") }
    }

    init() {
        notes = JSONStore.load([Note].self, from: "notes.json") ?? []
    }

    func add(text: String) {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        notes.insert(Note(text: text), at: 0)
    }

    func delete(_ note: Note) {
        notes.removeAll { $0.id == note.id }
    }
}
