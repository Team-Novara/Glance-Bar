# Cober-Windows-Bar — 项目开发计划

> **状态**: 校准版 v2
> **校准日期**: 2026-06-17(项目第 12 天,自 2026-06-06 首次提交)
> **配套文档**: [`ROADMAP.md`](product/ROADMAP.md) · [`IMPLEMENTATION_PLAN.md`](plans/IMPLEMENTATION_PLAN.md) · [`STAGE5_WIP_LANDING.md`](plans/STAGE5_WIP_LANDING.md) · [`ARCHITECTURE.md`](architecture/ARCHITECTURE.md)
> **本文档定位**: 单一入口的开发计划。给团队成员、新人协作者、PR 审阅者看的"我们在哪、要去哪、下一步做什么"。
> **校准历史**:
> - v1 (2026-06-17): 初稿,基于"阶段表"和最近 30 提交扫描
> - v2 (2026-06-17): **应用代码事实校准**——修正阶段表状态、提交密度数据、v1.0.0 发布事实、WIP 真实范围(不再把 `schedulerService.ts` 视作游离文件),时间线从 6 个月预测改为 4 周滚动

---

## 1. 项目一句话

Cober-Windows-Bar 是一个 **Windows 11 Fluent Design 风格的统一状态悬浮栏**。它常驻屏幕右下角任务栏上方,把音乐播放、AI 任务、下载进度、系统指标、剪贴板、专注模式、桌面通知等所有"低频但需要瞥一眼"的动态,聚合到一个紧凑、低打扰的浮层里。

**长期目标** 是成为 Windows 11 上的 **Unified Status Hub**,而不仅仅是 Dynamic Island 的克隆。差异化点: **真实系统数据** + **开发者工作流状态** + **AI Agent 状态**。

---

## 2. 当前状态 (2026-06-17,项目第 12 天)

### 2.1 阶段进度一览 (校准后)

| 阶段 | 目标 | 状态 | 关键提交 | 备注 |
|------|------|------|----------|------|
| Stage 0 | UI 原型 | ✅ 完成 | `14c5fb0` (2026-06-06) | 首次提交,展示页 |
| Stage 1 | 事件总线 Playground | ✅ 完成 | — | Mock Event Controls + Auto Demo |
| Stage 2 | 架构规划 | ✅ 完成 | `00ce11a` | 文档里程碑 |
| Stage 3 | Mock Provider SDK | ✅ 完成 | `92f3e01` (v0.6 关闭) | Provider 接口 + Adapter + Registry + 测试 |
| Stage 4 | Tauri 桌面 Shell | ✅ 完成 | 多个 | Rust 模块化、IPC、托盘、热键、媒体会话 GSMTC |
| **Stage 5** | **第一组真实 Provider** | **✅ 已提交,🔄 WIP 收尾** | **`9cdfa2b` "land 7-state product surface"** | 7 状态 + 5 新 IPC + 15s 媒体/驻留交替已合并;当前 WIP 正在验证 |
| **Stage 6** | **开发者 Hub** | **🔄 部分提交** | **`d1aebf1` `realNpmProvider+realWslProvider`** | Git/Docker/NPM/WSL Provider 落地;Maven/Gradle/Cargo/Pnpm 待做 |
| Stage 7 | AI Agent Hub | 📋 规划中 | — | v1.0 长期目标 |

> **校准关键点**:
> 1. **`ROADMAP.md` 仍把 Stage 5 标为 in progress**——但 `9cdfa2b` 已合并,Stage 5 核心完成,文档滞后于代码。建议本周把 ROADMAP 改为 ✅
> 2. **v1.0.0 已在 6-10 发布** (`3be98d9`):`package.json` + `tauri.conf.json` + `Cargo.toml` 全部对齐。**v1.0.0 是工具版本号(自动生成),不是产品里程碑**。Stage 7 才是真正的产品 v1
> 3. **216 个提交**在 12 天内完成,平均 18/天,峰值 74/天 (6-9)——这是开发冲刺节奏,不是稳态

### 2.2 代码体量与质量 (校准后)

