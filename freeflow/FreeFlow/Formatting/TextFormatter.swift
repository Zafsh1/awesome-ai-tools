import Foundation

/// The "auto-edits" layer: turns a raw transcript into clean, writable text.
/// Removes filler words, applies self-corrections ("meet Tuesday — wait,
/// Wednesday" becomes "meet Wednesday"), expands spoken commands like
/// "new line", applies the personal dictionary, and adapts punctuation to
/// the tone of the target app.
struct TextFormatter {
    struct Options {
        var removeFillers = true
        var applySelfCorrections = true
        var style: AppStyle = .standard
        var replacements: [(spoken: String, written: String)] = []
    }

    /// Writing style inferred from the app being dictated into.
    enum AppStyle {
        /// Documents, email, default: full sentences, terminal punctuation.
        case standard
        /// Chat apps: keep it light — no trailing period on short messages.
        case casual
        /// Code editors and terminals: don't force sentence punctuation.
        case technical
    }

    func format(_ raw: String, options: Options) -> String {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return text }

        if options.removeFillers {
            text = Self.removeFillers(text)
        }
        if options.applySelfCorrections {
            text = Self.applySelfCorrections(text)
        }
        text = Self.applySpokenCommands(text)
        text = Self.applyReplacements(text, options.replacements)
        text = Self.normalizeWhitespaceAndPunctuation(text)

        switch options.style {
        case .standard:
            text = Self.capitalizeSentences(text)
            text = Self.ensureTerminalPunctuation(text)
        case .casual:
            text = Self.capitalizeSentences(text)
            text = Self.stripCasualTrailingPeriod(text)
        case .technical:
            // Leave the content alone beyond cleanup — code and shell text
            // shouldn't get sentence-cased or force-punctuated.
            break
        }
        return text
    }

    // MARK: - Filler words

    private static let fillerPattern: NSRegularExpression = {
        // Conservative list — words like "like" are too ambiguous to strip.
        let fillers = [
            "um+", "uh+", "uhm+", "erm+", "hmm+", "mhm+",
            "you know", "i mean(?=,)", "sort of like", "kind of like"
        ]
        let pattern = "(?i)(?:^|(?<=[\\s,]))(?:\(fillers.joined(separator: "|")))(?:[,.]?)(?=\\s|$)"
        return try! NSRegularExpression(pattern: pattern)
    }()

    static func removeFillers(_ text: String) -> String {
        let range = NSRange(text.startIndex..., in: text)
        return fillerPattern.stringByReplacingMatches(in: text, range: range, withTemplate: "")
    }

    // MARK: - Self-corrections

    /// Markers that mean "discard what I just said, use what comes next".
    private static let correctionMarkers = [
        "scratch that", "strike that", "no wait", "wait no", "wait,",
        "actually no", "no, i mean", "i mean,", "or rather", "rather,"
    ]

    /// Handles backtracking: when a correction marker appears, drop the
    /// clause immediately before it. "Meet on Tuesday, wait, Wednesday at 3"
    /// -> "Meet on Wednesday at 3" is approximated by removing the segment
    /// between the previous clause boundary and the marker.
    static func applySelfCorrections(_ text: String) -> String {
        var result = text
        for marker in correctionMarkers {
            while let markerRange = result.range(of: marker, options: [.caseInsensitive]) {
                // Find the clause boundary (comma/period/dash) before the marker.
                let prefix = result[result.startIndex..<markerRange.lowerBound]
                let boundary = prefix.lastIndex { ",.;—-".contains($0) }
                let dropFrom: String.Index
                if let boundary {
                    dropFrom = result.index(after: boundary)
                } else {
                    // No boundary: drop only the last word before the marker,
                    // not the whole sentence.
                    let words = prefix.split(whereSeparator: \.isWhitespace)
                    if let lastWord = words.last,
                       let wordRange = prefix.range(of: String(lastWord), options: .backwards) {
                        dropFrom = wordRange.lowerBound
                    } else {
                        dropFrom = result.startIndex
                    }
                }
                result.removeSubrange(dropFrom..<markerRange.upperBound)
                // Guard against pathological loops on repeated markers.
                if result.count > 20_000 { break }
            }
        }
        return result
    }

    // MARK: - Spoken commands

    static func applySpokenCommands(_ text: String) -> String {
        var result = text
        let commands: [(String, String)] = [
            ("(?i)[,.]?\\s*\\bnew paragraph\\b[,.]?\\s*", "\n\n"),
            ("(?i)[,.]?\\s*\\bnew line\\b[,.]?\\s*", "\n"),
        ]
        for (pattern, replacement) in commands {
            result = result.replacingOccurrences(
                of: pattern, with: replacement, options: .regularExpression)
        }
        return result
    }

    // MARK: - Personal dictionary

    static func applyReplacements(_ text: String,
                                  _ replacements: [(spoken: String, written: String)]) -> String {
        var result = text
        for (spoken, written) in replacements {
            let escaped = NSRegularExpression.escapedPattern(for: spoken)
            let pattern = "(?i)\\b\(escaped)\\b"
            result = result.replacingOccurrences(
                of: pattern, with: written, options: .regularExpression)
        }
        return result
    }

    // MARK: - Cleanup

    static func normalizeWhitespaceAndPunctuation(_ text: String) -> String {
        var result = text
        // Collapse runs of spaces/tabs (preserve newlines).
        result = result.replacingOccurrences(of: "[ \\t]{2,}", with: " ",
                                             options: .regularExpression)
        // No space before punctuation, one space after.
        result = result.replacingOccurrences(of: "\\s+([,.;:!?])", with: "$1",
                                             options: .regularExpression)
        result = result.replacingOccurrences(of: "([,.;:!?])(?=[A-Za-z])", with: "$1 ",
                                             options: .regularExpression)
        // Collapse doubled punctuation left over from edits (",." / ",,").
        result = result.replacingOccurrences(of: "[,.]{2,}", with: ".",
                                             options: .regularExpression)
        // Trim space at line boundaries.
        result = result.replacingOccurrences(of: " *\\n *", with: "\n",
                                             options: .regularExpression)
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func capitalizeSentences(_ text: String) -> String {
        var result = ""
        var capitalizeNext = true
        for char in text {
            if capitalizeNext, char.isLetter {
                result.append(Character(char.uppercased()))
                capitalizeNext = false
            } else {
                result.append(char)
            }
            if ".!?\n".contains(char) {
                capitalizeNext = true
            }
        }
        return result
    }

    static func ensureTerminalPunctuation(_ text: String) -> String {
        guard let last = text.last else { return text }
        if last.isLetter || last.isNumber {
            return text + "."
        }
        return text
    }

    /// Chat tone: a short single-sentence message shouldn't end with a period.
    static func stripCasualTrailingPeriod(_ text: String) -> String {
        guard text.hasSuffix("."), !text.hasSuffix("..") else { return text }
        let body = String(text.dropLast())
        let isSingleSentence = !body.contains(".") && !body.contains("\n")
        let isShort = body.split(whereSeparator: \.isWhitespace).count <= 14
        return (isSingleSentence && isShort) ? body : text
    }
}
