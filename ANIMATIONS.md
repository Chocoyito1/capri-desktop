# Animation Overhaul 2.0

Current direction: improve movement using the existing art. Standing floats,
quiet gestures and chat reactions now have more bounce, anticipation and
follow-through. Seated gestures remain planted.

Original art is the default again following user feedback. Generated sprite
candidates are saved for developer previews only. Future new frames should
match the original art style; the opening remains unchanged.

See [the actionable roadmap](docs/ANIMATION-OVERHAUL-2.0.md) for the new full-body
raster slice, source provenance, authoring commands, implemented scope and backlog.
The original opening and its assets remain unchanged. The notes below describe
the earlier rig-based expansion, which remains the fallback for unsupported states.

---

# Capri animation expansion

The original `capri-full.png`, shader rig, colors, line boil and silhouette are unchanged.
Quiet exposure sheets now interpolate at display cadence (up to 60 fps), with short
140–160 ms blends into and out of gestures. Their original key poses and durations
remain intact. Impact sheets retain their original held drawings and 24 fps action
timing. No generated art, replacement sprites or new sounds.

| Animation | Trigger |
| --- | --- |
| `idleSway` | Gentle side-to-side head and mane sway |
| `idlePreen` | Small one-handed mane gesture |
| `idleStretch` | Both arms stretch, then settle |
| `idleWave` | Raises one hand, gives three small waves and a brief “Hi!” greeting |
| `idleBreathe` / `idleListen` | Subtle body breathing and an attentive head/body lean |
| `idleYawn` / `idleBounce` | Sleepy stretch or a small full-body ghost dance |
| `sitDown` / `floorSit` / `standUp` | Desktop rest: settle down, sway and wiggle folded feet, then get up |
| `listen` | Opening chat or entering an approval-wait state |
| `think` | Local chat request or an observed tool without a more specific action |
| `read` | Observed read/view/inspect/list tool |
| `search` | Observed search/grep/glob/find/fetch/browser tool |
| `type` | Observed write/edit/patch/notebook tool |
| Gaming teleport | Gaming mode teleports Capri off screen; resuming teleports her back |

The `gameReady` hand pose remains available for manual previews; Gaming mode uses
the original teleport collapse, beam, shards and reassembly effects instead.

Idle gestures start after 12–22 seconds, then vary every 16–30 seconds without an
immediate repeat. They work standing and seated. They pause during work, sleep,
chat generation, travel, dragging, pointing and gaming. Existing wandering and
larger idle flourishes remain available. Routine tool reactions have a 4.5 second
cooldown, can replace a quiet idle gesture, and respect stronger reactions.

While a local chat response is pending, the existing focus cycle plays underneath
the thinking gesture. It clears on the first answer text, completion, error or
closing chat. Codex notification activity keeps its separate work/alert state.

Gaming mode still pauses AI, stops window tracking, unloads models and hides Capri.
Its departure uses her existing teleport-out effect, with a 1.1 second fallback if
the renderer does not answer. On resume, Capri starts invisible before the overlay
is shown and teleports into her safe corner, since her old window may have closed.
Hidden/stowed/dormant Capri stays put away. A short move may finish before departure;
dragging or longer travel skips that departure. Reduced motion uses a short fade
out/in and skips automatic idle gestures.

## Try it

Desktop sitting uses the original artwork and leg rig. After 45–80 seconds at the
desktop floor, an idle Capri can take a 20–40 second seated break. She then stands
and waits 90–150 seconds before another break. Resting pauses wandering and large
idle flourishes. Travel, dragging, hidden/fullscreen and Gaming mode block new sits;
work and chat generation block automatic breaks. Window perching is unchanged.

Tell her **sit down**, **take a seat**, **stand up**, or **get up** in chat. These
commands run locally without model inference; **siéntate / sentate** and
**levántate** also work. If needed, she first teleports down to the desktop floor.
Busy moves finish before accepting another posture command. Reduced motion uses
a still sitting pose and immediate posture changes.

Restart Capri when convenient to load the changed source; an already running copy
keeps its loaded code. No automatic restart is performed.

1. Leave Capri idle and watch for the quiet variations. Try her seated
   on a window too; she should stay anchored to its ledge.
2. Open chat and send a question: she listens, thinks, and returns to her prior
   work/idle cycle when the reply arrives. Closing a pending chat clears focus.
3. With Codex hooks connected, use read, search and edit tools. Distinct action
   poses should appear between events; rapid tool bursts should stay quiet.
4. Turn Gaming mode on in the control room: she collapses into light and teleports
   off screen. Resume through the same switch or the tray: she teleports back into
   her corner with the original arrival effects.
