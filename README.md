# dsh-ui-task-notify

English | [中文](README.zh.md)

## Install

```sh
dsh plugin --profile <name> add github:ivvan3016/dsh-ui-task-notify
```

Git installs fetch the source and rebuild it via `prepare`; pnpm blocks that build until the package is allowlisted. When the install fails with `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`, copy the **exact key pnpm prints** into the profile's `pnpm-workspace.yaml` and re-run the command:

```yaml
allowBuilds:
  dsh-ui-task-notify@https://codeload.github.com/ivvan3016/dsh-ui-task-notify/tar.gz/<commit-hash>: true
```

The key is bound to one resolved commit — a bare package name does not match, and it changes only when you update the dependency to a newer commit. Once published to npm, `dsh plugin --profile <name> add dsh-ui-task-notify` needs no allowlist entry.

Web task-complete alert plugin: when an agent finishes while the page is hidden, it raises a browser (Windows) notification — a system toast that carries its own sound and stays visible even while the whole window is minimized. It renders nothing beyond its settings card and issues no RPC: the trigger is the host-authoritative **agent idle signal** already streamed to the browser — the Host pushes `host/session-status` frames from `agent/status`, the client runtime folds them into each list row's `running` bit, and this package watches `ctx.sessions.list` for the running→idle edge. Because `running` spans the driver's whole drain interval, a multi-turn goal alerts exactly once, at true quiescence, rather than once per turn.

The behavior gates are durable preferences in the `ui-task-alert` settings namespace, registered by the package's node half and bound through `ctx.settingsScope`:

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch; when off the alert does nothing. |
| `onlyWhenHidden` | `true` | Alert only while `document.hidden`; a visible page needs no reminder. |
| `includeSubagents` | `false` | Also alert when a subagent session finishes; top-level sessions only by default. |

**Settings** → **Plugins** → **Plugin configuration** shows a task-complete alert card. The card's **系统通知 / System notification** row is an **authorize button**, not a setting: click **授权** to ask the browser for notification permission; once granted the button becomes disabled and reads **已授权**, and a finished agent raises the Windows toast (with the system notification sound) even with the whole browser window minimized. A denied permission reads **已拒绝** and must be re-granted in the browser's site settings; an environment without the Notification API reads **不支持**. The boolean fields below stage save/discard with per-field reset to the composed default and override markers; toggling `enabled` off takes effect immediately for the running page — the alert checks the section at every idle edge.

An edge observed while the page is visible is consumed without alerting, so returning later never fires a stale reminder; an edge missed during a disconnect alerts on the reconnect resync, which is the "finished while you were away" case.

## Model Experience

None, as this package reacts to host-computed agent status for a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **A closed or discarded browser tab cannot alert** — the page must be alive for the notification; a fully closed browser or a memory-reclaimed tab stays silent until reopened. The notification additionally needs the browser's notification permission (a denied permission is sticky until changed in the browser's site settings).
- **Subagent completions are quiet by default** — the `includeSubagents` preference exists but defaults to `false`; flip it in the card (or the settings document) to alert on every child session.
