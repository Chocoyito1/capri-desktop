# Daily reflection from saved evidence

Daily reviews connect Capri's existing goals, project notes, check receipts and
resume points into a brief local recap. Ask **What did we do today?**, use
`/review today`, or open **PC awareness > Daily reviews > Review today**.

The recap separates:

- Completed goals updated that day, explicitly labeled as user-marked.
- Saved decisions and user-reported outcomes, with reports labeled unverified.
- Observed command exit codes, keeping only the latest result for each command.
- Active goals and their saved next steps, plus a separate paused-goal section.
- A saved resume point only while its underlying project context remains current.

A completed goal's update time does not prove when the underlying work finished.
Successful command exits do not certify correctness or a release. A failed check
is an observed exit, not proof that the whole project is broken. Missing evidence
is unknown, not a judgment about productivity. Reviews never start work.

## Quiet daily behavior

**Save a daily review** is enabled by default but requires Memory and recall to be
enabled. The existing presence timer considers a local review after 18:00 on the
device's local calendar day. It waits for the same availability gates as companion
conversation: no foreground work, locked/suspended session, fullscreen, game mode,
open chat, active dictation or unavailable overlay. Companion conversations and
the agent must also be enabled. Saved records must have changed that day; visiting
apps or leaving Capri running is not evidence of project progress.

Automatic generation is limited to one opportunity per local day across projects,
with twenty-hour minimum spacing. A durable cadence record prevents repeated
generation after restart, clearing reviews or moving the clock backwards. Missed
days are not queued. No new timer, model inference, screen capture or PC action is
added. The recap is a local evidence synthesis; Codex can phrase it naturally when
you ask in normal conversation through `capri_daily_review`.

**Offer the daily recap** is off by default. Enabling it permits one short generic
notification during an eligible automatic opportunity; it contains no project
details or private goal text. A failed delivery is not retried in a burst. Toggling
notifications on after that day's opportunity does not replay it.

An explicit `/review today` refreshes the same date's entry as the saved evidence
changes, including before 18:00. Explicit reviews can be created for more than one
project in a day. There is still only one saved entry per project/date. With
generation off, Memory off or gaming mode on, existing saved reviews can be read
locally but no entry is created or refreshed.

## Records and controls

Reviews are scoped to the selected project, with explicitly global goals included.
Without a selected project, the review contains global goals and the global resume
point. Other projects' notes and goals are excluded.

Reviews store source IDs and fingerprints in the existing goal database, rather
than duplicating source text. Reading a historical review resolves the current
sources. Corrected, forgotten, expired or removed sources are omitted and reported
as stale; the earlier text cannot reappear from an archived summary. A historical
review describes evidence at its capture time, not current task status. Use today's
review or current project lookup for the latest state.

- `/review today`: create/refresh today's recap when generation is enabled.
- `/review YYYY-MM-DD`: read an existing historical review.
- `/review list`: list saved dates for the current scope.
- `/review export`: return current-scope reviews as JSON in chat.
- `/review forget YYYY-MM-DD`: remove one saved review.
- `/review clear`: remove saved reviews in the current scope.
- `/review on` or `/review off`: enable/disable generation.

Explicit local review, export and deletion remain available with Memory or recall
off. Model lookup obeys Memory, recall, gaming mode and prompt-budget permissions.
Turning generation off preserves existing entries. Deleting a review preserves
its source goals and notes; deleting a project atomically removes its reviews and
leaves the actual project files intact. Retention follows the Memory setting, with
a maximum of ninety review entries across scopes. The small automatic cadence
ledger contains only dates/timestamps, is capped at four hundred entries, and is
preserved when reviews are cleared. No transcript, app history, speculative
reflection, personal-memory candidate or emotional inference is saved.

## Validation

Windows x64 with Node 24.15.0 and Electron 44.9.3:

- Full Node suite: 294/294 passed, including the previously blocked local hook
  delivery check and twelve new review tests.
- Review tests cover restart/cadence, quiet defaults, optional notification,
  unavailable sessions, no catch-up, backwards clock, local calendar boundaries
  including daylight saving, project isolation/deletion, corrected/forgotten
  sources, retention, bounds, latest-check selection, multilingual tool-byte limits and the real local tool.
- Isolated Electron cognitive smoke passed through actual preload/main/renderer
  routes, natural continuity updates, daily recap tool, settings toggles and the
  review button. Codex inference was mocked; no real microphone capture, user
  files, live profile or external messages were used.
- Windows x64 directory packaging passed using the installed Electron runtime
  (`--config.electronDist=node_modules/electron/dist`, publishing disabled).
  All twelve changed application sources match the packaged archive, and the
  Windows x64 Koffi module is present. This is an unsigned directory build, not
  installer acceptance or a published release.

The live companion is not restarted by these checks. Restart normally to load the
new code. Test the natural-language examples with your signed-in Codex account to
assess real model phrasing; the deterministic saved evidence and local slash
commands do not depend on a generated summary.
