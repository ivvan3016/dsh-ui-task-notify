// @vitest-environment jsdom
/**
 * ui-task-alert browser half: idle-edge detection over a driven sessions
 * list, the Windows-notification side effect, live settings gating, and
 * HMR-safe teardown.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type {
  SessionId, SessionListState, SessionSummary, SettingsScopeSnapshot,
} from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import * as AlertInvariant from '../src/invariant.ts'
import { createIdleWatcher } from '../src/client/watcher.ts'
import { createTaskAlert } from '../src/client/alert.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import {
  DEFAULT_TASK_ALERT_SETTINGS, TASK_ALERT_SETTINGS_NAMESPACE,
  type TaskAlertSettings,
} from '../src/task-alert-settings.ts'

/** One fake list-row seed. */
interface SessionSeed {
  id: string
  running?: boolean
  origin?: 'subagent'
}

/** Controllable sessions-list observable standing in for `ctx.sessions.list`. */
class FakeList {
  state: SessionListState = {
    ids: [], byId: {}, current: undefined, phase: 'ready',
    subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
  }
  private readonly listeners = new Set<() => void>()

  getSnapshot(): SessionListState { return this.state }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  /** Replace the snapshot wholesale and notify. */
  set(sessions: readonly SessionSeed[]): void {
    const byId: Record<string, SessionSummary> = {}
    for (const seed of sessions) {
      byId[seed.id] = {
        id: seed.id as SessionId,
        displayTitle: seed.id,
        running: seed.running ?? false,
        blank: false,
        updatedAt: 1,
        ...(seed.origin === undefined ? {} : { origin: seed.origin, parentId: 'p' as SessionId }),
      }
    }
    this.state = { ...this.state, ids: sessions.map(seed => seed.id as SessionId), byId }
    this.notify()
  }

  /** Inject a raw snapshot (for byId/ids divergence) and notify. */
  rawState(state: SessionListState): void {
    this.state = state
    this.notify()
  }

  private notify(): void {
    for (const fn of [...this.listeners]) fn()
  }
}

/** Controllable settings scope standing in for the ui-settings bound scope. */
class FakeScope {
  snapshot: SettingsScopeSnapshot<TaskAlertSettings>
  private readonly listeners = new Set<() => void>()

  constructor(value?: TaskAlertSettings) {
    this.snapshot = {
      status: 'ready', value, base: undefined, user: undefined,
      revision: 0, writable: true, mode: 'host',
    }
  }

  getSnapshot(): SettingsScopeSnapshot<TaskAlertSettings> { return this.snapshot }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  set(field: string, value: unknown): Promise<void> {
    const user = { ...(this.snapshot.user as Record<string, unknown> | undefined ?? {}) }
    user[field] = value
    this.snapshot = {
      ...this.snapshot,
      user,
      value: { ...(this.snapshot.value ?? {}), [field]: value } as unknown as TaskAlertSettings,
    }
    for (const fn of [...this.listeners]) fn()
    return Promise.resolve()
  }

  unset(field: string): Promise<void> {
    const user = Object.fromEntries(
      Object.entries(this.snapshot.user as Record<string, unknown> | undefined ?? {}).filter(([key]) => key !== field),
    )
    const next = Object.fromEntries(
      Object.entries(this.snapshot.value as Record<string, unknown> | undefined ?? {}).filter(([key]) => key !== field),
    )
    this.snapshot = {
      ...this.snapshot,
      user: Object.keys(user).length > 0 ? user : undefined,
      value: Object.keys(next).length > 0 ? next as unknown as TaskAlertSettings : undefined,
    }
    for (const fn of [...this.listeners]) fn()
    return Promise.resolve()
  }
}

/** Hide/shown state behind `document.hidden`. */
function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
}

interface Bench {
  ctx: Context
  fiber: ReturnType<Context['plugin']>
  list: FakeList
  scope: FakeScope
}

/** Notification double recording shown notifications. */
function stubNotification(permission: NotificationPermission = 'granted'): {
  requestPermission: ReturnType<typeof vi.fn>
  shown: Array<{ title: string; options: { body?: string; tag?: string } }>
  instances: Array<{ onclick: (() => void) | null }>
} {
  const shown: Array<{ title: string; options: { body?: string; tag?: string } }> = []
  const instances: Array<{ onclick: (() => void) | null }> = []
  const requestPermission = vi.fn(() => Promise.resolve(permission))
  vi.stubGlobal('Notification', class {
    static permission = permission
    static requestPermission = requestPermission
    onclick: (() => void) | null = null
    constructor(title: string, options: { body?: string; tag?: string } = {}) {
      shown.push({ title, options })
      instances.push(this)
    }
  })
  return { requestPermission, shown, instances }
}

