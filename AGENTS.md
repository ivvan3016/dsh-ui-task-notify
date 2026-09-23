# dsh-ui-task-notify

A standalone-published dsh (DeepSeek Harness) plugin that raises a browser (Windows) notification when an agent finishes while the page is hidden.

Targets dsh `0.1.7-alpha.2`.

## Project Overview

The plugin has two halves, both built from this repo:

- Node half (`src/index.ts`): declares the plugin entry's live `Config` — the schema the Host serves as the `ui-task-alert` settings section — and withholds the Host's auto-generated page.
- Client half (`src/client/`): renders the settings card on the Plugins page, watches `ctx.sessions.list` for the running→idle edge, and watches `ctx.uiSession.sessionStatus` for the waiting-on-the-user edge.

The browser runs the client bundle as `/plugins/<id>/client.js?rev=<hash>`, loaded through the harness contract `window.__ModuleLoader__.load({ id, factory })`.

## Repository Layout

- `src/index.ts` — plugin entry; the entry's `Config` schema and `apply`.
- `src/task-alert-settings.ts` — shared, dependency-free constants: the settings namespace (= the entry id), the row-config key, the plain `TaskAlertSettings` shape and its defaults.
- `src/client/` — browser half: `index.ts` (apply), `TaskAlertCard.tsx` (+ `.module.css`), `alert.ts`, `watcher.ts`, `task-alert-form.ts`, `locales.ts`.
- `tests/` — vitest specs: `host.client.spec.ts` (node half), `browser-plugin.client.spec.ts` (client activation, watch edges, and notification side effects), `task-alert-card.client.spec.tsx` (card rendering and the card controller).
- `scripts/build.mjs` — esbuild bundles the node and browser halves.
- `tsconfig.json` — declaration-only project emitting `lib/types/**/*.d.ts` from `src/`.
- `cordis.patch.yml` — dsh bundle patch layer; its `name` must match the package name, and its row `id` is the settings namespace.
- `lib/` — build output (`index.js`, `client.js`, `types/**`); gitignored, never committed, rebuilt by `prepare`.

## Common Commands

```sh
pnpm install            # install devDependencies (esbuild, typescript, vitest, @deepseek-ai/*)
pnpm run build          # bundle + emit declarations; runs as the package `prepare` script
pnpm test               # run the vitest specs
```

## Building

`pnpm run build` runs two phases: `scripts/build.mjs` bundles the runtime entry points with esbuild, then `tsc -p tsconfig.json` emits `lib/types/**/*.d.ts`. The package `prepare` script runs both, so a git install and an npm publish produce the same payload.

The node half bundles `@deepseek-ai/schemastery` (currently `~3.18.4`) so the package installs with no registry dependencies. That version floor is load-bearing: the schema uses `.volatile()`, without which the Host describes no section for the entry and the card never appears. `isVolatile`/`createVolatile` identify references through `Symbol.for('cosmokit.volatile.write')`, so the bundled copy interoperates with the Host's own copy.

`scripts/build.mjs` bundles the client half with esbuild. Two hard requirements, already fixed — do not regress them:

1. `jsx: 'automatic'` — components never `import React`. Without it, the classic transform emits `React.createElement` and the card crashes at runtime with "React is not defined".
2. The CSS Modules rewrite must touch **selector text only**, via `/(?<![0-9a-zA-Z])\.([a-zA-Z_][a-zA-Z0-9_-]*)/g` inside `source.replace(/([^{}]*)\{/g, ...)`. Naive rewrites corrupt decimal values (`opacity: 0.4` → `opacity: 0.dshtask-4`) and prefix only the first selector of comma groups (`.discard, .save {` → `.dshtask-discard, .save {`).

Sanity-check built `lib/client.js` for: `__ModuleLoader__.load({ id: "dsh-ui-task-notify"`; zero `React.createElement`; `opacity: 0.4` intact; no `schemastery` (the schema is host-only, and importing it from the client half would bundle the library into the browser artifact).