| 指标 | 数值 | 来源 |
|------|------|------|
| 源代码 (TS/TSX) | ~16,360 行 | `wc -l src/**/*.{ts,tsx}` |
| 源文件 (src) | 134 | `find src -name "*.ts" -o -name "*.tsx"` |
| 测试文件 | 46 (覆盖率目标 80%) | `find src -name "*.test.*"` |
| Rust 后端 | 3,221 行,6 模块 | `wc -l src-tauri/src/*.rs` |
| 总提交数 (含远端) | 216 | `git log --all --oneline \| wc -l` |
| 提交密度 | 12 天 216 提交,平均 18/天 | 峰值 74/天 (6-9) |
| 项目年龄 | 12 天 (2026-06-06 首次 → 2026-06-17 当前) | `git log --reverse` |
| 远端 WIP 分支 | 3 个 (`codex/*`) | codex 自动化 PR 痕迹 |
| git tag | 0 个 (版本号手改) | `git tag` 为空 |

### 2.3 已交付能力清单

#### 桌面 Shell 与 IPC
- ✅ Tauri 2 桌面应用,Rust 后端模块化(`lib.rs` 1,983 行 / `media.rs` 519 / `window.rs` 371 / `tray.rs` 65 / `preferences.rs` 59 / `types.rs` 218)
- ✅ 系统指标 (CPU / 内存 / 网络) 通过 `sysinfo` crate
- ✅ Windows 媒体会话 (GSMTC WinRT) 真实播放状态
- ✅ 窗口管理:Z 序、多显示器校正、全屏避让、`WS_EX_TOOLWINDOW` 隐藏任务栏
- ✅ 系统托盘 + 全局热键 `Alt+Shift+Space` + JSON 偏好持久化
- ✅ 16+ 个 IPC 命令,5 个新增(`stop_focus_session` / `pause|resume|cancel_download` / `install_update` / `dismiss_notification`)

#### 7 状态桌面产品
- Idle / Resident / Media / Download / Update / Clipboard / Focus / **Notification**
- 15 秒媒体↔驻留交替逻辑(8s resident ↔ 15s media,非对称)
- 完整动作链:`play/pause/next/prev`、`stop_focus_session`、`pause/resume/cancel_download`、`install_update`、`dismiss_notification`

#### Provider SDK 完整闭环
- 接口契约:`providerShell` / `providerManager` / `providerAdapter` / `providerRegistry`
- Mock Provider (4 个) + 真实 Provider 10 个已实现:
  - 系统域: `realSystemPerformanceProvider` / `realMediaSessionProvider` / `realClipboardProvider` / `realFocusProvider` / `realUpdateProvider` / `realDownloadProvider`
  - 开发者域: `realGitProvider` / `realDockerProvider` / `realNpmProvider` / `realWslProvider`
- Provider 健康监控 (`providerHealthMonitor`) + 注册表健康输出 + capability 摘要

#### 工程化基础
- ✅ React 19 + TypeScript 5.9 + Vite 7 + Tailwind 3.4 + Framer Motion 12
- ✅ Vitest (组件级) + Node test runner (state/provider/runtime)
- ✅ ESLint v9 + Prettier v3 + `@/*` 路径别名 + `noUncheckedIndexedAccess`
- ✅ CI (build job, Node matrix, artifact upload, concurrency cancel)
- ✅ Bundle 分割 (react-vendor / animation / i18n)
- ✅ i18n (en + zh-CN)
- ✅ Rust 模块化 (`lib.rs` → 6 个模块)

### 2.4 工作树当前状态 (WIP) — 校准重写

**未提交的文件** (`git status` 实时):
- **修改 17 个文件** + 1 个新文件未跟踪
- ✅ 全部已在 git 索引中有修改历史(`git diff --stat` 显示 +677 / -294)
- ❌ **关键发现**:`src/runtime/schedulerService.ts` **不是游离文件**,它**已经被 `useDesktopStatusRuntime.ts` 在 WIP 中 import**

**WIP 真实内容** (通过交叉引用确认):

1. **核心架构变化**:`useDesktopStatusRuntime.ts` 把原本由 `state/desktopStatusScheduler.ts` 提供的纯函数式 `scheduleDesktopStatus()` 调用,**替换为有状态服务 `createSchedulerService()`**
   - 旧:`scheduleDesktopStatus(input)` 接收快照,返回 decision
   - 新:`createSchedulerService()` 返回 `start/stop/updateKinds/setPreferred/clearPreferred/subscribe/getSnapshot` 状态机
   - 目的:让 `useEffect` 内能订阅 scheduler 决策变化,而不是每次渲染都计算(避免 React 重入)