5. With Windows reduced motion enabled, teleporting uses a short fade instead.

## Verification

- `npm test` checks the exposure sheets, tool mapping and existing app behavior.
- `node_modules/electron/dist/electron.exe scripts/check-animations.js` uses an
  isolated renderer to check actual WebGL drawings, action priority, idle rotation,
  chat focus cleanup, seated anchoring and gaming gating. It saves a pose gallery
  under `.caprigpt-local/animation-check/poses.png` without starting Capri or AI.
- `npm run test:settings` exercises the real control room and gaming pause/resume
  with an isolated test profile and model unload mocked.

No animation claims to observe gameplay or infer game events. The gaming gesture
is tied to the actual Gaming mode switch.

## Dragging and dropping

Hold the left mouse button on Capri and move more than five pixels: she squirms
with alternating arm swings, leg kicks and trailing mane motion. These physical
animations interpolate at up to 60 fps, with short blends into pickup, falling
and landing. Her original artwork and ink texture remain unchanged. The held
point follows the pointer directly, without added bobbing or glitch flashes.

Release above the desktop to see her fall under gravity, then settle with a soft
landing. She can also land on a free window ledge. Releasing at the floor or right
beside a ledge lands directly. A click without dragging still opens her usual
status. Pointer capture keeps the drag active outside her silhouette; cancellation
or losing focus releases her safely. Reduced motion uses a still held pose and
places her directly on the landing surface.

The isolated Electron check exercises actual mouse pickup/release, focus-loss
cleanup, falling to the floor, landing on a window and reduced-motion handling.

## Companion life and smooth motion

The renderer's `Companion` controller extends `Capri.behave()` rather than starting
another animation loop. Quiet base cycles, gestures, floor sitting and standing
interpolate through their original poses. Gentle counter-lean and compression
carry movement through the body; the mane and limbs retain their authored
follow-through. The original texture, shader, palette, ink cadence and dramatic
action sheets are preserved. Existing drifting shards and data glyphs also move
at display cadence; no new effect sprites are needed.

Appearance settings independently control idle gestures, pointer/desktop
reactions, personality, daily routine and rare surprises. Existing wandering,
window tracking/perching and window mischief controls keep their behavior.
Game mode, fullscreen, hidden state, work, alerts, dragging, travel and active
animations take priority. Reduced motion freezes base poses and suppresses quiet
gestures, cursor reactions, daily gestures and surprises.

Personality is fictional, local energy/playfulness state, persisted in renderer
localStorage under `capri.companion.v1`. It gradually settles toward a time-of-day
energy level. Interaction increases playfulness; work/alerts use focused/attentive
moods. The current state shapes gesture selection and provides bounded character
context to existing chat. Turning personality off uses a calm mood. Corrupt or
unavailable storage falls back safely; this is separate from personal memory.

Routine phases follow the PC's local time: morning 06–12, afternoon 12–18,
evening 18–23, night 23–06. A quiet stretch, glance, breathing gesture or yawn runs
once per phase/day, after a one-minute startup grace period. The phase is saved
to prevent restart repeats; blocked periods do not queue multiple gestures.
The existing evening report also respects the routine switch and game/fullscreen.

Rare surprises reuse spin/hop/split. After at least 20 minutes, an eligible idle
moment has a 25% chance, then waits another 20–40 minutes before checking again.
Successful surprises have a persisted minimum 30-minute cooldown. Foreground
changes produce a small glance at most once a minute; nearby pointer dwell can
earn a greeting, with a 30-second cooldown. These use existing geometry/events,
without screen capture, app changes or additional observation permissions.

Use **/actions**, **wave**, **dance**, **stretch**, **take a nap**, **wake up**,
**come here**, or **how are you feeling?** in chat. English and Spanish direct
commands are supported, alongside existing sit/stand commands. Negations, quoted
examples, hypothetical requests and commands for other apps remain ordinary chat.
Gestures route locally before AI or desktop tasks. If Ollama is unavailable,
choose **Local actions (no AI)** from the offline panel. Voice uses the existing
microphone button: dictate, review the text, then Send; it never listens in the
background or auto-executes a transcript. Come here uses the existing cursor
location and summon behavior, rechecking availability after the asynchronous read.

`tests/companion.test.js` checks time boundaries, persistence, invalid storage,
state decay, rate limits, busy/game/fullscreen/reduced-motion gates, command
routing, asynchronous cursor races and continuous poses including loop seams.
The renderer check verifies actual sub-frame limb motion as well as WebGL,
drag/drop and floor/ledge anchoring; the settings smoke checks all five switches
through the production IPC boundary.

