# Capri Animation Overhaul 2.0

Current direction: improve the original sprites and rig with bouncier, more
charming motion. The generated-art overhaul below is retained as a historical
experiment, with those assets restricted to developer previews. Opening is frozen.

User feedback: the original art style is preferred. Original artwork is restored
as the default, and generated candidates are retained only for explicit developer
previews (`previewCelArt: true` in the isolated cel check). Normal launches do not
load those atlases. Future frame art must match the original visual style.
The new full-frame renderer/authoring workflow remains available.

User feedback: the original art style is preferred. Original artwork is restored
as the default, and generated candidates are retained only for explicit developer
previews (`previewCelArt: true` in the isolated cel check). Normal launches do not
load those atlases. Future frame art must match the original visual style.
The new full-frame renderer/authoring workflow remains available.

## Audit and scope

Inspected `sprite.js`, `acting.js`, `capri.js`, `companion.js`, existing PNGs,
`tools/build-sprite.py`, `ANIMATIONS.md`, animation/sitting tests and isolated
Electron animation checks. The source cutout is 240x420 with a large angular
crimson mane, green mask, violet torso, and asymmetric green/red limbs. The old
WebGL fragment shader mirrors one arm, rotates masked limbs, folds legs and
warps the head/mane. Its exposure sheets contain numeric poses, not new images.
Smooth sheets interpolate; legacy action beats hold poses. This explains the
puppet-like movement despite an extensive action catalog.

`Capri` owns stance, floor/ledge geometry, priority, pointer capture, falls,
idle scheduling, activity cooldowns, work/alert/sleep, pointing and reduced
motion. `Companion` chooses personality-driven idle acts. Keep those behavioral
signals; do not add a competing timer or autonomous state controller.
`intro()` delegates the opening to `fx.intro()` and finishes via `arrive()`;
portrait/cutin art and opening audio are separate assets. Do not replace them.
Existing tests validate numeric poses, interpolation, seated geometry and quiet
behavior; they previously did not prove that independent sprite art existed.

## Art direction and acceptance bar

Preserve the angular crimson mane, green mask, slender silhouette, asymmetric
limbs and impish curiosity. Preserve the original angular, textured rendering,
line treatment, proportions and costume language. Improve motion and expressions
within that style; the cleaner generated-art redesign is not the preferred direction. Develop
front and three-quarter model sheets plus color/line/shadow references before
large-scale production. Avoid tiny details that disappear on a desktop.

Every new performance needs authored full-body silhouettes: anticipation,
action, follow-through and settle. Hair, torso, expression and hands should
change with weight and intent. Moving old pieces or generating interpolated
rig screenshots does not count as new drawing production. AI-generated images
must be labeled as such. A human animator cleanup pass is still desirable;
this repository does not claim that generated frames were drawn by a person.

Acceptance per clip: consistent anatomy/costume, no clipping or background,
transparent clean edges, stable ground/seat contact, readable hands and mask,
intentional exposure timing, no unplanned jumps or mirrored costume drift,
quiet default, reduced-motion hold, priority interruption, matching entry/exit
poses, and inspection at native desktop size on light and dark backgrounds.
A hard cut between redesigned art and an old rig state is transitional debt,
not a completed premium transition system.

## Implemented slice

- Eight independently generated whole-character raster drawings for a curious
  chin-touch / head-tilt / settle performance; source and individual PNGs retained.
- Twelve additional full-body drawings for a standing breathing/blinking loop.
  Twenty supplied raster drawings total, with a shared neutral between clips.
- Recipe-driven atlas packing from grids or explicit ordered PNG sequences,
  uniform drawing scale per source, foot registration at logical (128,418),
  transparent logical 240x420 cells and editable millisecond exposures.
- Versioned JSON manifest validation, held-frame sampling, GPU atlas playback
  that bypasses all limb warping, grading, speckles and shader line boil.
- Rest now plays the twelve-drawing breath/blink loop, with the old frame 0
  exposed at its beginning/end. `idlePreen` and `think` reuse the curious
  performance. There are two performances, not three distinct gestures.
- A state-owned base clock advances ambient drawings and restarts at the shared
  neutral after gestures or unsupported states. Changing motion preferences
  also starts/holds neutral rather than jumping into a blink.