2. **新文件** `src/runtime/schedulerService.ts` (279 行, 2026-06-16 21:09 创建):
   - 完整实现 8 个公开 API
   - 250ms `setInterval` 心跳
   - 复用 `DESKTOP_STATUS_PRIORITY_ORDER` 等常量
   - 接受 `Date.now()` 作为唯一时间源(可测试)
3. **其他 16 个修改**:
   - `useDesktopStatusRuntime.ts` (-46 / +204): 接入 scheduler service,加 1s 心跳对齐媒体交替
   - `desktopStatusScheduler.ts` (+95): 仍是 `scheduleDesktopStatus()` 纯函数,被 `desktopStatusState.ts` (resolver) 调用——**两个 scheduler 并存**:
     - `state/desktopStatusScheduler.ts` → resolver 内部快照计算
     - `runtime/schedulerService.ts` → hook 内部长期运行状态机
4. **新增 IPC** (`src-tauri/src/lib.rs` +245): 5 个 stub 命令(stub 是文档化的"未实现但接口就位")
5. **新增模板/运行时**:
   - `NotificationStatusTemplate.tsx` + vitest
   - `runtime/{downloadControlRuntime,focusStopRuntime,notificationDismissRuntime,updateInstallRuntime}.ts` + 各自 test

**与 `STAGE5_WIP_LANDING.md` 的关系**:
- 该 plan 的"Land (untracked, new files)"清单列了 4 个 runtime + 1 个 template,但**没有列出 `schedulerService.ts`**
- 意味着 `schedulerService.ts` 是 WIP 收尾阶段才加入的,**新于 `STAGE5_WIP_LANDING.md` 写作时间**

**风险点** (代码事实级别):
- `state/desktopStatusScheduler.ts` 还在被 `desktopStatusState.ts` 调用,但 WIP 之后 hook 走的是 service。**两个 scheduler 并存,职责可能重叠**
- `useDesktopStatusRuntime.vitest.ts` (已存在,57 行) 注释提醒 "20_000 ms per desktopStatusScheduler — keep in sync if it changes"——这是提醒可能漂移的
- 没有任何文件测试 `runtime/schedulerService.ts` 本身

**合并前必须做的事**:
1. 写 `schedulerService.test.ts` (至少覆盖 start/stop/updateKinds/setPreferred/subscribe + 媒体交替 5 个场景)
2. 决定 `desktopStatusScheduler.ts` 与 `schedulerService.ts` 的最终职责(让一个 `import` 另一个,或保留双层)
3. 跑 `npm run qa` 确认 `useDesktopStatusRuntime.vitest.ts` 仍然绿
4. 更新 `STAGE5_WIP_LANDING.md` 添加 `schedulerService.ts` 描述,或写 `STAGE5_PLUS2_LANDING.md` 单独管这次重构

---

## 3. 架构基线 (已经定型,后续阶段都基于此)

### 3.1 数据流

```text
Provider (mock + native Tauri IPC)
  → Event Bus
  → Store (active event snapshot)
  → Resolver (deterministic mode selection)
  → Hub UI (7 templates)
```

每条 Provider 必须按 `HubProvider` 接口实现,经过 Event Bus,从不绕过 Store/Resolver。

### 3.2 关键架构决策 (不可回退)

- **Provider 必须经过 Event Bus**: 直接监听 Tauri 事件然后写 Store 是反模式。
- **隐私边界不可破**: CPU/内存/网络只暴露粗粒度;媒体会话只暴露状态/位置/时长;**禁止**进程列表、窗口标题、用户名、文件路径、凭据、硬件序列号跨 IPC。
- **Mock 必须永远可用**: `npm run dev` 无 Tauri 也能跑,这是 CI 和前端工程师工作流的基础。
- **诊断字段用有界枚举**: `quality` (live/fallback/stale/unavailable)、`code` (available/unsupported/permission-denied/...)。

### 3.3 模块边界

| 层 | 路径 | 职责 |
|----|------|------|
| 类型 | `src/types/` | 共享 TS 类型 (HubEvent, HubMode, DesktopStatusKind, ...) |
| 数据 | `src/data/` | Mock 数据、状态模板描述符 |
| 运行时 | `src/runtime/` | Tauri IPC 桥、降级、调度服务 |
| Provider | `src/providers/` | 契约、注册表、管理器、Adapter、Mock、Real |
| 状态 | `src/state/` | Event Bus、Store、Resolver、Scheduler、Aggregation |
| UI 桌面 | `src/features/desktop/` | DesktopPage + 6 模板 + 钩子 |
| UI 展示 | `src/features/showcase/` | 演示、QA、Fixture 审查 |
| 共享 | `src/shared/` | runtimeGuards 等纯函数 |
| Rust | `src-tauri/src/` | IPC commands、Win32/WinRT、托盘、窗口、偏好 |

