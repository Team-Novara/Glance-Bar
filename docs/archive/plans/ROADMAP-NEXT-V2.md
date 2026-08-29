# Cober Windows Bar — 优化路线图 v2

## 现状扫描总结

项目已达到 v1.0 里程碑（9 阶段全部完成），代码量约 11,600 行 TS/TSX + 2,556 行 CSS + 1,569 行 Rust。以下为全量扫描发现的可优化方向，按优先级分层。

---

## 第一梯队：关键缺陷修复（P0）

### 阶段 17：Settings 面板样式断裂修复

**问题**：`SettingsPanel.tsx` 使用 `product-settings-*` 类名（9 个），但 `globals.css` 中定义的是 `product-status-settings*` 命名约定（26 条规则），导致设置面板在生产环境中**完全无样式**。

| 任务 | 详情 |
|------|------|
| 统一 CSS 类名 | 在 `globals.css` 中添加 `product-settings-*` 规则，或将组件改为使用已有的 `product-status-settings*` 类名 |
| 清理死 CSS | 移除 26 条从未引用的 `product-status-settings*` 规则（约 290 行） |
| 添加回归测试 | SettingsPanel vitest 渲染测试，验证关键 class 存在 |

### 阶段 18：同步 WinRT 阻塞 IPC 线程

**问题**：`media_control`、`get_media_session_status`、`get_guest_provider_capabilities` 三个 Tauri command 内部调用 WinRT `IAsyncOperation::get()`，同步阻塞 Tauri command 线程。若 WinRT 服务无响应，整个 IPC 通道卡死。

| 任务 | 详情 |
|------|------|
| 异步化 media_control | 改为 `async fn` + `spawn_blocking` |
| 异步化 get_media_session_status | 同上 |
| 异步化 get_guest_provider_capabilities | 同上 |
| 添加超时保护 | WinRT 操作增加超时机制，避免永久阻塞 |

### 阶段 19：后台线程无退出机制

**问题**：3 个 `std::thread::spawn` 后台线程（剪贴板 800ms、Focus Assist 2s、通知 5s）使用无限 `loop {}`，无 shutdown signal。`app.exit(0)` 时直接杀死线程，可能导致资源泄漏。

| 任务 | 详情 |
|------|------|
| 添加 CancellationToken | 使用 `tokio_util::sync::CancellationToken` 或 `Arc<AtomicBool>` 通知线程退出 |
| 通知监听合并 | Focus Assist 和通知线程读取同一注册表键，合并为一个轮询线程 |
| 复用 Clipboard 实例 | `arboard::Clipboard::new()` 从每 800ms 创建改为持有复用 |

---

## 第二梯队：代码质量工程（P1）

### 阶段 20：代码质量工具链

**问题**：项目无 ESLint、无 Prettier、无 pre-commit hook、无 lint script。代码风格完全靠人工维护。

| 任务 | 详情 |
|------|------|
| 配置 ESLint | `@typescript-eslint` + `react-hooks` + `react-refresh` + `unused-imports` |
| 配置 Prettier | 含 tailwindcss 插件，`.prettierrc` |
| pre-commit hook | `husky` + `lint-staged`，提交前自动 lint + format |
| 添加 npm scripts | `lint`、`format`、`typecheck` |
| CI 集成 | `.github/workflows/ci.yml` 添加 lint + build 步骤 |

### 阶段 21：Rust 后端模块化拆分

**问题**：整个 Rust 后端在 `lib.rs` 一个文件 1,569 行中，包含 commands、Win32 FFI、WinRT media、monitoring、preferences、window management、menu 等所有逻辑。零模块划分、零测试。

| 任务 | 详情 |
|------|------|
| 拆分模块 | `commands/`、`win32/`、`media/`、`monitoring/`、`preferences/`、`window/`、`menu/` |
| 添加 Rust 单元测试 | 纯函数 `corrected_window_position`、`clamp_window_axis`、`clamp_percent`、`duration_100ns_to_ms` |
| 添加 clippy/rustfmt 配置 | `#![warn(clippy::all)]`、`rustfmt.toml` |
| 移除死代码 | `HUB_EVENT_FIXTURE_TICK`（从未写入）、`HUB_EVENT_FIXTURE_INTERVAL`、fixture 系统 |
| 消除冗余 | 重复 WinRT import、`DesktopProductState<R>` 无用泛型参数 |
| 升级 sysinfo | 0.30 → 0.33+（需 API 迁移） |