The declaration project compiles `src/` alone (no specs), so a Context or SlotMap merge that only the specs import must also be imported by the source using it — `import type {} from '…'` is the idiom. Emitted declarations keep the source's `.ts` specifiers; the README records what that means for consumers.

## Testing

- `host.client.spec.ts` — node half: every preference is a volatile field, the defaults resolve, an out-of-type value is rejected, the auto-generated page is withheld, and the namespace equals the row id the bundle patch mounts.
- `browser-plugin.client.spec.ts` — client activation over stubbed services and the real slot registry: the card registers under the row-config key and leaves with the fiber, idle-edge and waiting-on-the-user edge detection, live preference gating, the notification side effects, and HMR-safe teardown.
- `task-alert-card.client.spec.tsx` — the card controller (staging, save/discard, override markers, refused writes, permission republishing) and the component driven through props.

`pnpm test` runs standalone. The specs import the `@deepseek-ai/*` peers at `0.1.7-alpha.2` from devDependencies, except two value peers that `vitest.config.ts` aliases to their sources in the deepseek-harness checkout: `@deepseek-ai/dsh-client-store` (its published Node entry expects a host-provided state library) and `@deepseek-ai/dsh-client-ui-renderer/client` (its published bundle reads `window.__ModuleLoader__` on import). Those two aliases need a sibling `../deepseek-harness` checkout. After any build change, also spot-check the bundle (see Building).

## Client API Surface

The browser half binds only through services and slot declarations — cross-package **value** imports are forbidden (the bundle purity gate) and every `@deepseek-ai/*` import outside the module-table seed words must stay type-only:

- `@deepseek-ai/cordis` — `Context` (the client context; there is no `ClientContext` export any more).
- `@deepseek-ai/dsh-client-store` — `createSnapshotStore`, `SnapshotStore`, `ObservableSnapshot` (a module-table seed word).
- `@deepseek-ai/dsh-client-ui-settings/client` — `ConfigForm`, `ConfigFormSnapshot` (`ctx.configForms.get(entryId)` and `ctx.configForms.whileServed([...])`).
- `@deepseek-ai/dsh-api-session-controller/client` — `SessionListState`, `SessionSummary` (`ctx.sessions`).
- `@deepseek-ai/dsh-client-ui-session/client` — `SessionStatusSnapshot` (`ctx.uiSession.sessionStatus`; there is no `pendingInteractions` map any more, and `SessionSummary.pendingInteraction` does not exist).
- `@deepseek-ai/dsh-client-ui-plugin-manager/client` — the `plugins.row.config` SlotMap merge the card registers into (`rowConfigKey(package, rowId)`), plus `PluginConfigViewProps` and its `view: 'summary' | 'page'` protocol.
- `@deepseek-ai/dsh-client-ui-slots` — `PropsRuntime`, `PropsLocale`, `InjectFace`, `LocaleNamespaceMap` (types only).
- `@deepseek-ai/dsh-client-ui-renderer/client` — owns `SlotRegistry` and the `ctx.slots` service (types only here).

## Settings Namespace

One active plugin entry publishes one settings section, keyed by that entry's id, so the namespace is the row id the bundle patch mounts: `ui-task-alert`. **Keep it unchanged** — renaming the row detaches the card from every stored user value. The id is intentionally distinct from the package name (`dsh-ui-task-notify`).

Because the Host describes a section only for an entry whose schema publishes a live field, every preference is declared `.volatile()`. The card's copy lives in the separate `settings.taskAlert` locale namespace, following the `settings.<feature>` convention every settings surface uses.

## Runtime Invariant

No `./invariant` companion is published, and none should be added back. The package owns no event protocol or mutable data of its own — it observes two client-owned sources and raises a browser notification — so no independent observations can diverge. The entry Config, the watch edges, and their disposal are covered by the behavior specs ([rule](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/AGENTS.md)).
