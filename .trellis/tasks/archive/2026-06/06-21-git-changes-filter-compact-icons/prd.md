# Git changes filter responsive labels

## Goal

Make the Git changes filter row adapt to narrow panel widths: keep visible filter text when there is enough room, but hide that text when the panel is dragged narrower so labels do not wrap.

## Requirements

* In the Git changes filter row, keep filters for all, modified, added, and deleted.
* Keep visible labels like `全部`, `修改`, `新增`, `删除` when the panel has enough width.
* When the Git changes panel becomes too narrow, hide only the visible text labels so the buttons remain one-line and compact.
* Keep icons and counts visible in narrow mode.
* Provide hover text and accessible labels for each filter button.
* Make the Git changes panel frame narrower without changing Git data behavior.

## Acceptance Criteria

* [ ] Filter buttons show visible text labels at normal width.
* [ ] Filter button text labels hide at narrow panel width instead of wrapping.
* [ ] Hovering a filter button shows the corresponding label and count.
* [ ] Screen-reader labels remain meaningful.
* [ ] The non-embedded Git changes panel default width is narrower than before.
* [ ] `npx tsc --noEmit` passes, or any failure is reported.

## Definition of Done

* Keep the change local and minimal.
* Do not change Git command behavior or selection/staging logic.
* Run a static/type check where practical.

## Technical Approach

Update `src/components/git/GitChangesPanel.tsx` only if possible:

* Add a local responsive rule for the filter row so label spans are hidden below a narrow panel threshold.
* Keep `title` and `aria-label` on each filter button.
* Reduce the non-embedded panel width class from the current `w-[290px]` to a narrower value.

## Out of Scope

* No changes to Git backend commands.
* No redesign of the full Git changes panel.
* No changes to the merged `TerminalSidePanel` resizable width unless required by implementation.

## Technical Notes

* `GitChangesPanel` is used by `src/components/terminal/TerminalSidePanel.tsx` in embedded mode and by `src/components/TerminalTabs.tsx` in independent side-panel mode.
* GitNexus impact lookup did not find `GitChangesPanel`, likely because the index is stale or incomplete for this component. Direct `rg` found both call sites.
