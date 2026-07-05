import SwiftUI

/// Voice snippets: speak the trigger phrase during dictation and the full
/// saved text is inserted instead — scheduling links, intros, disclaimers.
struct SnippetsView: View {
    @EnvironmentObject private var state: AppState
    @State private var trigger = ""
    @State private var content = ""

    var body: some View {
        VStack(spacing: 0) {
            addForm
            Divider()
            if state.snippets.snippets.isEmpty {
                ContentUnavailableView(
                    "No snippets yet",
                    systemImage: "text.badge.plus",
                    description: Text("Create a trigger like “insert my calendar link”, then just say it while dictating."))
            } else {
                List {
                    ForEach(state.snippets.snippets) { snippet in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Label("“\(snippet.trigger)”", systemImage: "mic")
                                    .fontWeight(.semibold)
                                Spacer()
                                Button {
                                    state.snippets.delete(snippet)
                                } label: {
                                    Image(systemName: "trash")
                                }
                                .buttonStyle(.borderless)
                            }
                            Text(snippet.content)
                                .foregroundStyle(.secondary)
                                .lineLimit(3)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
        }
        .navigationTitle("Snippets")
    }

    private var addForm: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("Spoken trigger (e.g. insert my calendar link)", text: $trigger)
                .textFieldStyle(.roundedBorder)
            TextField("Text to insert", text: $content, axis: .vertical)
                .lineLimit(2...5)
                .textFieldStyle(.roundedBorder)
            HStack {
                Spacer()
                Button("Add Snippet") {
                    state.snippets.add(trigger: trigger, content: content)
                    trigger = ""
                    content = ""
                }
                .disabled(trigger.trimmingCharacters(in: .whitespaces).isEmpty
                          || content.isEmpty)
            }
        }
        .padding(12)
    }
}