- Existing priorities and act promises own completion; clip timing is scaled
  to its invoking act. Frame 0 is the final settle to avoid a loop seam.
- Per-frame alpha hit testing in both facing directions. Existing opening,
  travel, gaming, floor/window sitting, drag/fall, pointing and unsupported
  gestures use the original renderer. Busy states cannot select cel playback.
- Missing/invalid art falls back to the original rig. Reduced motion holds
  frame 0; disabling companion idle animations also holds the ambient drawing.
  Existing motion preferences continue to suppress automatic gestures.

This is an integration and art-direction candidate. It does not implement
new sit/stand, talking, listening, emotion, locomotion or contextual frame art.
Continuous breathing/blinking is implemented. The remaining phase 1 art, model
sheet and polished bridges between old/new silhouettes remain work below.

## Ordered production plan

| Phase | Deliverables / concrete work | Gate before next phase |
| --- | --- | --- |
| 0: audit + vertical slice | Preserve original opening; source drawings, atlas, held-frame renderer, hit tests and runtime check | Eight distinct frames visibly play, restore rest, no rig deformation, tests/package pass |
| 1: lock art + foundational idle | Model sheet; neutral breathe (12), relaxed sway (12), blink/glance (8), curious (cleanup 8), hands-behind-back (12), alert idle (10) | Review native-size clips and alpha edges, approve silhouette and shared neutral pose |
| 2: seated performance | Floor sit-down (16), floor settle (8), floor sit breathe (12), stand-up (16); separate ledge sit-down (16), dangling legs (16), ledge stand (16), seated sleepy (12) | Author per-frame seat/head/foot anchors; window move/close/minimize, floor collision and chat gestures remain grounded |
| 3: communication | Listen enter (8), listen loop (12), listen exit (8); think enter/loop/exit (8/12/8); talk enter/gesture/settle (8/16/8); small/medium mouth sets if mask design supports them | Real chat streaming, cancel/error, wake phrase and approval transitions; no invented speech activity |
| 4: gestures + personality | Wave (16), stretch (20), preen (16), shrug (14), nod (10), head shake (12), point enter/hold/exit (12/6/12), peek (16), yawn (18), amused laugh (16) | Distinct silhouettes, anti-repeat scheduling, cooldowns; no noisy routine effects |
| 5: emotion + context | Success (16), small delight (14), surprise (12), concerned (14), error frustration (16), reassuring (14), reading (16), searching (16), typing (16), curious observation (16) | Map only observed app/tool events; gaming/hidden/quiet rules; contextual reactions do not imply new PC actions |
| 6: locomotion + cleanup | Pickup/flail (16), fall loop (12), floor landing (12), ledge landing (12), turn (12), relocate departure/arrival (16 each); shared transition library | Drag/drop and interrupted state continuity; no regression to opening or gaming effects |
| 7: polish + rollout | Light/dark/high-DPI review, memory/CPU checks, atlas budgets, art credits/provenance, remove superseded rig acts only after parity | Interactive Windows review and packaged build on clean machine; release through existing PR process |

Counts are initial drawing budgets, not completed assets or promises of a fixed
production rate. Phase 1 precedes dozens of clips so model drift is caught early.
Do not generate an enormous sheet of unrelated gestures and call it animation.

## Transition design to implement

Give each clip posture, entry/exit pose IDs, contact anchor, facing strategy,
priority, loop segment and safe interruption markers. Add a resolver that routes
standing-neutral -> listen-enter -> listen-loop -> listen-exit -> neutral.
Use authored bridge drawings where silhouettes differ, never slow image morphs
as a substitute for in-betweens. Urgent events may interrupt at once; ambient
idles should finish at their next safe marker. Queue at most one latest ambient
request, dropping obsolete requests. Busy opening/travel remains exclusive.

For seats, replace hardcoded thigh deformation with explicit contact anchors
and frame geometry before enabling new seated art. Head/panel anchors should
follow authored landmarks. Keep physical position separate from drawing-local
motion, with feet/seat pinned and hand hit areas updated per frame. Define how
asymmetric costume details behave for left/right before drawing separate facings.

Reduced motion should use an expressive key drawing per state with no loop;
hidden/gaming/fullscreen should stop cel updates. Respect existing quiet mode
and do not add routine audio. Do not add desktop capture or observation polling.

