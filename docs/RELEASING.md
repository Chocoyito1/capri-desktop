# Version and release procedure

## Current status

0.4.0 is an unreleased local prototype, not an installer certification. Windows
x64 is the only configured packaging target. There are no verified macOS/Linux
downloads. `VALIDATION.md` records historical checks; rerun checks for each
candidate. The inherited upstream README is not this fork's release promise.
There is no automatic updater/publishing configuration added by this process.

## Prepare and promote

1. Confirm the canonical remote, its current branches, tags, releases and Actions
   configuration. Preserve existing tags and releases. Never move a release tag.
2. Integrate the intended shared and Windows work into development through PRs.
   Save unfinished local changes on their own work branches; never release a
   dirty checkout. Synchronize development into platform/windows before final
   platform validation, then integrate any platform fixes back through a PR.
3. Run `npm ci`, `npm test` and
   `npx electron-builder --win --x64 --dir --publish never`. Run affected isolated
   Electron checks and the interactive Windows/Ollama/browser/voice checks that
   the change requires. Some existing live smoke scripts assume local services
   or scratch paths: review them first. `test:release` alone is not proof of a
   verified installer. Record commit, Windows version, architecture and results.
4. Update package.json and package-lock.json together on development using
   `npm version <version> --no-git-tag-version`. Use SemVer: patch for fixes,
   minor for compatible features, major for incompatible changes. Prefer
   `0.4.0-alpha.1` or `0.4.0-beta.1` until the prototype is validated. Do not
   label the unfinished 0.4.0 work stable simply because its version lacks a suffix.
5. Write `releases/v<version>.md` from the actual changes, with explicit
   `Stability: alpha`, `Stability: beta`, `Stability: rc` or `Stability: stable`.
   Include Windows x64, tested behavior, test evidence and remaining limits.
   Check installer licensing/asset permissions and signing status; do not claim
   bundled models, voices or Ollama when they are separately installed.
6. Review and merge development -> main with a merge commit as a deliberate
   release. Stable notes require actual native/installer validation evidence.
   A prerelease must also be on main under this model; it is clearly marked as
   a test build and does not establish stable support. Do not tag a work branch.
7. With a clean checkout of that main commit, run
   `git tag -a v<version> -m "Release v<version>"`. Review the exact commit and
   get explicit authorization before pushing branches or tags. Pushes, tags and
   publishing are separate operations; none is authorized by this document.

## Build, inspect and publish

The tag workflow checks main ancestry, version/lock agreement, notes and
stability, then installs the lockfile, runs unit tests, and builds the Windows
x64 NSIS installer with publishing disabled. It inspects the packaged app.asar,
checks its version, required entry points and native unpacked module, rejects
local credential/model/capture paths, and creates SHA256SUMS.txt plus
release-manifest.json. The manifest names the exact tag/commit, OS, architecture
and declared stability. This is structural validation, not an install test.

Only after successful inspection does automation create a **draft** release in
the repository where the workflow runs. It never publishes. Stable releases
are not marked prerelease; alpha/beta/rc tags are marked prerelease. An existing
release for the tag causes a failure instead of silently replacing downloads.
To recover an interrupted attempt, inspect and repair the draft manually.

Before publishing, a person must:

- Download the draft installer, manifest and checksums and recompute SHA-256.
- Install on a clean Windows x64 machine/VM, inspect installed contents and
  signing/SmartScreen behavior, launch, test the changed features, tray/shortcut,
  uninstall and verify separate prerequisites and privacy defaults.
- Verify version/source identity and honest notes, including missing features,
  untested behavior and signing status. Attach the evidence to the release PR.
- Explicitly authorize publication, then publish the reviewed draft manually.
  Do not rebuild from another commit under the same tag. Fixes get a new version.

Use `releases/TEMPLATE.md` as a starting point. For platform test builds include
platform in the notes and artifact name and a prerelease identifier such as
`0.4.0-beta.1`; never reuse a stable tag for a different platform experiment.
The current workflow intentionally builds only Windows x64. Optional build
metadata is not accepted by the release checker so artifact names stay portable.