/** Boot the browser half over stubbed sessions/settings services and the real locale plugin. */
async function bench(value?: TaskAlertSettings): Promise<Bench> {
  const ctx = new Context()
  const list = new FakeList()
  const scope = new FakeScope(value)
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.session.header.actions': { kind: 'list', scope: 'session' },
      'settings.plugin.item': { kind: 'keyed', scope: 'root' },
    },
  } as never, () => null)
  ctx.provide('sessions', { list } as never)
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('settingsScope', {
    bind: (spec: { namespace: string }) =>
      spec.namespace === TASK_ALERT_SETTINGS_NAMESPACE ? scope : stubSettingsScope().scope,
  } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.locale.setLocale('zh')
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber, list, scope }
}

beforeEach(() => {
  setHidden(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ui-task-alert browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['sessions', 'settingsScope', 'locale', 'slots'])
  })

  it('registers the Plugins card under its namespace and releases it with the fiber', async () => {
    const { ctx, fiber } = await bench()
    const entry = ctx.slots.entries('settings.plugin.item').find(candidate => candidate.options.key === 'ui-task-alert')
    expect(entry).toBeDefined()
    // StoredEntry.inject is declaration-typed ((...args: never[]) shape);
    // the erased registration widens it past a direct cast, so hop unknown.
    const face = entry!.inject as unknown as () => {
      hooks: { taskAlertCard: { getSnapshot(): { available: boolean } } }
      authorize(): void
    }
    const injected = face()
    expect(injected.hooks.taskAlertCard.getSnapshot().available).toBe(true)
    // The card's authorize action requests notification permission.
    const { requestPermission } = stubNotification('default')
    injected.authorize()
    await vi.waitFor(() => { expect(requestPermission).toHaveBeenCalled() })
    await fiber.dispose()
    expect(ctx.slots.entries('settings.plugin.item').map(candidate => candidate.options.key)).not.toContain('ui-task-alert')
  })

  it('honors the enabled master switch live', async () => {
    const { list, scope } = await bench(DEFAULT_TASK_ALERT_SETTINGS)
    const { shown } = stubNotification()
    setHidden(true)
    await scope.set('enabled', false)
    list.set([{ id: 's1', running: true }])
    list.set([{ id: 's1', running: false }])
    expect(shown).toHaveLength(0)

    await scope.set('enabled', true)
    list.set([{ id: 's1', running: true }])
    list.set([{ id: 's1', running: false }])
    expect(shown).toHaveLength(1)
  })

  it('shows a system notification with the session title when permission is granted', async () => {
    const { list } = await bench(DEFAULT_TASK_ALERT_SETTINGS)
    const { shown } = stubNotification()
    setHidden(true)
    list.set([{ id: 's1', running: true }])
    list.set([{ id: 's1', running: false }])
    expect(shown).toEqual([{ title: 'dsh 已完成', options: { body: 's1', tag: 'dsh-task-alert' } }])
  })

  it('skips the system notification without granted permission', async () => {
    const { list } = await bench(DEFAULT_TASK_ALERT_SETTINGS)
    stubNotification('denied')
    setHidden(true)
    list.set([{ id: 's1', running: true }])
    list.set([{ id: 's1', running: false }])
    const { shown } = stubNotification('default')
    list.set([{ id: 's1', running: true }])
    list.set([{ id: 's1', running: false }])
    expect(shown).toHaveLength(0)
  })

  it('stays silent while the page is visible even though the agent finished', async () => {
    const { list } = await bench(DEFAULT_TASK_ALERT_SETTINGS)
    const { shown } = stubNotification()
    setHidden(false)
    list.set([{ id: 's1', running: true }])
    list.set([{ id: 's1', running: false }])
    expect(shown).toHaveLength(0)
  })

  it('ignores subagent sessions unless the preference includes them', async () => {
    const { list, scope } = await bench(DEFAULT_TASK_ALERT_SETTINGS)
    const { shown } = stubNotification()
    setHidden(true)
    list.set([{ id: 's1', running: true, origin: 'subagent' }])
    list.set([{ id: 's1', running: false, origin: 'subagent' }])
    expect(shown).toHaveLength(0)

    await scope.set('includeSubagents', true)
    list.set([{ id: 's1', running: true, origin: 'subagent' }])
    list.set([{ id: 's1', running: false, origin: 'subagent' }])
    expect(shown).toHaveLength(1)
  })

  it('stops alerting on teardown', async () => {
    const { ctx, fiber, list } = await bench(DEFAULT_TASK_ALERT_SETTINGS)
    const { shown } = stubNotification()
    setHidden(true)
    list.set([{ id: 's1', running: true }])
    list.set([{ id: 's1', running: false }])
    expect(shown).toHaveLength(1)
    await fiber.dispose()
    list.set([{ id: 's1', running: true }])
    list.set([{ id: 's1', running: false }])
    expect(shown).toHaveLength(1)
    expect(ctx.locale.bind(NS)('title.done')).not.toBe(zh['title.done'])
  })

  it('registers both dictionaries under its own namespace and releases them with the fiber', async () => {
    const { ctx, fiber } = await bench()
    const translate = ctx.locale.bind(NS)
    expect(translate('title.done')).toBe(zh['title.done'])
    ctx.locale.setLocale('en')
    expect(translate('title.done')).toBe(en['title.done'])
    await fiber.dispose()
    expect(translate('title.done')).not.toBe(en['title.done'])
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})

