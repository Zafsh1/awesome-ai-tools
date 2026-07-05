import AppKit

/// Subtle audio cues for dictation start/stop/cancel, using system sounds.
@MainActor
enum SoundPlayer {
    static func playStart() {
        play("Tink")
    }

    static func playStop() {
        play("Pop")
    }

    static func playCancel() {
        play("Bottle")
    }

    static func playError() {
        play("Basso")
    }

    private static func play(_ name: String) {
        guard AppSettings.shared.playSounds else { return }
        NSSound(named: name)?.play()
    }
}