## Live panel portrait

All message and chat panel avatars now use `assets/capri/portrait-blink.png`, a
new two-frame portrait with open and closed eyes. It preserves Capri's red angular
hair, lime face, blue concentric eyes and jagged grin with cleaner portrait art.
Original full-body art, desktop icons and cinematic cut-ins remain in use.

The portrait blinks every few seconds, with an eased close/open, brief cyan and
magenta echoes, displaced signal bands, and a faint traveling scan line. The
first interference burst appears after 1–2.5 seconds; later bursts are spaced
3.5–7 seconds apart and last 280 ms. Displaced bands use the composed blink
frame, so glitching does not reopen closed eyes. There are no full-frame flashes.
A slim violet-to-mint border and faint scanlines
frame it. Animation stops when its panel is hidden or suspended, the document is
hidden, or reduced motion is enabled. Existing mood names share this consistent
portrait, with a brief glitch when the mood changes instead of different crops.

`node_modules/electron/dist/electron.exe scripts/check-portraits.js` verifies asset
loading, blinking, glitching, all mood names, visibility and reduced motion. It
saves an actual-size panel preview to `.caprigpt-local/portrait-check/panels.png`.
Art provenance and the generation prompt are in `assets/capri/portrait-source.md`.

The chat draft starts as a single-line textarea and grows to two and then three
lines as text wraps, including long unbroken words or explicit newlines. Longer
drafts scroll vertically with a violet scrollbar. Deleting text shrinks it;
sending resets it to one line. Dictation and panel-width changes resize it too.
Enter sends,
Shift+Enter adds a line, and composition/active dictation cannot submit by
accident. Microphone, Send and Close stay aligned along the bottom edge. The
existing 500-character draft limit remains. The portrait check also verifies
wrapping, scrolling, multiline submission and keyboard/dictation guards.

## Automatic fullscreen teleport

On Windows, Capri now teleports away when the foreground app covers her entire
display, then teleports back when fullscreen ends or you switch away. Normal
maximized windows and fullscreen apps on another display do not trigger this.
The detector reads only native window geometry every 50 ms; it does not collect
screenshots, titles, keystrokes or send an AI request. The teleport begins as soon
as a changed state arrives and takes 160 ms (an 80 ms fade with reduced motion).

Each new fullscreen state reverses the current visual transition immediately.
There is no queue of teleport tasks. A revision number prevents old snapshots,
animation acknowledgments or delayed hide timers from overriding a newer state.
The overlay becomes click-through immediately, hides after departure, and has a
260 ms hide fallback for an unresponsive renderer. Temporary animation throttling
is disabled during the transition so losing focus does not stall it.

Fullscreen presence composes over the current sprite without changing its alpha
or its regular teleport state. Manual stowing and Gaming mode remain independent;
resuming Gaming mode while still fullscreen keeps Capri hidden. Putting her away
or bringing her out while fullscreen updates her state without waiting on hidden
animation frames.

Verification: `npm test` includes geometry/detection, rapid reversals, late snapshots
and reduced motion. Run `node_modules/electron/dist/electron.exe scripts/smoke-electron.js --fullscreen-only`
for an isolated production-app check of the native-probe → IPC → shader → OS
visibility path. That check supplies simulated native window geometry and tests
rapid toggles, stale hide acknowledgments, overlapping ordinary teleports, Gaming
mode combinations and manual stow; it does not take over the desktop with a real
fullscreen app.

Fullscreen return also restores native mouse activation with `setFocusable(true)`
before `showInactive()`, without focusing over the foreground application. The
renderer resends its click-through state and refreshes the cursor after arrival,
even if it has not moved. Revision checks discard stale cursor replies during
rapid toggles. This repairs a return path that showed Capri but retained the
disabled native focus state. The fullscreen smoke test now checks focusability,
stationary-pointer routing, actual pointer events for character clicks and drag,
and Send/Close buttons, alongside the existing visibility and rapid-toggle cases.

## Sound-reactive speech aura

Spoken audio adds a violet silhouette halo with mint edge accents to the current
drawing. The voice analyser drives its intensity after accounting for output
volume; text, generation and microphone activity do not activate it. A 65 ms
attack and 125 ms release smooth syllables and playback stops. A gentle pulse
runs at display cadence independently of cel animation. Reduced motion removes
the pulse while keeping the sound envelope. Hidden, stowed and gaming states
clear the effect. The aura does not change character geometry or hit testing.

Run `node_modules/electron/dist/electron.exe scripts/check-speech-aura.js` for
an isolated, silent native playback check and local speaking/silent captures.
