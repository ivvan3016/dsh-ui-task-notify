# dsh-ui-task-notify

English | [中文](README.zh.md)

## Install

```sh
# from npm (recommended)
dsh plugin --profile web add dsh-ui-task-notify

# from GitHub
dsh plugin --profile web add github:ivvan3016/dsh-ui-task-notify
```

The npm package ships prebuilt artifacts and installs without any further setup. Git installs fetch the source and rebuild it via `prepare`; pnpm blocks that build until the package is allowlisted. When a git install fails with `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`, copy the **exact key pnpm prints** into the profile's `pnpm-workspace.yaml` and re-run the command:

```yaml
allowBuilds:
  dsh-ui-task-notify@https://codeload.github.com/ivvan3016/dsh-ui-task-notify/tar.gz/<commit-hash>: true
```

The key is bound to one resolved commit — a bare package name does not match, and it changes only when you update the dependency to a newer commit.

## Uninstall

```sh
dsh plugin --profile web remove dsh-ui-task-notify
```

Removing the plugin drops its bundle layer and removes the package from the profile.

Web task-complete alert plugin: when an agent finishes — or starts waiting on you for an approval, question, or plan review — while the page is hidden, it raises a browser (Windows) notification, a system toast that carries its own sound and stays visible even while the whole window is minimized. It renders nothing beyond its settings card and issues no RPC: both triggers are host-authoritative signals already streamed to the browser. The **agent idle edge** comes from `ctx.sessions.list` (the Host pushes `host/session-status` frames from `agent/status`, and the client runtime folds them into each list row's `running` bit); the **pending-interaction edge** comes from `ctx.uiSession.pendingInteractions`, the map the Session UI adapter publishes for sessions waiting on the user (`approval`, `question`, and `plan-review` domains). Because `running` spans the driver's whole drain interval, a multi-turn goal alerts exactly once, at true quiescence, rather than once per turn.

The behavior gates are durable preferences in the `ui-task-alert` settings namespace, registered by the package's node half and bound through `ctx.settingsScope`:

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch; when off the alert does nothing. |
| `onlyWhenHidden` | `true` | Alert only while `document.hidden`; a visible page needs no reminder. |
| `includeSubagents` | `false` | Also alert when a subagent session finishes; top-level sessions only by default. |
| `interactionAlert` | `true` | Also alert when a session is waiting on you (approval, question, plan review). |

**Settings** → **Plugins** → **Plugin configuration** shows a task-complete alert card. The card's **系统通知 / System notification** row is an **authorize button**, not a setting: click **授权** to ask the browser for notification permission; once granted the button becomes disabled and reads **已授权**, and a finished agent (or one waiting on you) raises the Windows toast (with the system notification sound) even with the whole browser window minimized. A denied permission reads **已拒绝** and must be re-granted in the browser's site settings; an environment without the Notification API reads **不支持**. The boolean fields below stage save/discard with per-field reset to the composed default and override markers; toggling `enabled` off takes effect immediately for the running page — the alert checks the section at every idle edge.

An edge observed while the page is visible is consumed without alerting, so returning later never fires a stale reminder; an edge missed during a disconnect alerts on the reconnect resync, which is the "finished while you were away" case. A pending-interaction edge fires once per interaction kind, so a replacement request of the same kind does not re-alert.

## Model Experience

None, as this package reacts to host-computed agent status for a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **A closed or discarded browser tab cannot alert** — the page must be alive for the notification; a fully closed browser or a memory-reclaimed tab stays silent until reopened. The notification additionally needs the browser's notification permission (a denied permission is sticky until changed in the browser's site settings).
- **Subagent completions are quiet by default** — the `includeSubagents` preference exists but defaults to `false`; flip it in the card (or the settings document) to alert on every child session.
- **Published declarations carry source specifiers** — `lib/types` mirrors `src/`, so a relative import inside a `.d.ts` reads `./locales.ts` and resolves only in a TypeScript workspace with `allowImportingTsExtensions`; no `.js` ships beside them. The dsh runtime reads only `lib/index.js` and `lib/client.js`, never these types.

**Runtime invariant:** No companion is published. The package observes two client-owned sources and raises a browser notification; it owns no event protocol or mutable relation whose independent observations could diverge. The settings registration, the watcher edges, and their disposal are covered by this package's behavior specs.