### 阶段 22：前端死代码清理与组件提取

**问题**：多处死代码和重复组件散布在代码库中。

| 任务 | 详情 |
|------|------|
| 移除 `DesktopStatusTransition.tsx` | 从未被导入，37 行死代码 |
| 移除 `DESKTOP_STATUS_TEMPLATE_DESCRIPTORS` | 标记 `@deprecated` 但仍导出 |
| 移除 `getDesktopStatusMenuActions()` | 从未被导入 |
| 移除 `listDesktopStatusStates()` | 从未被导入 |
| 提取共享 `StatusRail` 组件 | `MediaStatusTemplate` 和 `DownloadStatusTemplate` 中几乎相同 |
| 提取共享 `getSafeCurrentWindow()` | `DesktopPage.tsx` 和 `useOverlayPolicy.ts` 中重复定义 |
| 消除 `isFiniteNumber` 重复 | `hubState.ts` 和 `shared/runtimeGuards.ts` 各有一份 |
| 修复 `usePreferences` 反模式 | IPC 调用不应在 React state updater 内部（应移到 callback body） |

### 阶段 23：CSS 架构重构

**问题**：`globals.css` 单文件 2,556 行，包含约 1,500 行 showcase 样式被打包到生产环境。rgba 颜色值散布、无 CSS 变量体系。

| 任务 | 详情 |
|------|------|
| 拆分 CSS | 生产样式 `product.css` + showcase 样式 `showcase.css`，按路由加载 |
| 建立 CSS 变量体系 | 将散布的 `rgba()` 颜色值统一为 CSS custom properties |
| 移除 showcase 死 CSS | 生产 bundle 不加载 showcase 样式 |
| 响应式优化 | 检查并精简 media queries |

---

## 第三梯队：架构升级（P2）

### 阶段 24：测试体系统一与补全

**问题**：双测试系统并存（17 个 legacy `.test.ts` + 9 个 `.vitest.ts/tsx`），核心 UI 组件和 hooks 零覆盖。

| 任务 | 详情 |
|------|------|
| 迁移 legacy 测试 | 17 个 `.test.ts` 文件迁移到 Vitest（统一 runner） |
| DesktopPage 集成测试 | 主生产组件 427 行，零测试——mock Tauri invoke 测试关键流程 |
| hooks 单元测试 | `useDesktopStatusRuntime`（153 行）、`usePreferences`（98 行）等核心 hooks |
| 配置覆盖率 | `vitest --coverage`，设置 80% 目标阈值 |
| SettingsPanel 渲染测试 | 验证设置切换、语言切换行为 |

### 阶段 25：DesktopPage 瘦身

**问题**：DesktopPage.tsx 427 行，15+ handler 函数、5+ useEffect，仍是"上帝组件"。

| 任务 | 详情 |
|------|------|
| 提取 `useSettingsActions` hook | 10+ settings 相关 handler 移出 |
| 提取 `useContextMenuHandlers` hook | 右键菜单逻辑独立 |
| 提取 `useWindowLifecycle` hook | show/hide/recall/quit 等窗口生命周期函数 |
| render 性能优化 | `useDesktopStatusRuntime` 中 render 内计算（聚合、state map）移入 `useMemo` |

### 阶段 26：Bundle 优化与代码分割

**问题**：整个应用打包为单个 510KB JS chunk + 59KB CSS chunk，desktop 和 showcase 路由无法独立加载。

| 任务 | 详情 |
|------|------|
| Route-level code splitting | `React.lazy` + `Suspense` 分离 desktop/showcase |
| manualChunks | `react-vendor`、`animation`、`i18n` 分包 |
| Showcase CSS 按需加载 | 仅在 `/showcase` 路由加载 |
| 依赖位置修正 | `typescript`、`vite`、`@vitejs/plugin-react` 从 `dependencies` 移到 `devDependencies` |

### 阶段 27：i18n 补全与响应性修复

**问题**：SettingsPanel 中部分文案不响应语言切换；Showcase 页面完全未国际化。

