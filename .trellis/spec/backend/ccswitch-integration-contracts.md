# cc-switch Integration Contracts

> Executable contracts for reading the external cc-switch SQLite db and writing
> per-project `.claude/settings.json`. Implementation: `src-tauri/src/commands/ccswitch.rs`.

---

## Scenario: Reading an external tool's SQLite database

### 1. Scope / Trigger

- Trigger: any Tauri command that reads a SQLite file owned by another application
  (here: `~/.cc-switch/cc-switch.db`).

### 2. Signatures

```rust
#[tauri::command]
pub async fn ccswitch_list_providers(
    app: tauri::AppHandle,
    db_path: Option<String>,        // JS 侧传 dbPath（camelCase 自动映射）
) -> Result<CcSwitchProvidersResponse, String>
```

### 3. Contracts

- **Dependency**: use the `sqlx` 0.8 already present in the dependency tree via
  `tauri-plugin-sql` (`default-features = false, features = ["runtime-tokio", "sqlite"]`).
  **Never add `rusqlite`** — `libsqlite3-sys` is a `links = "sqlite3"` crate, two versions
  cannot coexist; the build breaks or pins us to fragile version coupling.
- **Open mode**: `SqliteConnectOptions::new().filename(path).read_only(true)` +
  `SqliteConnection::connect_with`. `create_if_missing` stays default (false) so a typo'd
  path can never create an empty db file.
- **Path resolution**: `None`/blank → default under `app.path().home_dir()`; custom path
  must pass extension allowlist (`.db`) and `is_file()` before any I/O.
- **Secret masking happens in Rust**: env keys containing
  `token|key|secret|auth|password` (case-insensitive) are masked
  (`first 4 + … + last 4`, or `***` if ≤12 chars) before the payload crosses to the
  WebView. Plaintext credentials must never reach the frontend.

### 4. Validation & Error Matrix

| Condition | Error (stable string) |
|-----------|----------------------|
| Path extension is not `.db` | `unsupported_format` |
| File does not exist | `db_not_found` |
| Cannot resolve home dir | `home_dir_unavailable: <err>` |
| SQLite open failure | `db_open_failed: <err>` |
| Query/decode failure | `db_query_failed: <err>` |

### 5. Good/Base/Bad Cases

- Good: no `dbPath` arg → default path resolved, providers returned with masked env.
- Base: custom `dbPath` to a moved db file → `db_not_found`, frontend shows mapped hint.
- Bad: opening read-write or with `create_if_missing(true)` → may create/lock another
  app's database file; forbidden.

### 6. Tests Required

- Unit: `is_secret_env_key` accepts/rejects known key names (`ANTHROPIC_AUTH_TOKEN` vs
  `ANTHROPIC_BASE_URL`).
- Unit: `mask_secret` keeps only edges, handles short/empty strings.
- Unit: settings_config parse failure → provider still listed with `configParseError: true`.

### 7. Wrong vs Correct

#### Wrong
```toml
rusqlite = { version = "0.32", features = ["bundled"] }  # links 冲突 / 重复原生 sqlite
```
#### Correct
```toml
sqlx = { version = "0.8", default-features = false, features = ["runtime-tokio", "sqlite"] }
```

---

## Scenario: Writing provider env into `<project>/.claude/settings.json`

### 1. Scope / Trigger

- Trigger: switching a claude project's API provider (`ccswitch_apply_provider`); any
  future command that rewrites a user-owned JSON config must follow the same posture.

### 2. Signatures

