# Local validation

Validated on this Windows laptop during the CapriGPT build session:

- Upstream `79a016c` (0.3.1) cloned, dependencies installed, original Electron app launched and its local health endpoint responded.
- `npm.cmd ci`: installed successfully; npm audit reported zero known vulnerabilities at installation time.
- Ollama `llama3.2:3b` downloaded (Q4_K_M, about 2 GB on disk).
- GPU reported as RTX 5070 Ti Laptop GPU, 12,227 MiB VRAM.
- `npm.cmd test`: five safety tests pass. These cover address restrictions, request bounds/unload/no-tools/redirect policy, cloud metadata rejection, cancellation, and the desktop confirmation gate with simulated responses.
- `npm.cmd run test:desktop`: actual Electron renderer/preload/main/Ollama flow passes. A submitted arithmetic question received streamed model output and displayed `15` in the successful run. The test verifies that output came from stream events rather than a canned greeting.
- Same desktop test verifies disabled app-closing requests, cancellation of active inference, gaming-mode hiding and blocking, unloaded model via `/api/ps`, and overlay resume.
- The app's own chat capture was inspected visually (`captures/local-chat.png`). It contains only the transparent application overlay, not a desktop screenshot.
- `git diff --check`: passes.

One cold-start inference took roughly 27 seconds in Ollama's server log; subsequent runs were faster. This is a functional prototype, not a performance benchmark. Small model answers can be inaccurate or stay too much in character; a failed arithmetic answer in an earlier run prompted clearer helpful-assistant instructions. No gaming FPS test was performed.

Real applications were not closed or force-quit as part of validation. Approval behavior was tested with fake app backends; production requests use the native confirmation gate. No Windows installer was built and no cloud inference request was sent. After browser access connected, the GitHub fork was created at https://github.com/Chocoyito1/capri-desktop and the prototype branch was pushed. No PR or release was created. Inherited asset rights limitations still apply.

## Companion identity update

Removed Claude as the default collaborator from the system prompt and task context. Default help now describes local Ollama chat with planned ChatGPT/Codex task integration. Legacy hook setup remains in a labelled submenu. Added explicit limits against inventing calendar, clock, sunrise, orbit tracking or live task access. Restart clears the old in-memory conversation.

Safety tests and the desktop smoke test pass after this change. The updated live chat test answered: "I\'m working with ChatGPT and Codex as my collaborators, but their task integration isn\'t connected yet, so I don\'t have access to their current tasks or activities." The sampled response is evidence for this prompt, not a guarantee that a small generative model will never hallucinate. Gaming cancellation/unload/resume checks also passed.

## Codex notification milestone

Nine tests pass, including bounded metadata stripping, late-event deduplication, safe installer merging/removal, and a real forwarding child process against the authenticated HTTP receiver. The Electron smoke test passes for hook-to-renderer approval notifications, clearing on resume, cancellation/unload, gaming suppression, alerts after gaming resume, and local handoff preview/copy with mocked clipboard writes. Captured `captures/codex-notifications.png` is labelled CODEX · TEST and was inspected visually.

The installed Codex CLI reports version 0.164.0-alpha.11.1 and ChatGPT sign-in. A read-only app-server hooks/list call recognizes all eight installed CapriGPT definitions. They are enabled but untrusted: no genuine lifecycle dispatch is claimed yet. Review via /hooks is the remaining activation step. No trust bypass, account token extraction, cloud inference request, or background agent was used. Ordinary ChatGPT chats have manual handoff only.

## Real CLI activation verified

All eight hook definitions were confirmed trusted and enabled. The user’s app-bundled 0.164.0-alpha.11.1 terminal completed test prompts but did not launch the forwarder in this environment. Installing the complete official @openai/codex 0.164.0 package separately and launching it in a terminal with TERM cleared produced a genuine, non-test completion delivery (HTTP 200). The user confirmed that Capri visibly reacted. No account credentials or trust state were replaced. Desktop-app-originated events remain unverified.

