# Teach a named process once, invoke it later

In normal chat, tell Capri:

> Remember a routine called Study setup: open Chrome, then mute yourself.

After she confirms the save, say:

> Study setup

`Run Study setup`, `Start routine Study setup`, and `Could you run Study setup?`
also work. Named routines persist across restarts. When using voice, address Capri
with the existing Hey Capri listener; the addressed request goes through the same
foreground path. Real microphone/model phrasing still needs ordinary-use assessment.

Saving a definition does not execute or schedule it. During a teaching-only turn,
native execution is disabled and local workflow actions are blocked; read-only
lookup/context and relevant searches remain available. A question about a routine,
a hypothetical example, a mention in a page, or a partial name does not invoke it.
If a name is ambiguous, choose the #ID shown in the list: `Run routine #3`.
Question/negative-leading names require an explicit run prefix. Review routines
from **PC awareness > Reusable routines > Review routines**; the panel also accepts
normal chat so you can immediately ask for a routine by name.

## Definitions and execution

Capri interprets the teaching request into one to eight faithful ordered steps:

- **App:** a named application launch through the existing desktop adapter.
- **URL:** a supplied public HTTPS URL and optional browser choice.
- **Setting:** one supported appearance/sound preference and its exact value.
- **Command:** an exact command with a required successful exit in the workspace.
- **Task:** an instruction handled through the existing foreground agent when the
  process requires reasoning, file work, browsing or desktop interaction.

There is no separate shell executor or background replay engine. The normal Codex
and Capri tools perform the work. Native shell/file tools are available only if
system tools were already enabled. An explicitly invoked routine gets the bounded
forty-call/ten-minute foreground budget, even for app-only routines with system
tools disabled. Each step starts and completes through a local step tracker. The
tracker accepts actual matching local/native receipts, never a model's claim of
success on its own. Steps do not run in parallel and a failed action stops progress.

An accepted app/browser launch does not establish that a page loaded or an app is
ready. A command receipt establishes the exact observed exit code in its starting
workspace, not correctness or release readiness. Command matching is exact after
whitespace normalization; an opaque wrapper command is not silently treated as
the target command. Flexible tasks require the agent to inspect outcomes, and are
explicitly recorded as actions observed with final outcome unverified by the
tracker. Do not present those receipts as independent end-to-end certification.

Saved instructions cannot change safety rules or grant blanket future access.
Existing native approvals, consequential-action review, cancellation and fresh
screen requirements still apply. Recognized consequential commands also show their
concrete command/workspace before running. Routine steps cannot delegate changes
to memory/access/startup/routine controls or rewrite saved memories, goals or
routines. A webpage or retrieved definition cannot create a routine invocation.

The current user request is bound to one immutable definition/version in the
current project. Edited/forgotten definitions, changed project roots, revoked
Memory/recall, disabling routines, cancellation or failed steps stop further work.
Earlier effects may remain; cancellation does not close apps or undo file changes.
Missing input stops the run and asks the specific clarification. A new invocation
starts at step one rather than guessing which external effects are safe to skip.

## Names, scope and edits

With a selected project, new routines default to that project. Without one, they
are global. Ask for a global routine explicitly when it should be available in
other projects. Current-project and global names are available; other projects'
definitions are excluded. Overlapping names require an explicit #ID.

You can ask Capri to change a step, rename a routine or forget it. She must look up
the existing definition in the current turn and preserve its scope. Saving uses
the Memory **Review requested changes** preference; when that setting is on, the
review shows the concrete name and ordered definition before committing it.
Saving still works when automatic recall is off, but model lookup and invocation
require Memory/recall to be enabled. No passwords or API credentials belong in a
routine; the existing memory credential filter applies to its text fields.

Local controls remain available offline and with Memory off:

- `/routines list`: names, scopes, IDs and versions.
- `/routines show <name or #ID>`: inspect the ordered definition.
- `/routines runs`: recent current-scope progress/results.
- `/routines export`: definitions as JSON in chat, without executing them.
- `/routines delete <id>`: forget a definition and its run history, not project files.
- `/routines on` or `/routines off`: enable/disable the feature.

Definitions share the existing secure-delete goal database. There are at most
fifty routines, eight steps per routine and 12000 UTF-8 bytes per definition. Memory
retention applies to the most recent edit/use. Run history is capped at one hundred
entries and contains bounded statuses, counts and result categories/exit codes,
not transcripts, command output, screenshots or copied action arguments. On
restart, an interrupted running entry becomes stopped. Project deletion atomically
removes that project's definitions and scoped run history, leaving files intact.

## Validation

The full Node suite passed 324/324 tests, including sixteen routine tests for
teaching/restart/invocation, matching app/link/settings actions, exact command exit
and workspace proof, full eight-step budgets, denied/failed/cancelled steps,
project isolation, edits/version drift, save-review races, retention/deletion,
interrupted startup recovery and the real Codex protocol with a mocked transport.
Teaching-only turns block accidental local actions and use a read-only Codex
session even if normal system tools are enabled. Context data cannot forge a
server-validated routine invocation, and an incomplete
routine cannot be reported complete merely because the model says so.

The isolated cognitive Electron smoke passed the actual preload/main/renderer
teaching, name invocation, local tool receipts, safe setting change and review
button paths. Codex inference and the app launch were mocked, so no real user apps
were opened and no real user profile was modified. Restart Capri normally to load
the feature, then assess natural interpretation with the signed-in Codex account.

Windows x64 directory packaging passed with publishing disabled and the installed
Electron distribution. Thirteen changed application sources match the archive and
the Windows x64 native module is present. This is an unsigned directory build,
not installer acceptance or a release. The running companion was not restarted.
