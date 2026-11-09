# Audit fixes on the Codex implementation

Source: [AnalogicGoose/CapriGPT commit 12462ee](https://github.com/AnalogicGoose/CapriGPT/commit/12462ee66c8813d6ed0dd59f1e162600143cd219).
Ported its bug fixes individually onto the existing working tree. The following
branch/release-process commit was not part of this bug-fix port.

| Fix | Adaptation in this checkout |
| --- | --- |
| Bare app questions do not launch apps | Applied to the legacy launcher and the active Codex desktop tool bridge. Pending legacy app-choice answers still work. |
| Repeated app discovery blocks the main process | Cache the catalog for 30 seconds; explicit launches refresh it immediately. |
| Unreadable shortcuts break discovery | Skip unreadable shortcuts and Start menu roots. |
| Large speech archives freeze the app | Extract hash-verified archives with Windows tar in a hidden child process; remove the unused fflate dependency from both package manifests. |
| Memory review fails over an open chat | Hide the existing panel before switching modes, cancel its pending turn, and preserve renderer conversation history. |
| Transient native errors kill tracking | Skip the failed geometry tick and continue the existing timer. |
| Overlay can change arbitrary settings | Accept only boolean visible/welcomed flags from the production overlay; retain trusted control-room and validated Codex settings tools. |
| Cosmetic changes cancel unrelated work | Preserve Codex turns and memory reviews; revoke affected work on policy/backend changes, and stop speech on relevant sound/pause changes. |
| Closed browser reported as still open | Check the original window-owning process IDs instead of unrelated same-name background processes. |

The Codex chat/background transports, CLI discovery/settings, streaming, memory
tools, companion behavior, voice adapters and current artwork remain in place.
Ollama startup and inference were not restored. No existing working-tree files
were replaced with older whole-file versions. Pre-port copies of the affected
files were saved under the ignored local work folder.

## Verification

- Full Node suite: **174/174 pass** with TEMP/TMP pointing to a writable,
  workspace-local test directory. Default sandbox temp caused the existing hook
  installer rename test to fail with EPERM; the same test passes in writable temp.
- Focused audit/Codex suite: **21/21 pass**, including new coverage for active
  Codex launch guards, memory-panel mode switching, cosmetic/policy cancellation,
  unreadable shortcuts, catalog refresh and transient window-provider failures.
- Real Windows tar extraction of a small nested ZIP fixture passed.
- Eleven changed JavaScript files parse, and dependency manifests agree.
- Standard Windows directory packaging hit EPERM renaming the Electron download
  into the sandbox cache. A build using the installed matching Electron 44.9.3
  and workspace-local cache **passed**. This is a directory package, not an
  installer test; no signing certificate was configured.
- Inspected the resulting app.asar: Codex brain/client/runtime/tools and the
  companion/voice modules are present, packaged chat still calls Codex, and
  neither Ollama transport wiring nor the removed fflate payload was restored.

Live Codex inference and native interactive desktop/voice/installer acceptance
remain unverified. This work does not certify a release. The running companion
was not restarted, and no commits, pushes, tags or releases were made.
