# dsh-ui-task-notify

A standalone-published dsh (DeepSeek Harness) plugin that raises a browser (Windows) notification when an agent finishes while the page is hidden.

## Project Overview

The plugin has two halves, both built from this repo:

- Node half (`src/index.ts`): registers the `ui-task-alert` settings namespace with its schema.
- Client half (`src/client/`): renders the settings card, watches `ctx.sessions.list` for the running→idle edge, and watches `ctx.uiSession.pendingInteractions` for the waiting-on-the-user edge.

The browser runs the client bundle as `/plugins/<id>/client.js?rev=<hash>`, loaded through the harness contract `window.__ModuleLoader__.load({ id, factory })`.

## Repository Layout

- `src/index.ts` — plugin entry; node-half registration.
- `src/task-alert-settings.ts` — settings schema for the `ui-task-alert` namespace.
- `src/client/` — browser half: `index.ts` (apply), `TaskAlertCard.tsx` (+ `.module.css`), `alert.ts`, `watcher.ts`, `task-alert-form.ts`, `locales.ts`.
- `tests/` — vitest specs: `host.client.spec.ts` (node half), `browser-plugin.client.spec.ts` (client registration), `task-alert-card.client.spec.tsx` (card rendering).
- `scripts/build.mjs` — esbuild bundles the node and browser halves.
- `tsconfig.json` — declaration-only project emitting `lib/types/**/*.d.ts` from `src/`.
- `cordis.patch.yml` — dsh bundle patch layer; its `name` must match the package name.
- `lib/` — build output (`index.js`, `client.js`, `types/**`); gitignored, never committed, rebuilt by `prepare`.

## Common Commands

```sh
pnpm install            # install devDependencies (esbuild, typescript, @deepseek-ai/*)
pnpm run build          # bundle + emit declarations; runs as the package `prepare` script
```

## Building

`pnpm run build` runs two phases: `scripts/build.mjs` bundles the runtime entry points with esbuild, then `tsc -p tsconfig.json` emits `lib/types/**/*.d.ts`. The package `prepare` script runs both, so a git install and an npm publish produce the same payload.

`scripts/build.mjs` bundles the client half with esbuild. Two hard requirements, already fixed — do not regress them:

1. `jsx: 'automatic'` — components never `import React`. Without it, the classic transform emits `React.createElement` and the card crashes at runtime with "React is not defined".
2. The CSS Modules rewrite must touch **selector text only**, via `/(?<![0-9a-zA-Z])\.([a-zA-Z_][a-zA-Z0-9_-]*)/g` inside `source.replace(/([^{}]*)\{/g, ...)`. Naive rewrites corrupt decimal values (`opacity: 0.4` → `opacity: 0.dshtask-4`) and prefix only the first selector of comma groups (`.discard, .save {` → `.dshtask-discard, .save {`).

Sanity-check built `lib/client.js` for: `__ModuleLoader__.load({ id: "dsh-ui-task-notify"`; zero `React.createElement`; `opacity: 0.4` intact.

The declaration project compiles `src/` alone (no specs), so a Context or SlotMap merge that only the specs import must also be imported by the source using it — `import type {} from '…'` is the idiom. Emitted declarations keep the source's `.ts` specifiers; the README records what that means for consumers.

## Testing

- `host.client.spec.ts` — node half: settings registration; `describe()` returns the namespace.
- `browser-plugin.client.spec.ts` — client bundle registration under a simulated browser module loader, idle-edge and pending-interaction-edge detection, and the notification side effects.
- `task-alert-card.client.spec.tsx` — renders the settings card component.

The specs import `@deepseek-ai/*` peers at `0.1.5-rc.2` (published on the npm `next` tag, but the client-side ones carry no `latest` tag), so they run from a temporary package inside the deepseek-harness workspace (`packages/client/task-alert-local`, see `vitest.task-alert.local.ts` at the harness root). Sync the copied `tests/` and `src/` from this repo after editing, then run with the harness vitest config. After any build change, also spot-check the bundle (see Building).

## Client API Surface

The browser half binds only through services and slot declarations — cross-package **value** imports are forbidden (the bundle purity gate) and every `@deepseek-ai/*` import outside the module-table seed words must stay type-only:

- `@deepseek-ai/cordis` — `Context` (the client context; there is no `ClientContext` export any more).
- `@deepseek-ai/dsh-client-store` — `createSnapshotStore`, `SnapshotStore`, `ObservableSnapshot` (a module-table seed word; the old `dsh-client-runtime` package is gone).
- `@deepseek-ai/dsh-client-ui-settings/client` — `SettingsScope`, `SettingsScopeSnapshot` (`ctx.settingsScope`).
- `@deepseek-ai/dsh-api-session-controller/client` — `SessionListState`, `SessionSummary` (`ctx.sessions`).
- `@deepseek-ai/dsh-client-ui-session/client` — `ctx.uiSession`, whose `pendingInteractions` observable is the live waiting-on-the-user source (the `SessionSummary.pendingInteraction` field no longer exists).
- `@deepseek-ai/dsh-client-ui-slots` — `PropsRuntime`, `PropsLocale`, `InjectFace`, `LocaleNamespaceMap` (types only).
- `@deepseek-ai/dsh-client-ui-primitives` — icons (a module-table seed word, so it is a *value* import).
- `@deepseek-ai/dsh-client-ui-renderer/client` — owns `SlotRegistry` and the `ctx.slots` service.

## Settings Namespace

The settings namespace is `ui-task-alert`, registered by the node half. **Keep it unchanged.** Renaming it resets users' granted notification-permission state and their settings section. It is intentionally distinct from the package name (`dsh-ui-task-notify`).

The card's copy lives in the separate `settings.taskAlert` locale namespace, following the `settings.<feature>` convention every settings surface uses.

## Runtime Invariant

No `./invariant` companion is published, and none should be added back. The package owns no event protocol or mutable data of its own — it observes two client-owned sources and raises a browser notification — so no independent observations can diverge. The settings registration, the watch edges, and their disposal are covered by the behavior specs ([rule](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/AGENTS.md)).