---

## 4. 后续开发计划 (按阶段,4 周滚动视角)

### 阶段名约定
- `Stage X`: 已在 `ROADMAP.md` 出现的主阶段
- `Stage X+N`: 主阶段内部的子切片(尚未合并到 ROADMAP,本文档引入)

> **时间线哲学**: 项目仍在前 12 天的高强度冲刺期,产品形态(7 状态 + 10 Provider)已经定型。**接下来 4 周**的目标是**质量收尾 + 真实化补完**,而不是新功能铺开。Stage 6 完整化和 Stage 7 仍在产品边界外,需要更多设计输入。

---

### Stage 5+1 — WIP 收尾与 scheduler 收敛 (本周, 6-17 → 6-21)

**目标**: 把当前 17 个未提交改动合并;**重点解决 `state/desktopStatusScheduler.ts` 与 `runtime/schedulerService.ts` 双层问题**。
**计划文档**: [`docs/plans/STAGE5_WIP_LANDING.md`](plans/STAGE5_WIP_LANDING.md) + 本节
**预计工作量**: 3-4 天,3-4 个 commit

| 切片 | 任务 | 验收 |
|------|------|------|
| **Slice 1 (Day 1)** | 写 `runtime/schedulerService.test.ts` 覆盖 5 个核心场景 (start/stop/updateKinds/setPreferred/subscribe) + 媒体交替边界 | vitest 全绿,无 `it.skip` |
| **Slice 2 (Day 1-2)** | **双层 scheduler 收敛决策**——3 个选项之一:<br>**(A)** ✅ **选定**: 保留双层,resolver 用纯函数 (snapshot),hook 用 service (stateful),在两个 scheduler 文件顶部加 docstring 互相引用,引用 ADR `v0.8_DESKTOP_STATUS_SCHEDULER_DUALITY_DECISION.md`<br>**(B)**: 把 `scheduleDesktopStatus()` 内联进 `schedulerService` 内,resolver 改为接受 `previousKind/previousChangedAt` 入参——单层<br>**(C)**: 反向,把 service 改成纯函数 + React `useSyncExternalStore` 包装——单层在 hook 端 | ADR 状态改 ✅,docstring 已加,`ARCHITECTURE.md` Scheduler Duality 小节已加 |
| **Slice 3 (Day 2-3)** | 跑 `npm run typecheck && npm run test:vitest && npm run qa` | 全绿 |
| **Slice 4 (Day 3)** | 文档同步:更新 `STAGE5_WIP_LANDING.md` (加 `schedulerService.ts`)、更新 `ROADMAP.md` (Stage 5 改 ✅)、更新 `ARCHITECTURE.md` (Runtime Bridge Layer 段加 scheduler service) | 文档一致 |
| **Slice 5 (Day 4)** | 提交 + push | 工作树干净 |

**Slice 2 决策建议**: 倾向 **选项 A**(保留双层,各司其职)。理由:
- `desktopStatusState.ts` (resolver) 在每次渲染同步调用,需要纯函数
- `useDesktopStatusRuntime` 跨渲染持有状态,需要 service
- 两个文件逻辑 90% 重叠但抽象层不同,合并会增加复杂度

---

### Stage 5+2 — System Performance + Media Session 进入 Provider SDK (下周, 6-24 → 6-28)

**目标**: 消除 `useDesktopStatusRuntime.ts` 里的直接 Tauri 监听,让最后两个 native 数据源走 Provider SDK。
**预计工作量**: 4-5 天

任务清单:
1. **完善 `realMediaSessionProvider`**: 按 `realClipboardProvider` 模式订阅 `onMediaSessionChanged` Tauri 事件,转换 `TauriMediaSessionStatus` → `HubEvent`,通过 `handle.emit()` 发出。
2. **完善 `realSystemPerformanceProvider`**: 当前 `loadSystemPerformanceStatus` 是 polling;改为启动时一次性 `loadTauriMediaSessionStatus()` 拉快照,然后订阅事件流更新。
3. **注册到 `providerManager.ts`**: 移除 media/system performance 的"特殊通道"注释,和其他 Provider 走同一管线。
4. **改造 `useDesktopStatusRuntime`**: 移除 `useEffect` 块,改为订阅 `HubEventBus`,让 `aggregateDesktopStatusInput` 处理转换。
5. **测试更新**: `MediaStatusTemplate.vitest.tsx` 反映新管线;补 `useDesktopStatusRuntime.vitest.ts`(已有雏形,57 行,需扩到 200+ 行覆盖 scheduler 行为)。
6. **文档同步**: `ARCHITECTURE.md` Runtime Bridge Layer 段落更新。

