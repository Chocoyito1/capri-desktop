# Branches and integration

## Local transition completed (2026-11-07)

The existing process work and current application snapshot were deliberately
saved as separate commits on `codex/caprigpt-local` (`c08ad43`, `a1a388e`). The
machine-specific `.codex/config.toml` remains local and untracked. Local
`development` now exists at the documented `3095c18` baseline. Shared work branch
`feature/project-companion` was created from development, then fast-forwarded to
the saved application snapshot before implementing project context. The feature
branch targets development through a PR. This does not advance main or establish
a stable release. The historical starting-point notes below describe the earlier
read-only session; platform/windows remains to be established when needed.

## Starting point (2026-11-06)

The inspected checkout is `codex/caprigpt-local` at `3095c18`, 17 commits ahead
of `origin/main` (`79a016c`, upstream 0.3.1). Both tracked package versions are
0.4.0. The working tree contains substantial ongoing companion, voice and
request-routing work; it is not part of any new branch until deliberately
committed. No local tags or tracked GitHub workflows existed.

`origin` is `Chocoyito1/capri-desktop`; `analogicgoose` is
`AnalogicGoose/CapriGPT`. Read-only GitHub inspection confirmed that the latter's
main already points to `3095c18`, while origin/main remains at `79a016c`.
Both repositories returned empty release lists. Remote tag/workflow enumeration
was unavailable; do not assume they are absent. Recheck before enabling CI.
The package's repository field and much of the inherited README still reference
mochiiwuff's upstream. Do not silently retarget those links or publish there.

The intended local transition starts main at origin/main and development and
platform/windows at the current committed HEAD. Creating these references was
blocked by this session's read-only access to .git; no new branches were created.
Run the following locally after confirming the refs still match the audit:

```powershell
git branch main origin/main
git branch development 3095c18
git branch platform/windows development
```

These commands create refs without switching or moving dirty work. Do not use
`-f` if any name already exists; inspect it instead. The old working branch is
preserved and remains checked out. No remote default branch, protection, tag or
release is changed. Creating development does not release the prototype. The
two remote mains must not be treated as interchangeable release baselines.
Confirm the canonical repository before pushing or configuring hosted releases.

## Long-lived branches

| Branch | Purpose | Accepts |
| --- | --- | --- |
| main | Historical released baseline; future verified releases | Release PR from development, urgent hotfix PR |
| development | Shared integration and next release | Shared work PRs, tested Windows integration, main after hotfix |
| platform/windows | Windows-specific implementation | Windows work PRs, development synchronization |

Only Windows has a packaging target and recorded runtime validation. Even on
Windows, the current 0.4.0 installer has not yet been validated. Do not create
platform/macos or platform/linux or advertise their support based only on
Electron or inherited README speculation. Add a platform branch only with a
maintained build target, CI and recorded native runtime verification.

## Work branches

| Work | Parent | Name |
| --- | --- | --- |
| Shared code, config, docs | development | feature/description or fix/description |
| Windows-only code | platform/windows | feature/windows/description or fix/windows/description |
| Urgent released defect | main | hotfix/description |

Start new work only after saving current edits deliberately. Do not stash,
reset, clean, switch or move the existing dirty checkout automatically. These
process files should be selected into a focused shared-work commit later, not
bundled with the unfinished application changes. A separate worktree is useful
once the current work has been saved. Existing branches stay intact.

Review through PRs; keep development buildable. Merge development down into
platform/windows regularly. Merge platform/windows into development only for a
coherent, tested integration. Never merge platform branches into each other.
Use merge commits for long-lived branch integrations to preserve ancestry;
do not squash those integrations, rebase shared branches or force-push them.
Squash is acceptable for a short-lived work PR when its branch will be retired.

Promote development to main only for a release. After a hotfix lands on main,
open main -> development immediately, then development -> platform/windows.
Resolve conflicts on a temporary branch based on the destination, merge the
source into it, test and open a PR to the destination. Preserve both histories.

## Automation and repository settings

`CI / windows` tests and packages the application without publishing on pushes
and PRs. `Branch synchronization` is manually dispatched: it opens a downward
sync PR, never merges or force-pushes. Choose development for the Windows sync,
or main after a hotfix. Unknown/conflicting mergeability is surfaced for human
review. GitHub must allow Actions to create PRs. PRs created with GITHUB_TOKEN
do not start ordinary PR workflows: a maintainer must close/reopen the sync PR
to trigger CI before merging, or configure an approved GitHub App token later.

When remote changes are authorized, protect all three long-lived branches:
require PR review and CI / windows, prohibit force pushes/deletion, and require
branches to be current before merging. Keep merge commits enabled; do not
require a linear history. These settings are recommendations, not installed
protections. Workflows must first land on the default branch for manual dispatch
to be available. Bootstrap through a reviewed process-only PR; that administrative
exception must not promote unfinished application work as a release.

No pruning automation is enabled. Retire a finished work branch only with
explicit authorization, after a grace period (at least 14 days), no open PR and
confirmation of inclusion in its intended parent. Use
`git merge-base --is-ancestor <branch> <parent>` for merge commits. Squashed PRs
need separate PR/diff verification because ancestry alone cannot confirm them.
Never delete an unmerged branch or an existing tag.
