import Foundation

/// One completed dictation, kept in Recent Activity / History.
struct DictationEntry: Identifiable, Codable, Hashable {
    var id = UUID()
    var date = Date()
    /// Raw transcript exactly as the speech engine heard it.
    var rawText: String
    /// Final text after formatting / snippet expansion — what was inserted.
    var finalText: String
    /// Bundle identifier of the app the text was inserted into.
    var targetApp: String?
    /// Human-readable name of the target app.
    var targetAppName: String?
    /// Length of the recording in seconds.
    var duration: TimeInterval
    /// True when the user cancelled instead of inserting.
    var cancelled = false

    var wordCount: Int {
        finalText.split(whereSeparator: \.isWhitespace).count
    }

    var wordsPerMinute: Int {
        guard duration > 1 else { return 0 }
        return Int(Double(wordCount) / (duration / 60.0))
    }
}

/// A custom vocabulary entry. `replacement` is optional: a plain word just
/// biases the recognizer, a word with a replacement also rewrites matches
/// in the transcript (e.g. "gpt 4" -> "GPT-4").
struct DictionaryEntry: Identifiable, Codable, Hashable {
    var id = UUID()
    /// What the recognizer tends to hear.
    var spoken: String
    /// How it should be written. Empty means "same as spoken, but boost it".
    var replacement: String = ""
    var dateAdded = Date()

    var written: String { replacement.isEmpty ? spoken : replacement }
}

/// A voice snippet: say the trigger phrase, get the full text pasted.
struct Snippet: Identifiable, Codable, Hashable {
    var id = UUID()
    /// Spoken trigger, e.g. "insert my calendar link".
    var trigger: String
    /// Text that gets inserted verbatim.
    var content: String
    var dateAdded = Date()
}

/// A voice note captured into FreeFlow itself rather than another app.
struct Note: Identifiable, Codable, Hashable {
    var id = UUID()
    var date = Date()
    var text: String
}
