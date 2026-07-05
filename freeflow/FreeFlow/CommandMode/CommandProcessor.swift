import Foundation

/// Command Mode: the user highlights text, holds the command hotkey, and
/// speaks an instruction. Common transformations run locally and instantly;
/// anything free-form goes to Claude when an API key is configured.
struct CommandProcessor {
    let claude: ClaudeClient?

    func apply(instruction: String, to text: String) async throws -> String {
        let normalized = instruction.lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if let local = Self.localTransform(normalized, text: text) {
            return local
        }
        guard let claude else {
            throw ClaudeClient.ClientError.missingKey
        }
        return try await claude.edit(text: text, instruction: instruction)
    }

    /// Deterministic transformations that don't need a model.
    static func localTransform(_ instruction: String, text: String) -> String? {
        func has(_ phrases: String...) -> Bool {
            phrases.contains { instruction.contains($0) }
        }

        if has("uppercase", "upper case", "all caps", "capitalize everything") {
            return text.uppercased()
        }
        if has("lowercase", "lower case") {
            return text.lowercased()
        }
        if has("title case", "capitalize each word") {
            return text.capitalized
        }
        if has("sentence case") {
            return TextFormatter.capitalizeSentences(text.lowercased())
        }
        if has("bullet list", "bullet points", "bulleted list", "make this a list") {
            return listify(text, prefix: { _ in "- " })
        }
        if has("numbered list", "number the", "ordered list") {
            var index = 0
            return listify(text) { _ in
                index += 1
                return "\(index). "
            }
        }
        if has("one line", "single line", "remove line breaks", "unwrap") {
            return text
                .components(separatedBy: .newlines)
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
                .joined(separator: " ")
        }
        if has("remove punctuation") {
            return text.components(separatedBy: CharacterSet.punctuationCharacters).joined()
        }
        if has("trim whitespace", "remove extra spaces") {
            return TextFormatter.normalizeWhitespaceAndPunctuation(text)
        }
        return nil
    }

    private static func listify(_ text: String, prefix: (Int) -> String) -> String {
        // Prefer existing lines; fall back to splitting on sentences.
        var items = text
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        if items.count <= 1 {
            items = text
                .components(separatedBy: CharacterSet(charactersIn: ".;"))
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
        }
        return items.enumerated()
            .map { index, item in prefix(index) + item }
            .joined(separator: "\n")
    }
}
