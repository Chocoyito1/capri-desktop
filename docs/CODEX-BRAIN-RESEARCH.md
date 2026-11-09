# Replacing Qwen with Codex: research and migration design

Investigated 2026-11-06. Status: research completed; production backend unchanged.
This is a personal local desktop integration proposal, not a hosted Codex service.

## Conclusion

Use a Capri-owned `codex app-server` child process over stdio, with a single
conversation/task coordinator and explicitly registered Capri tools. Preserve
Capri's renderer, character rig, voice, local SQLite memory and native execution
services. Replace the reasoning and routing layer, rather than renaming Qwen or
forwarding only chat. Expected reasoning improvements need actual comparison
tests; neither model intelligence nor correct actions can be guaranteed.

## Evidence from this checkout and machine

| Check | Observed result |
| --- | --- |
| CLI discovery | `codex` is not on this session's PATH; a native codex.exe exists in the Codex app's resources directory |
| CLI version | `codex-cli 0.167.0-alpha.3.2` |
| Login status | CLI reports `Logged in using ChatGPT`; no credential files were opened |
| Protocol tooling | `app-server --help` confirms stdio and schema generation; command is experimental |
| Schema generation | Stable and experimental JSON schemas generated successfully into ignored `.caprigpt-local/codex-research/schema` |
| Real app-server probe | Child exited with code 1 before handshake completed; sanitized stderr categories were permission and state |
| Live inference, dynamic tools, approvals | Not verified; no model turn was started |
| Research diagnostic tests | Four pass: metadata-only handshake, approval rejection, malformed/timeout handling, safe discovery/account summary |

The probe failure is evidence about this restricted execution session, not proof
that the integration cannot run on normal Windows. Successful `login status`
does not prove the app-server can start, reach a model, or use that login in the
future packaged app. Exact startup cause remains unresolved; no permissions or
Codex configuration were changed to get around it.

Run the reproducible metadata-only diagnostic in a normal terminal:

```powershell
node scripts/probe-codex-brain.cjs --exe "C:\absolute\path\to\codex.exe"
node --test tests/codex-probe.test.js
```

It launches its own hidden stdio child and requests only initialize, account/read
without token refresh, and model/list. It never starts a conversation or turn,
grants approval, logs in/out, prints raw account data, or stops the active Codex
daemon. Codex itself may need to initialize local state or access its model
catalog; this is not a guarantee of zero network or filesystem activity.

## Existing Qwen dependencies

| Area | Current code | Migration requirement |
| --- | --- | --- |
| Chat and streamed output | `src/main/main.js`, `ollama.js`, `src/renderer/js/chat.js` | Replace Ollama transport, status and model selection; map Codex message deltas and completion/errors |
| Task interpretation and planning | `request-interpreter.js`, `action-agent.js` | Replace repeated local inference with one tool-using Codex loop; preserve validated execution/receipts |
| Memory interpretation | `memory-agent.js`, `personal-assistant.js`, `memory.js` | Route through Codex tools while retaining atomic local saves, current review settings, edits and retention |
| Settings interpretation | `settings-agent.js`, `settings-policy.js` | Expose validated local settings operations; keep direct game-mode commands available without inference |
| Event suggestions | `agent.js`, `world-state.js`, `foreground-priority.js` | Preserve foreground priority/cancellation; bound cloud usage and separate local observation from cloud event inference |
| Startup and gaming | `main.js`, `ollama-runtime.js` | Remove automatic Ollama startup on the Codex path; interrupt owned Codex turns and stop pending tools on pause/quit |
| Identity and settings UI | `capabilities.js`, `config.js`, `settings-migration.js`, renderer chat/settings | Remove local-only/Qwen claims and model-required checks; show actual backend, auth/connection state and available model |
| Existing Codex hooks | `codex-events.js`, `CODEX-CONNECTION.md` | Keep external notifications separate from the brain's own events; avoid duplicate actions/animations |

There are six direct Ollama inference call sites wired in main.js. Multiple
classes also require the hard-coded `AGENT_MODEL` to appear in a local model
list. Faking that list or retaining the same serial planners would hide the
dependency rather than perform the requested architecture change.

## Interface choice

| Option | Assessment for Capri |
| --- | --- |
| Drive the interactive terminal UI | Fragile output/approval handling; does not fit Capri's UI |
| `codex exec` JSON events | Useful for bounded jobs, but less suited to the full interactive client lifecycle |
| TypeScript SDK | Viable for automation; compare its control surface against required UI/tool behavior |
| App-server | Selected for threads, streaming and client-mediated tools/requests; version-sensitive experimental surface |

