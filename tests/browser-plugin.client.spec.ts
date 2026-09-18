// @vitest-environment jsdom
/**
 * ui-task-alert browser half: idle-edge detection over a driven sessions
 * list, the Windows-notification side effect, live settings gating, and
 * HMR-safe teardown.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { createIdleWatcher, type PendingInteractionView } from '../src/client/watcher.ts'
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
      } as SessionSummary
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

/** Controllable pending-interaction observable standing in for `ctx.uiSession`. */
class FakeInteractions {
  private state: ReadonlyMap<SessionId, PendingInteractionView> = new Map()
  private readonly listeners = new Set<() => void>()

  getSnapshot(): ReadonlyMap<SessionId, PendingInteractionView> { return this.state }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  /** Replace the waiting-set wholesale and notify. */
  set(entries: readonly { id: string; kind: string }[]): void {
    this.state = new Map(entries.map(entry => [
      entry.id as SessionId,
      { kind: entry.kind } satisfies PendingInteractionView,
    ]))
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

  /** The card never mutates path-addressed; the batch write path is a no-op stub. */
  mutate(): Promise<void> { return Promise.resolve() }
}

/** Hide/shown state behind `document.hidden`. */
function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
}

interface Bench {
  ctx: Context
  fiber: ReturnType<Context['plugin']>
  list: FakeList
  interactions: FakeInteractions
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
  const interactions = new FakeInteractions()
  const scope = new FakeScope(value)
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      // The locale plugin owns its General-section preference row.
      'settings.general.item': { kind: 'list', scope: 'root' },
      'settings.plugin.item': { kind: 'keyed', scope: 'root' },
    },
  } as never, () => null)
  ctx.provide('sessions', { list } as never)
  ctx.provide('uiSession', { pendingInteractions: interactions } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('settingsScope', {
    bind: (spec: { namespace: string }) =>
      spec.namespace === TASK_ALERT_SETTINGS_NAMESPACE ? scope : stubSettingsScope().scope,
  } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.locale.setLocale('zh')
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber, list, interactions, scope }
}

beforeEach(() => {
  setHidden(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ui-task-alert browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['sessions', 'uiSession', 'settingsScope', 'locale', 'slots'])
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
    const interactions = new FakeInteractions()
    const onIdle = vi.fn()
    const onInteraction = vi.fn()
    const watcher = createIdleWatcher(list, interactions, () => false, onIdle, () => true, onInteraction)
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
    const interactions = new FakeInteractions()
    const onIdle = vi.fn()
    const onInteraction = vi.fn()
    let includeSubagents = false
    const watcher = createIdleWatcher(list, interactions, () => includeSubagents, onIdle, () => true, onInteraction)
    list.set([{ id: 'child', running: true, origin: 'subagent' }])
    list.set([{ id: 'child', running: false, origin: 'subagent' }])
    expect(onIdle).not.toHaveBeenCalled()
    includeSubagents = true
    list.set([{ id: 'child', running: true, origin: 'subagent' }])
    list.set([{ id: 'child', running: false, origin: 'subagent' }])
    expect(onIdle).toHaveBeenCalledTimes(1)
    watcher.dispose()
  })

  it('fires once per pending-interaction kind, keyed by kind, and prunes on removal', () => {
    const list = new FakeList()
    const interactions = new FakeInteractions()
    const onIdle = vi.fn()
    const onInteraction = vi.fn()
    const watcher = createIdleWatcher(list, interactions, () => false, onIdle, () => true, onInteraction)
    list.set([{ id: 'a' }])
    interactions.set([{ id: 'a', kind: 'question' }])
    expect(onInteraction).toHaveBeenCalledTimes(1)
    expect(onInteraction).toHaveBeenCalledWith('a', 'question', 'a')
    // A repeated publication of the same kind must not re-alert.
    interactions.set([{ id: 'a', kind: 'question' }])
    expect(onInteraction).toHaveBeenCalledTimes(1)
    // A different kind is a fresh edge.
    interactions.set([{ id: 'a', kind: 'approval' }])
    expect(onInteraction).toHaveBeenCalledTimes(2)
    expect(onInteraction).toHaveBeenLastCalledWith('a', 'approval', 'a')
    // Settling clears the ledger so a later re-ask re-alerts.
    interactions.set([])
    interactions.set([{ id: 'a', kind: 'question' }])
    expect(onInteraction).toHaveBeenCalledTimes(3)
    watcher.dispose()
  })

  it('ignores interaction kinds this plugin ships no copy for', () => {
    const list = new FakeList()
    const interactions = new FakeInteractions()
    const onIdle = vi.fn()
    const onInteraction = vi.fn()
    const watcher = createIdleWatcher(list, interactions, () => false, onIdle, () => true, onInteraction)
    list.set([{ id: 'a' }])
    interactions.set([{ id: 'a', kind: 'credential' }])
    expect(onInteraction).not.toHaveBeenCalled()
    // An unknown kind does not mask the alertable one that follows it.
    interactions.set([{ id: 'a', kind: 'approval' }])
    expect(onInteraction).toHaveBeenCalledTimes(1)
    watcher.dispose()
  })

  it('skips interaction edges when the preference is off', () => {
    const list = new FakeList()
    const interactions = new FakeInteractions()
    const onIdle = vi.fn()
    const onInteraction = vi.fn()
    let interactionAlert = false
    const watcher = createIdleWatcher(list, interactions, () => false, onIdle, () => interactionAlert, onInteraction)
    list.set([{ id: 'a' }])
    interactions.set([{ id: 'a', kind: 'approval' }])
    expect(onInteraction).not.toHaveBeenCalled()
    interactionAlert = true
    interactions.set([{ id: 'a', kind: 'approval' }])
    expect(onInteraction).toHaveBeenCalledTimes(1)
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

  it('shows a kind-specific interaction notification, gated by the interaction preference', () => {
    let settings = { ...DEFAULT_TASK_ALERT_SETTINGS }
    const alert = createTaskAlert(
      key => key === 'interaction.approval' ? 'approval-copy' : String(key),
      () => settings,
    )
    const { shown } = stubNotification()
    setHidden(true)
    alert.notifyInteraction('approval', 's1')
    expect(shown).toHaveLength(1)
    expect(shown[0]!.title).toBe('approval-copy')
    expect(shown[0]!.options.body).toBe('s1')
    // The interaction preference off suppresses the notification.
    settings = { ...settings, interactionAlert: false }
    alert.notifyInteraction('question', 's2')
    expect(shown).toHaveLength(1)
    // The master switch off suppresses it too.
    settings = { ...settings, interactionAlert: true, enabled: false }
    alert.notifyInteraction('question', 's2')
    expect(shown).toHaveLength(1)
  })

  it('stays silent for interaction edges while the page is visible', () => {
    const alert = createTaskAlert(
      key => String(key),
      () => DEFAULT_TASK_ALERT_SETTINGS,
    )
    const { shown } = stubNotification()
    setHidden(false)
    alert.notifyInteraction('plan-review', 's1')
    expect(shown).toHaveLength(0)
  })
})

describe('ui-task-alert node half', () => {
  it('contributes no host behavior beyond the settings registration', () => {
    expect(() => { applyNode(new Context()) }).not.toThrow()
  })
})
