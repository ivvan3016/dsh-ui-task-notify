/**
 * ui-task-alert host half: the entry's live Config is the settings section the
 * browser card binds, so the schema must publish one volatile field per
 * preference, resolve the documented defaults, and withhold the Host's own
 * generated page.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { Config, apply } from '../src/index.ts'
import {
  DEFAULT_TASK_ALERT_SETTINGS, TASK_ALERT_PACKAGE_NAME, TASK_ALERT_ROW_CONFIG_KEY,
  TASK_ALERT_SETTINGS_NAMESPACE,
} from '../src/task-alert-settings.ts'

/** The fields the card edits, read off the schema without schemastery's internals. */
const fields = (Config as unknown as { dict: Record<string, { meta: { volatile?: boolean; default?: unknown } }> }).dict

describe('ui-task-alert host', () => {
  it('publishes every preference as a live field the Host can serve', () => {
    expect(Object.keys(fields).sort()).toEqual(Object.keys(DEFAULT_TASK_ALERT_SETTINGS).sort())
    for (const field of Object.keys(DEFAULT_TASK_ALERT_SETTINGS)) {
      expect(fields[field]!.meta.volatile).toBe(true)
      expect(fields[field]!.meta.default).toBe(
        DEFAULT_TASK_ALERT_SETTINGS[field as keyof typeof DEFAULT_TASK_ALERT_SETTINGS],
      )
    }
  })

  it('resolves the defaults for an unconfigured entry', () => {
    const config = Config({})
    expect(config.enabled.get()).toBe(true)
    expect(config.onlyWhenHidden.get()).toBe(true)
    expect(config.includeSubagents.get()).toBe(false)
    expect(config.interactionAlert.get()).toBe(true)
  })

  it('rejects a value outside the declared type', () => {
    expect(() => Config({ enabled: 'sepia' })).toThrow()
  })

  it('withholds the auto-generated section page when the Host serves settings', async () => {
    const ctx = new Context()
    const configure = vi.fn()
    ctx.provide('settings', { configure } as never)
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    expect(configure).toHaveBeenCalledWith({ auto: false }, expect.anything())
  })

  it('mounts without a settings service and does nothing', async () => {
    const ctx = new Context()
    await ctx.plugin({ apply }).await()
    expect(ctx.get('settings')).toBeUndefined()
  })

  it('keeps the namespace the bundle patch mounts', () => {
    expect(TASK_ALERT_SETTINGS_NAMESPACE).toBe('ui-task-alert')
    expect(TASK_ALERT_ROW_CONFIG_KEY).toBe(`${TASK_ALERT_PACKAGE_NAME}#${TASK_ALERT_SETTINGS_NAMESPACE}`)
  })
})
