# V1.2.6 Git 功能增强

## Goal

当前 CLI-Manager 的 Git 功能只覆盖加入暂存、忽略、推送，无法支撑高频开发流。V1.2.6 需要参考 JetBrains IDE 的 Git 工作流，筛选性价比分数不低于 80 的功能，分阶段实现，优先补齐高频、低风险、性能影响小的能力。

## Changelog Target

V1.2.6

## What I Already Know

* 用户认为当前 Git 功能“太鸡肋”，明确点名分支切换是高频功能。
* 本次不能只做分支切换，需要按阶段完成多项高性价比 Git 能力。
* 最终交付必须包含详细修改内容、验证手册、使用手册。
* 项目规范要求新增/修改用户可见文案同步 `zh-CN` 与 `en-US`。

## Assumptions

* 优先做工作区内本地 Git 操作，不引入重量级依赖。
* Git 操作应复用现有后端命令模式，避免前端直接拼接危险命令。
* V1.2.6 先补 JetBrains 高频工作流中的核心 80 分以上能力，复杂能力分后续阶段。

## Open Questions

* 已确认：V1.2.6 Stage A 先做“分支列表/切换 + 远程分支 checkout + 新建分支 + Fetch”，Smart Checkout / Stash / Git Log 放到 Stage B/C。

## User Confirmation

* 2026-07-07：用户回复“继续”，确认进入实现。

## Requirements

* 对比 JetBrains Git 功能，形成性价比评分和分阶段落地清单。
* 实现评分不低于 80 的首批 Git 功能，不能只包含分支切换。
* V1.2.6 Stage A 包含：
  * 显示本地/远程分支列表。
  * 切换本地分支。
  * checkout 远程分支并建立本地跟踪分支。
  * 从当前 HEAD 新建并切换分支。
  * Fetch 远端分支/提交信息，但不合并、不改工作区。
* 控制性能影响：状态刷新、分支列表、远程信息应避免高频阻塞 UI。
* 所有新增用户可见文案必须走 i18n，兼容 `zh-CN` 与 `en-US`。
* 交付 V1.2.6 修改内容、验证手册、使用手册。

## Acceptance Criteria

* [x] 有 JetBrains Git 功能对照表，包含评分、阶段、是否纳入 V1.2.6。
* [x] Git 面板能查看本地分支、远程分支和当前分支。
* [x] Git 面板能切换本地分支。
* [x] Git 面板能从远程分支 checkout 本地跟踪分支。
* [x] Git 面板能新建分支并切换过去。
* [x] Git 面板能执行 fetch 并刷新分支/远端状态。
* [x] checkout 遇到未提交改动冲突时不强制覆盖，给出清晰错误提示。
* [x] 分支菜单输入框用于搜索分支，输入时不触发主变更树明显重渲染卡顿。
* [x] 新增 Git UI 在中英文界面下均无硬编码文案。
* [x] `npx tsc --noEmit` 通过。
* [x] Rust 侧若有修改，`cd src-tauri && cargo check` 通过。
* [x] `CHANGELOG.md` 记录 V1.2.6 变更。
* [x] `docs/功能清单.md` 更新 Git 能力说明。
* [x] 输出验证手册和使用手册。

## Definition of Done

* 代码符合现有架构和项目规范。
* 不新增不必要依赖。
* 变更范围清晰，避免重构无关代码。
* 性能敏感路径有节流、缓存或按需加载策略。
* 验证命令和手动验证流程可复现。

## Out of Scope

* 不做完整 JetBrains Git 功能克隆。
* 不实现复杂图形化提交历史/分支图。
* 不实现交互式 rebase、Smart Checkout、stash/shelf 完整替代、冲突三方合并编辑器。
* 不实现强制 checkout、删除分支、重命名分支。
* 不擅自推送、提交或改写用户仓库历史。

## Research References

* [`research/jetbrains-git-comparison.md`](research/jetbrains-git-comparison.md) - JetBrains Git 功能对照、评分、阶段和当前代码现状。

## Scoring Summary

| Feature | Score | Stage | Decision |
|---|---:|---|---|
| Branch list + local switch | 96 | V1.2.6-A | Implement |
| Remote branch checkout | 90 | V1.2.6-A | Implement |
| Create branch from current branch | 88 | V1.2.6-A | Implement |
| Fetch remote changes | 86 | V1.2.6-A | Implement |
| Pull/update strategy | 84 | Existing / polish | Keep |
| Commit + push | 82 | Existing | Keep |
| Rollback/revert selected changes | 82 | Existing | Keep |
| Smart Checkout | 78 | V1.2.6-B | Defer |
| Stash/Shelf UI | 76 | Later | Defer |
| Git Log / history | 74 | Later | Defer |

## Technical Approach

* 后端在 `src-tauri/src/commands/git.rs` 增加轻量 Git 命令：
  * `git_list_branches`
  * `git_fetch`
  * `git_checkout_branch`
  * `git_create_branch`
* 命令参数用数组传给 `std::process::Command`，不拼 shell 字符串。
* 分支名优先用 `git check-ref-format --branch` 校验，避免自己维护不完整规则。
* 前端在 `src/stores/gitStore.ts` 增加 branch/fetch/checkout/create 状态和 action。
* `GitChangesPanel` 在当前分支区域增加紧凑下拉：本地分支、远程分支、Fetch、新建分支。
* 所有新增文案加入 `src/lib/i18n.ts` 的 `zh-CN` 与 `en-US`。
* checkout/create/fetch 后刷新 changes、branch status、branch list 和 repository list。

## Decision (ADR-lite)

**Context**: JetBrains 的 Git 功能很大，CLI-Manager 不应克隆全部功能。用户最明确的痛点是分支切换，同时要求本次不能只做分支切换。

**Decision**: V1.2.6 Stage A 选择“分支工作流最小闭环”：分支列表、本地切换、远程 checkout、新建分支、fetch。保留现有 commit/pull/push/rollback，不重写。

**Consequences**: 第一阶段能显著提升高频 Git 使用，但遇到本地改动冲突时只提示失败，不做 Smart Checkout。Smart Checkout 和 stash/shelf 进入 Stage B，避免第一阶段直接触碰用户未提交改动的自动迁移。

## Technical Notes

* 已调研 JetBrains 官方文档和当前项目 Git 相关代码。
* GitNexus 索引已重建；预计触达 `GitChangesPanel`、`useGitStore`、`git.rs`，初步 impact 为 LOW/MEDIUM。
* 代码修改前需确认本 PRD 的 Stage A 范围。
