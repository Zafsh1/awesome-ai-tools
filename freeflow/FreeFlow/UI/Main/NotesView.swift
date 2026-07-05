import SwiftUI

/// Quick voice notes captured inside FreeFlow: dictate into the note field
/// with the usual hotkey (the cursor is just in our own text field), or type.
struct NotesView: View {
    @EnvironmentObject private var state: AppState
    @State private var draft = ""

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                TextField("Capture a thought — hold \(state.settings.dictationKey.displayName) and speak, or type",
                          text: $draft, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.roundedBorder)
                Button("Save") {
                    state.notes.add(text: draft)
                    draft = ""
                }
                .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(12)
            Divider()
            if state.notes.notes.isEmpty {
                ContentUnavailableView("No notes yet", systemImage: "note.text")
            } else {
                List {
                    ForEach(state.notes.notes) { note in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(note.text)
                            Text(note.date, style: .date)
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                        .padding(.vertical, 2)
                        .contextMenu {
                            Button("Copy") {
                                NSPasteboard.general.clearContents()
                                NSPasteboard.general.setString(note.text, forType: .string)
                            }
                            Button("Delete", role: .destructive) {
                                state.notes.delete(note)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Notes")
    }
}