describe('idle watcher', () => {
  it('fires on running→idle edges, skips byId gaps, and prunes removed sessions', () => {
    const list = new FakeList()
    const onIdle = vi.fn()
    const watcher = createIdleWatcher(list, () => false, onIdle)
    list.rawState({
      ids: ['missing' as SessionId], byId: {}, current: undefined, phase: 'ready',
      subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    })
    list.set([{ id: 'a', running: true }])
    list.set([{ id: 'a', running: false }])
    expect(onIdle).toHaveBeenCalledTimes(1)
    expect(onIdle).toHaveBeenCalledWith('a', 'a')
    list.set([{ id: 'b' }])
    list.set([{ id: 'b', running: true }])
    list.set([{ id: 'b', running: false }])
    expect(onIdle).toHaveBeenCalledTimes(2)
    expect(onIdle).toHaveBeenLastCalledWith('b', 'b')
    watcher.dispose()
  })

  it('filters subagent sessions by the live preference', () => {
    const list = new FakeList()
    const onIdle = vi.fn()
    let includeSubagents = false
    const watcher = createIdleWatcher(list, () => includeSubagents, onIdle)
    list.set([{ id: 'child', running: true, origin: 'subagent' }])
    list.set([{ id: 'child', running: false, origin: 'subagent' }])
    expect(onIdle).not.toHaveBeenCalled()
    includeSubagents = true
    list.set([{ id: 'child', running: true, origin: 'subagent' }])
    list.set([{ id: 'child', running: false, origin: 'subagent' }])
    expect(onIdle).toHaveBeenCalledTimes(1)
    watcher.dispose()
  })
})

describe('task alert engine', () => {
  it('requests notification permission only while undecided', async () => {
    const alert = createTaskAlert(
      key => key === 'title.done' ? 'done' : key,
      () => DEFAULT_TASK_ALERT_SETTINGS,
    )
    const undecided = stubNotification('default')
    await alert.requestNotificationPermission()
    expect(undecided.requestPermission).toHaveBeenCalledTimes(1)
    const granted = stubNotification('granted')
    await alert.requestNotificationPermission()
    expect(granted.requestPermission).not.toHaveBeenCalled()
    const denied = stubNotification('denied')
    await alert.requestNotificationPermission()
    expect(denied.requestPermission).not.toHaveBeenCalled()
  })

  it('reports the permission state and tolerates missing notification support', async () => {
    const alert = createTaskAlert(
      key => key === 'title.done' ? 'done' : key,
      () => DEFAULT_TASK_ALERT_SETTINGS,
    )
    stubNotification('granted')
    expect(alert.notificationPermission()).toBe('granted')
    vi.stubGlobal('Notification', undefined)
    expect(alert.notificationPermission()).toBe('unsupported')
    await alert.requestNotificationPermission()
    setHidden(true)
    alert.notify('s')
  })

  it('shows the notification without a session title and focuses the window on click', () => {
    const alert = createTaskAlert(
      key => key === 'title.done' ? 'done' : key,
      () => DEFAULT_TASK_ALERT_SETTINGS,
    )
    const { shown, instances } = stubNotification()
    const focus = vi.fn()
    window.focus = focus
    setHidden(true)
    alert.notify()
    expect(shown).toHaveLength(1)
    expect(shown[0]!.options.body).toBeUndefined()
    instances[0]!.onclick?.()
    expect(focus).toHaveBeenCalled()
  })
})

describe('ui-task-alert node half', () => {
  it('contributes no host behavior beyond the settings registration', () => {
    expect(() => { applyNode(new Context()) }).not.toThrow()
  })
})

describe('ui-task-alert invariant companion', () => {
  it('reserves package ownership under its declared companion name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(AlertInvariant)
    await fiber.await()
    expect(AlertInvariant.name).toBe('dsh-ui-task-notify-invariant')
    expect(AlertInvariant.inject).toEqual(['invariants'])
    expect(() => { (ctx.emit as (event: string) => void)('slots/changed') }).not.toThrow()
    await fiber.dispose()
  })
})
