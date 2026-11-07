# Capri can act on desktop requests

Ask in ordinary chat. You do not need slash commands:

- “Capri, open File Explorer.”
- “Open Firefox.” (or another exact installed Start menu app name)
- “Could you bring up Netflix using Firefox?”
- “Pull up Wikipedia in Firefox.”
- “Firefox.” also works as an installed-app launch shortcut, including after
  Capri asks which browser/app to open.
- “Capri, play the newest Rubius video on YouTube.”
- “Look for the latest news about AI models.”
- “Find the best discounts on Steam.”
- “Open the first one.” after a search

`/do <task>` also invokes the planner. Ordinary requests use the same local intent
interpreter, rather than needing a particular verb or phrase. Close chat to stop in-flight work. `/cancel` and
`/agent cancel` also cancel tasks. Gaming mode cancels tasks and pauses the media
in Capri Browser. Apps/pages already opened remain open after cancellation.

## What executes

The main-process `RequestInterpreter` first identifies intent and requested
outcomes using local Qwen 3.5 9B. It then plans one tool step, calls `ActionAgent`
to validate and execute it, and uses the observation for the next decision.
Completion checks preserve browser constraints and stop completed effects from
repeating. A failed tool can receive one correction within the same limits.
At most four tool attempts and six planning decisions run under one three-minute
deadline. See [REQUEST-INTERPRETATION.md](REQUEST-INTERPRETATION.md).
Tools accept names, short queries and indexes into observed results.
They cannot accept shell commands, JavaScript, arbitrary file paths or model-made
URLs. Background observation events cannot invoke these action tools. Explicit
requests take priority over background inference.

Known installed app names and explicit app-opening requests have an immediate
route that does not load the model. App requests resolve fixed Windows programs
or exact app names from the user and
machine Start menu folders. Shortcut paths are resolved from those folders;
installer, uninstall, terminal, registry, reset and restore shortcuts are excluded.
Per-user shortcuts take precedence over duplicate machine-wide names. Windows
accepting a launch is reported separately from observing the app’s window.

## Public browsing and research

Reasoning stays local. Requested searches and website visits use the Internet:

- **YouTube:** verify the creator’s actual channel identity and the selected
  newest-first Videos tab. Support both current and older video renderer data.
  “Rubius” means **Rubius Z / @elrubius**; “Rubius OMG” means **@elrubiusOMG**.
  Other creators require their exact @handle. The most recent upload on the
  Videos tab is separate from Shorts and live streams. Playback is attempted in
  Capri Browser, then verified by checking that video time advances and the
  player is not showing an ad. Consent, sign-in or playback blocks are reported;
  the agent does not bypass them or pretend that playback succeeded.
- **News:** Google News RSS headlines from the last seven days, sorted by
  publication time, with source buttons. Headlines are not independently verified
  reporting or article summaries. Older/undated results are excluded.
- **Web search:** public Bing RSS results, with source buttons.
- **Websites in a browser:** named sites are searched first, then an observed
  result is sent to the requested verified Firefox/Chrome/Edge/Brave executable
  or the default browser. Explicit public HTTPS URLs can open directly.
  There are no site-specific launch rules. Receipt text distinguishes sending
  the URL from verifying page loading, sign-in or playback.
- **Steam:** live featured specials directly from Steam’s public store endpoint,
  ordered by percentage discount. Prices/currency come from the Guatemala store
  region. This is a useful current shortlist, not a claim to have ranked every
  Steam game or found the historical lowest price. No purchases are made.

No screen snapshots, PC context or personal memory are sent to search providers.
Public fetches have fixed provider hosts, redirect checks, size limits and timeouts.
Research results may open in Capri Browser as part of a requested lookup. Source
buttons open only observed URLs through opaque references that expire after ten
minutes. Follow-ups can refer to the most recent result set during that period.

Capri Browser is a visible, separate Chromium window. Its public pages have no
preload or app API, no Node access, and no access to the overlay’s profile. The
browser session is non-persistent; browser permission requests, popups and
downloads are denied. Navigation is limited to public HTTPS URLs. This is
purposeful browsing, not automation of your signed-in Firefox/Chrome profile.

## Reporting and personality

Progress appears in the existing chat panel. Results are generated from tool
observations, with clickable source buttons. Session-only execution receipts let
ordinary follow-up conversation refer to what she actually did. Memory commands
remain outside chat history and retain their separate save confirmations.
Capability registry revision **3** advertises these tools and their actual limits.

This does not add unrestricted desktop clicking/typing, file modification, login,
shopping checkout or messaging. Windows accessibility control and broader
result-driven planning remain separate next milestones.

## Checks

```text
npm test
npm run test:tasks
npm run test:tasks-live
npm run test:playback-live
npm run test:tasks-ui-live
```

Unit tests cover planning limits, unrequested playback, bad references, URL/feed
validation, cancellation, launch paths, truthful results and follow-ups.
`test:tasks` exercises real preload/main/chat routing with mocked effects.
`test:tasks-live` exercises real Qwen planning and live data for all three example
requests, with browser effects stubbed. `test:playback-live` launches real File
Explorer and verifies real newest-upload playback. `test:tasks-ui-live` exercises
the whole chat → Qwen → live Steam → clicked source → real browser path. Live
tests depend on the public sites; source changes and blocks are surfaced.

Initial live planner runs for the three example requests took about nine seconds
each. The real Explorer window and advancing YouTube playback were verified.
All 58 Node tests passed, along with task IPC/UI checks, all three real-planner
examples, the real Steam chat/source-button flow, and the control-room regression
check. The desktop shortcut was verified against this checkout and left intact.

The app-choice routing fix adds coverage for short replies, polite launch
requests, aliases, ordinary app mentions and paused/disabled actions. All 61 Node
tests passed. `npm run test:firefox-live` also passed through real chat: “can you
open my browser?” → “firefox” launched the installed Firefox shortcut and verified
a Firefox window, with zero model inference calls.

## Grounded app context

App matching and execution now use the same alias resolver: `Chrome` and
`Google Chrome` resolve to the same verified launch entry. Discovery also checks
existing standard browser executables when Start menu shortcuts are missing.
The inventory supplies positive evidence only; a lookup failure is never proof
that an app is uninstalled. Typo suggestions require a choice before launching.

Task goals and compact observed outcomes remain in RAM for ten minutes (six
entries maximum). App-choice questions expire after two minutes. Replies such
as “the second one”, “Chrome instead”, and “open it again” can use this context.
Cancellation or unrelated conversation clears active app follow-up intent.
Ordinary chat receives bounded task context and fresh app evidence; app evidence
respects the process-context privacy setting. Neither context nor earlier task
results grant permission for a new action. No ordinary transcript is persisted.

`npm run test:chrome-live` passed through real chat and verified a visible
Chrome window, with no model inference for the known app launch.
`npm run test:context-live` passed with real Qwen and installed-app discovery:
after opening Chrome, “open it again” resolved to Chrome. Launch effects in that
planner test are stubbed; the separate Electron test performs the real launch.
Eight additional regression tests cover aliases, app choices, corrections,
typos, evidence failures, context expiry and prompt grounding.
All 69 Node tests and the control-room regression check passed. The desktop
shortcut still points directly at this checkout and required no changes.
