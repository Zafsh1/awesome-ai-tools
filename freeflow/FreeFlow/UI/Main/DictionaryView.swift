import SwiftUI

/// Personal dictionary: names, jargon, and unique spellings. Plain entries
/// bias the recognizer; entries with a replacement also rewrite the
/// transcript ("gpt four" -> "GPT-4").
struct DictionaryView: View {
    @EnvironmentObject private var state: AppState
    @State private var spoken = ""
    @State private var replacement = ""

    var body: some View {
        VStack(spacing: 0) {
            addBar
            Divider()
            if state.dictionary.entries.isEmpty {
                ContentUnavailableView(
                    "Dictionary is empty",
                    systemImage: "character.book.closed",
                    description: Text("Add names, acronyms, and industry terms so FreeFlow always gets them right."))
            } else {
                List {
                    ForEach(state.dictionary.entries) { entry in
                        HStack {
                            Text(entry.spoken)
                            if !entry.replacement.isEmpty {
                                Image(systemName: "arrow.right")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(entry.replacement)
                                    .fontWeight(.medium)
                            }
                            Spacer()
                            Button {
                                state.dictionary.delete(entry)
                            } label: {
                                Image(systemName: "trash")
                            }
                            .buttonStyle(.borderless)
                        }
                    }
                }
            }
        }
        .navigationTitle("Dictionary")
    }

    private var addBar: some View {
        HStack(spacing: 8) {
            TextField("Word or phrase (e.g. Anthropic)", text: $spoken)
                .textFieldStyle(.roundedBorder)
            TextField("Written as (optional, e.g. GPT-4)", text: $replacement)
                .textFieldStyle(.roundedBorder)
            Button("Add") {
                state.dictionary.add(spoken: spoken, replacement: replacement)
                spoken = ""
                replacement = ""
            }
            .keyboardShortcut(.return, modifiers: [])
            .disabled(spoken.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(12)
    }
}
