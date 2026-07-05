# FreeFlow 🎙️

**Effortless voice dictation for macOS — a native, open-source Swift app inspired by [Wispr Flow](https://wisprflow.ai/).**

Hold a key, speak naturally, and clean, formatted text appears wherever your cursor is — Slack, Mail, Notion, VS Code, Cursor, WhatsApp, any app with a text field. FreeFlow transcribes **on-device** with Apple's Speech framework (no audio leaves your Mac), then runs an auto-edit pass that removes filler words, applies your mid-sentence corrections, and matches the tone of the app you're writing in.

## Features

| Wispr Flow behavior | FreeFlow implementation |
|---|---|
| **Push-to-talk** — hold `fn`, speak, release to insert | Global hotkey monitor; hold `fn` (or Right ⌘ / ⌥ / ⌃) to talk |
| **Hands-free mode** — double-tap to start, tap to stop | Double-tap the dictation key; ✕ / ✓ buttons in the Flow Bar; `Esc` cancels |
| **Flow Bar** — the little lozenge at the bottom of the screen | Non-activating `NSPanel` pinned bottom-center, on every Space and over full-screen apps, with a live waveform while you speak |
| **Works in any app** | Text is inserted at the cursor via the pasteboard + synthetic ⌘V; your clipboard is snapshotted and restored |
| **Auto-edits** — fillers removed, backtracking applied | Rule-based formatter: strips "um/uh/you know", handles "meet Tuesday — wait, Wednesday", expands "new line"/"new paragraph", fixes punctuation and capitalization |
| **Tone matching** — casual in chat, polished in docs | Detects the frontmost app: chat apps get casual style, code editors/terminals get hands-off technical style, everything else gets full sentences |
| **Personal dictionary** | Custom words bias the recognizer (`contextualStrings`) and optional replacements rewrite the transcript ("gpt four" → "GPT-4") |
| **Snippets** — say a trigger, paste a saved block | Say "insert my calendar link" while dictating and the full snippet is inserted |
| **Command Mode** — edit selected text by voice | Select text, hold the command key (default Right ⌘), speak "make this a bullet list" / "make it more professional". Common transforms run locally; free-form edits use Claude (bring your own API key) |
| **Whisper-friendly** | Level meter and recognition are tuned to pick up quiet speech |
| **100+ languages** | Language picker backed by `SFSpeechRecognizer.supportedLocales()` |
| **History & stats** | Words dictated, words this week, average WPM, day streak, searchable history (cancelled dictations included) |
| **Notes** | Quick voice notes captured inside the app |
| **Onboarding** | Guided setup: permissions → hotkey → first dictation |

**Where FreeFlow deliberately differs:** Wispr Flow sends audio to the cloud for its AI formatting; FreeFlow is local-first (on-device recognition + rule-based formatting) with *optional* AI polish via the Anthropic API using your own key. There are no accounts, no word limits, and no subscription.

## Requirements

- macOS 14.0 (Sonoma) or later
- Xcode 15.3+ to build
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (installed automatically by `make bootstrap` via Homebrew)

## Building

```sh
cd freeflow
make project   # generates FreeFlow.xcodeproj from project.yml
make run       # builds Debug and launches the app
# or: make open  → build & run from Xcode
```

## First run

FreeFlow needs three permissions (onboarding walks you through them):

1. **Microphone** — to capture your voice
2. **Speech Recognition** — to transcribe it (on-device where the locale supports it)
3. **Accessibility** — to watch the global hotkey and paste text into other apps (System Settings → Privacy & Security → Accessibility)

Then put your cursor in any text field, **hold `fn` and talk**. Release to insert. Double-tap `fn` for hands-free. Press `Esc` to cancel.

> ⚠️ The `fn`/Globe key is a hardware signal that only Apple-built keyboards emit. On third-party keyboards, switch the dictation key to Right ⌘ or Right ⌥ in Settings.
>
> If macOS's own "Press fn to start Dictation" feature is enabled, turn it off (System Settings → Keyboard → *Press 🌐 key to* → **Do Nothing**) so the two don't fight.

## Command Mode

Select text anywhere, hold **Right ⌘**, and speak an instruction:

- Offline, instant: *"uppercase"*, *"lowercase"*, *"title case"*, *"bullet list"*, *"numbered list"*, *"single line"*, *"remove punctuation"*
- With an Anthropic API key (Settings → AI): anything — *"make this more professional"*, *"summarize into three bullets"*, *"translate to French"*, *"shorten this paragraph"*

## Architecture

```
FreeFlow/
├── App/            SwiftUI entry, menu-bar extra, app delegate, composition root
├── Audio/          AVAudioEngine capture + input level metering
├── Transcription/  TranscriptionEngine protocol + AppleSpeechEngine
│                   (protocol keeps the door open for a whisper.cpp backend)
├── Formatting/     TextFormatter (fillers, self-corrections, spoken commands,
│                   punctuation) + AppContext (per-app tone matching)
├── Dictation/      HotkeyMonitor (fn / right-modifier keys, global NSEvent
│                   monitors) + DictationController (the state machine)
├── Insertion/      TextInserter (pasteboard-swap ⌘V insertion, selection capture)
├── CommandMode/    CommandProcessor (local transforms) + ClaudeClient
│                   (raw URLSession → Anthropic Messages API)
├── Data/           Codable models + JSON persistence in
│                   ~/Library/Application Support/FreeFlow/
├── UI/             Flow Bar (NSPanel + SwiftUI), main window (Home, History,
│                   Dictionary, Snippets, Notes, Settings), onboarding
└── Support/        Permissions, sounds, launch-at-login
```

**Dictation pipeline:** hotkey ⭢ `AVAudioEngine` buffers ⭢ `SFSpeechRecognizer` (streaming partials drive the waveform bar) ⭢ snippet match **or** rule-based formatting (+ optional Claude pass) ⭢ pasteboard-swap ⌘V insertion ⭢ history entry.

## Privacy

- Speech recognition runs **on-device** when the selected language supports it (toggle in Settings). Nothing is uploaded.
- History, dictionary, snippets, and notes are plain JSON files in `~/Library/Application Support/FreeFlow/`.
- The only network calls are the **optional** Anthropic API features, off unless you enter a key.

## Known limitations

- The paste-based insertion can't target secure input fields (password boxes) — by design of macOS.
- Recognition quality is Apple's Speech framework; a whisper.cpp backend (as in [Mila](https://github.com/island-io/mila)) can be slotted in behind `TranscriptionEngine` for higher accuracy.
- App Sandbox is disabled (required for global hotkeys and synthetic key events), so this app is for direct distribution, not the Mac App Store.

## License

MIT — same as this repository.
