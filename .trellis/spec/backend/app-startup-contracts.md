# App Startup Contracts

> CLI-Manager 桌面应用启动期的可执行约束。

---

## Scenario: Single-instance desktop startup

### 1. Scope / Trigger

- Trigger: 修改 `src-tauri/src/lib.rs` 的 `run()` 启动链路、窗口首次创建逻辑、托盘唤醒逻辑、Tauri 启动插件顺序时。

### 2. Signatures

- 启动入口：`src-tauri/src/lib.rs::run()`
- 窗口唤醒辅助：`show_main_window<R: Runtime>(app: &AppHandle<R>)`
- 单实例插件注册：
  `tauri_plugin_single_instance::init(|app, _args, _cwd| { ... })`

### 3. Contracts

- 桌面端只允许一个 CLI-Manager 进程实例存在。
- 当用户在应用已运行时再次从桌面、任务栏或其他壳入口启动应用：
  - 新实例必须被单实例插件拦截。
  - 已运行实例必须尝试唤醒 `main` 窗口。
- 唤醒 `main` 窗口的标准行为：
  - `window.show()`
  - `window.unminimize()`
  - `window.set_focus()`
- 单实例插件必须在 `tauri::Builder::default()` 链上最先注册。

### 4. Validation & Error Matrix

- `main` 窗口存在 -> 执行显示、取消最小化、聚焦。
- `main` 窗口不存在 -> 允许静默跳过，不得 panic。
- 单实例插件未最先注册 -> 视为错误配置，重复启动拦截行为不再有保证。

### 5. Good/Base/Bad Cases

- Good: 应用最小化到托盘后再次启动，旧窗口被拉起且无第二个进程。
- Base: 应用已在前台，再次启动后仍保持单实例，只做一次聚焦。
- Bad: 移除或后置单实例插件，导致桌面重复启动出现多个进程。

### 6. Tests Required

- 后端编译检查：`cd src-tauri && cargo check`
- 后端回归测试：`cd src-tauri && cargo test`
- 手动验证：
  - 先启动应用并隐藏/最小化。
  - 再从桌面或任务栏启动一次。
  - 断言不会出现第二个 CLI-Manager 进程，且已有主窗口被显示并聚焦。

### 7. Wrong vs Correct

#### Wrong

- 在托盘点击、二次启动回调里各自复制窗口唤醒逻辑。
- 先注册其他插件，再注册单实例插件。

#### Correct

- 统一复用 `show_main_window(...)`。
- 在 `tauri::Builder::default()` 后立刻注册单实例插件，再继续其他插件和 `setup(...)`。