## Authoring / packing / validation workflow

1. Write action brief and exposure sheet. Select shared entry/exit drawing.
2. Create or import full-body PNG drawings; keep unmodified source and provenance.
   The recipe currently lists `source.png` (4x2 curious) and `idle-source.png`
   (4x3 breathing). Artist PNG sequences already work through a source `files`
   array, with explicit ordering and no renderer changes required.
3. Inspect each source at 100% and at desktop size. Reject clipped hair, bad
   hands, drifting anatomy or opaque backgrounds. Do not hide defects with rigs.
4. Install the pinned authoring dependency with
   `python -m pip install -r tools/animation-requirements.txt`, then run:
   `python tools/pack-animation.py assets/capri/animation-v2/source.png`.
   It reads adjacent `recipe.json`, crops whole drawings, uses a common scale per
   source, registers feet, and writes individual frames, `atlas.png`, and
   `atlas.json`. It rejects clipped drawings and atlas texture-budget overflow.
   Recipe clips reference named drawings (for example `breathe:6`) plus hold
   durations, shared entry/exit pose IDs and an explicit motion-off still frame.
5. Run the same command with `--check` to compare atlas pixels/manifest with a
   deterministic rebuild. Source and per-frame SHA256 hashes record exactly which art was packed.
   Individual PNGs are verified too. Add
   `--preview .caprigpt-local/cel-check` to export actual-frame dark/light GIFs.
6. Run `npm test`, `npm run test:animations`, and `npm run test:cels`.
   The cel check uses isolated Electron with a separate local profile, decodes
   real PNGs, exercises twenty GPU drawings, loop seams, preference changes,
   alpha clicks and state fallbacks. Native-size light/dark GPU snapshots are
   `.caprigpt-local/cel-check/breathing-gallery.png`. The check uses offscreen
   rendering and invalidates the compositor before capture to avoid partial
   hidden-window screenshots.
7. Review runtime capture, both facings, dark/light backdrop and a full-speed loop;
   keep contact sheets and art-source credits. Then package with
   `npx electron-builder --win --x64 --dir --publish never`.
8. Record evidence and unresolved visual limitations here before a PR. Never
   report a unit-test pass as proof of art quality or a native installer test.

Near-term tooling: add per-frame contact/head/hand landmarks, reject duplicate
frames except documented holds, detect atlas padding bleed, and expand contact
sheet/editor support. Ordered PNG sequences, editable exposure JSON, preview
GIFs, hashes and texture budgets are now implemented.
At present the manifest runtime supports multiple clips on one resident atlas;
lazy multi-atlas loading/LRU, blending/bridges and animation editor UI are planned.

## Validation record

See the final work-session results appended below. No push, PR, release,
automatic restart or opening-animation replacement is part of this change.


### First slice verification (Windows x64, Node 24.15.0, Electron 44.9.3)

- `npm test`: 266/266 passed.
- `npm run test:cels`: passed real atlas loading, eight GPU drawings,
  undeformed art, completion to rest, alpha hit tests for both facings, busy
  and ledge fallback, and emulated reduced-motion hold.
- `npm run test:animations`: passed existing priorities/cooldowns, seated chat,
  idle selection, gaming, actual pointer drag/drop, floor/ledge landing and
  reduced motion. A concurrent run hit the existing 25-second watchdog while
  packaging/full tests were running; the isolated rerun passed in about 8 seconds.
- Deterministic pack `--check`: passed; eight complete registered RGBA drawings.
- `npx electron-builder --win --x64 --dir --publish never`: passed; unsigned
  unpacked Windows app produced. No installer or clean-machine install test.
- `git diff --check`: passed. Compared the complete `intro()` function with
  branch HEAD and verified opening effects and original art have no changes.
- Inspected the actual WebGL capture at `.caprigpt-local/cel-check/curious.png`.
  An animated review export is `.caprigpt-local/cel-check/curious.gif`.
- Desktop special-folder shortcut inspected: already targets this checkout's
  Electron executable with quoted absolute project argument, project working
  directory and Capri icon. No rewrite was needed.

No live-app restart was performed; restart normally to load the updated source.
Interactive daily use, subjective full-speed art review, silhouette bridges,
light-background review and installer validation remain unverified. The new
art still shows some costume/hair drift; this candidate should receive animator
cleanup before scaling production. No claims of human-drawn frames are made.


