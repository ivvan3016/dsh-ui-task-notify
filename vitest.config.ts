import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/** Absolute path into the deepseek-harness checkout that owns the peer sources. */
const harness = (path: string): string =>
  fileURLToPath(new URL(`../../deepseek-harness/${path}`, import.meta.url))

/**
 * Standalone vitest config for this plugin's specs. Two peers are imported as
 * values: the snapshot-store engine and the slot registry. Their published
 * entries are built for the browser module table (the registry's `/client`
 * bundle reads `window.__ModuleLoader__` on import, and the store's Node entry
 * expects a host-provided state library), so the specs resolve those two to
 * their sources in the deepseek-harness checkout. Every other `@deepseek-ai/*`
 * import in the specs is type-only or a plain library entry and resolves from
 * the plugin's own node_modules.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@deepseek-ai\/dsh-client-store$/, replacement: harness('packages/client/store/src/index.ts') },
      {
        find: /^@deepseek-ai\/dsh-client-ui-renderer\/client$/,
        replacement: harness('packages/client/ui-renderer/src/client/index.ts'),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
  },
})