Added an authenticated read-only receiver status endpoint and a bounded last-delivery diagnostic file without conversation content. Smoke tests use their own profile and connection file so they can run without stopping the live companion.

## Working-label cleanup

Fixed a state-isolation bug where an unfinished diagnostic fixture could keep the CODEX ticker visible after a genuine turn completed. Real events now remove test-only state, and test fixtures cannot enter an already-live connection. The renderer also excludes test state from real activity decisions. Ten tests pass, including a regression for an unfinished test task followed by a real task completion. The currently running older build needs a normal restart to load this change.

## Message/ticker overlap fixed

A delayed ticker callback could reveal the small working label after a full message had already opened, covering its portrait and text. Accepted messages now cancel pending ticker updates; delayed callbacks recheck visibility and suspension. The ticker returns only after the message exit animation. A real Electron layout regression passes for delayed tool updates, dismissal, and suspension/resume. The cropped capture captures/panel-layout-fixed.png was inspected visually.

## Shared desktop/CLI connection settings

Observed HTTP 403 from the previously saved connection details after a desktop-shortcut launch. Moved notification connection material to a shared, Git-ignored per-checkout runtime directory, preserved its token across restarts, and delayed publishing until the port is bound. After the user restarted Capri, the authenticated status check succeeded with gamingMode false, visible true and rendererReady true. No genuine desktop-app-originated lifecycle event has arrived yet. The app-server process predates the installed hooks; a desktop app restart is the next activation check. Ten tests and the isolated Electron layout test pass.

## Desktop activation and quiet reactions verified

After restarting the desktop app, “test capri” produced non-test ready/working events for native chat 01a1769f-6db1-75c1-8066-23571142e87a, accepted with HTTP 200. The user confirmed the visible reaction. This supersedes the pending desktop activation status above.

Quiet mode keeps routine work silent, throttles burst pulses, and uses a new held-pose focus cycle with the original cut-out and renderer. Existing seated, completion-hop and error animations are reused. Twelve tests pass, covering routine silence, burst throttling, sticky approval, competing turns, errors, completion and loop timing. The isolated Electron integration smoke test passes through actual hook delivery and the real renderer without requiring Ollama. The full model/chat smoke test was not run for this animation change; Ollama was offline. Restart Capri normally to load the changes.

## Opening greeting restored

Removed the first-launch-only condition from the existing full “hi” entrance. Visible fresh launches now play the original intro, while the onboarding message remains first-launch-only. Starting stowed still respects the saved visibility setting, missing intro assets still fall back to materialization, and reduced motion is handled by the existing intro implementation. Clicking the shortcut while Capri is already running displays status instead of restarting her. The isolated Electron integration smoke test passes with this startup path.

## Click status follows Codex activity

The click/status handler previously consulted only legacy sessions, so it could claim idle while Codex notifications animated work. It now queries the same observed Codex snapshot as the animation controller. Approval takes precedence across concurrent turns, then errors and work; completed turns allow the existing idle/talk fallback. The status query has no approval or action side effects. Twelve tests pass with added status assertions; the isolated Electron test delivers real hook fixtures and invokes the exact status handler used by clicks, verifying the working text and panel state before testing approval/resume/completion.

## Chat access, activity display and Ollama recovery

Working/error status panels now include the existing Talk action. Chat displays a separate activity line, updated from Codex snapshots without replacing the conversation on routine work or completion. Approval alerts keep their existing priority. Offline status distinguishes a standard Windows Ollama installation from an absent one; the explicit Start Ollama button launches only that fixed executable with `serve`, hidden and bound to the validated loopback endpoint. No model is loaded by the start action, and gaming mode blocks it. Missing installations retain the download link; other failures such as gaming mode are no longer mislabeled as a missing model.

On this laptop, Ollama was installed but stopped. Started the local server, verified llama3.2:3b remained installed, and observed no loaded model before chat. Thirteen tests pass, including explicit-start recovery and Talk availability. The full Electron smoke test passes: Talk button opens the real chat, activity updates without closing it, a real local response streams, gaming cancellation/unload/resume works, and starting Ollama is denied while gaming. The chat capture was visually checked; its activity line fits above the conversation. After testing, Ollama reports no loaded models.

