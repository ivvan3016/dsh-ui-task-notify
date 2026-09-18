// @vitest-environment jsdom
/**
 * Task-alert Plugins card: the staged boolean form over the ui-task-alert
 * scope (edit/reset/save/discard, override markers, revision-fenced writes),
 * the notification-permission authorize button, and the component's chrome
 * and controls, driven through props.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { TaskAlertPermission } from '../src/client/alert.ts'
import {
  TASK_ALERT_FIELDS, TaskAlertCardController,
  type TaskAlertCardState, type TaskAlertFieldState,
} from '../src/client/task-alert-form.ts'
import { TaskAlertCard, type TaskAlertCardProps } from '../src/client/TaskAlertCard.tsx'
import { zh } from '../src/client/locales.ts'
import {
  DEFAULT_TASK_ALERT_SETTINGS, type TaskAlertSettings,
} from '../src/task-alert-settings.ts'

/** Controllable settings scope standing in for the ui-settings bound scope. */
class FakeScope {
  snapshot: {
    status: 'loading' | 'ready' | 'unavailable'
    value: TaskAlertSettings | undefined
    base: unknown
    user: unknown
    revision: number | undefined
    writable: boolean
    mode: 'host' | 'memory'
  }
  private readonly listeners = new Set<() => void>()

  constructor(over: Partial<FakeScope['snapshot']> = {}) {
    this.snapshot = {
      status: 'ready', value: undefined, base: undefined, user: undefined,
      revision: 0, writable: true, mode: 'host', ...over,
    }
  }

  getSnapshot(): FakeScope['snapshot'] { return this.snapshot }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  set(field: string, value: unknown): Promise<void> {
    const user = { ...(this.snapshot.user as Record<string, unknown> | undefined ?? {}) }
    user[field] = value
    this.snapshot = { ...this.snapshot, user, value: { ...(this.snapshot.value ?? {}), [field]: value } as unknown as TaskAlertSettings }
    for (const fn of [...this.listeners]) fn()
    return Promise.resolve()
  }

  unset(field: string): Promise<void> {
    const user = Object.fromEntries(
      Object.entries(this.snapshot.user as Record<string, unknown> | undefined ?? {}).filter(([key]) => key !== field),
    )
    const value = Object.fromEntries(
      Object.entries(this.snapshot.value as Record<string, unknown> | undefined ?? {}).filter(([key]) => key !== field),
    )
    this.snapshot = {
      ...this.snapshot,
      user: Object.keys(user).length > 0 ? user : undefined,
      value: Object.keys(value).length > 0 ? value as unknown as TaskAlertSettings : undefined,
    }
    for (const fn of [...this.listeners]) fn()
    return Promise.resolve()
  }

  /** The card never mutates path-addressed; the batch write path is a no-op stub. */
  mutate(): Promise<void> { return Promise.resolve() }
}

function field(over: Partial<TaskAlertFieldState> = {}): TaskAlertFieldState {
  return { checked: true, overridden: false, ...over }
}

function cardState(over: Partial<TaskAlertCardState> = {}): TaskAlertCardState {
  return {
    available: true,
    writable: true,
    dirty: false,
    saving: false,
    failed: false,
    permission: 'default',
    fields: {
      enabled: field(),
      onlyWhenHidden: field(),
      includeSubagents: field({ checked: false }),
      interactionAlert: field(),
    },
    ...over,
  }
}

function makeProps(over: Partial<TaskAlertCardState> = {}) {
  const state = cardState(over)
  return {
    t: makeTranslate(zh, commonZh),
    useTaskAlertCard: (selector: (snapshot: TaskAlertCardState) => unknown) => selector(state),
    edit: vi.fn(),
    resetField: vi.fn(),
    save: vi.fn(),
    discard: vi.fn(),
    authorize: vi.fn(),
  } as unknown as TaskAlertCardProps
}

/** Controllable permission double: readPermission/requestPermission over one mutable state. */
function makePermission(initial: TaskAlertPermission) {
  let permission: TaskAlertPermission = initial
  const request = vi.fn(async () => {
    permission = 'granted'
    return permission
  })
  return {
    readPermission: () => permission,
    requestPermission: request,
    set: (next: TaskAlertPermission) => { permission = next },
  }
}

