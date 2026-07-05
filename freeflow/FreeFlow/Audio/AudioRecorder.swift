import AVFoundation

/// Captures microphone audio with AVAudioEngine and hands PCM buffers to the
/// transcription engine, plus a smoothed 0...1 level for the waveform UI.
final class AudioRecorder {
    private let engine = AVAudioEngine()
    private(set) var isRunning = false

    /// Called on the audio thread with each captured buffer.
    var onBuffer: ((AVAudioPCMBuffer) -> Void)?
    /// Called on the main thread with a normalized input level (0...1).
    var onLevel: ((Float) -> Void)?

    func start() throws {
        guard !isRunning else { return }
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0 else {
            throw NSError(domain: "FreeFlow.Audio", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "No audio input device available."
            ])
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            self.onBuffer?(buffer)
            let level = Self.normalizedLevel(of: buffer)
            DispatchQueue.main.async { self.onLevel?(level) }
        }
        engine.prepare()
        try engine.start()
        isRunning = true
    }

    func stop() {
        guard isRunning else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        isRunning = false
    }

    /// RMS power mapped through a decibel curve so quiet speech (and
    /// whispering) still moves the meter visibly.
    private static func normalizedLevel(of buffer: AVAudioPCMBuffer) -> Float {
        guard let channelData = buffer.floatChannelData?[0] else { return 0 }
        let frames = Int(buffer.frameLength)
        guard frames > 0 else { return 0 }
        var sum: Float = 0
        for i in 0..<frames {
            let sample = channelData[i]
            sum += sample * sample
        }
        let rms = sqrt(sum / Float(frames))
        let db = 20 * log10(max(rms, 1e-7))
        // Map -55 dB...-10 dB to 0...1.
        let normalized = (db + 55) / 45
        return min(max(normalized, 0), 1)
    }
}
