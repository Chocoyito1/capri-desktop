# Capri roadmap implementation audit — 2026-11-07

Follow-up: the core project companion is now implemented. See
[PROJECT-COMPANION.md](PROJECT-COMPANION.md) for selected workspaces, scoped goals,
user-authored decisions, reported outcomes and observed command-exit receipts.
The original audit below records the starting implementation, not the follow-up
feature's final status. [Restart continuity](COMPANION-CONTINUITY.md) now adds
project recall and natural goal/decision updates; [daily reviews](DAILY-REVIEW.md)
now summarize saved evidence, open goals and next steps. The follow-up full suite
passed 324/324 tests and the isolated cognitive Electron smoke passed with mocked
Codex inference. [Grounded curiosity](GROUNDED-CURIOSITY.md) now connects inquiries
to saved command exits, planning changes and explicit feedback.
[Reusable routines](REUSABLE-ROUTINES.md) now add explicit teaching, persistent
named definitions and foreground execution through existing tools with ordered
receipt tracking. Broader voice/animation polish and everyday native acceptance
remain follow-up work.

Audited the current Windows checkout, including its substantial pre-existing
uncommitted changes, against the nine features in “Capri Roadmap Functions”.
No branch switch, staging, commit, push, release or live companion restart was
performed. This is an implementation audit, not a claim that every native/model
path has passed real-world acceptance. File names and functions below identify
the actual implementation rather than relying on earlier roadmap descriptions.

## Nine-feature assessment

| Feature | Starting status | Evidence and actual behavior | Remaining gap / result of this work |
| --- | --- | --- | --- |
| Self-questioning | Partial | `src/main/cognitive-foundation.js`: `observeApp`, `openQuestions`, `recordReflection`, SQLite evidence/review revisions. `src/main/cognitive-reflection.js`: `ReflectionEngine.run`, schema-validated hypothesis/counterpoint, two attempts/hour, cancellation. Constructed in `src/main/main.js`. | Real persistent, model-assisted inquiry exists. Its only detector is three foreground activations in ten minutes; it cannot establish repeated errors, project progress or user frustration. Added lock/dictation/wake-session gates; keep broader evidence collection as a separate next milestone. |
| Proactive conversation | Implemented, bounded | `src/main/proactive-conversation.js`: `run`, source rotation, 5–15 minute randomized opportunities, persisted cadence/hashes, generated silence, similarity checks. `main.js` wires availability and delivery into foreground history; `src/renderer/js/app.js` presents and speaks remarks. | Meaningful generated openings already exist. Fixed permission changes during awaited collection/model work. Old screen-observer controls and capability claims were inaccurate and are now corrected. Quality/appropriateness still needs live observation. |
| Screen / app awareness | Implemented for snapshots | `src/main/pc-context.js`: `DEFAULT_PRIVACY`, `ContextService.snapshot`, permission revalidation, all-app defaults. `src/main/screen-access.js`: `snapshot`, `act`. `main.js` wires Electron capture and Win32 input; `src/main/codex-tools.js` forwards image/receipt tools. | Foreground screen interpretation and screenshot-based control exist; no accessibility-tree reader or continuous activity understanding. Background conversations use app/title context, not screenshots. Fixed stale/replaced/consumed/resized frames after approval. Broad observation remains enabled by default; no recording/keylogging added. |
| Goals / intentions | Partial: inquiries and temporary task goals only | `src/main/task-context.js`: six recent task receipts in RAM with ten-minute expiry. Curiosity questions persist, but they are not user goals. `src/main/request-interpreter.js` extracts per-request outcomes, not durable plans. | Added `src/main/companion-goals.js`: explicit durable goals, next step, pause/resume/done, deletion/export, bounds and privacy/retention. `main.js` routes `/goals` locally and adds active records to `currentContext`. Core durable intentions now exist; project linkage, verified progress and natural-language goal edits remain partial. |
| Project companion | Partial | `src/main/codex-events.js`: `fromHook`, `accept`, `snapshot` retain bounded project basename/stage/tool metadata. `src/renderer/js/integration.js` and `brain.js` react to lifecycle. `main.js` supplies event snapshots and recent task receipts to Codex. `CodexBrain` uses the user's home as default workspace. | Capri can react to project activity, but has no selected project/root, decision journal, project-specific retrieval or verified milestones. Hooks deliberately omit code/prompts/results. She must not claim she understands a repository merely from its basename or a completion event. |
| Conversation memory | Partial | `src/main/memory.js`: SQLite facts, edits, deletion/export, retention, keyword search and profile flag. `memory-agent.js` validates requested changes. `codex-tools.js` exposes recall and atomic changes. `codex-brain.js` keeps 24 messages in RAM; `conversation-context.js` has a separate older packing path. | Durable explicit facts work; ordinary chat history is not durable. Current Codex chat primarily relies on tool-selected recall; the older `PersonalAssistant.prepare` automatic profile injection is not called by the active `chat:send` path. No episodic/decision memory, semantic retrieval, or automatic contradiction reconciliation. Do not silently persist transcripts as a shortcut. |
| Contextual animation / voice | Implemented | `src/renderer/js/companion.js`: routine, decorative mood, availability, idle choice and pointer/app reactions. `integration.js` handles Codex activity. `acting.js`, `capri.js`, `portrait.js` preserve the rig. `app.js` binds speech amplitude; `speech-output.js`, `src/main/tts.js`, `speech.js`, `wake-phrase.js` implement playback/local input. | Existing rig, animation files, timing and voice behavior were preserved. Mood is decorative, not evidence of emotion. Live voice quality, interruption comfort and native timing still need manual acceptance. Daily routines are animations, not reflection. |
| Research / skills | Partial, substantial tools exist | `src/main/web-tools.js`: public search/news/YouTube/Steam services; `action-agent.js`: bounded execution/receipts. `codex-brain.js`: native foreground shell/file/web and configured CLI connections, tool budget, approval handling and cancellation. `codex-client.js` gates native features. | Requested research is available; a learned reusable skill registry, provenance-backed research memory and reliable project-specific skill selection are not. ChatGPT plugins are not automatically inherited. Do not build another parallel tool executor. |
| Daily reflection | Missing | `cognitive-reflection.js` reviews one open inquiry when fresh evidence exists. `src/renderer/js/mission.js` stores activity counters; `companion.js` selects time-of-day gestures. No day-keyed reflective journal or daily synthesis scheduling exists in the active main-process path. | Build after project/decision evidence exists: local-date-keyed, restart-safe, bounded summaries that distinguish observations, confirmed outcomes and unresolved hypotheses. Never turn speculative reflections into personal facts or invented accomplishments. |

