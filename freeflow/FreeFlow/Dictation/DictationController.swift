import AppKit
import Combine
import Foundation

/// The heart of the app: coordinates hotkeys, audio capture, transcription,
/// formatting, and insertion. Implements Wispr-Flow-style interaction:
///
///   - Hold the dictation key to talk (push-to-talk); release to insert.
///   - Double-tap the dictation key for hands-free; tap again to finish.
///   - Esc cancels the current dictation.
///   - Hold the command key with text selected to speak an editing
///     instruction (Command Mode).
@MainActor
final class DictationController: ObservableObject {
    enum Mode: Equatable {
        case idle
        case recording(handsFree: Bool)
        case commandRecording
        case processing
    }

    @Published private(set) var mode: Mode = .idle
    /// Rolling input levels for the waveform (newest last).
    @Published private(set) var levels: [Float] = Array(repeating: 0, count: 28)
    /// Live partial transcript while recording.
    @Published private(set) var partialTranscript = ""
    /// Transient hint or error surfaced in the Flow Bar.
    @Published private(set) var statusMessage: String?

    let settings: AppSettings
    let history: HistoryStore
    let dictionary: DictionaryStore
    let snippets: SnippetStore

    private let hotkeys = HotkeyMonitor()
    private let recorder = AudioRecorder()
    private let engine: TranscriptionEngine = AppleSpeechEngine()
    private let inserter = TextInserter()

    // Push-to-talk vs tap/double-tap bookkeeping.
    private let holdThreshold: TimeInterval = 0.35
    private let doubleTapWindow: TimeInterval = 0.45
    private var keyDownDate: Date?
    private var awaitingSecondTap = false
    private var singleTapCancelWork: DispatchWorkItem?

    // Context of the in-flight recording.
    private var recordingStart: Date?
    private var targetApp: AppContext.FrontApp?
    private var commandSelection: String?

    private var statusClearWork: DispatchWorkItem?
    private var cancellables: Set<AnyCancellable> = []

