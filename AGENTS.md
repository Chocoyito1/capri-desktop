# Capri project preferences

- Follow `CONTRIBUTING.md`, `docs/DEVELOPMENT.md` and `docs/RELEASING.md` for
  branches, checks and releases. Preserve dirty work and existing history.
  Shared work starts from development; Windows-only work from platform/windows.
  Use PRs into long-lived branches. Never push, delete branches, rewrite history
  or publish a release without explicit user authorization.

- The user wants PC awareness enabled by default for all apps, including newly
  installed apps. Do not require maintaining an app allowlist or repeatedly
  requesting observation permission. Keep observation local and on demand or
  event-triggered; do not add screen recording or keylogging. Do not mistake
  broad observation permission for automatic approval of destructive actions.

- After changing Capri's setup, location, or launch behavior, check the user's
  `CapriGPT.lnk` desktop shortcut and update it if needed so it launches the
  current checkout directly without an npm command or a terminal window.
- Use the Windows Desktop special-folder path rather than assuming its location.
  Point the shortcut at this checkout's Electron executable, pass the absolute
  project folder as its argument, set that folder as the working directory, and
  use Capri's icon. Verify the saved target and arguments.
- The user has authorized these routine shortcut updates; do not ask again.
  Preserve an existing shortcut backup under the ignored `.caprigpt-local/`
  folder before replacing it. Do not restart a running Capri merely to update
  the shortcut; explain if a restart is needed for application changes.
