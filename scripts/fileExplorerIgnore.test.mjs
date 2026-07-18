import test from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultIgnoreMatcher,
  createIgnoreMatcher,
  includesProjectGitIgnoreChange,
} from "../src/lib/fileExplorerIgnore.ts";

test("bare directory rules match at any depth", () => {
  const matcher = createIgnoreMatcher("node_modules/");

  assert.equal(matcher.ignores("node_modules", true), true);
  assert.equal(matcher.ignores("packages/app/node_modules", true), true);
  assert.equal(matcher.ignores("packages/app/node_modules/pkg/index.js", false), true);
});

test("root-anchored rules stay root-only", () => {
  const matcher = createIgnoreMatcher("/build");

  assert.equal(matcher.ignores("build", true), true);
  assert.equal(matcher.ignores("packages/build", true), false);
});

test("wildcard rules and negation follow gitignore semantics", () => {
  const matcher = createIgnoreMatcher("*.log\n!important.log\ndocs/**/draft*.md");

  assert.equal(matcher.ignores("debug.log", false), true);
  assert.equal(matcher.ignores("important.log", false), false);
  assert.equal(matcher.ignores("logs/important.log", false), false);
  assert.equal(matcher.ignores("docs/guides/archive/draft-old.md", false), true);
});

test("directory-only rules do not hide same-named files", () => {
  const matcher = createIgnoreMatcher("cache/");

  assert.equal(matcher.ignores("cache", true), true);
  assert.equal(matcher.ignores("cache", false), false);
});

test("default matcher covers nested dependencies and generated files", () => {
  const matcher = createDefaultIgnoreMatcher();

  assert.equal(matcher.ignores("apps/web/node_modules", true), true);
  assert.equal(matcher.ignores("logs/app.log", false), true);
  assert.equal(matcher.ignores("src/main.ts", false), false);
});

test("an empty project gitignore remains authoritative", () => {
  const matcher = createIgnoreMatcher("");

  assert.equal(matcher.ignores("node_modules", true), false);
  assert.equal(matcher.ignores("logs/app.log", false), false);
});

test("gitignore watcher path detection accepts normalized relative paths", () => {
  assert.equal(includesProjectGitIgnoreChange(["src/main.ts", ".gitignore"]), true);
  assert.equal(includesProjectGitIgnoreChange([".\\.gitignore"]), true);
  assert.equal(includesProjectGitIgnoreChange(["nested/.gitignore"]), false);
  assert.equal(includesProjectGitIgnoreChange(undefined), false);
});
