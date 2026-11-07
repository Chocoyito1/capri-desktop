# Capri as a Codex desktop agent

This unreleased checkout now separates requested work from autonomous presence.
Neither path uses Qwen or Ollama for inference.

## Requested work

Foreground conversations enable Codex's native command execution, file and image
tools, live web search and the CLI's configured connections/skills, rather than
forcing those capabilities off. The default working directory is the user's home
folder unless a project is selected, with Codex's workspace-write sandbox and
on-request human approval. [Project companion](PROJECT-COMPANION.md) explains
folder selection, scoped goals, decisions and command-exit receipts.
Additional filesystem/network permission requests are reviewed in Capri and
granted only for that turn. The app does not grant administrator rights or bypass
Windows protection. Installed Codex connections are distinct from this ChatGPT
session's plugins: subscriptions, credentials and tools are not automatically
copied from ChatGPT.

Capri's own tools expose:

- Screen snapshots as actual model image inputs, with display ID, dimensions and
  a short-lived coordinate reference. The default is the foreground app's display;
  another connected display can be requested explicitly.
- Mouse clicks, drags, Unicode typing, keyboard chords and wheel scrolling through
  native Win32 input. Input requires a current frame; foreground/display changes,
  expiry, cancellation or revoked access stop it. Every input consumes its frame.
  Input acceptance is reported separately from outcome verification. Protected or
  elevated windows may reject input. There is no accessibility-tree adapter yet.
- Existing app/browser/search services, SQLite memory tools, appearance/sound
  settings and body animations. Consequential actions require concrete review.

Native approval requests show the actual command, requested permissions or known
file-change item. Stop sends turn/interrupt before closing the owned process,
allowing Codex to cancel its work. Closing a turn cannot undo completed actions.
Foreground requests have a ten-minute deadline and up to forty Capri tool calls.

## Presence and conversation

Normal greetings, idle remarks, satellite commentary and completion chatter no
longer come from the old dialogue banks. Clicking Capri opens AI conversation;
gestures and posture in normal chat use an AI-selected body tool and an AI-written
reply. Operational labels, actual error/approval text and the offline maintenance
panel remain deterministic. Legacy translation/dialogue resources remain for
demo/compatibility paths; they do not drive normal social conversation.

One main-process persona defines her warmth, curiosity, mischief and response
style. The model receives her current decorative mood, routine, actual abilities,
recent task evidence and recent conversation. It is explicitly instructed to avoid
reciting profile facts, lore, repeated greetings or recurring catchphrases.

The active `ProactiveConversation` service considers a conversation every 5–15
minutes while available. It rotates permitted foreground app/title context,
explicitly saved facts, speculative open inquiries and smalltalk. Codex can choose
silence. Persisted topic hashes and recent message similarity suppress repetition.
Delivered remarks enter foreground chat history, so a reply has its question in
context. Disabling activity context still allows general conversation; disabling
autonomy or proactive conversation stops these opportunities entirely.

Separate `CognitiveFoundation` / `ReflectionEngine` services persist tentative
questions after repeated foreground app activations. Reflection compares fresh
evidence revisions with previous hypotheses, at most twice per rolling hour.
This is private app-level inquiry, not a record of user intent or daily learning.
Both background services share a tool-free, history-free Codex adapter. They
cannot capture screenshots, click, execute commands or change personal memories.
The older `autonomy.js` observer remains in the repository but is not constructed
by `main.js`; its 90-second/twelve-attempt screen loop is not the active runtime.

Foreground requests cancel pending background reasoning. Locked/suspended
sessions, dictation and fullscreen block reflection and conversation. Conversation
also waits while hidden, chat is open, presentation cannot speak or the user has
been idle for five minutes. Gaming mode pauses both. No missed conversations are
queued for a later burst.

Generated remarks use the existing local speech pipeline when **Sound → Speak chat
replies** is enabled. The separate opt-in controls for the existing Hey Capri
listener are described in [WAKE-WORD.md](WAKE-WORD.md).

## Data and controls

**PC awareness → Agent presence** controls system tools, foreground screen vision,
companion conversations and private inquiry reflection. The obsolete proactive
screen/observation-interval preferences remain compatible in saved configuration
but are no longer offered as working controls. All apps remain eligible by
default, including newly installed apps; there is no allowlist to maintain.

Screen capture is not a video stream or recording. Capri stores no screen images
on disk for this feature, and it adds no keyboard hooks or keylogging. Selected
snapshots and context are sent to OpenAI for reasoning. The provider's handling is
separate from Capri's ephemeral local state. Personal memories remain in SQLite
under their existing recall, save, edit, retention and confirmation controls.

## Saved goals

Enable Memory, then use `/goals add Finish the Capri roadmap` in chat. Use
`/goals next 1 Review test results` to save a next step, `/goals pause 1` to stop
including a goal in context, `/goals resume 1` to restore it, and `/goals done 1`
when you consider it complete. `/goals list`, `/goals export`, `/goals delete 1`
and `/goals help` work locally without Codex. Export returns JSON in chat.

Goals persist in `companion-goals.sqlite`, separately from personal memories and
curiosity. Only explicit slash commands change them; these commands are direct
saves, with no inferred progress or background execution. At most 100 goals are
stored and up to three whole active records fitting the Memory context allowance
are supplied to foreground chat. Recall switches and Memory retention apply;
large records can remain saved without fitting the automatic context allowance.
Deleting personal memories with `/memory delete-all` does not delete goals.
Delete goals individually with `/goals delete <id>`; listing/export/deletion remain
available while Memory is off. Restart clears chat history but retains goals.

