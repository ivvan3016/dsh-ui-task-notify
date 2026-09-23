// @vitest-environment jsdom
/**
 * ui-task-alert browser half: idle-edge detection over a driven sessions
 * list, the waiting-on-the-user edge over the session UI adapter's status map,
 * the Windows-notification side effect, live settings gating, and HMR-safe
 * teardown.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { createIdleWatcher } from '../src/client/watcher.ts'
import { createTaskAlert } from '../src/client/alert.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import {
  DEFAULT_TASK_ALERT_SETTINGS, TASK_ALERT_ROW_CONFIG_KEY, TASK_ALERT_SETTINGS_NAMESPACE,
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
  state: SessionListState = { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }
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

/**
 * Controllable session-status observable standing in for
 * `ctx.uiSession.sessionStatus`; the waiting side of the map is what the
 * watcher reads.
 */
class FakeStatus {
  private state: SessionStatusSnapshot = new Map()
  private readonly listeners = new Set<() => void>()

  getSnapshot(): SessionStatusSnapshot { return this.state }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  /** Replace the waiting set wholesale, keeping list rows out of it. */
  setWaiting(entries: readonly { id: string; kind: string }[]): void {
    const next = new Map<SessionId, SessionStatusSnapshot extends ReadonlyMap<SessionId, infer S> ? S : never>()
    for (const entry of entries) {
      next.set(entry.id as SessionId, {
        running: undefined,
        pendingInteraction: { key: entry.id, kind: entry.kind, sessionId: entry.id as SessionId },
        completionUnread: false,
      })
    }
    this.state = next
    for (const fn of [...this.listeners]) fn()
  }
}

/** Controllable configuration form standing in for `ctx.configForms.get(ns)`. */
class FakeForm implements ConfigForm<TaskAlertSettings> {
  snapshot: ConfigFormSnapshot<TaskAlertSettings>
  private readonly listeners = new Set<() => void>()

  constructor(value?: TaskAlertSettings) {
    this.snapshot = {
      status: 'ready', value, base: undefined, user: undefined,
      revision: 0, writable: true, mode: 'host',
    }
  }

  getSnapshot(): ConfigFormSnapshot<TaskAlertSettings> { return this.snapshot }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  mutate(): Promise<boolean> { return Promise.resolve(true) }

  set(field: string, value: unknown): Promise<boolean> {
    const user = { ...(this.snapshot.user as Record<string, unknown> | undefined ?? {}) }
    user[field] = value
    this.snapshot = {
      ...this.snapshot,
      user,
      value: { ...(this.snapshot.value ?? {}), [field]: value } as unknown as TaskAlertSettings,
    }
    for (const fn of [...this.listeners]) fn()
    return Promise.resolve(true)
  }

  unset(field: string): Promise<boolean> {
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
    return Promise.resolve(true)
  }
}

/** Minimal locale service standing in for `ctx.locale` (zh dictionaries). */
function fakeLocale(): Record<string, unknown> {
  const dictionaries = new Map<string, Record<string, string>>()
  return {
    register(ns: string, dicts: { zh: Record<string, string> }): () => void {
      dictionaries.set(ns, dicts.zh)
      return () => { dictionaries.delete(ns) }
    },
    bind: (ns: string) => (key: string) => dictionaries.get(ns)?.[key] ?? key,
    getSnapshot: () => ({ revision: 0 }),
    subscribe: () => () => {},
    resolveText: (text: string) => text,
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
  status: FakeStatus
  form: FakeForm
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

/** Boot the browser half over stubbed services and the real renderer registry. */
async function bench(value?: TaskAlertSettings): Promise<Bench> {
  const ctx = new Context()
  const list = new FakeList()
  const status = new FakeStatus()
  const form = new FakeForm(value)
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      // The Plugins page owns the row page this card occupies.
      'plugins.row.config': { kind: 'keyed', scope: 'root' },
    },
  } as never, () => null)
  ctx.provide('sessions', { list } as never)
  ctx.provide('uiSession', { sessionStatus: status } as never)
  ctx.provide('locale', fakeLocale() as never)
  ctx.provide('configForms', {
    get: (namespace: string) => {
      expect(namespace).toBe(TASK_ALERT_SETTINGS_NAMESPACE)
      return form
    },
    // The real service registers the contribution while the Host serves the
    // namespace and disposes it when the namespace or the caller goes away.
    whileServed: (namespaces: readonly string[], register: (served: ReadonlySet<string>) => () => void) =>
      register(new Set(namespaces)),
  } as never)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber, list, status, form }
}

/** The card's registered slot entry, or undefined before it lands. */
function cardEntry(ctx: Context) {
  return ctx.slots.entries('plugins.row.config').find(candidate => candidate.options.key === TASK_ALERT_ROW_CONFIG_KEY)
}