验收标准:
- `useDesktopStatusRuntime.ts` 没有任何 `onMediaSessionChanged` 或 `loadSystemPerformanceStatus` 直调
- `providerManager` 启动时 `realMediaSessionProvider` / `realSystemPerformanceProvider` 被 `start()`,且出现在 `listRealProviders()` 输出
- `npm run qa` 全绿
- 真机 (Windows + Tauri) 上音乐/系统指标切换无功能回归

---

### Stage 5+3 — Download / Notification 真实 Provider 替换 Stub (2 周内, 7-1 → 7-12)

**目标**: 当前 `pause_download` / `resume_download` / `cancel_download` / `dismiss_notification` / `install_update` 5 个 IPC 是 stub,本次替换为真实实现。

| IPC | 真实数据源 | 工作量 |
|-----|-----------|--------|
| `pause/resume/cancel_download` | `notify` crate 监听 Downloads 文件夹 + 浏览器下载事件 | 4 天 |
| `install_update` | Tauri `tauri-plugin-updater` | 2 天 |
| `dismiss_notification` | Windows Toast Notification API (`Windows.UI.Notifications`) | 3 天 |

技术风险:
- 文件系统 watcher 在 Windows 上要处理 NTFS MFT 抖动 → 用 `ReadDirectoryChangesW`
- Toast dismiss 需要 AppUserModelID 匹配,需要注册到注册表
- Updater 需要代码签名基础设施(单独里程碑,见 Stage 6+3)

---

### Stage 5+4 — 测试覆盖率 80% 推进 (本周起,持续)

**目标**: 当前 46 个测试文件,覆盖率目标 80%。**已知缺口**:
- ❌ `runtime/schedulerService.ts` — **0 测试**
- ❌ `useSystemPerformance` / `useWindowLifecycle` / `useDragController` / `useOverlayPolicy` 钩子还没有 vitest
- ❌ Rust 单元测试(只 `corrected_window_position` / `clamp_window_axis` / `duration_100ns_to_ms` 等纯函数)
- ❌ E2E 真实 Tauri 应用测试(目前只有 showcase 截图)

**预计工作量**: 持续性,每加 1 个 Provider = 至少 3-5 个测试。

---

### Stage 6 — 开发者 Hub 完整化 (7-15 → 8-15,滚动)

**目标**: 成为日常开发者状态中心。当前已有 Git/Docker/NPM/WSL 四个 Provider 落地,需要补完和扩面。

#### 6.1 现有 Provider 补完
- `realGitProvider`: 已实现,需要补 E2E 测试(在真实 git 仓库上跑)
- `realDockerProvider`: 需要支持 compose stack 状态(目前只看 container)
- `realNpmProvider`: 需要支持 pnpm/yarn(目前只看 npm)
- `realWslProvider`: 需要支持多发行版(目前只支持默认)

#### 6.2 新增 Provider (按需求优先级)
| Provider | 数据源 | 优先级 |
|----------|--------|--------|
| `realMavenProvider` | `.m2` 目录 + `~/.m2/settings.xml` | P1 |
| `realGradleProvider` | `.gradle/caches` + daemon 状态 | P1 |
| `realCargoProvider` | `target/` 目录监听 + `cargo metadata` | P2 |
| `realPnpmProvider` | pnpm store + lock file | P2 |
| `realVscodeProvider` | VS Code 扩展 API 或 IPC 端口 | P3 (风险高) |

#### 6.3 配套基础设施
- **Settings 面板重构**: 独立窗口(不是 inline panel)
- **生产打包**: MSI/NSIS installer、代码签名、SmartScreen 兼容、auto-updater
- **Provider 健康指示器**: UI 已有 `GuestSourceHealthIndicator`,需要把"无数据"和"无 Provider"两种状态分开