## Ollama starts with Capri

At the user's request, visible or stowed Capri launches now prepare the installed local Ollama server in the background. Gaming mode skips startup. The existing server is reused, missing installations retain the setup flow, and no model is preloaded. Chat status waits for startup readiness so an early click does not incorrectly report an offline server. The manual Start Ollama button remains available for retries. This supersedes the manual-only startup behavior described above.

The isolated Electron startup/integration check passes with the running server reused, and `/api/ps` still reports no loaded models afterward. Cold server startup was verified through the shared runtime helper in the preceding change.

## Chat closing and repeat body clicks (2026-11-09)

Body clicks now show the conversation launcher idempotently: a rapid second
click does not toggle it closed and release overlay focus. The fullscreen
watcher preserves the last external-app state while Capri owns foreground
focus, and requires 150 ms of sustained fullscreen evidence before hiding her.
Brief activation rectangles during chat close cannot trigger a collapse and
return in place. Returning from genuine fullscreen remains immediate.

On Windows, `npm test` passed all 326 tests. New watcher regressions cover a
brief chat-close activation rectangle and repeated overlay focus round trips;
the launcher test verifies repeated show requests neither dismiss nor refocus.
`electron scripts/smoke-electron.js --fullscreen-only` passed in a separate
profile with native Chromium input: repeat body clicks keep the launcher and
character visible; the X closes chat without movement, loss of opacity, or a
teleport; a simulated 75 ms fullscreen signal after closing produces no state
revision or animation. Sustained fullscreen detection was observed at 217 ms.
Existing drag, fullscreen reversal, gaming and manual-stow checks also passed.
Fullscreen geometry and chat inference were simulated; the user's exact live
desktop occurrence was not independently reproduced. No active Capri instance
was restarted. Restart normally to load these changes.

## Sound-reactive speech aura (2026-11-09)

Added a violet/mint silhouette aura driven by spoken playback amplitude, with
smooth attack/release and a gentle pulse. The analyser accounts for master
volume, mute and suspended audio. Reduced motion keeps the envelope without
the periodic pulse; hiding Capri clears the effect immediately.

On Windows, all 343 tests pass. `electron scripts/check-speech-aura.js` passed
using real Web Audio scheduling and analysis in isolated offscreen Electron:
idle, audible playback, CSS rendering, natural completion, zero volume and
interruption. Output was silenced downstream of analysis. The speaking capture
under `.caprigpt-local/speech-aura-check/` was visually inspected. This verifies
the playback path using a synthetic tone; a live spoken conversation remains
for user validation. Windows x64 directory packaging with publishing disabled
also passed. No running Capri instance was restarted.

## Repository checkpoint and text-chat blips (2026-11-09)

Text chat now retains synthesized text blips when spoken replies are enabled.
The TTS preference previously suppressed both the panel typewriter and streamed
reply cues, even though typed chat deliberately does not synthesize speech.
Voice-mode deltas remain blip-free and the existing global mute still applies.

Windows 10.0.26200 x64 / Node 24.15.0 / Electron 44.9.3: all 343 unit tests,
Windows x64 directory packaging (`--publish never`), original-art animation
checks, preview-cel checks, the isolated cognitive integration check and the
new `--chat-sounds-only` Electron check passed. The cognitive fixture now uses
a distinct synthetic app name so startup foreground observations cannot consume
the fixture's cooldown before its three observations.

The broader `--voice-flow-only` check passed its text-chat sound assertions but
timed out waiting for the wake listener; continuous wake-to-voice flow is not
revalidated by this checkpoint. Live model/voice quality and installer testing
remain outside these checks. Local configuration, models, reference audio,
credentials and captures stay excluded. This is a development checkpoint of the
unreleased 0.4.0 prototype, without a release tag or publication.
