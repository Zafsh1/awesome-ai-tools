import SwiftUI

/// Content of the floating Flow Bar. Idle: a tiny dark lozenge. Hover: an
/// expanded hint. Recording: a pill with a live waveform (plus ✕ / ✓ buttons
/// in hands-free mode). Processing: an animated ellipsis.
struct FlowBarView: View {
    @ObservedObject var controller: DictationController
    @ObservedObject private var settings = AppSettings.shared
    @State private var hovering = false

    var body: some View {
        VStack {
            Spacer(minLength: 0)
            content
                .animation(.spring(response: 0.3, dampingFraction: 0.8), value: controller.mode)
                .animation(.easeInOut(duration: 0.15), value: hovering)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .padding(.bottom, 6)
    }

    @ViewBuilder
    private var content: some View {
        if let message = controller.statusMessage {
            pill {
                Text(message)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.white.opacity(0.9))
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
            }
        } else {
            switch controller.mode {
            case .idle:
                idleLozenge
            case .recording(let handsFree):
                recordingPill(handsFree: handsFree)
            case .commandRecording:
                commandPill
            case .processing:
                pill {
                    HStack(spacing: 6) {
                        ProgressView()
                            .controlSize(.small)
                            .colorInvert()
                        Text("Polishing…")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.white.opacity(0.9))
                    }
                }
            }
        }
    }

    // MARK: Idle

    private var idleLozenge: some View {
        Group {
            if hovering {
                pill {
                    Text("Click, or hold \(settings.dictationKey.displayName) to dictate")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.white.opacity(0.9))
                }
            } else {
                Capsule()
                    .fill(Color.black.opacity(0.75))
                    .frame(width: 44, height: 8)
                    .overlay(
                        Capsule().strokeBorder(.white.opacity(0.15), lineWidth: 0.5)
                    )
            }
        }
        .onHover { hovering = $0 }
        .onTapGesture { controller.toggleHandsFree() }
    }

    // MARK: Recording

    private func recordingPill(handsFree: Bool) -> some View {
        pill {
            HStack(spacing: 10) {
                if handsFree {
                    barButton(systemName: "xmark", help: "Cancel (Esc)") {
                        controller.cancelFromUI()
                    }
                }
                Waveform(levels: controller.levels)
                    .frame(width: 120, height: 22)
                if handsFree {
                    barButton(systemName: "checkmark", help: "Insert") {
                        controller.toggleHandsFree()
                    }
                }
            }
        }
    }

    private var commandPill: some View {
        pill {
            HStack(spacing: 8) {
                Image(systemName: "wand.and.stars")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.purple)
                Waveform(levels: controller.levels)
                    .frame(width: 100, height: 20)
                Text("Command")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
            }
        }
    }

    private func barButton(systemName: String, help: String,
                           action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.white.opacity(0.85))
                .frame(width: 22, height: 22)
                .background(Circle().fill(.white.opacity(0.12)))
        }
        .buttonStyle(.plain)
        .help(help)
    }

    private func pill<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(Color.black.opacity(0.82))
                    .overlay(Capsule().strokeBorder(.white.opacity(0.15), lineWidth: 0.5))
                    .shadow(color: .black.opacity(0.35), radius: 8, y: 2)
            )
    }
}

/// Live microphone waveform: one bar per recent level sample.
struct Waveform: View {
    let levels: [Float]

    var body: some View {
        HStack(alignment: .center, spacing: 2.5) {
            ForEach(Array(levels.enumerated()), id: \.offset) { _, level in
                Capsule()
                    .fill(Color.white.opacity(0.9))
                    .frame(width: 2.5,
                           height: max(3, CGFloat(level) * 22))
            }
        }
        .animation(.linear(duration: 0.08), value: levels)
    }
}