### Foundational idle verification (Windows x64, Node 24.15.0, Electron 44.9.3)

- Added twelve AI-generated breathing/blinking drawings; twenty whole drawings
  now packed in a 960x2100 atlas. At RGBA8 the texture and CPU hit map each use
  about 7.69 MiB, excluding decoded source images and driver overhead. Runtime
  validation caps resident atlases at 4096 per edge and 4,194,304 pixels.
- `npm test`: 269/269 passed, including looping exposure coverage, distinct
  frame hashes, source hashes, shared neutral seams, base clock reset after a
  gesture/interruption, motion-off holds/resume and gesture time scaling.
- `npm run test:cels`: passed all twenty real GPU drawings, breath/blink loop,
  neutral seam/return, idle preference, alpha hits, reduced motion and fallback.
- `npm run test:animations`: passed original animation/interaction regressions.
- Recipe rebuild `--check`: passed atlas pixels, manifest and individual PNGs.
  An isolated ordered-PNG sequence import using real frames also passed packing
  and a deterministic rebuild; input order and exposure order were preserved.
- `npx electron-builder --win --x64 --dir --publish never`: passed, unsigned
  unpacked Windows app. No installer or clean-machine validation performed.
- Native desktop-size GPU gallery inspected on dark and light backgrounds.
  The closed-eye drawing is present and whole characters fit without clipping.
  Review exports: `.caprigpt-local/cel-check/rest-dark.gif`, `rest-light.gif`,
  `curious-dark.gif`, `curious-light.gif`, and `breathing-gallery.png`.

Phase 1 is still incomplete: front/three-quarter model sheets, separate relaxed
sway, glance, hands-behind-back, alert idle and curious cleanup are pending.
The shared neutral reduces the loop/gesture boundary jump; authored bridges to
legacy rig silhouettes are still pending. Existing opening remains unchanged.
No live app restart, push, PR or release was performed.


### Original-art charm pass

At the user's request, work now focuses on the existing sprites rather than
producing replacement character art. No new image generation in this pass.
The original texture, palette, line boil, speckles and opening are unchanged.

Reworked thirteen motion sheets: `stand`, `focus`, `idleBreathe`, `idleListen`,
`idleYawn`, `idleBounce`, `idleWave`, `idleSway`, `idlePreen`, `idleStretch`,
`listen`, `think`, and `talk`. Standing uses unequal float beats, small
compression before rising, and delayed arm/hair motion. Waves have uneven
hand beats and a little lift; stretch/preen have anticipation and a soft rebound.
The dance/bounce has a larger first lift and a smaller second echo. Talking
uses unequal nods and a restrained hand accent. Work/focus remains quieter.
These are improved rig performances using existing art, not new sprite frames.

Quiet squash/stretch remains small; the larger bounce is bounded to 0.94-1.04
scale and ten screen pixels of vertical motion. A `charm` sheet marker keeps
seated reactions at unit body scale and zero vertical bob, with lean limited
to 1.2 degrees. Hands, hair and head still move while floor/ledge contact and
underlying leg motion are preserved. Existing priority, cooldown, reduced
motion and gaming rules remain in effect. No new routine sound/effect cues.

Validation: 271 unit tests; original Electron animation interactions plus the
preview-only cel regression check; Windows unpacked packaging. New checks cover
motion continuity across every millisecond/loop seam, restrained deformation,
a visible anticipation/lift, and planted seated gestures on both floor/windows.
The previous test requiring exactly four standing keys was replaced with the
actual behavior requirement (a smooth looping stance), since the new float
uses ten timed poses. Original opening and character files remain unchanged.

Before/after review: `npx electron scripts/preview-original-motion.js` reads the
committed HEAD acting sheet as baseline, samples the real WebGL renderer at
25 fps, and composites the same physical canvas transforms side by side.
It uses a separate local profile, does not start/restart the live companion,
and saves PNG sequences under `.caprigpt-local/charming-motion/`. The session
also exported `stand-before-after.gif`, `idleWave-before-after.gif` and
`idleBounce-before-after.gif` there. PNG captures were visually inspected.
The preview does not draw replacement art or synthesize new sprite frames.

No automatic restart, push, PR or release. Restart normally to load the changes.
