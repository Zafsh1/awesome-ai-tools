import AVFoundation
import Speech

/// Speech-to-text backed by Apple's Speech framework. Runs on-device when the
/// locale supports it (no audio leaves the Mac), with streaming partial
/// results for live feedback in the Flow Bar.
final class AppleSpeechEngine: NSObject, TranscriptionEngine {
    var onPartial: ((String) -> Void)?

    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    private let stateQueue = DispatchQueue(label: "com.zafsh.freeflow.speech")
    private var latestTranscript = ""
    private var finished = false
    private var finishContinuation: CheckedContinuation<String, Never>?

    func begin(locale: Locale, contextualStrings: [String], onDeviceOnly: Bool) throws {
        cancel()

        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            throw NSError(domain: "FreeFlow.Speech", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Speech recognition is not available for \(locale.identifier)."
            ])
        }
        self.recognizer = recognizer

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.taskHint = .dictation
        request.addsPunctuation = true
        if !contextualStrings.isEmpty {
            request.contextualStrings = Array(contextualStrings.prefix(100))
        }
        if onDeviceOnly && recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }
        self.request = request

        stateQueue.sync {
            latestTranscript = ""
            finished = false
            finishContinuation = nil
        }

        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            self.stateQueue.async {
                if let result {
                    self.latestTranscript = result.bestTranscription.formattedString
                    let text = self.latestTranscript
                    DispatchQueue.main.async { self.onPartial?(text) }
                    if result.isFinal {
                        self.resumeFinishLocked()
                    }
                }
                if error != nil {
                    // Errors after endAudio() are expected when the session is
                    // short or silent — settle with whatever we heard.
                    self.resumeFinishLocked()
                }
            }
        }
    }

    func append(_ buffer: AVAudioPCMBuffer) {
        request?.append(buffer)
    }

    func finish() async -> String {
        request?.endAudio()
        let transcript = await withCheckedContinuation { (continuation: CheckedContinuation<String, Never>) in
            stateQueue.async {
                if self.finished {
                    continuation.resume(returning: self.latestTranscript)
                } else {
                    self.finishContinuation = continuation
                    // Don't hang forever if the recognizer never finalizes.
                    self.stateQueue.asyncAfter(deadline: .now() + 5) {
                        self.resumeFinishLocked()
                    }
                }
            }
        }
        tearDown()
        return transcript
    }

    func cancel() {
        stateQueue.sync { resumeFinishLocked() }
        tearDown()
    }

    /// Must be called on `stateQueue`.
    private func resumeFinishLocked() {
        guard !finished else { return }
        finished = true
        finishContinuation?.resume(returning: latestTranscript)
        finishContinuation = nil
    }

    private func tearDown() {
        task?.cancel()
        task = nil
        request = nil
        recognizer = nil
    }

    /// Locales the current OS can transcribe, for the language picker.
    static var supportedLocales: [Locale] {
        SFSpeechRecognizer.supportedLocales().sorted {
            $0.identifier < $1.identifier
        }
    }
}
