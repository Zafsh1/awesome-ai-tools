import SwiftUI

struct HistoryView: View {
    @EnvironmentObject private var state: AppState
    @State private var query = ""

    private var filtered: [DictationEntry] {
        guard !query.isEmpty else { return state.history.entries }
        return state.history.entries.filter {
            $0.finalText.localizedCaseInsensitiveContains(query)
                || ($0.targetAppName?.localizedCaseInsensitiveContains(query) ?? false)
        }
    }

    var body: some View {
        Group {
            if state.history.entries.isEmpty {
                ContentUnavailableView("No history yet", systemImage: "clock.arrow.circlepath")
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(filtered) { entry in
                            HistoryRow(entry: entry)
                                .contextMenu {
                                    Button("Delete", role: .destructive) {
                                        state.history.delete(entry)
                                    }
                                }
                        }
                    }
                    .padding(16)
                }
            }
        }
        .searchable(text: $query, prompt: "Search dictations")
        .toolbar {
            Button("Clear All", role: .destructive) {
                state.history.clear()
            }
            .disabled(state.history.entries.isEmpty)
        }
        .navigationTitle("History")
    }
}
