# Repository process validation (2026-11-06)

This records process setup, not a released application build.

- Inspected local refs/history, both remotes, lockfile, Electron Builder config,
  existing tests, validation notes and inherited setup documentation. Read-only
  GitHub branch/release reads confirmed the two distinct main baselines and no
  releases in either fork. Remote tags/workflows could not be enumerated.
- Preserved the checked-out codex branch and all pre-existing dirty files.
  Only AGENTS.md was extended among previously tracked files; the process docs,
  PR template, workflows, release checker and its tests are new files.
- Branch creation failed because .git is read-only in this session. No new refs
  were created. Initialization commands are in DEVELOPMENT.md. No commits,
  pushes, history rewrites, branch deletion, tags or releases were made.
- Existing unit suite: 141 of 143 passed. The hook installer test hit EPERM on a
  temporary file rename; the real hook bridge test hit EACCES connecting to
  loopback. These sandbox limitations do not establish passing CI.
- All six new release tests pass. They cover valid stable/prerelease source, dirty work, wrong tag,
  main ancestry, mismatched lock/stability, archive version/native payload and
  credential/model exclusion. Git receipts are simulated because metadata
  writes are blocked; archive fixtures use real asar files.
- All three workflow YAML files parsed successfully, embedded sync JavaScript
  compiled, and new process files passed whitespace checks.
- Attempted Windows x64 directory packaging with publishing disabled. Native
  dependency preparation completed; packaging failed on GitHub DNS resolution
  (`ENOTFOUND github.com`). No successful installer or packaged runtime check
  is claimed. Re-run on an unrestricted Windows runner before merging/releasing.
- Hosted workflows, branch protection, draft upload and real tag-triggered
  builds remain unverified until the files are reviewed and pushed with explicit
  authorization. No app restart or shortcut change was needed for process files.