#### 6.4 里程碑
- v0.9.0: Git/Docker/NPM/WSL 全部上线真机验证
- v0.9.1: + Maven/Gradle
- v0.9.2: + Cargo/Pnpm

---

### Stage 7 — AI Agent Hub (5-8 周,最大不确定性)

**目标**: 统一展示 Codex、Claude、GPT、OpenCode、Gemini 等 AI 代理的运行状态。

#### 7.1 数据源策略
- **Codex CLI**: `--json` 输出流
- **Claude Code**: SDK 事件流
- **GPT/OpenCode**: HTTP API + 本地 watcher
- **Gemini**: CLI `--output-format stream-json`

#### 7.2 状态机设计
- `idle` → `thinking` → `tool_calling` → `generating` → `awaiting_approval` → `completed` / `failed`
- 多 Agent 协同:`multi-agent` 状态,显示 N 个 agent 的聚合进度

#### 7.3 风险
- **隐私**: Agent 消息可能含凭据、代码片段。**强制策略**: 只暴露进度 + 工具名 + 文件计数,不暴露消息内容。
- **数据源异质性**: 每个 Agent CLI 协议不同,需要抽象成统一的 `AgentProvider` 适配层
- **状态机竞态**: 多 agent 并行时,优先级如何决定

#### 7.4 里程碑
- v1.0.0-alpha: Codex 单一 Provider 跑通
- v1.0.0-beta: + Claude Code,多 Agent 视图
- v1.0.0: 全部 4 个 Provider 上线

---

## 5. 时间线 (4 周滚动,2026-06-17 → 2026-07-15)

```
2026-06-17 ──── 2026-06-21 ──── 2026-06-28 ──── 2026-07-05 ──── 2026-07-12
   │                │                │                │                │
   ▼                ▼                ▼                ▼                ▼
Stage 5+1       Stage 5+2       Stage 5+3        Stage 5+3 (续)    Stage 6.1
WIP + scheduler  Provider SDK 化  Stub→真实       Download 真实化   已有 Provider
收敛             media/system     Download IPC                              补 E2E
(本周冲刺)       perf                              Notification
   │                │                │                │                │
   ▼                ▼                ▼                ▼                ▼
 1 个 PR          1 个 PR          1-2 个 PR         1 个 PR          1 个 PR
```

**为什么不预测 6 个月**: 项目 12 天 216 提交是开发冲刺节奏,前 4 周观察期才能知道稳态。**Stage 6/7 在 7-15 之后根据 Stage 5 完成情况再规划**。

---

## 6. 跨阶段非功能性需求 (Backlog)

无论哪个阶段,以下工作都需要持续推进:

### 6.1 测试与质量
- 当前 46 个测试文件,目标覆盖率 80%
- 缺失:`useSystemPerformance` / `useWindowLifecycle` / `useDragController` / `useOverlayPolicy` 还没有 vitest
- 缺失:Rust 单元测试(只 `corrected_window_position` / `clamp_window_axis` / `duration_100ns_to_ms` 等纯函数)
- 缺失:E2E 真实 Tauri 应用测试(目前只有 showcase 截图)

### 6.2 文档维护
- `ROADMAP.md` 与 `IMPLEMENTATION_PLAN.md` 内容已经部分漂移,需要定期同步
- `ARCHITECTURE.md` 没有覆盖 Stage 5+ 引入的 7 状态和 15 秒交替
- 决策记录 (`docs/decisions/v0.8_*.md`) 有 16 篇,多数已经被实现超越,需要标注 `[SUPERSEDED]`

### 6.3 工程化补完
- Rust clippy / rustfmt 配置(已经在 ROADMAP-NEXT-V2 阶段 21 列出)
- Pre-commit hook (husky + lint-staged)
- `npm run qa` 应该跑全部 test + 真实 Tauri 启动验证(目前只到 build)

### 6.4 性能与稳定性
- WinRT 阻塞 IPC 线程(ROADMAP-NEXT-V2 阶段 18) — 这是 Stage 5+2 之前必须解决的
- 后台线程无退出信号(阶段 19) — `app.exit(0)` 时泄漏风险
- `schedulerService.ts` 与现有 `desktopStatusScheduler.ts` 的关系(本周决策)

---

