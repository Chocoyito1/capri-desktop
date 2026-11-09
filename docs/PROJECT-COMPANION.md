# Project companion — 2026-11-07

Capri can now keep a selected workspace, goals and a small decision/outcome
journal for each project. Existing animations, voice and task execution remain
in place. The working checkout continues to report version 0.4.0, an unreleased
prototype; this change does not create a release or installer certification.

## Use it

Open **Control room → Connections → Project companion → Choose folder**.
The selected folder becomes the working directory for requested native Codex
tasks. **Use home folder** deselects it without deleting saved context. Chat also
supports `/project choose` or `/project open "C:\Projects\Capri"`.
Selection is a persisted workspace preference, independent of the Memory switch.
Choosing a folder does not read its contents, start work or grant action approval.
A missing/moved folder stops native tasks with a request to select it again,
rather than silently falling back to the home folder.

With Memory enabled:

- `/goals add Finish the release checklist` saves a goal for the selected project.
  Without a selected project it becomes global. Existing goals remain global.
- `/goals next <id> <next step>` and the existing pause/resume/done commands work
  as before. Goals never start work or assert automatically verified progress.
- `/project decision Keep the original animations` saves a user-authored decision.
- `/project outcome The manual check looked good` saves a **user-reported** outcome,
  explicitly distinguished from independent verification.
- `/project notes` reviews notes; `/project forget-note <id>` removes one.
- `/project export` returns the current project's metadata, notes and goals as JSON.
- `/project list`, `/project status`, `/project off` and `/project help` work locally.
- `/project delete <id>` asks before atomically deleting that saved project, its
  notes and scoped goals. It never removes project files. Other projects and
  global goals remain intact.

Explicit review/export/deletion remain available with Memory off. Automatic note
and goal recall obeys Memory enable/recall switches and the existing UTF-8 context
allowance. Notes and goals share that allowance; records are never split. The
selected workspace's name/root can still be supplied to Codex as a workspace
preference when Memory is off. At most three active global/current-project goals
and five fitting notes enter the automatic context. At most 30 projects, 100 goals
in total and 100 notes per project are retained. Memory retention applies to
goals/notes; selection itself remains until changed/deleted.

## Verification evidence

When Memory is enabled, Capri can save observed receipts from exact recognized
commands: `npm test` / `npm.cmd test`, `node --test` (optionally the tests glob),
and `npx electron-builder --win --x64 --dir --publish never` (`npx.cmd` also works).
Only a completed native command item with an integer exit code is eligible.
The actual command working directory must resolve inside the selected project
workspace. Both zero and nonzero exit codes can be recorded, with no copied
command output. Shell chains, arbitrary commands and commands in another project
do not qualify. Receipt storage failure does not convert successful task work
into a failure. Stopped/failed chat turns are not used to create receipts.

These receipts say that a recognized command exited with a particular code.
They do not certify test coverage, correctness, deployment, installation or
release quality. Explicit user reports and Codex lifecycle notifications cannot
create verification receipts. There is no new background command runner.

The authoritative `item/completed` lifecycle and `commandExecution` fields are
documented in the [official OpenAI app-server reference](https://learn.chatgpt.com/docs/app-server).
The installed CLI's locally generated `ItemCompletedNotification` schema was
also checked for `cwd`, `command`, `exitCode` and status fields.

## Implementation and bugs addressed

- `src/main/project-companion.js` shares the goal SQLite connection so project
  deletion and related goal/note deletion form a single transaction.
  `companion-goals.js` migrates the old goal schema in place with nullable project
  IDs, preserving existing intentions as global goals.
- `main.js` routes local commands and control-room actions through the same
  guarded project route. A folder picker cannot race with a new chat request.
  Switching/deselecting projects clears stale model history and temporary task
  receipts; project A's notes/goals do not enter project B's automatic context.
- `codex-brain.js` captures the workspace once per native turn and records only
  deduplicated completed command items from that turn. Started/stale items are
  excluded, and callback failure cannot change a completed answer.
- Fixed a pre-existing context bug: raw `JSON.stringify(...).slice(0,16000)`
  could cut a record in half and omit project details after large event/history
  data. Context now packs whole records within a UTF-8 bound, prioritizes selected
  project/goals and explicitly reports omitted fields.
- Added native folder selection to the existing Connections page. The settings
  action allowlist and trusted-window checks still apply. No animation/rig assets
  or running companion process were changed.

## Validation

- Windows 10.0.26200 x64, Node 24.15.0, Electron 44.9.3.
- `npm test`: **251/251 passed**, including project isolation, legacy schema
  migration, restart persistence, workspace failures, receipt provenance,
  privacy/bounds/retention, reviewed deletion, async picker cancellation,
  native-turn workspace selection, deduplication and valid context packing.
- `electron scripts/smoke-electron.js --cognitive-only`: passed real main/preload/
  renderer/control-room IPC, mocked folder selection, blocked chat during the
  picker, project-specific notes/goals/workspace, stale task clearing, recall
  switches and the existing proactive/reflection checks. Codex inference was
  mocked, with no actual project commands, dialogs or user files modified.
- `electron-builder --win --x64 --dir --publish never`: passed Windows directory
  packaging. This is an unsigned directory build, not installation acceptance.
- Syntax checks and `git diff --check` passed.

Live model behavior, actual command receipts from a real model session, voice
quality, and installer install/uninstall still need native acceptance. A normal
Capri restart loads the changes; the running companion was left alone.

Next: improve project decision retrieval and corrections, then use confirmed
outcomes for a genuine daily review. Do not infer progress from app switching.
