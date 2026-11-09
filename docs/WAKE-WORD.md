# Hands-free Hey Capri

> Superseded interaction: see [compact voice conversations](COMPACT-VOICE.md)
> for the microphone-only UI, silent text chat and speech interruption. The
> implementation and validation notes below document the earlier panel flow.

Wake listening is enabled by default for this requested upgrade, unless a saved
wakeWordEnabled preference disables it. Restart Capri, allow the default
microphone if Windows requests it, and wait for the Hey Capri indicator to report
listening. Say "Hey Capri" and then a request, in one utterance or separately.
She opens the existing conversation UI and listens without a click. The addressed
request sends after an utterance pause and the remaining audio is flushed.

An existing unsent draft is preserved and requires review rather than automatic
submission. Manual microphone dictation still requires Send. A truncated or
cancelled voice request never submits automatically. Saying "cancel" during an
empty-draft wake session closes it. Disable the listener with the microphone
indicator or Sound > Hands-free listening > Hey Capri. Spoken replies use the
existing Speak chat replies preference and selected local voice.

## Across applications and games

The local listener continues when the character is stowed or hidden by games or
fullscreen. It is independent of the decorative game-mode pause. A recognized
address temporarily permits the requested foreground conversation and displays
its panel; it does not change the saved gaming setting or enable background
actions. Closing that conversation restores ordinary hiding and pause behavior.
A wake phrase during a pending reply can interrupt that reply for a new request.
Manual dictation and Capri's own speech playback temporarily own the microphone
path, so wake recognition yields during them to avoid self-triggered loops.

Capri must remain running, Windows must be awake, and microphone access must be
available. OS restrictions, exclusive microphone use and exclusive fullscreen
rendering can affect availability. This is local ASR phrase matching, not speaker
authentication or a dedicated low-power wake-word model. TV/audio can trigger an
address; consequential actions retain existing review requirements.

## Local processing and resource use

The existing local Whisper large-v3-turbo / Silero pipeline processes short
speech segments, matching the complete address at the beginning of an utterance.
Ordinary speech transcripts are discarded in the main process. Ambient audio and
transcripts are not sent to Codex, logged, or saved as recordings. Only the
addressed request text enters ordinary Codex conversation after activation.
Unrecognized text is never delivered to the renderer. In-memory segment queues
are bounded; there is no continuous audio recording or growing history.

The listener keeps the existing local model warm; CPU/GPU use and memory are
higher than with wake listening disabled. Existing runtime/model downloads are
required on first use. Recognition waits for a short speech pause and local
inference, so latency depends on hardware and speech conditions. After detection,
the same microphone stream and backend session transfer to dictation, preserving
words immediately following Hey Capri. Listening rearms after the request while
Capri remains running. Revocation, reload, process loss and shutdown cancel
capture; shutdown also stops the local recognition worker.

## Validation

Legacy isolated Electron smoke runs disable background wake startup unless explicitly
launched with --wake-live; they do not implicitly download models or open the mic.

The 200-test Node suite passed, including strict wake matching, ambient transcript
suppression, capture beyond 90 seconds, game-pause-independent detection, stream
handoff, auto-send after flush, draft preservation, revocation and cancellation.
Changed JavaScript entry points passed syntax checks. Windows directory packaging
is checked separately; neither unit tests nor packaging establish microphone
recognition accuracy or latency. The restricted session's isolated Electron
runtime exits with 0x80000003, so normal-Windows microphone, fullscreen overlay,
recognition, resource and spoken-reply acceptance remains pending. No running
Capri instance was restarted and nothing was pushed or released.