## Validation

The Node suite covers protocol mode separation, actual image content in tool
responses, live personality context, command/permission approval responses,
interrupt-before-close ordering, screen expiry/focus/display checks, Unicode
input records, observer quotas/cancellation/silence/repetition, the read-only
background tool boundary, and removal of normal scripted chatter.

Windows directory packaging uses the installed matching Electron 44.9.3 to avoid
the sandbox cache's rename restriction. This verifies packaging, not live input.
The restricted development session cannot verify real Codex inference or native
screen/control behavior; its CLI state handshake and isolated Electron runtime
checks were previously blocked. The user's screenshot established that their
normal session could produce a Codex chat reply, not that these new capabilities
have passed native acceptance. Screen interpretation, input delivery, approvals,
speech quality and realistic autonomous behavior need normal-Windows validation.
Some older Electron smoke fixtures still assume Ollama and are not acceptance
evidence for this new architecture.

The current desktop shortcut still targets this checkout directly. Restart Capri
to load the new code. No running companion was restarted, and nothing was pushed,
tagged or published as part of this upgrade.

## Instant talk launcher

Left-click Capri to show two circular choices above her: text chat and voice.
The launcher and composer open locally, without a Codex status request or an
inference round trip. Twelve local greetings per English/Spanish language cycle
through shuffled bags; each greeting appears once before refilling, with no
immediate repeat across refill. Other languages currently use English greetings.
These short welcomes are the explicit exception to generated social dialogue.
Actual conversation and requested actions still use the current Codex backend.

Text opens the composer; voice opens the composer and starts the existing local
microphone dictation flow. Dictation remains reviewable before Send. Selecting a
mode preserves overlay focus so the transition cannot cancel the microphone.
Escape, clicking elsewhere, dragging, stowing, gaming and fullscreen dismiss the
launcher. Only the circular buttons capture pointer input; the gap stays
click-through. The conversation panel hides external Codex activity, model tags
and the Codex badge. Integration events remain connected to existing animations.

The Node suite now has 193 passing tests, including greeting rotation, launch
without Codex status, mode selection, focus handoff, bounds and click-through.
An isolated Electron visual attempt exited with 0x80000003 before loading the
preview, so desktop layout and live microphone acceptance remain unverified in
this restricted session. Restart the normal Capri instance to load these edits.

## Hands-free activation

[Hey Capri wake listening](WAKE-WORD.md) now keeps the local speech pipeline
available across apps, games and fullscreen while enabled. It opens a requested
voice conversation, keeps the same microphone stream for following words, and
submits that addressed request after a speech pause when the draft was empty.
Ambient speech stays local and is discarded. The microphone indicator and Sound
settings disable this feature. Wake listening yields during manual dictation and
Capri playback; it requires Capri running, an awake PC and microphone access.
The Node suite now passes 200 tests. Real microphone recognition and fullscreen
acceptance remain pending in a normal Windows session.

## Softer conversation UI

The launcher circles are 44px (previously 56px), with smaller symbols and a softer
welcome bubble. Chat now uses a rounded violet-bordered card, smaller circular
portrait, quieter type and circular microphone/send/close controls. The send
arrow retains its localized accessible label. Other operational/approval panels
retain their existing styling and priorities.

Voice opens a compact dedicated layout with one central microphone, transcript,
brief listening status and a keyboard switch. The send control appears for a
draft and stays hidden while recording. Both the voice circle and Hey Capri use
this layout. Switching to typing flushes and preserves the transcript for review
and disables wake auto-send for that request. Manual microphone input still
requires Send; ordinary wake requests still auto-submit after their pause.

The Node suite covers draft preservation and accessible voice/text mode changes,
plus switching a wake request to typing without submission. Native visual
verification is still pending: an isolated Chrome headless preview also exited
with 0x80000003 before rendering in this restricted session.

Conversation exits now replace the old glitch collapse: text fades downward over
160ms, while voice fades with a smaller downward motion and gentle contraction
over 180ms. Closing clears the entrance class, preserves the card height while
microphone cleanup runs, and cancels old close timers on reopening. Microphone
capture stops immediately; a fullscreen wake conversation stays visible until
its exit finishes. Reduced motion hides immediately without either animation.

## Softer right-click control room

The existing right-click settings window now uses the conversation UI's rounded
violet surfaces, small circular section icons, circular close control, pill
buttons, rounded switches and quieter typography. Text fields and native
selectors follow the dark theme. All seven pages and existing settings remain
available. The sidebar and content scroll independently at compact sizes, and
page transitions respect reduced motion.

Preference writes are serialized instead of dropping changes while a save is
pending. Intermediate saves do not redraw over later edits. A redraw preserves
the focused control, unsaved text draft, selection and scroll. Switch values are
captured at interaction time, and visibility buttons request the state shown by
their label rather than toggling twice on a repeated click. Failed saves surface
an error and do not block subsequent saves. Text fields respect the backend's
2,000-character limit. Gaming/wake and approval copy reflects current behavior.

Tests exercise all seven page renders, rapid saves, failure recovery, focus/draft
and scroll preservation, and queued startup-switch order. Existing settings
validation and action restrictions remain in force. Native visual verification
remains pending because the isolated Electron/browser runtime cannot launch in
this restricted session. No running Capri instance was restarted.
