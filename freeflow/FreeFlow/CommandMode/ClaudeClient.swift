import Foundation

/// Minimal Anthropic Messages API client (raw URLSession — Swift has no
/// official SDK). Used for two optional features, both off unless the user
/// supplies an API key in Settings:
///   1. AI formatting — a deeper cleanup pass on dictated text.
///   2. Command Mode free-form edits — "make this more professional",
///      "summarize into three bullets", "translate to French", ...
struct ClaudeClient {
    enum ClientError: LocalizedError {
        case missingKey
        case refused
        case badResponse(String)

        var errorDescription: String? {
            switch self {
            case .missingKey: return "No Anthropic API key set in Settings."
            case .refused: return "The model declined this request."
            case .badResponse(let detail): return "Claude API error: \(detail)"
            }
        }
    }

    let apiKey: String
    var model = "claude-opus-4-8"

    /// Applies a spoken editing instruction to the selected text.
    func edit(text: String, instruction: String) async throws -> String {
        try await complete(
            system: """
            You are a text editing engine inside a dictation app. The user \
            selected some text and spoke an instruction for how to change it. \
            Apply the instruction and return ONLY the resulting text — no \
            preamble, no explanations, no quotes around the result.
            """,
            user: "Instruction: \(instruction)\n\nSelected text:\n\(text)")
    }

    /// Deeper AI cleanup of a dictated transcript.
    func format(transcript: String, styleHint: String) async throws -> String {
        try await complete(
            system: """
            You clean up dictated speech into polished written text. Remove \
            filler words and false starts, apply self-corrections the speaker \
            made while talking, fix punctuation and capitalization, and format \
            lists when the speaker clearly enumerates items. Preserve the \
            speaker's meaning, words, and voice — do not summarize, embellish, \
            or add content. Style: \(styleHint). Return ONLY the cleaned text.
            """,
            user: transcript)
    }

    private func complete(system: String, user: String) async throws -> String {
        guard !apiKey.isEmpty else { throw ClientError.missingKey }

        var request = URLRequest(url: URL(string: "https://api.anthropic.com/v1/messages")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        request.timeoutInterval = 30

        let body: [String: Any] = [
            "model": model,
            "max_tokens": 4096,
            "system": system,
            "messages": [["role": "user", "content": user]],
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.badResponse("no HTTP response")
        }
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard http.statusCode == 200 else {
            let message = ((json["error"] as? [String: Any])?["message"] as? String)
                ?? "HTTP \(http.statusCode)"
            throw ClientError.badResponse(message)
        }
        // Check stop_reason before reading content — a refusal returns 200
        // with empty content.
        if json["stop_reason"] as? String == "refusal" {
            throw ClientError.refused
        }
        guard let content = json["content"] as? [[String: Any]],
              let text = content.first(where: { $0["type"] as? String == "text" })?["text"] as? String
        else {
            throw ClientError.badResponse("unexpected response shape")
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