| 任务 | 详情 |
|------|------|
| 修复 SettingsPanel i18n 响应性 | `settingsCopy` 用 `useMemo([i18n.language])` 包裹 |
| Showcase i18n（可选） | 如果 showcase 保留在生产构建中，则补全翻译 |
| 添加 language switch 测试 | 验证切换语言后所有 UI 文案更新 |

---

## 第四梯队：安全与运维加固（P2）

### 阶段 28：安全加固

| 任务 | 详情 |
|------|------|
| 启用 CSP | `tauri.conf.json` 添加 Content Security Policy |
| 收紧 Tauri 权限 | `core:default` → 精确的权限列表 |
| 错误处理改进 | 18 处 `let _ =` 中关键调用（如 `persist_preferences`）添加错误日志 |
| app.exit 前清理 | 退出时通知后台线程 graceful shutdown |

### 阶段 29：CI/CD 完善

| 任务 | 详情 |
|------|------|
| 添加 build 验证 | CI 中运行 `npm run build` |
| 添加 Rust 编译检查 | CI 中运行 `cargo check` + `cargo test` |
| Windows runner | 在目标平台上运行测试 |
| Bundle size 追踪 | 添加 size-limit 或 bundlewatch |

---

## 第五梯队：技术演进（P3，远期）

### 阶段 30：依赖版本演进

| 任务 | 详情 |
|------|------|
| Tailwind CSS v3 → v4 | 重大更新，新 CSS 引擎 |
| Vite 7 → 8 | 新构建引擎 |
| TypeScript 5 → 6 | 新语言特性 |
| lucide-react 升级 | 新图标集 |

### 阶段 31：开发者体验提升

| 任务 | 详情 |
|------|------|
| VSCode 配置 | 推荐扩展、launch.json 调试配置 |
| Path aliases | `@/` → `src/`，减少 `../../../` 深层导入 |
| 严格 TypeScript | `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` |
| .gitignore 补全 | `nul`、`*.log`、`work/`、`codegraph.html`、`AGENTS.md` |

### 阶段 32：Rust 端测试与性能

| 任务 | 详情 |
|------|------|
| 纯函数单元测试 | `corrected_window_position`、`clamp_*`、`duration_100ns_to_ms` |
| sysinfo 实例复用 | `System::new_all()` 从每次调用新建改为持有复用 |
| Networks 实例复用 | 同上 |
| 添加集成测试 | Tauri command handler 测试 |

---

## 建议执行顺序

```
第 1 周:  阶段 17 (Settings 样式修复) + 阶段 20 (质量工具链) + 阶段 22 (死代码清理)
第 2 周:  阶段 18 (WinRT 异步化) + 阶段 19 (线程退出) + 阶段 21 (Rust 模块化)
第 3 周:  阶段 24 (测试统一) + 阶段 25 (DesktopPage 瘦身) + 阶段 23 (CSS 重构)
第 4 周:  阶段 26 (Bundle 优化) + 阶段 28 (安全加固) + 阶段 29 (CI/CD)
远期:     阶段 27, 30, 31, 32
```

预计 **4 周**完成第一至第四梯队，达到 v1.1 质量标准：零关键 bug、完整 lint/format 工具链、Rust 模块化、测试覆盖率 >80%、bundle 优化、安全加固。

---

## 扫描数据速查

| 指标 | 数值 |
|------|------|
| TS/TSX 源码行数 | ~9,037 |
| CSS 行数 | 2,556（单文件） |
| Rust 行数 | 1,569（单文件） |
| Tauri IPC commands | 20 |
| 后台线程 | 3（无退出机制） |
| JS bundle 大小 | 510 KB（单 chunk） |
| CSS bundle 大小 | 59 KB |
| 测试文件 | 22（17 legacy + 9 vitest） |
| ESLint | 未配置 |
| Prettier | 未配置 |
| Rust 测试 | 0 |
| CSP | 禁用 |
| 死 CSS 行数 | ~290（settings）+ ~1,500（showcase） |
| 死代码文件/函数 | 4 个文件/函数 |
| 同步阻塞 WinRT 调用 | 3 个 command |
| `let _ =` 静默吞错 | 18 处 |