## Bugs and improvements addressed

1. **Screen actions could outlive their evidence.** The frame was checked before
   awaiting confirmation. A user could approve after its 30-second expiry, monitor
   resize, newer snapshot, or consumption elsewhere. `ScreenAccess.act` now checks
   identity, age and geometry again immediately before dispatch. Snapshot geometry
   is copied so an in-place monitor mutation cannot rewrite captured evidence.
2. **Background reflection could run while locked.** Lock cancelled the current
   turn, but periodic scheduling could restart it because reflection's availability
   callback omitted session state. It now includes session, voice-session and
   dictation gates. The real Electron wiring is exercised with synthetic power
   events; the test does not lock the user's PC.
3. **Proactive sources could become revoked during an await.** The service now
   revalidates its normalized source policy after collection/model awaits and
   before delivery. Changed permissions or language discard the result rather
   than using an earlier grant. The application already cancels on settings
   changes; this also makes the service correct independently of that caller.
4. **Settings/self-description advertised an inactive observer.** The screen and
   90-second/twelve-attempt background loop in `autonomy.js` is not instantiated
   by `main.js`. The settings page, registry and presence documentation now describe
   the active proactive/inquiry services. Legacy configuration remains readable.
5. **Persistent questions were being mistaken for durable user goals.** A separate
   bounded local goal service now stores only explicit user intentions. It does
   not alter curiosity, task execution, animations or the existing personal-fact
   schema. Deleted/updated goal commands clear model chat history to avoid stale
   context. Recall-disabled goals never enter automatic model context.

## Recommended next work, in order

1. **Select a project and ground its progress.** Persist a user-selected root and
   link goals, user-confirmed decisions and verified outcomes. Scope retrieval and
   file work to that project. Keep observed Codex lifecycle separate from actual
   evidence of changed files/tests. This is the largest remaining connective gap.
2. **Make recall dependable.** Add relevant project/decision retrieval to the
   active Codex path with explicit provenance, correction/deletion and prompt
   bounds. Test a correction, restart and follow-up. Keep private chat opt-in.
3. **Add a genuine daily review.** Use confirmed project outcomes and remaining
   goals, not just app visits. One local calendar-day entry, no catch-up burst,
   quiet defaults, explicit review/delete/export, and separate hypotheses/facts.
4. **Broaden curiosity with evidence.** Use requested diagnostics, verified task
   failures and explicit user feedback before adding new detectors. Preserve
   cooldowns and never infer distress or broken code from switching windows.
5. **Promote repeated successful workflows into skills.** Save validated steps,
   required permissions and evidence of success. Reuse the current Codex/tool
   bridge, approvals and cancellation instead of building another executor.

## Validation and limitations

- Baseline: Node v24.15.0 on Windows; all 235 pre-existing tests passed.
- Updated Node suite: 241/241 passed. Added goal restart/lifecycle/privacy/bounds
  and UTF-8 context-budget coverage, source revocation races, and frame changes
  during approval. Updated the isolated settings fixture for the new goal store.
- Focused suite: 24/24 passed before the final settings/context refinements.
- Isolated Electron `--cognitive-only`: passed through the real preload/main/
  renderer path with mocked Codex inference, including inquiry persistence,
  locked-session reflection suppression, proactive reply context, saved goals in
  foreground context, recall revocation and deletion.
- Isolated Electron `--layout-only`: passed delayed ticker/message overlap,
  dismissal and suspension checks with the existing renderer.
- `electron-builder --win --x64 --dir --publish never`: passed for Electron
  44.9.3 on Windows 10.0.26200 x64. The packaged archive contains byte-identical
  goal, main-process and settings sources. This unsigned directory build is not
  an installed/validated release.
- `git diff --check` and syntax checks for changed main-process modules passed.
- The Desktop special-folder `CapriGPT.lnk` already targets this checkout's
  Electron executable with the absolute checkout argument, working directory and
  Capri icon. No shortcut change or application restart was needed.
- No real mouse/key input, cloud inference, external messages, credentials,
  installer install/uninstall or microphone capture was needed for these changes.
  Native input acceptance and real model/voice quality remain unverified here.
- The existing dirty checkout was kept intact; integration should be reviewed
  through the documented development/Windows branch process after its unfinished
  work has been deliberately saved. This audit is not release certification.
