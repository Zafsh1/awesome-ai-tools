import SwiftUI

/// Landing screen: dictation stats and recent activity, in the spirit of the
/// Wispr Flow home screen.
struct HomeView: View {
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var history: HistoryStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                statsRow
                recentActivity
            }
            .padding(24)
        }
        .navigationTitle("Home")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Speak. Don't type.")
                .font(.largeTitle.bold())
            Text("Hold **\(settings.dictationKey.displayName)** and talk into any app. Double-tap it for hands-free. Hold **\(settings.commandKey.displayName)** over selected text to edit it by voice.")
                .foregroundStyle(.secondary)
        }
    }

    private var statsRow: some View {
        HStack(spacing: 14) {
            StatTile(value: "\(history.totalWords)", label: "Words dictated",
                     symbol: "text.word.spacing")
            StatTile(value: "\(history.wordsThisWeek)", label: "Words this week",
                     symbol: "calendar")
            StatTile(value: "\(history.averageWPM)", label: "Average WPM",
                     symbol: "speedometer")
            StatTile(value: "\(history.streakDays)", label: "Day streak",
                     symbol: "flame")
        }
    }

    private var recentActivity: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Recent activity")
                .font(.title3.bold())
            if history.entries.isEmpty {
                ContentUnavailableView(
                    "No dictations yet",
                    systemImage: "waveform",
                    description: Text("Put your cursor in any text field, hold \(settings.dictationKey.displayName), and start talking."))
                    .frame(maxWidth: .infinity)
            } else {
                ForEach(history.entries.prefix(8)) { entry in
                    HistoryRow(entry: entry)
                }
            }
        }
    }
}

struct StatTile: View {
    let value: String
    let label: String
    let symbol: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.tint)
            Text(value)
                .font(.system(size: 26, weight: .bold, design: .rounded))
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
    }
}

struct HistoryRow: View {
    let entry: DictationEntry

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.finalText)
                    .lineLimit(3)
                    .foregroundStyle(entry.cancelled ? .secondary : .primary)
                HStack(spacing: 8) {
                    if entry.cancelled {
                        Text("Cancelled")
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(.orange.opacity(0.2), in: Capsule())
                    }
                    if let app = entry.targetAppName {
                        Label(app, systemImage: "app")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Text("\(entry.wordCount) words · \(entry.wordsPerMinute) WPM")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(entry.date, style: .relative)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
            Spacer()
            Button {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(entry.finalText, forType: .string)
            } label: {
                Image(systemName: "doc.on.doc")
            }
            .buttonStyle(.borderless)
            .help("Copy")
        }
        .padding(12)
        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
    }
}