afterEach(cleanup)

describe('TaskAlertCardController', () => {
  it('projects the effective values, override markers, and the permission', () => {
    const scope = new FakeScope({
      value: { ...DEFAULT_TASK_ALERT_SETTINGS, onlyWhenHidden: false },
      user: { onlyWhenHidden: false },
    })
    const permission = makePermission('granted')
    const controller = new TaskAlertCardController(scope, permission.readPermission, permission.requestPermission)
    const store = controller.inject().hooks.taskAlertCard
    const snapshot = store.getSnapshot()
    expect(snapshot.available).toBe(true)
    expect(snapshot.writable).toBe(true)
    expect(snapshot.dirty).toBe(false)
    expect(snapshot.permission).toBe('granted')
    expect(snapshot.fields.enabled).toEqual({ checked: true, overridden: false })
    expect(snapshot.fields.onlyWhenHidden).toEqual({ checked: false, overridden: true })
    expect(snapshot.fields.includeSubagents).toEqual({ checked: false, overridden: false })
  })

  it('reports an unavailable namespace so the card renders nothing', () => {
    const scope = new FakeScope({ status: 'loading' })
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(scope, permission.readPermission, permission.requestPermission)
    expect(controller.inject().hooks.taskAlertCard.getSnapshot().available).toBe(false)
  })

  it('reports a read-only document', () => {
    const scope = new FakeScope({ writable: false })
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(scope, permission.readPermission, permission.requestPermission)
    expect(controller.inject().hooks.taskAlertCard.getSnapshot().writable).toBe(false)
  })

  it('stages edits, writes them on save, and clears the drafts when they land', async () => {
    const scope = new FakeScope()
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(scope, permission.readPermission, permission.requestPermission)
    const face = controller.inject()
    const store = face.hooks.taskAlertCard
    face.edit('onlyWhenHidden', false)
    expect(store.getSnapshot().dirty).toBe(true)
    expect(store.getSnapshot().fields.onlyWhenHidden).toEqual({ checked: false, overridden: true })
    face.save()
    await vi.waitFor(() => { expect(store.getSnapshot().dirty).toBe(false) })
    expect(scope.snapshot.user).toEqual({ onlyWhenHidden: false })
    expect(store.getSnapshot().fields.onlyWhenHidden.overridden).toBe(true)
  })

  it('authorizes and republishes the granted permission', async () => {
    const scope = new FakeScope()
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(scope, permission.readPermission, permission.requestPermission)
    const face = controller.inject()
    const store = face.hooks.taskAlertCard
    expect(store.getSnapshot().permission).toBe('default')
    face.authorize()
    await vi.waitFor(() => { expect(permission.requestPermission).toHaveBeenCalled() })
    await vi.waitFor(() => { expect(store.getSnapshot().permission).toBe('granted') })
  })

  it('republishes when the permission changed elsewhere', () => {
    const scope = new FakeScope()
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(scope, permission.readPermission, permission.requestPermission)
    const store = controller.inject().hooks.taskAlertCard
    permission.set('denied')
    void scope.set('onlyWhenHidden', false)
    expect(store.getSnapshot().permission).toBe('denied')
  })

  it('stages a reset as a clear that reverts to the composition value', async () => {
    const scope = new FakeScope({
      value: { ...DEFAULT_TASK_ALERT_SETTINGS, onlyWhenHidden: false },
      user: { onlyWhenHidden: false },
      base: { onlyWhenHidden: true },
    })
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(scope, permission.readPermission, permission.requestPermission)
    const face = controller.inject()
    const store = face.hooks.taskAlertCard
    face.resetField('onlyWhenHidden')
    expect(store.getSnapshot().fields.onlyWhenHidden).toEqual({ checked: true, overridden: false })
    face.save()
    await vi.waitFor(() => { expect(store.getSnapshot().dirty).toBe(false) })
    expect(scope.snapshot.user).toBeUndefined()
    expect(store.getSnapshot().fields.onlyWhenHidden.checked).toBe(true)
  })

  it('keeps the drafts and marks failed when the Host rejects a write', async () => {
    const scope = new FakeScope()
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(scope, permission.readPermission, permission.requestPermission)
    const face = controller.inject()
    const store = face.hooks.taskAlertCard
    const originalSet = scope.set.bind(scope)
    scope.set = () => Promise.resolve()
    face.edit('onlyWhenHidden', false)
    face.save()
    await vi.waitFor(() => { expect(store.getSnapshot().saving).toBe(false) })
    expect(store.getSnapshot().failed).toBe(true)
    expect(store.getSnapshot().dirty).toBe(true)
    expect(store.getSnapshot().fields.onlyWhenHidden.overridden).toBe(true)
    scope.set = originalSet
    face.save()
    await vi.waitFor(() => { expect(store.getSnapshot().failed).toBe(false) })
  })

  it('discards staged edits and clears the failure marker', () => {
    const scope = new FakeScope()
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(scope, permission.readPermission, permission.requestPermission)
    const face = controller.inject()
    const store = face.hooks.taskAlertCard
    face.edit('enabled', false)
    expect(store.getSnapshot().dirty).toBe(true)
    face.discard()
    expect(store.getSnapshot().dirty).toBe(false)
    expect(store.getSnapshot().fields.enabled.checked).toBe(true)
    face.discard()
    expect(store.getSnapshot().dirty).toBe(false)
  })

  it('ignores a save with nothing staged', async () => {
    const scope = new FakeScope()
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(scope, permission.readPermission, permission.requestPermission)
    const face = controller.inject()
    const store = face.hooks.taskAlertCard
    face.save()
    await vi.waitFor(() => { expect(store.getSnapshot().saving).toBe(false) })
    expect(scope.snapshot.user).toBeUndefined()
  })

  it('republishes when the scope changes underneath', () => {
    const scope = new FakeScope()
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(scope, permission.readPermission, permission.requestPermission)
    const store = controller.inject().hooks.taskAlertCard
    void scope.set('onlyWhenHidden', false)
    expect(store.getSnapshot().fields.onlyWhenHidden).toEqual({ checked: false, overridden: true })
  })

  it('previews the schema default when the composition layer has no value', () => {
    const scope = new FakeScope({ user: { onlyWhenHidden: false } })
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(scope, permission.readPermission, permission.requestPermission)
    const face = controller.inject()
    face.resetField('onlyWhenHidden')
    expect(face.hooks.taskAlertCard.getSnapshot().fields.onlyWhenHidden).toEqual({ checked: true, overridden: false })
  })

  it('skips the unset write when the cleared field has no user entry', async () => {
    const scope = new FakeScope()
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(scope, permission.readPermission, permission.requestPermission)
    const face = controller.inject()
    const store = face.hooks.taskAlertCard
    face.resetField('onlyWhenHidden')
    face.save()
    await vi.waitFor(() => { expect(store.getSnapshot().dirty).toBe(false) })
    expect(permission.requestPermission).not.toHaveBeenCalled()
    expect(store.getSnapshot().failed).toBe(false)
  })
})

