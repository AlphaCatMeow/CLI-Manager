# JetBrains Git 功能对比与 V1.2.6 取舍

## Sources

* JetBrains IntelliJ IDEA 2026.1: Manage Git branches  
  https://www.jetbrains.com/help/idea/manage-branches.html
* JetBrains IntelliJ IDEA 2026.1: Sync with a remote Git repository  
  https://www.jetbrains.com/help/idea/sync-with-a-remote-repository.html
* JetBrains IntelliJ IDEA 2026.1: Commit and push changes  
  https://www.jetbrains.com/help/idea/commit-and-push-changes.html
* JetBrains IntelliJ IDEA 2026.1: Shelve or stash changes  
  https://www.jetbrains.com/help/idea/shelving-and-unshelving-changes.html
* JetBrains IntelliJ IDEA 2026.1: Resolve Git conflicts  
  https://www.jetbrains.com/help/idea/resolve-conflicts.html
* JetBrains IntelliJ IDEA 2026.1: Investigate changes in Git repository  
  https://www.jetbrains.com/help/idea/investigate-changes.html

## Current CLI-Manager Baseline

Inspected files:

* `src/components/git/GitChangesPanel.tsx`
* `src/stores/gitStore.ts`
* `src-tauri/src/commands/git.rs`
* `src/lib/types.ts`
* `src/lib/i18n.ts`

Current Git panel already has:

* Changed/untracked file tree, grouping by directory/module.
* Diff modal, hunk/line revert, tracked-file discard.
* Stage/unstage file/path/all.
* Commit selected changes, including selected untracked files.
* Branch status with ahead/behind, pull strategy menu, push with upstream setup.
* Pull conflict banner with abort/rebase-continue path.
* Root/sub-repository selector.
* Watcher-driven refresh with fallback polling.

Main gaps versus JetBrains high-frequency flows:

* No branch list grouped by local/remote.
* No branch checkout/switch from the Git panel.
* No new-branch-from-current action.
* No explicit fetch action to refresh remote branch list without merging.
* No stash/shelf UI.
* No Git log/history UI.
* No full conflict merge editor.

## Scoring Method

Score = user value 40 + implementation cost inverse 25 + risk inverse 20 + fit with CLI-Manager 15.

Interpretation:

* 90+: must do early unless risky.
* 80-89: good V1.2.6 candidate.
* 70-79: useful, but defer unless it unlocks a chosen flow.
* <70: not worth this release.

## JetBrains Feature Comparison

| Feature | JetBrains behavior | Current CLI-Manager | Score | Stage | Decision |
|---|---|---:|---:|---|---|
| Branch list + local switch | VCS widget / Branches pane lists local branches and checks out selected local branch. | Only shows current branch. | 96 | V1.2.6-A | Implement. Highest frequency, clear user request. |
| Remote branch checkout | Fetch, show remote branches, checkout creates local tracking branch. | No remote branch list/checkout. | 90 | V1.2.6-A | Implement minimal version. |
| Create branch from current branch | Dialog asks branch name and optional checkout. | Missing. | 88 | V1.2.6-A | Implement minimal "create and checkout" first. |
| Fetch remote changes | Safe fetch, refreshes incoming/remote branch info without touching worktree. | Pull exists, explicit fetch missing. | 86 | V1.2.6-A | Implement because it supports remote branch checkout and is low risk. |
| Pull/update strategy | Pull supports merge/rebase/ff-only. | Mostly present. | 84 | Existing / polish | Keep; maybe expose alongside branch menu. |
| Commit + push | Commit window selects files, unversioned files staged at commit time, push available. | Present enough for CLI-Manager. | 82 | Existing | No V1.2.6 rewrite. |
| Rollback/revert selected changes | Revert local changes from Changes view. | Present for file/hunk/line. | 82 | Existing | No rewrite. |
| Smart Checkout | If checkout conflicts, shelve/stash, checkout, unshelve/apply. | Missing. | 78 | V1.2.6-B | Defer from first slice; riskier because it can move user changes. |
| Stash/Shelf UI | Stash/shelf list, apply, pop, drop. | Missing. | 76 | Later | Useful but broader UX and safety surface. |
| Git Log / history | Commit graph, filters, file history, compare revisions. | History session diff exists, Git log missing. | 74 | Later | High value but expensive UI. |
| Conflict merge editor | Three-pane merge resolution. | Conflict files visible; no merge editor. | 66 | Later | Too big for V1.2.6-A. |
| Branch compare / diff with working tree | Compare branch vs current/working tree. | File diff only current worktree. | 70 | Later | Useful after branch list exists. |
| Delete/rename branches | Local branch rename/delete with warnings/restore. | Missing. | 68 | Later | Risky destructive operations; not first release. |
| Favorites/recent branches | Favorite/recent grouping and prefix grouping. | Missing. | 62 | Later | Convenience after core branch workflow. |
| Changelists | Multiple local change buckets. | Missing. | 58 | Later | Doesn't map cleanly to Git index without custom model. |