    init(settings: AppSettings, history: HistoryStore,
         dictionary: DictionaryStore, snippets: SnippetStore) {
        self.settings = settings
        self.history = history
        self.dictionary = dictionary
        self.snippets = snippets
        wireHotkeys()
        settings.$dictationKey.merge(with: settings.$commandKey)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.refreshHotkeyConfig() }
            .store(in: &cancellables)
    }

    func startMonitoring() {
        refreshHotkeyConfig()
        hotkeys.start()
    }

    private func refreshHotkeyConfig() {
        hotkeys.dictationKey = settings.dictationKey
        hotkeys.commandKey = settings.commandKey
    }

    private func wireHotkeys() {
        hotkeys.onDictationKeyDown = { [weak self] in self?.dictationKeyDown() }
        hotkeys.onDictationKeyUp = { [weak self] in self?.dictationKeyUp() }
        hotkeys.onCommandKeyDown = { [weak self] in self?.commandKeyDown() }
        hotkeys.onCommandKeyUp = { [weak self] in self?.commandKeyUp() }
        hotkeys.onEscape = { [weak self] in self?.escapePressed() }
    }

    // MARK: - Dictation key handling

    private func dictationKeyDown() {
        switch mode {
        case .recording(handsFree: true):
            // Hands-free: press again to finish.
            stopAndInsert()
        case .recording(handsFree: false):
            if awaitingSecondTap {
                // Second tap of a double-tap: promote to hands-free.
                singleTapCancelWork?.cancel()
                awaitingSecondTap = false
                mode = .recording(handsFree: true)
                setStatus("Hands-free — press \(settings.dictationKey.displayName) or ✓ to finish")
            }
        case .idle:
            keyDownDate = Date()
            startRecording(handsFree: false)
        case .commandRecording, .processing:
            break
        }
    }

    private func dictationKeyUp() {
        guard case .recording(handsFree: false) = mode, !awaitingSecondTap else { return }
        let heldFor = Date().timeIntervalSince(keyDownDate ?? .distantPast)
        if heldFor >= holdThreshold {
            // Push-to-talk: release inserts.
            stopAndInsert()
        } else {
            // A quick tap: keep listening briefly in case a second tap
            // arrives (double-tap = hands-free); otherwise cancel.
            awaitingSecondTap = true
            let work = DispatchWorkItem { [weak self] in
                guard let self, self.awaitingSecondTap else { return }
                self.awaitingSecondTap = false
                self.cancelRecording()
                self.setStatus("Hold \(self.settings.dictationKey.displayName) to talk, double-tap for hands-free")
            }
            singleTapCancelWork = work
            DispatchQueue.main.asyncAfter(deadline: .now() + doubleTapWindow, execute: work)
        }
    }

    private func escapePressed() {
        switch mode {
        case .recording, .commandRecording:
            singleTapCancelWork?.cancel()
            awaitingSecondTap = false
            cancelRecording()
        default:
            break
        }
    }

    /// Used by the Flow Bar and menu bar: click to toggle hands-free.
    func toggleHandsFree() {
        switch mode {
        case .idle:
            startRecording(handsFree: true)
        case .recording:
            stopAndInsert()
        default:
            break
        }
    }

    /// Flow Bar ✕ button.
    func cancelFromUI() {
        escapePressed()
    }

    // MARK: - Recording lifecycle

    private func startRecording(handsFree: Bool) {
        guard Permissions.allGranted else {
            SoundPlayer.playError()
            setStatus("Grant Microphone, Speech, and Accessibility permissions in FreeFlow settings")
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        targetApp = AppContext.frontmostApp()
        recordingStart = Date()
        partialTranscript = ""
        levels = Array(repeating: 0, count: levels.count)

        engine.onPartial = { [weak self] text in
            self?.partialTranscript = text
        }
        do {
            try engine.begin(locale: Locale(identifier: settings.localeIdentifier),
                             contextualStrings: dictionary.contextualStrings,
                             onDeviceOnly: settings.onDeviceOnly)
            let engine = self.engine
            recorder.onBuffer = { buffer in engine.append(buffer) }
            recorder.onLevel = { [weak self] level in self?.pushLevel(level) }
            try recorder.start()
            mode = .recording(handsFree: handsFree)
            SoundPlayer.playStart()
        } catch {
            engine.cancel()
            SoundPlayer.playError()
            setStatus(error.localizedDescription)
        }
    }

    private func stopAndInsert() {
        guard case .recording = mode else { return }
        mode = .processing
        recorder.stop()
        SoundPlayer.playStop()
        let duration = Date().timeIntervalSince(recordingStart ?? Date())
        let target = targetApp

        Task { @MainActor in
            let raw = await engine.finish()
            defer {
                partialTranscript = ""
                mode = .idle
            }
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else {
                setStatus("Didn't catch that")
                return
            }

            let final = await self.finalText(for: trimmed, target: target)
            var inserted = final
            if settings.trailingSpace && !inserted.hasSuffix("\n") {
                inserted += " "
            }
            inserter.insert(inserted)
            history.add(DictationEntry(rawText: trimmed,
                                       finalText: final,
                                       targetApp: target?.bundleID,
                                       targetAppName: target?.name,
                                       duration: duration))
        }
    }

    /// Snippet expansion → rule-based formatting → optional AI pass.
    private func finalText(for raw: String, target: AppContext.FrontApp?) async -> String {
        if let snippet = snippets.match(raw) {
            return snippet.content
        }
        let style = settings.toneMatching
            ? AppContext.style(for: target?.bundleID)
            : .standard
        let options = TextFormatter.Options(
            removeFillers: settings.removeFillers,
            applySelfCorrections: settings.applySelfCorrections,
            style: style,
            replacements: dictionary.replacements)
        var text = TextFormatter().format(raw, options: options)

        if settings.aiFormatting, !settings.anthropicAPIKey.isEmpty {
            let hint: String
            switch style {
            case .standard: hint = "clear written prose"
            case .casual: hint = "casual chat message"
            case .technical: hint = "technical text; keep code and identifiers verbatim"
            }
            let claude = ClaudeClient(apiKey: settings.anthropicAPIKey)
            if let polished = try? await claude.format(transcript: text, styleHint: hint),
               !polished.isEmpty {
                text = polished
            }
        }
        return text
    }

    private func cancelRecording() {
        let hadAudio = !partialTranscript.isEmpty
        let duration = Date().timeIntervalSince(recordingStart ?? Date())
        recorder.stop()
        let partial = partialTranscript
        engine.cancel()
        SoundPlayer.playCancel()
        if hadAudio {
            // Cancelled dictations stay findable in Recent Activity.
            history.add(DictationEntry(rawText: partial,
                                       finalText: partial,
                                       targetApp: targetApp?.bundleID,
                                       targetAppName: targetApp?.name,
                                       duration: duration,
                                       cancelled: true))
        }
        partialTranscript = ""
        mode = .idle
    }

    // MARK: - Command Mode

    private func commandKeyDown() {
        guard mode == .idle else { return }
        guard Permissions.allGranted else {
            SoundPlayer.playError()
            setStatus("Command Mode needs all permissions granted")
            return
        }
        mode = .commandRecording
        targetApp = AppContext.frontmostApp()
        recordingStart = Date()
        partialTranscript = ""
        commandSelection = nil

        Task { @MainActor in
            // Grab the selection first, then start listening for the
            // instruction — the user is still holding the key.
            let selection = await inserter.captureSelection()
            guard mode == .commandRecording else { return }
            guard let selection else {
                mode = .idle
                SoundPlayer.playError()
                setStatus("Select some text first, then hold \(settings.commandKey.displayName) and speak an instruction")
                return
            }
            commandSelection = selection
            engine.onPartial = { [weak self] text in
                self?.partialTranscript = text
            }
            do {
                try engine.begin(locale: Locale(identifier: settings.localeIdentifier),
                                 contextualStrings: [],
                                 onDeviceOnly: settings.onDeviceOnly)
                let engine = self.engine
                recorder.onBuffer = { buffer in engine.append(buffer) }
                recorder.onLevel = { [weak self] level in self?.pushLevel(level) }
                try recorder.start()
                SoundPlayer.playStart()
            } catch {
                engine.cancel()
                mode = .idle
                SoundPlayer.playError()
                setStatus(error.localizedDescription)
            }
        }
    }

    private func commandKeyUp() {
        guard mode == .commandRecording else { return }
        guard let selection = commandSelection, recorder.isRunning else {
            // Released before the selection capture finished.
            mode = .idle
            return
        }
        mode = .processing
        recorder.stop()
        SoundPlayer.playStop()

        Task { @MainActor in
            let instruction = await engine.finish()
                .trimmingCharacters(in: .whitespacesAndNewlines)
            defer {
                partialTranscript = ""
                commandSelection = nil
                mode = .idle
            }
            guard !instruction.isEmpty else {
                setStatus("Didn't catch an instruction")
                return
            }
            let claude = settings.anthropicAPIKey.isEmpty
                ? nil
                : ClaudeClient(apiKey: settings.anthropicAPIKey)
            let processor = CommandProcessor(claude: claude)
            do {
                let result = try await processor.apply(instruction: instruction, to: selection)
                // The original selection is still highlighted; pasting
                // replaces it.
                inserter.insert(result)
            } catch {
                SoundPlayer.playError()
                setStatus(error.localizedDescription)
            }
        }
    }

    // MARK: - UI helpers

    private func pushLevel(_ level: Float) {
        levels.removeFirst()
        levels.append(level)
    }

    private func setStatus(_ message: String) {
        statusMessage = message
        statusClearWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.statusMessage = nil }
        statusClearWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.5, execute: work)
    }
}
