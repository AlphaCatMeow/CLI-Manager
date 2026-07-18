import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHistoryProjectPaths,
  resolveTodayProjectStatsScope,
} from "../src/lib/historyProjectPaths.ts";

test("normalizes, sorts, and deduplicates project paths", () => {
  assert.deepEqual(normalizeHistoryProjectPaths([
    " D:\\repo\\worktree\\ ",
    "D:/repo/main/",
    "D:/repo/main",
    "",
  ]), ["D:/repo/main", "D:/repo/worktree"]);
});

test("allows project-wide today usage before the active checkout has a latest session", () => {
  assert.deepEqual(resolveTodayProjectStatsScope(
    ["D:/repo/main", "D:/repo/worktree"],
    [null, undefined]
  ), {
    projectKey: "",
    projectPaths: ["D:/repo/main", "D:/repo/worktree"],
  });
});

test("falls back to project key when no project path is available", () => {
  assert.deepEqual(resolveTodayProjectStatsScope([], [null, "project-key"]), {
    projectKey: "project-key",
    projectPaths: [],
  });
  assert.equal(resolveTodayProjectStatsScope([], [null, " "]), null);
});