describe('TaskAlertCard', () => {
  it('renders nothing while the namespace is unavailable', () => {
    const { container } = render(<TaskAlertCard {...makeProps({ available: false })} />)
    expect(container.firstChild).toBeNull()
  })

  it('discloses the authorize button and the boolean controls from the header', () => {
    const props = makeProps()
    render(<TaskAlertCard {...props} />)
    expect(screen.getByRole('button', { name: '展开设置: 任务完成提醒' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '展开设置: 任务完成提醒' }))
    expect(screen.getByText('系统通知')).toBeTruthy()
    for (const field of TASK_ALERT_FIELDS) {
      expect(screen.getByLabelText(zh[`field.${field}`])).toBeTruthy()
    }
    expect(screen.queryByText('未保存')).toBeNull()
    const dirty = makeProps({ dirty: true })
    const { container } = render(<TaskAlertCard {...dirty} />)
    expect(container.textContent).toContain('未保存')
  })

  it('renders the authorize button per permission state', () => {
    const pending = render(<TaskAlertCard {...makeProps()} />)
    fireEvent.click(pending.getByRole('button', { name: '展开设置: 任务完成提醒' }))
    expect((pending.getByRole('button', { name: '授权' }) as HTMLButtonElement).disabled).toBe(false)

    const granted = render(<TaskAlertCard {...makeProps({ permission: 'granted' })} />)
    fireEvent.click(granted.getByRole('button', { name: '展开设置: 任务完成提醒' }))
    expect((granted.getByRole('button', { name: '已授权' }) as HTMLButtonElement).disabled).toBe(true)

    const denied = render(<TaskAlertCard {...makeProps({ permission: 'denied' })} />)
    fireEvent.click(denied.getByRole('button', { name: '展开设置: 任务完成提醒' }))
    expect((denied.getByRole('button', { name: '已拒绝' }) as HTMLButtonElement).disabled).toBe(true)

    const unsupported = render(<TaskAlertCard {...makeProps({ permission: 'unsupported' })} />)
    fireEvent.click(unsupported.getByRole('button', { name: '展开设置: 任务完成提醒' }))
    expect((unsupported.getByRole('button', { name: '不支持' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('requests permission through the authorize action', () => {
    const props = makeProps()
    render(<TaskAlertCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '展开设置: 任务完成提醒' }))
    fireEvent.click(screen.getByRole('button', { name: '授权' }))
    expect(props.authorize).toHaveBeenCalled()
  })

  it('stages a checkbox change through the edit action', () => {
    const props = makeProps()
    render(<TaskAlertCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '展开设置: 任务完成提醒' }))
    const checkbox = screen.getByLabelText<HTMLInputElement>(zh['field.onlyWhenHidden'])
    fireEvent.click(checkbox)
    expect(props.edit).toHaveBeenCalledWith('onlyWhenHidden', false)
  })

  it('shows the overridden badge and wires the reset action', () => {
    const props = makeProps({
      fields: { ...cardState().fields, onlyWhenHidden: { checked: false, overridden: true } },
    })
    render(<TaskAlertCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '展开设置: 任务完成提醒' }))
    expect(screen.getByText('已覆盖')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '恢复默认' }))
    expect(props.resetField).toHaveBeenCalledWith('onlyWhenHidden')
  })

  it('renders the read-only notice and disables the controls', () => {
    const props = makeProps({ writable: false })
    render(<TaskAlertCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '展开设置: 任务完成提醒' }))
    expect(screen.getByText('本部署的设置为只读。')).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>(zh['field.enabled']).disabled).toBe(true)
  })

  it('wires save and discard and gates them on a dirty form', () => {
    const props = makeProps()
    render(<TaskAlertCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '展开设置: 任务完成提醒' }))
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '保存' }).disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '放弃修改' }).disabled).toBe(true)

    const dirty = makeProps({ dirty: true })
    const { container } = render(<TaskAlertCard {...dirty} />)
    fireEvent.click(container.querySelector('[aria-expanded]') as HTMLElement)
    const save = screen.getAllByRole('button', { name: '保存' })[1] as HTMLButtonElement
    const discard = screen.getAllByRole('button', { name: '放弃修改' })[1] as HTMLButtonElement
    expect(save.disabled).toBe(false)
    expect(discard.disabled).toBe(false)
    fireEvent.click(save)
    expect(dirty.save).toHaveBeenCalled()
    fireEvent.click(discard)
    expect(dirty.discard).toHaveBeenCalled()
  })

  it('reports a failed save and the saving label', () => {
    const props = makeProps({ failed: true })
    render(<TaskAlertCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '展开设置: 任务完成提醒' }))
    expect(screen.getByText('本部署没有接受这些值，已保留供你修改。')).toBeTruthy()

    const saving = makeProps({ dirty: true, saving: true })
    const { container } = render(<TaskAlertCard {...saving} />)
    fireEvent.click(container.querySelector('[aria-expanded]') as HTMLElement)
    expect(screen.getAllByText('保存中…').length).toBeGreaterThan(0)
  })
})