## 7. 风险登记表

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Stage 5+2 改造 `useDesktopStatusRuntime` 时引入回归 | 中 | 高 | 现有 `useDesktopStatusRuntime.vitest.ts` 必须先补全到能保护当前行为 |
| Stage 5+3 Toast dismiss 在新版 Windows 行为变化 | 高 | 中 | 提前在 Windows 11 24H2 上验证,准备 feature detect |
| Stage 6 设置面板重构工期低估 | 中 | 中 | 拆分为 2 步:先抽组件,再换窗口 |
| Stage 7 AI 协议异质性 | 高 | 高 | 优先做 Codex 单一闭环,其他后置 |
| Tauri 2 → 3 升级 | 中 | 中 | 关注 Tauri 3 稳定版时间,提前 2 周预留升级窗口 |
| 代码签名证书成本 | 低 | 中 | 在 Stage 6.3 启动前申请 EV 证书 |

---

## 8. 协作与沟通

### 8.1 Commit 规范 (沿用项目约定)
```
feat(<scope>): <imperative summary>
fix(<scope>): ...
refactor(<scope>): ...
test(<scope>): ...
chore(<scope>): ...
docs(<scope>): ...
```
类型 + scope(providers / runtime / desktop / rust / state / docs / styles / build)。

### 8.2 提交频率
- 平均 1 提交/天,目标维持
- 避免大型混合提交(feat + refactor + test 拆开)
- `git push` 仅在明确请求时执行(项目规则)

### 8.3 PR 流程 (尚未启用,但建议)
- 任何超过 300 行新增或 1 个完整 Provider 上线 → 起 PR
- 任何 `useDesktopStatusRuntime` / `providerManager` / `Resolver` 改动 → 必走 PR,需 1 个 reviewer
- 隐私相关代码 (`src-tauri/src/`) → 必走 PR,需引用 `v0.8_SYSTEM_STATUS_PRIVACY_CHECKLIST.md`

### 8.4 文档责任
- 每次 stage 完成 → 更新 `ROADMAP.md` + `IMPLEMENTATION_PLAN.md`
- 重大架构决策 → 写 `docs/decisions/vN.M_*.md`
- 每周同步一次本文档(滚动更新,版本号自增)

---

## 9. 立即可执行的 5 天任务 (6-17 → 6-21)

| Day | 任务 | 产出 |
|-----|------|------|
| **周二 6-17** | 写 `runtime/schedulerService.test.ts` (5 个核心场景) | 1 个 commit, ~150 行测试 |
| **周三 6-18** | 决定双层 scheduler 收敛方案 (A/B/C);按选定方案在 `state/desktopStatusScheduler.ts` 顶部加文档说明 | 1 个 commit,文档同步 |
| **周四 6-19** | 跑 `npm run typecheck && npm run test:vitest && npm run qa`;修复任何回归 | 全绿 |
| **周五 6-20** | 文档同步:`ROADMAP.md` (Stage 5 改 ✅)、`ARCHITECTURE.md` (Runtime Bridge Layer 段加 scheduler service)、`STAGE5_WIP_LANDING.md` (加 `schedulerService.ts` 章节) | 1 个 docs commit |
| **周六 6-21** | 提交 WIP 全部 17 个 M + 1 个 ?? (按 STAGE5_WIP_LANDING 三切片) | 工作树干净,Stage 5+1 完成 |

---

## 10. 文档维护说明

- **本文件的所有版本号、状态、时间线** 都会在每月 1 号做一次刷新
- **任何"已完成"的 stage 标题前** 应该及时把 🔄 改为 ✅
- **新增 stage** 用 `Stage X+1` / `Stage X+2` 命名,在 `ROADMAP.md` 同步登记后,再合并到本文件
- **关键决策** 单独成文到 `docs/decisions/`,本文件只引用

---

**最近更新**: 2026-06-17 (校准版 v2)
**下次刷新**: 2026-06-24 (Stage 5+2 启动时)
**维护者**: 当前 owner
**v2 校准主要变更**:
- 阶段表加入"关键提交"列,Stage 5 改 ✅ + 标注 ROADMAP 滞后
- 代码体量数据全部校准(216 提交、12 天、codex/* 分支)
- §2.4 WIP 重写:`schedulerService.ts` 不再是游离文件,实际是 scheduler 状态机重构
- §4 Stage 5+1 重构为 5 切片,加入"双层 scheduler 收敛"决策
- §5 时间线从 6 个月预测砍到 4 周滚动
- §6.4 拆出独立的 Stage 5+4 (测试覆盖率推进)
- §9 5 天任务清单重新排,聚焦 WIP 收尾
