# dsh-ui-task-notify

A standalone-published dsh (DeepSeek Harness) plugin that raises a browser (Windows) notification when an agent finishes while the page is hidden.

## Project Overview

The plugin has two halves, both built from this repo:

- Node half (`src/index.ts`): registers the `ui-task-alert` settings namespace with its schema.
- Client half (`src/client/`): renders the settings card and watches `ctx.sessions.list` for the running→idle edge to raise the notification.

The browser runs the client bundle as `/plugins/<id>/client.js?rev=<hash>`, loaded through the harness contract `window.__ModuleLoader__.load({ id, factory })`.

## Repository Layout

- `src/index.ts` — plugin entry; node-half registration.
- `src/invariant.ts` — runtime invariant for this package (dsh convention).
- `src/task-alert-settings.ts` — settings schema for the `ui-task-alert` namespace.
- `src/client/` — browser half: `index.ts` (apply), `TaskAlertCard.tsx` (+ `.module.css`), `alert.ts`, `watcher.ts`, `task-alert-form.ts`, `locales.ts`.
- `tests/` — vitest specs: `host.client.spec.ts` (node half), `browser-plugin.client.spec.ts` (client registration), `task-alert-card.client.spec.tsx` (card rendering).
- `scripts/build.mjs` — esbuild build; runs as the package `prepare` script.
- `cordis.patch.yml` — dsh bundle patch layer; its `name` must match the package name.
- `lib/` — build output; gitignored, never committed, rebuilt by `prepare`.

## Common Commands

```sh
pnpm install            # install devDependencies (esbuild, vitest, ...)
node scripts/build.mjs  # run the prepare build manually
pnpm test               # run all vitest specs
```

## Building

`scripts/build.mjs` bundles the client half with esbuild. Two hard requirements, already fixed — do not regress them:

1. `jsx: 'automatic'` — components never `import React`. Without it, the classic transform emits `React.createElement` and the card crashes at runtime with "React is not defined".
2. The CSS Modules rewrite must touch **selector text only**, via `/(?<![0-9a-zA-Z])\.([a-zA-Z_][a-zA-Z0-9_-]*)/g` inside `source.replace(/([^{}]*)\{/g, ...)`. Naive rewrites corrupt decimal values (`opacity: 0.4` → `opacity: 0.dshtask-4`) and prefix only the first selector of comma groups (`.discard, .save {` → `.dshtask-discard, .save {`).

Sanity-check built `lib/client.js` for: `__ModuleLoader__.load({ id: "dsh-ui-task-notify"`; zero `React.createElement`; `opacity: 0.4` intact.

## Testing

- `host.client.spec.ts` — node half: settings registration; `describe()` returns the namespace.
- `browser-plugin.client.spec.ts` — client bundle registration under a simulated browser module loader.
- `task-alert-card.client.spec.tsx` — renders the settings card component.

Run all with `pnpm test`. After any build change, also spot-check the bundle (see Building).

## Settings Namespace

The settings namespace is `ui-task-alert`, registered by the node half. **Keep it unchanged.** Renaming it resets users' granted notification-permission state and their settings section. It is intentionally distinct from the package name (`dsh-ui-task-notify`).
