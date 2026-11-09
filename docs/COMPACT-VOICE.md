# Compact voice conversation

2026-11-09. Text chat is silent even when spoken replies are enabled. Dictating
into the text composer remains a reviewed text draft. Background check-ins and
agent suggestions no longer start TTS. Sound's explicit voice preview is still
available for auditioning the voice.

Both the voice menu and "Hey Capri" enter the same compact voice session. It
shows only a 30-pixel microphone above Capri. The icon follows her head, appears
green while listening and violet while replying, and is dim while preparing or
thinking. No transcript, chat card, activity text, or launcher remains on screen.
The overlay does not request keyboard focus. Native action confirmation gates
remain in force; this flow adds no automatic approval.

After the wake phrase, the existing microphone stream and addressed words are
handed over without restarting capture. Whisper continues listening across
turns. The same Codex brain and conversation history answer voice and typed
messages; a trusted voice-turn option requests natural spoken prose. Only
addressed/session transcripts reach the normal reasoning backend. Idle wake
transcripts remain local and discarded, as before. No audio recordings are saved.

Interruption uses local Silero v5 via `@ricky0123/vad-web` 0.0.31 and
`onnxruntime-web` 1.22.0, served entirely from installed application dependencies.
The detector shares the existing echo-cancelled microphone stream and runs on
one WASM CPU thread. Sustained neural speech detection stops scheduled audio,
cancels generation, and resets recognition with a bounded 500 ms pre-roll so the
beginning of the interruption is retained. Recognition revisions, chat IDs and
playback epochs discard stale outputs. Brief noise does not use a simple volume
threshold to interrupt speech. Browser echo cancellation and noise suppression
are enabled; real microphone/speaker echo still requires user acceptance testing.

Clicking the microphone, pressing Escape while the overlay receives keyboard
events, saying "stop listening" / "end call", or opening text chat ends the
session. After 60 seconds without input or an active reply it returns to wake-only
listening. The icon disappears. Disconnection, revoked wake access for a
wake-started session, muting, disabling speech and app unload cancel capture.

## Validation

- Unit tests cover silent typed replies, complete wake-request assembly,
  speech interruption, stale generation/delta rejection, echo transcript gating,
  continuous input beyond 90 seconds and recognition reset.
- `electron scripts/check-voice-call.js`, with `CAPRI_VOICE_TEST_WAV` pointing at
  an authorized local speech sample, exercises real offline Silero/WASM in the
  native renderer with a synthesized MediaStream. It checks brief-click rejection,
  audio cancellation, a 30-pixel icon and a hidden chat surface. It never captures
  the user's microphone. The observed warm detection cut audio about 190 ms after
  the first positively classified speech frame; this is not a hardware latency
  guarantee.
- `electron scripts/smoke-electron.js --voice-flow-only --wake-live` uses an
  isolated profile, Chromium's fake microphone, and fake recognition/reasoning/TTS
  backends. It checks the real app/preload/main flow: silent typed chat, wake
  handoff, voice-only output, continuous microphone ownership, hidden panel,
  manual compact voice entry and click-to-end.
- The existing settings smoke check passes. Production dependency audit reports
  no known vulnerabilities for the newly installed dependency graph.

Authoritative detector documentation:
[browser setup](https://docs.vad.ricky0123.com/user-guide/browser/) and
[API](https://docs.vad.ricky0123.com/user-guide/api/).

The desktop shortcut continues to target this checkout directly. No running
Capri session is restarted, and no branch is pushed or release published.