```rust
#[tauri::command]
pub async fn ccswitch_get_project_provider(
    app: tauri::AppHandle,
    project_path: String,
    db_path: Option<String>,
) -> Result<CcSwitchProjectProvider, String>
// { matchedProviderId, hasSettingsFile, baseUrl,
//   localOverrideKeys }  // settings.local.json 中 ANTHROPIC_ 前缀 key 名（只 key 名不含值）

#[tauri::command]
pub async fn ccswitch_apply_provider(
    app: tauri::AppHandle,
    project_path: String,
    provider_id: String,
    db_path: Option<String>,
) -> Result<(), String>                        // unit：不向前端回传任何 env 内容

#[tauri::command]
pub async fn ccswitch_reset_project_provider(
    project_path: String,                      // 无 db_path：恢复全局不读 cc-switch.db
) -> Result<(), String>
// 删除项目 settings.json 的整个 env 字段（用户拍板，含用户自有 key）；
// 删后顶层为空对象 → 删除 settings.json 文件本身（.claude/ 目录保留）；
// 文件不存在 = no-op 成功；损坏 JSON → settings_parse_failed 不动文件

#[tauri::command]
pub async fn ccswitch_probe_projects(
    app: tauri::AppHandle,
    project_paths: Vec<String>,
    db_path: Option<String>,
) -> Result<Vec<CcSwitchProjectBadge>, String>
// 每项 { path, hasOverride, providerName }；单项路径缺失/损坏 JSON 容错为
// hasOverride=false，绝不让整批失败；db 缺失 → db_not_found（前端静默清徽标）
```

### 3. Contracts

- **env replacement rule** (pure fn `replace_anthropic_env` / `merge_settings_text`):
  1. remove every existing env key with prefix `ANTHROPIC_` (clears previous provider
     residue, e.g. stale model mappings);
  2. insert **all** keys from the provider's `settings_config.env` (overwrite on collision);
  3. top-level fields other than `env` (hooks/permissions/...) stay untouched;
  4. only the provider's `env` section is taken — never its `hooks` or other fields.
- **Match rule** (`provider_matches_project_env`): `ANTHROPIC_BASE_URL` equal AND
  (`ANTHROPIC_AUTH_TOKEN` OR `ANTHROPIC_API_KEY`) equal. Comparison runs in Rust only.
- **Atomic write**: serialize with `to_string_pretty`, write `settings.json.tmp` in the
  same directory, then `fs::rename` over the target; clean up tmp on rename failure.
  `create_dir_all` for `.claude/` first.

### 4. Validation & Error Matrix

| Condition | Error (stable string) | File touched? |
|-----------|----------------------|---------------|
| `project_path` is not an existing dir | `project_not_found` | no |
| provider id not in db (app_type='claude') | `provider_not_found` | no |
| provider settings_config invalid / no env object | `provider_config_invalid` | no |
| existing settings.json is invalid JSON / non-object root | `settings_parse_failed` | **no — file left as-is** |
| tmp write / rename failure | `settings_write_failed: <err>` | original intact |

### 5. Good/Base/Bad Cases

- Good: project with user env `HTTP_PROXY` + old provider's `ANTHROPIC_*` → after apply,
  `HTTP_PROXY` survives, all `ANTHROPIC_*` come from the new provider, `hooks` unchanged.
- Base: no `.claude/` or no settings.json → both created, result contains only provider env.
- Bad: corrupted settings.json silently replaced with `{}` — forbidden; must error and
  leave the file byte-identical.

### 6. Tests Required (all in `ccswitch.rs::tests`, run `cargo test ccswitch`)

- residue cleanup + user-key preservation (assert `HTTP_PROXY` survives, stale
  `ANTHROPIC_DEFAULT_*` gone);
- top-level fields untouched (assert `hooks` deep-equal before/after);
- env missing / env non-object → rebuilt as object;
- invalid JSON & non-object root → `Err("settings_parse_failed")`;
- match rule: AUTH_TOKEN path, API_KEY path, and negative case.

### 7. Wrong vs Correct

#### Wrong
```rust
// 整文件替换为 provider 的 settings_config —— 会抹掉项目自有 hooks/permissions
fs::write(settings_path, provider_settings_config)?;
```
#### Correct
```rust
let merged = merge_settings_text(existing.as_deref(), &provider_env)?; // 只替换 env 段
write_atomic(&settings_path, &merged)?;
```
