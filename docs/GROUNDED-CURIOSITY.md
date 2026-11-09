# Evidence-backed curiosity

Capri's existing private inquiry engine can now use saved project evidence, in
addition to its original application-pattern detector. It reuses the existing
Codex cognition adapter, foreground priority, cancellation and conversation
scheduler. It adds no background executor, filesystem watcher, screenshot capture
or transcript archive.

## What can create a project inquiry

- A recognized test/build receipt with a nonzero exit code creates a private
  question. Two consecutive observed failures of the same command can make it
  eligible for a brief offer after fresh reflection. Raw command output and an
  inferred cause are never recorded.
- A saved project decision recorded after an active project goal's saved next
  step can raise a tentative planning question. Chronology does not establish
  that the decision and next step conflict; the question asks whether clarification
  would be useful. Global goals are not silently associated with project decisions.
- Explicit project feedback can identify a missing detail in the previous
  response. It is a user report, not independent verification of a task failure.

Only existing saved project records are used. A hook's generic failure/completion
stage, a window title, repeated app visits, or an arbitrary user-reported outcome
cannot become a verified check result. The recognized-command receipt limits in
[PROJECT-COMPANION.md](PROJECT-COMPANION.md) still apply. Successful rechecks close
the corresponding failure inquiry without marking goals complete or certifying
the project. Changed/forgotten source records and project deletion remove dependent
speculative prose before it can be reused.

## Private reasoning and questions

**PC awareness > Grounded curiosity > Learn from project evidence** controls this
source. It also requires **Memory**, **Recall in conversation**, the agent and
private reflection to be enabled. Saved project evidence follows its own controls
independently of the foreground-app context switches. Relevant whole records must
fit the existing memory prompt budget; an oversized payload is skipped rather than
truncated. App observation remains controlled by its own permissions.

Private reflection remains limited to two attempts per rolling hour, including
failures and across restarts. Project evidence has priority over weak app patterns.
Previous hypotheses remain speculative, not personal memories. Authorized saved
records and their tentative reviews are sent to OpenAI through the configured
Codex CLI for reflection; this feature does not switch to Ollama or add tools to
the background model.

An unsolicited inquiry needs fresh reviewed evidence, an eligible source and a
model decision to ask later. It uses the normal conversation opportunity and
availability checks: no foreground work, locked/suspended session, fullscreen,
gaming, open chat, active dictation or unavailable presentation. At most one
inquiry is offered per six hours globally, and a topic cannot repeat within
twenty-four hours even if its source records change or are deleted. A topic also
needs fresh evidence; repeating model wording does not create evidence.

The app-pattern inquiry detector stays private even if a reflection chooses
ask_later. Existing ordinary app-context smalltalk still follows the separate
conversation controls; app repetition is not evidence of a problem or emotion.

## Feedback and review

Recognized short statements include:

- `That didn't work.` / `That did not work.`
- `That helped.` / `That worked.`
- `That suggestion wasn't useful.`
- `You're repeating yourself.`

Task-outcome feedback needs a recognized project check in the preceding turn or
a just-delivered project inquiry, within ten minutes and in the selected project.
Without that anchor it stays session-only. Style feedback is an explicit report
about Capri's response. Other wording can be handled normally in the conversation;
do not assume it was persisted. Only a category is saved, never the message text.
Duplicate categories are deduplicated for six hours.

Use `/feedback still-blocked`, `/feedback unhelpful`, `/feedback repetitive` or
`/feedback helpful` to explicitly record a category for the selected project.
`/feedback list` reviews these local records and `/feedback clear` removes them,
including with Memory off. Negative style feedback keeps project inquiries quiet
for six hours; recognized unhelpful/repetitive feedback also delays ordinary
unsolicited conversations for one hour, including across restart.

A direct `No thanks`, `Don't ask me about this again`, or similar reply to a
just-delivered inquiry dismisses that topic. `Not now` leaves it open but does not
repeat it without fresh evidence and the normal cooldowns. A helpful reply can
resolve an inquiry as user-reported; it is not proof that the underlying code works.

Review questions through **PC awareness > Grounded curiosity > Review questions**
or `/curiosity list`. `/curiosity history <id>` reviews tentative reflections;
`/curiosity dismiss <id>` and `/curiosity resolve <id>` close a topic. Explicit
dismissal/resolution is respected for thirty days. `/curiosity clear` forgets the
journal without resetting model/question budgets or immediately reconstructing
old source events. Feedback has its own clear command.

`capri_curiosity_lookup` lets the foreground model explain the permitted evidence
behind a question. It exposes source records and labels hypotheses as tentative,
not internal reasoning or action authorization. It does not start a model turn or
collect PC context on its own.

## Persistence and validation

The inquiry evidence field contains source IDs/fingerprints and bounded metadata,
not copies of goal/decision text or raw outputs. Model-generated questions/reviews can
mention their source; those reviews are removed when a source is corrected,
forgotten, expires or its project is deleted. Inquiries retain at most thirty days
and one hundred questions, with bounded review history. Feedback follows project
Memory retention and is capped at ninety categorical records across projects.
Project deletion removes its feedback atomically. Small timestamp/hashed-topic
ledgers preserve cooldowns independently of record deletion.

Unit coverage includes failure/recovery, idempotent observations, planning
chronology, source forgetting, project boundaries, Memory/toggle/budget controls,
app-pattern silence, feedback anchors, restart/clear budgets, topic cooldowns,
late model cancellation, opt-out handling and the foreground evidence lookup.
The isolated Electron cognitive smoke covers the actual preload/main/renderer
paths, evidence candidates, settings, question review, categorical feedback and
recovery; Codex responses are mocked. The live companion is not restarted by
these checks. Restart normally to load the feature, then assess real Codex phrasing
in day-to-day use.

Final validation: 308/308 Node tests passed, including fourteen new grounded
curiosity tests. The cognitive Electron smoke passed through real IPC and controls.
Windows x64 directory packaging passed with publishing disabled and the installed
Electron distribution. Fifteen changed application sources match the packaged
archive. This unsigned directory build is not installer or release certification.
