import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SettingsProvider, settingsNamespace, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  DEFAULT_TASK_ALERT_SETTINGS, TASK_ALERT_SETTINGS_NAMESPACE, apply,
} from '../src/index.ts'

class MemorySettings extends SettingsProvider {
  readonly writable = true
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve({}) }
  protected persist(_ns: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve()
  }
}

describe('ui-task-alert host', () => {
  it('registers, validates, and disposes the durable alert namespace with its fiber', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    const ns = settingsNamespace(TASK_ALERT_SETTINGS_NAMESPACE)
    expect(ctx.settings.get(ns)).toEqual(DEFAULT_TASK_ALERT_SETTINGS)
    await ctx.settings.update(ns, { includeSubagents: true })
    expect(ctx.settings.get(ns)).toEqual({ ...DEFAULT_TASK_ALERT_SETTINGS, includeSubagents: true })
    await expect(ctx.settings.update(ns, { includeSubagents: 'sepia' as never })).rejects.toThrow()
    await fiber.dispose()
    expect(ctx.settings.describe().map(row => row.ns)).not.toContain(ns)
  })

  it('mounts without a settings provider and does nothing', async () => {
    const ctx = new Context()
    await ctx.plugin({ apply }).await()
    expect(ctx.settings).toBeUndefined()
  })
})
