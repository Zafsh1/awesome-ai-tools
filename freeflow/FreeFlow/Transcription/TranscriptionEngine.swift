import AVFoundation

/// Abstraction over speech-to-text backends. The default implementation uses
/// Apple's Speech framework (on-device where supported). The protocol keeps
/// the door open for other engines — e.g. a whisper.cpp backend like the one
/// Mila uses — without touching the dictation pipeline.
protocol TranscriptionEngine: AnyObject {
    /// Streaming partial transcript updates, delivered on the main thread.
    var onPartial: ((String) -> Void)? { get set }

    /// Start a new recognition session.
    func begin(locale: Locale, contextualStrings: [String], onDeviceOnly: Bool) throws

    /// Feed captured audio (called from the audio thread).
    func append(_ buffer: AVAudioPCMBuffer)

    /// Signal end of audio and wait for the final transcript.
    func finish() async -> String

    /// Abort the session, discarding any transcript.
    func cancel()
}