The official [app-server guide](https://learn.chatgpt.com/docs/app-server)
describes the custom-client interface. The [SDK guide](https://learn.chatgpt.com/docs/codex-sdk)
distinguishes it from job automation. Do not use obsolete examples that launch
Codex as an MCP server; the [removal notice](https://learn.chatgpt.com/docs/mcp-server)
directs those integrations to app-server. External MCP tools are a separate
concept.

## Proposed runtime

1. Electron main owns executable discovery, protocol connection and current
   thread/turn IDs. Spawn a native executable with argument arrays, shell=false
   and windowsHide=true. Renderer IPC accepts text/actions, never process paths
   or arbitrary CLI options. Use a supported standalone CLI installation for
   normal setup; the app-bundled alpha path is research evidence, not a durable
   install location. Record and check the actual CLI version/capabilities.
2. The coordinator receives one real user request, fresh permitted context and
   Capri's persona/capability description from the trusted main process. The
   model reasons and chooses tools, observes their results and continues. The
   client displays user-facing assistant text and progress, not raw reasoning.
   Preserve no-inference controls for cancel, game mode and character gestures.
3. Register explicit tools for context, relevant memory recall/mutation, own
   settings and the already implemented desktop/web services. Extract/reuse the
   execution layer without recursively invoking the old Qwen planners. Tool
   results identify what actually happened; a request to launch a browser is
   not proof of page loading or video playback.
4. Validate tool name, schema, active thread/turn, request authority and current
   settings before every effect. Deduplicate side effects by call identity;
   never blindly retry app launches, writes or closes after a crash. Keep native
   close/force-quit confirmation. Unknown methods/tools fail closed.
5. Keep one active foreground turn. Stop, game mode, lost connection and quit
   invalidate the local execution epoch, interrupt the owned turn, cancel local
   fetches/tools and reject late calls/deltas. Recheck the epoch immediately
   before effects. Closing a process cannot undo an action already completed.
6. Turn start/completion/tool notifications drive Capri's existing animations
   directly. Separate these events from hooks observing other Codex sessions;
   do not infer permissions or tool availability from notification hooks.

### Installed protocol details verified from generated schema

- initialize requires clientInfo; dynamic tools require the experimental API
  capability in this version. Complete the initialize/initialized handshake.
- ThreadStartParams contains dynamicTools, baseInstructions,
  developerInstructions, ephemeral, sandbox and approvalPolicy.
- DynamicToolSpec uses a tagged union. A function requires **type=function**,
  name, description and inputSchema; namespace tools use a different shape.
  Older snippets omitting type are not the contract for this installed alpha.
- Dynamic calls include threadId, turnId, callId, tool and arguments; results
  require contentItems and success. Validate against the generated schema.
- TurnStartParams requires threadId and input; outputSchema is supported for
  narrowly structured operations. It should not force ordinary conversation
  into a brittle JSON planner.
- Map item/agentMessage/delta, tool progress, turn/completed and turn/interrupt.
  Resuming a thread is separate from starting a new one. No real exchange beyond
  CLI schema/help and login metadata has been validated here.

## Boundaries that need explicit implementation

**Credentials and usage.** Let the CLI manage its own sign-in. Read account
metadata via the protocol; never copy auth.json, scrape the desktop's private
connection material or expose credentials to the renderer. The official
[authentication guide](https://learn.chatgpt.com/docs/auth) distinguishes ChatGPT
subscription sign-in from API billing. Check the actual account/model catalog;
do not promise a particular model, unlimited usage or automatic access to this
ChatGPT session's plugins, browser or computer-use tools.

**Permissions.** Broad PC awareness stays enabled locally for all apps under
the existing settings, with no new app allowlist. It does not authorize arbitrary
shell/file actions or persistent cloud transmission of every event. Prompt text
and a read-only sandbox are not a tool allowlist: read-only commands can still
read sensitive files. Before live user prompts, verify inherited tools, plugins,
MCP servers, hooks and effective permissions in a dedicated Capri session. Only
claim a restricted execution surface after testing it. Keep coding/file-edit
capabilities separate until deliberately implemented and authorized per task.

**Data flow.** OpenAI-hosted inference sends user messages and whichever memory,
PC or tool results we include to OpenAI. Keep observations local until relevant
to a user request, send bounded facts, and show this change honestly in settings
and help. Idle animation remains local; do not run cloud inference per animation
frame, process poll or focus change. Make event inference bounded and separately
controllable. Local microphone/TTS does not need to move to the cloud.

**Memory and history.** SQLite remains the source of durable personal facts.
Codex history is a different store. Default to ephemeral app sessions unless
durable chat history is explicitly designed with retention, clear/reset and
resume behavior. After forgetting/editing/revoking recall, rotate/sanitize the
active context so stale thread/tool output cannot reintroduce removed facts.
Do not claim that a local forget retroactively deletes data already sent to a
provider. Never auto-resume unrelated Codex threads or scan other conversations.

**Failures.** Distinguish missing CLI, signed out, model unavailable, exhausted
allowance, offline, server crash, tool failure and interrupted reply. A Codex
failure must not silently fall back to Qwen. Keep local controls usable and
report partial work from real receipts.

## Implementation and acceptance order

| Stage | Required proof before proceeding |
| --- | --- |
| 1. Connection | Normal-Windows app-server handshake, account/model metadata and graceful owned-child shutdown |
| 2. Bounded reasoning | Verify effective tool/config permissions; stream a harmless real reply with no tools, cancellation, disconnect and failed-auth/limit cases |
| 3. Agent tools | Real read-only context call, then requested settings/memory/app actions with receipts; unknown/stale/duplicate/negated requests cannot cause effects |
| 4. Conversation | Follow-ups preserve task/browser choice; missing facts stay unknown; memory edit/forget and privacy revocation remove stale recalled context |
| 5. Integration | Unified Codex routing replaces all six Ollama inference paths and local-model gates; UI/self-description/status agree; no Ollama startup on Codex path |
| 6. Lifecycle | Game mode and chat close stop turns/tools; late responses cannot change settings or launch apps; external Codex hooks do not duplicate notifications |
| 7. Native release check | Existing relevant tests, clean Windows packaging, packaged CLI discovery/sign-in and installer/runtime verification; record actual outcomes |

Compare against the current prototype on compound requests, corrections,
conversation continuity and accurate execution claims. Measure actual first-token
latency and usage instead of assuming the new backend is faster or unlimited.
Do not delete the local implementation until equivalent behavior passes; retain
a clear rollback during development, with no silent runtime fallback.

Research additions do not change Capri's launch, settings, selected model,
shortcut or running process. The existing dirty application work and Git refs
were preserved. New work cannot be placed on the intended feature branch in
this session while .git remains read-only. No push or release is part of this
research step.