## Recommended V1.2.6 Scope

### Stage A: 80+ score, high value, controlled risk

Implement:

* `git_fetch`: explicit safe fetch/prune command.
* `git_list_branches`: local + remote branches, current marker, upstream marker if available.
* `git_checkout_branch`: switch local branch; checkout remote branch as local tracking branch.
* `git_create_branch`: create from current HEAD and checkout.
* Git panel branch dropdown: local/remote sections, refresh/fetch, create branch form.
* i18n keys for all new UI and toast/error strings.

Do not implement in Stage A:

* Force checkout.
* Smart checkout with stash/shelf.
* Delete/rename branch.
* Full Git log UI.

### Stage B: after Stage A is stable

Candidate features:

* Smart checkout prompt when checkout fails because local changes would be overwritten.
* Minimal stash flow: stash all, list latest stashes, apply/pop latest.
* Branch compare: show changed files between selected branch and current branch.

### Stage C: larger UI investment

Candidate features:

* Git log/history panel.
* File history.
* Conflict merge editor.
* Branch favorites/recent.

## Implementation Notes

* Use existing `run_git_cli` for Git operations that need user credential manager / SSH / git config behavior.
* Use args arrays only; no shell string concatenation.
* Validate branch names through Git itself (`git check-ref-format --branch <name>`) or a stricter helper before running checkout/create commands.
* After checkout/create/fetch, refresh changes, branch status, branch list, and repositories.
* Keep watcher/polling behavior unchanged.
* Branch list fetch should be on panel open and after fetch/checkout/create, not on every file change event.
* WSL: keep behavior consistent with existing pull/push path; avoid introducing a separate WSL-only implementation in Stage A unless current command path fails in verification.

## Impact Notes

GitNexus index was stale and was rebuilt with `npx gitnexus analyze`.

Impact checks:

* `GitChangesPanel` (`src/components/git/GitChangesPanel.tsx`): LOW risk, no upstream dependents reported; used as a panel process entry.
* `useGitStore` (`src/stores/gitStore.ts`): LOW risk; direct affected consumers are `GitChangesPanel` and `GitTreeNodeComponent`, indirect `GitChangesTree`.
* `git_branch_status` (`src-tauri/src/commands/git.rs`): LOW risk, no upstream dependents reported.
* `run_git_cli` (`src-tauri/src/commands/git.rs`): LOW risk; direct callers are `git_commit_paths`, `git_push`, `git_pull_abort`.

Risk assessment:

* Overall Stage A risk: MEDIUM. The touched surface spans backend commands, frontend store, UI, i18n, and command registration.
* Main user-data risk: branch checkout can fail or overwrite only if forced. Stage A must avoid force checkout and surface checkout conflicts as errors.
* Main performance risk: branch listing/fetch should not run on every Git file-change event.
