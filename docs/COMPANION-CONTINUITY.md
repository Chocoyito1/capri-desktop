# Restart continuity and natural project updates

Capri can retrieve the selected project's saved goals, next steps, decisions and
check receipts after restarting. The active Codex tool loop now supports ordinary
language for explicit updates; personal facts remain in the separate memory store.
This is saved-record continuity, not an automatic archive of conversation.

## Using it

Enable **Memory** in the control room. Select a project in **Connections > Project
companion** for project-specific goals and decisions. Selection persists; without
a selected project, new goals and resume points are global. Decisions require a
selected project.

Examples in normal chat or an addressed voice request:

- `Remember our goal: Finish the animation review.`
- `Set the next step for Finish the animation review to Inspect seated motion.`
- `Remember we are keeping the original art and opening.`
- `Correct goal 1 to Finish the seated animation review.`
- `Mark goal 1 done.`
- `Save where we left off: Review paused; next inspect seated motion.`
- After restarting: `Where did we leave off?` or `Let's continue.`

Capri uses `capri_project_lookup` to retrieve current saved evidence and
`capri_project_change` to apply requested updates. Existing records must have been
looked up in that turn; ambiguous references require clarification. A successful
save clears old model conversation context so a correction is not contradicted by
the previous session's messages. Natural interpretation depends on Codex being
available; local slash commands remain available offline.

There is one explicitly saved resume point per project and one global point.
Saving a replacement requires looking up the previous point. A fingerprint of the
scoped goals/notes marks a point `needs_review` after those records change, even if
the updates share a timestamp. Capri must use current goal/decision records rather
than presenting an outdated handoff as current progress. Resume points are saved
only on request; ordinary chat and task output are not automatically persisted.

## Review and controls

- `/continuity status` reviews saved context for the current scope.
- `/continuity export` returns all current-scope goals/notes and the resume point
  as JSON, including global goals. It does not write an export file.
- `/continuity forget` removes only the current scope's resume point.
- `/goals delete <id>` and `/project forget-note <id>` remove individual records.
  Existing project deletion also removes that project's resume point atomically.

Review, export and explicit forgetting remain available when Memory or recall is
off. Automatic context and model lookup obey Memory, recall, gaming mode and
prompt-budget controls. Writes obey Memory enablement, gaming mode and the
existing optional change-review setting. Permissions, project identity,
cancellation and record freshness are checked again after an awaited review.
Retention applies at startup, settings pruning and access. Secure deletion uses
the existing shared goal database setting.

Automatic continuity packs whole UTF-8 records within the existing memory budget;
records that do not fit can still be retrieved on demand. Lookup returns bounded
records, prioritizing active goals and preserving the latest note of each kind so
repeated check receipts cannot hide an older decision. Project A's goals, notes
and resume point do not enter project B; explicitly global goals remain shared.

Saved goals and resume points are intentions and user-provided context, not proof
of completion or permission to act. Goal completion is user-reported. Verification
receipts preserve the observed command exit code, including failures; they do not
certify correctness, installation or release readiness. No executor, screenshot
storage, recording, keylogging, background action or transcript archive was added.

## Validation and remaining limits

The focused suite exercises restart persistence, goal/decision corrections,
project boundaries, ambiguous and negated requests, stale edits, cancellation and
permission changes during review, retention, UTF-8 budgets, project deletion,
receipt provenance, crowded history and the real Codex protocol/tool bridge with
a mocked app-server. The isolated cognitive Electron smoke also contains natural
goal/next-step/handoff/completion checks through the real preload/main wiring;
model responses are mocked there too.

The focused continuity suite passed (11/11). Follow-up validation during the
[daily review work](DAILY-REVIEW.md) passed the full suite (294/294), including the
previously blocked localhost hook check. The isolated cognitive Electron smoke
also passed natural goal/next-step/handoff/completion updates through the actual
preload/main/renderer wiring. Codex inference was mocked. No live model, microphone
or real user-profile acceptance was claimed.

The standard directory-build attempt could not resolve github.com. Using the
installed Electron distribution with
`npx electron-builder --win --x64 --dir --publish never --config.electronDist=node_modules/electron/dist`
successfully produced an unsigned directory build. This is not an installed
release. Try the examples above after a normal restart with Memory enabled to
assess live model phrasing. This work did not restart the live companion.

Creating a feature worktree from development was denied by the session's read-only
Git metadata. Changes remain local alongside the preserved animation edits; no
branch switch, staging, commit, push or release was performed. Review and integrate
the continuity changes separately through the documented development PR process.