beforeEach(() => {
  setHidden(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ui-task-alert browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['sessions', 'uiSession', 'configForms', 'locale', 'slots'])
  })

  it('registers the Plugins row card under the Host entry and releases it with the fiber', async () => {
    const { ctx, fiber } = await bench()
    const entry = cardEntry(ctx)
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
    expect(cardEntry(ctx)).toBeUndefined()
  })

  it('honors the enabled master switch live', async () => {
    const { list, form } = await bench(DEFAULT_TASK_ALERT_SETTINGS)
    const { shown } = stubNotification()
    setHidden(true)
    await form.set('enabled', false)
    list.set([{ id: 's1', running: true }])
    list.set([{ id: 's1', running: false }])
    expect(shown).toHaveLength(0)

    await form.set('enabled', true)
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
    const { list, form } = await bench(DEFAULT_TASK_ALERT_SETTINGS)
    const { shown } = stubNotification()
    setHidden(true)
    list.set([{ id: 's1', running: true, origin: 'subagent' }])
    list.set([{ id: 's1', running: false, origin: 'subagent' }])
    expect(shown).toHaveLength(0)

    await form.set('includeSubagents', true)
    list.set([{ id: 's1', running: true, origin: 'subagent' }])
    list.set([{ id: 's1', running: false, origin: 'subagent' }])
    expect(shown).toHaveLength(1)
  })

  it('alerts once when a session starts waiting on the user', async () => {
    const { list, status } = await bench(DEFAULT_TASK_ALERT_SETTINGS)
    const { shown } = stubNotification()
    setHidden(true)
    list.set([{ id: 's1' }])
    status.setWaiting([{ id: 's1', kind: 'approval' }])
    expect(shown).toEqual([{ title: '有请求等待审批', options: { body: 's1', tag: 'dsh-task-alert' } }])
    // A replacement request of the same kind does not re-alert.
    status.setWaiting([{ id: 's1', kind: 'approval' }])
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
    await fiber.dispose()
    expect(translate('title.done')).not.toBe(zh['title.done'])
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})

describe('idle watcher', () => {
  it('fires on running→idle edges, skips byId gaps, and prunes removed sessions', () => {
    const list = new FakeList()
    const status = new FakeStatus()
    const onIdle = vi.fn()
    const onInteraction = vi.fn()
    const watcher = createIdleWatcher(list, status, () => false, onIdle, () => true, onInteraction)
    list.rawState({ ids: ['missing' as SessionId], byId: {}, phase: 'ready', projectionsBySession: {} })
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
    const status = new FakeStatus()
    const onIdle = vi.fn()
    const onInteraction = vi.fn()
    let includeSubagents = false
    const watcher = createIdleWatcher(list, status, () => includeSubagents, onIdle, () => true, onInteraction)
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
    const status = new FakeStatus()
    const onIdle = vi.fn()
    const onInteraction = vi.fn()
    const watcher = createIdleWatcher(list, status, () => false, onIdle, () => true, onInteraction)
    list.set([{ id: 'a' }])
    status.setWaiting([{ id: 'a', kind: 'question' }])
    expect(onInteraction).toHaveBeenCalledTimes(1)
    expect(onInteraction).toHaveBeenCalledWith('a', 'question', 'a')
    // A repeated publication of the same kind must not re-alert.
    status.setWaiting([{ id: 'a', kind: 'question' }])
    expect(onInteraction).toHaveBeenCalledTimes(1)
    // A different kind is a fresh edge.
    status.setWaiting([{ id: 'a', kind: 'approval' }])
    expect(onInteraction).toHaveBeenCalledTimes(2)
    expect(onInteraction).toHaveBeenLastCalledWith('a', 'approval', 'a')
    // Settling clears the ledger so a later re-ask re-alerts.
    status.setWaiting([])
    status.setWaiting([{ id: 'a', kind: 'question' }])
    expect(onInteraction).toHaveBeenCalledTimes(3)
    watcher.dispose()
  })

  it('ignores interaction kinds this plugin ships no copy for', () => {
    const list = new FakeList()
    const status = new FakeStatus()
    const onIdle = vi.fn()
    const onInteraction = vi.fn()
    const watcher = createIdleWatcher(list, status, () => false, onIdle, () => true, onInteraction)
    list.set([{ id: 'a' }])
    status.setWaiting([{ id: 'a', kind: 'credential' }])
    expect(onInteraction).not.toHaveBeenCalled()
    // An unknown kind does not mask the alertable one that follows it.
    status.setWaiting([{ id: 'a', kind: 'approval' }])
    expect(onInteraction).toHaveBeenCalledTimes(1)
    watcher.dispose()
  })

  it('skips interaction edges when the preference is off', () => {
    const list = new FakeList()
    const status = new FakeStatus()
    const onIdle = vi.fn()
    const onInteraction = vi.fn()
    let interactionAlert = false
    const watcher = createIdleWatcher(list, status, () => false, onIdle, () => interactionAlert, onInteraction)
    list.set([{ id: 'a' }])
    status.setWaiting([{ id: 'a', kind: 'approval' }])
    expect(onInteraction).not.toHaveBeenCalled()
    interactionAlert = true
    status.setWaiting([{ id: 'a', kind: 'approval' }])
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
  it('mounts without a settings service and waits for it', async () => {
    const ctx = new Context()
    await ctx.plugin({ apply: applyNode }).await()
    expect(ctx.get('settings')).toBeUndefined()
  })
})
