# Codex brain migration validation

Status: unreleased implementation; live inference has not been verified.

## Runtime changes

- Main-process chat uses an owned Codex app-server stdio child, ephemeral threads,
  account/model discovery, streamed replies and a bounded dynamic-tool bridge.
- PC context, app lookup, durable memory, settings and desktop task steps use
  existing local validators/services. Ordinary chat and compound requests go to
  one Codex conversation loop; exact maintenance commands remain local.
- Background suggestions use a separate Codex decision session with the existing
  decision validator, event cooldown, foreground priority and action approvals.
  No runtime inference or startup route in main.js calls Ollama. Legacy modules
  remain available as source for rollback; there is no silent Qwen fallback.
- Stop, game mode, quit and privacy changes cancel owned turns. Tool requests are
  bound to thread/turn IDs and duplicate IDs do not repeat effects. Memory changes
  clear conversational state; settings/model changes revoke active requests.
- Connections exposes native CLI path, account-default/explicit model and effort.
  Chat, guide and settings disclose OpenAI processing. External hook notifications
  remain separate from the brain connection.

## Evidence from this restricted session

- Nine new protocol/tool tests pass: child ownership, protocol failure, streaming,
  conversation state, MCP disabling, duplicate/stale calls, cancellation, startup
  failure cleanup, mutation intent, memory edit scoping and settings validation.
- Full suite before the final two added tests: 158/160 passed. The remaining two
  failures are the previously observed sandbox restrictions: EPERM on temporary
  hook configuration rename and EACCES on a loopback HTTP connection. The two
  subsequently added memory/settings tests also pass.
- Fifteen changed JavaScript entry points parse successfully.
- Native CLI discovery found the installed Codex executable. Live account/model
  handshake failed: Codex could not access its local state from this sandbox.
  No real model response, live dynamic-tool call or allowance/expired-login case
  is claimed verified.
- Windows directory packaging reached Electron packaging but failed resolving
  github.com (ENOTFOUND) for a required download. No successful build is claimed.
- Desktop special-folder CapriGPT.lnk already targets this checkout's Electron
  executable, absolute project argument, working directory and Capri icon.
  No shortcut replacement or running-app restart was needed or performed.

## Remaining native acceptance

From a normal Windows session, verify signed-in app-server handshake, one real
streamed reply, read-only PC context, requested memory/settings/launch actions,
Stop during inference and tool use, game-mode silence, follow-up/browser choice,
network/auth/allowance failures and packaged CLI discovery. Re-run the full suite,
Windows packaging and interactive validation before merging or releasing.

The previous running Capri process keeps its loaded implementation until restarted.
Restarting this checkout selects Codex and may surface the unverified connection
error. No changes were committed, pushed, tagged or released by this migration.
Git metadata remains read-only in this environment; existing dirty work is preserved.

## Firefox tool failure follow-up

A user-provided screenshot shows a reply in the Codex chat UI, but the Firefox
action failed with a generic local-tool connection explanation. Investigation
found a reproducible contract mismatch: the shared dynamic-tool schema requires
a browser field even for app launches, while ActionAgent rejects browser fields
on non-navigation actions. A default placeholder now normalizes away on those
actions; real navigation browser constraints remain validated. Tool descriptions
specify the field's purpose and tools are explicitly registered without deferred
loading. Instructions distinguish external hook notifications from brain/tool
availability and tell the model to try its tools before declaring them offline.

Session-only diagnostics track call counts and tool errors without arguments or
receipts. If every attempted tool fails, the final reply includes the actual local
error. New regressions exercise the Codex callback through CodexTools, ActionAgent
and DesktopTools, including a duplicate callback, and verify failure reporting.

`scripts/check-codex-tools.cjs` provides a separate native diagnostic:

```powershell
# Read-only native launch-entry check; no Codex inference.
node_modules/electron/dist/electron.exe scripts/check-codex-tools.cjs
# Codex calling the read-only app catalog.
node_modules/electron/dist/electron.exe scripts/check-codex-tools.cjs --live
# Explicit native Firefox launch; add --live for the complete Codex path.
node_modules/electron/dist/electron.exe scripts/check-codex-tools.cjs --launch-firefox
```

The focused audit/Codex tests pass (23/23). This restricted session still cannot
start the Codex account/state handshake. Its isolated Electron diagnostic exited
with status 2147483651 before producing a result; no real Firefox launch is claimed.
The user's running Capri was not restarted. The fix addresses the reproduced
contract mismatch; confirming the screenshot's exact runtime failure still needs
the diagnostic in a normal Windows session after loading the updated source.
