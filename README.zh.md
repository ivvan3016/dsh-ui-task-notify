# dsh-ui-task-notify

[English](README.md) | 中文

## 安装

```sh
# 从 npm 安装（推荐）
dsh plugin --profile web add dsh-ui-task-notify

# 从 GitHub 安装
dsh plugin --profile web add github:ivvan3016/dsh-ui-task-notify
```

npm 包自带构建产物，安装即可用，无需额外配置。从 GitHub 安装会拉取源码并通过 `prepare` 脚本重新构建；pnpm 会拦截该构建，直到包被加入白名单。当安装报 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` 时，把 pnpm 打印的**精确 key** 复制到 profile 的 `pnpm-workspace.yaml`，然后重新执行命令：

```yaml
allowBuilds:
  dsh-ui-task-notify@https://codeload.github.com/ivvan3016/dsh-ui-task-notify/tar.gz/<commit-hash>: true
```

该 key 与解析出的具体 commit 绑定——仅写包名不会匹配，且只有把依赖更新到更新的 commit 时它才会变化。

## 卸载

```sh
dsh plugin --profile web remove dsh-ui-task-notify
```

卸载会移除该插件的 bundle 层并从 profile 中删除包。

Web 任务完成提醒插件：当 agent 完成任务、或开始等待你处理（审批、提问、计划审查）且页面处于后台时，它会弹出浏览器（Windows）系统通知——自带提示音、整个窗口最小化时也能显示的系统 toast。除了设置卡片外它不渲染任何内容、也不发起任何 RPC：两个触发信号都是已经推送到浏览器的**宿主权威信号**——**agent 空闲边沿**来自 `ctx.sessions.list`（宿主从 `agent/status` 推送 `host/session-status` 帧，客户端运行时将其折叠进列表每行的 `running` 位），**待处理交互边沿**来自 `ctx.uiSession.pendingInteractions`（Session UI 适配器为等待用户处理的会话发布的映射，包含 `approval`、`question`、`plan-review` 三个域）。由于 `running` 覆盖驱动器的整个 drain 区间，多轮目标只在真正停稳时提醒一次，而不是每轮提醒一次。

行为开关是 `ui-task-alert` settings 命名空间中的持久偏好，由本包的 node 半区注册、经 `ctx.settingsScope` 绑定：

| 字段 | 默认 | 含义 |
|---|---|---|
| `enabled` | `true` | 总开关；关闭后提醒完全不生效。 |
| `onlyWhenHidden` | `true` | 仅在 `document.hidden` 时提醒；页面可见时无需提醒。 |
| `includeSubagents` | `false` | 是否也在子代理会话完成时提醒；默认只提醒顶层会话。 |
| `interactionAlert` | `true` | 会话等待你处理（审批、提问、计划审查）时也提醒。 |

**设置** → **插件** → **插件配置** 中会显示"任务完成提醒"卡片。卡片的 **系统通知** 行是一个**授权按钮**而非设置项：点击 **授权** 向浏览器请求通知权限；授权后按钮变为不可用并显示 **已授权**，此后 agent 完成任务或等待你处理时会弹出 Windows toast（带系统通知音），即使整个浏览器窗口最小化也能显示。权限被拒时按钮显示 **已拒绝**，需在浏览器站点设置中改回；不支持 Notification API 的环境显示 **不支持**。下方的布尔开关支持暂存保存/放弃修改、逐字段恢复默认与覆盖标记；关闭 `enabled` 对当前页面立即生效——提醒在每次空闲边沿都会读取该段。

页面可见时发生的边沿会被消费而不提醒，因此之后切回页面不会触发过期的提醒；断线期间错过的边沿会在重连同步时提醒，这正是"你在别处时它完成了"的场景。待处理边沿按交互类型（kind）各触发一次，同一类型的重复请求不会重复提醒。

## 模型体验

无。本包只对人类消费宿主计算的 agent 状态做出反应，不触碰任何提示词、消息、schema、流或工具结果。

#### KV Cache 影响

无。本包从不组装或发送 provider 请求。

## 已知限制与延期工作

- **浏览器关闭或标签页被回收时无法提醒** —— 系统通知要求页面存活；浏览器完全关闭或被内存回收的标签页在重新打开前保持静默。系统通知额外需要浏览器通知权限（一旦拒绝，需在浏览器站点设置中改回）。
- **子代理完成默认静默** —— `includeSubagents` 偏好存在但默认 `false`；在卡片（或设置文档）中打开它即可对每个子会话提醒。
- **发布的声明文件沿用源码扩展名** —— `lib/types` 与 `src/` 同构，因此 `.d.ts` 内部的相对引用写成 `./locales.ts`，只有在开启 `allowImportingTsExtensions` 的 TypeScript 工作区里才能解析，包里没有与它们并列的 `.js`。dsh 运行时只读取 `lib/index.js` 与 `lib/client.js`，不会读取这些类型。

**运行时不变式：** 不发布伴生入口。本包只观察两个由客户端拥有的数据源并弹出浏览器通知，自身不持有事件协议或可变关系，不存在可能相互发散的独立观测；设置注册、边沿判定与释放由本包的行为测试覆盖。
