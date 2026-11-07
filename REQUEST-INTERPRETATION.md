# Request interpretation and grounded execution

The previous conversational route tried app-name matching before using the
model. It extracted `netflix in firefox` as an installed app and asked for an
unrelated app choice. Expanding a verb list would leave that ordering problem.

Ordinary requests now use two distinct local model stages and the existing
trusted tools:

1. Interpret the whole current request and identify its requested outcomes.
   This stage classifies conversation, an action or a necessary clarification;
   it does not decide whether the assistant has a particular tool.
2. Plan one available tool step against that outcome contract. Named websites
   are searched first. Subsequent decisions receive observed titles/URLs and
   actual execution receipts, rather than an assumed successful plan.
3. Validate and execute through the main-process tool runner, then check the
   result against the outcome it serves. Continue only while a goal is missing.

Exact known app commands remain instant and can work without a model. Personal
memory and PC-status commands retain their separate local routes. Ordinary chat
returns to Capri's persona and full conversation context; the interpreter does
not replace the character with a generic task classifier response.

## General mechanisms

- Typed outcomes separate a website, an app, research and video playback. A
  distinct browser operand on an app-shaped website goal is normalized as web
  navigation. No Netflix or Wikipedia parser/URL mapping was added.
- Browser constraints flow into the tool call when the planner omits an
  argument. A conflicting browser cannot silently replace the user's choice.
- Each step can identify its goal index; two website goals require two separate
  observations. A browser launch alone cannot satisfy visiting a website.
- Actions stop as soon as their supported outcome checks succeed. Duplicate
  effects are compared by actual URL/video/app and browser, ignoring irrelevant
  formatting variations in a model's arguments.
- A non-action decision cannot execute an accidentally generated tool call.
  Unknown tools, arbitrary command arguments, invalid JSON, unsafe URLs and
  missing source references fail without executing those calls.
- One failed-tool correction is allowed. Completion reports use actual
  successful receipts; unavailable remaining work is explained separately.
- Clarifications keep the original goal/question in RAM for two minutes.
  Recent task evidence and up to eight bounded conversation messages help
  resolve follow-ups; they do not supply fresh authorization.
- Four tool attempts, six planning decisions and a shared three-minute deadline
  bound execution. Closing chat, cancellation, relevant settings changes, Gaming
  mode and quitting cancel the interpreter as well as its active tool.

## Browser opening

`open_result` uses an observed search result. A matching observed URL emitted
under `open_url` is normalized to that source reference. Otherwise `open_url`
requires an HTTPS URL actually supplied in the current request. Model-invented
addresses cannot be dispatched as direct URLs.

Native browser dispatch uses an installed executable found in verified standard
installation locations, with the public HTTPS URL as a separate argument and
`shell: false`. The default browser uses Electron's URL opener. It does not
change the browser default, automate login, buy anything, control arbitrary
desktop elements or verify a streaming player. A custom/portable installation
outside discovered locations can require another browser or a future discovery
adapter.

The website outcome check confirms the dispatch receipt and requested browser;
it does not confirm that the page loaded, the user is signed in, or playback
started. Receipt text states those limits.

## Research and design choice

Reviewed October 29, 2026:

- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
  discusses model-based routing, bounded workflows, clear tool interfaces and
  feedback from execution. These informed the intent/plan/observe separation.
- [Qwen-Agent](https://github.com/QwenLM/Qwen-Agent) documents Qwen's agent and
  function-calling components. We apply that model/tool separation within the
  current Electron app and retain its native permissions and tool validation.
  This change does not install the Python framework or a hosted service.
- [Firefox command-line parameters](https://firefox-source-docs.mozilla.org/browser/CommandLineParameters.html)
  documents URL dispatch, including a bare URL supplied by another application.

This is an architectural change to interpretation and execution, using the same
local Qwen model. It does not grant arbitrary computer control or guarantee
understanding every request. New abilities still need real tools. Local model
mistakes remain possible; outcome contracts and validation constrain their
effects. Ordinary chat adds a small local intent pass before the answer; tasks
can need several local model passes and searches, increasing latency. Model
weights remain unloaded between requests under the existing Ollama policy.

## Validation

- `npm test` includes semantic routing, observation-driven website opening,
  clarification continuity, negation/non-action behavior, premature-completion
  checks, multiple goals, duplicate prevention, one-error recovery,
  cancellation and browser executable/URL validation.
- `npm run test:requests-live` runs the real installed Qwen on eight synthetic
  requests: the reported wording, a paraphrase, Spanish, another website,
  ordinary conversation, negation, a hypothetical and an unsupported action.
  Search results and launches are fixtures by default. It requires successful
  website outcomes and no effects for negative/hypothetical requests; a safe
  clarification is accepted for those non-action cases.
- `node scripts/check-request-routing.js --open-browser --first-only` uses live
  public search and native Firefox dispatch for the first request. It can open
  a browser tab; it does not sign in or play media.
- `node_modules/electron/dist/electron.exe scripts/smoke-electron.js --requests-only`
  exercises the actual chat form, preload, main interpreter, tool observations,
  browser-constraint propagation, receipt and ordinary-chat fallback using an
  isolated profile and mocked model/search/launch effects.

Restart Capri to load the updated main process and renderer. The existing
desktop shortcut launches this checkout; no new API key is needed.

Validated locally: 113 automated tests passed, along with the eight-request
live-model evaluation and the actual chat-window integration checks. The real
search/browser test dispatched `https://www.netflix.com/` to the verified
Firefox executable. That check did not verify page loading or playback.
Representative website requests took about 14–22 seconds with local model
reloads. A hypothetical example sometimes received an unnecessary clarification
rather than conversational fallback, but no tool executed. This remains a
small regression set, not a universal request-understanding benchmark.
