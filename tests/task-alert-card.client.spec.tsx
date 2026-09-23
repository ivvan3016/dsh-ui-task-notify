// @vitest-environment jsdom
/**
 * Task-alert Plugins row page: the staged boolean form over the entry's
 * configuration form (edit/reset/save/discard, override markers, write
 * acceptance), the notification-permission authorize button, the `summary`
 * one-liner the page asks for, and the controls driven through props.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
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

/** Controllable configuration form standing in for `ctx.configForms.get(ns)`. */
class FakeForm implements ConfigForm<TaskAlertSettings> {
  snapshot: ConfigFormSnapshot<TaskAlertSettings>
  private readonly listeners = new Set<() => void>()

  constructor(over: Partial<ConfigFormSnapshot<TaskAlertSettings>> = {}) {
    this.snapshot = {
      status: 'ready', value: undefined, base: undefined, user: undefined,
      revision: 0, writable: true, mode: 'host', ...over,
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
    const value = Object.fromEntries(
      Object.entries(this.snapshot.value as Record<string, unknown> | undefined ?? {}).filter(([key]) => key !== field),
    )
    this.snapshot = {
      ...this.snapshot,
      user: Object.keys(user).length > 0 ? user : undefined,
      value: Object.keys(value).length > 0 ? value as unknown as TaskAlertSettings : undefined,
    }
    for (const fn of [...this.listeners]) fn()
    return Promise.resolve(true)
  }
}

/** A write the Host refuses: the form publishes nothing and answers false. */
class RejectingForm extends FakeForm {
  override set(): Promise<boolean> { return Promise.resolve(false) }
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

function makeProps(over: Partial<TaskAlertCardState> = {}, view: 'summary' | 'page' = 'page') {
  const state = cardState(over)
  return {
    view,
    t: (key: keyof typeof zh) => zh[key],
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
    const form = new FakeForm({
      value: { ...DEFAULT_TASK_ALERT_SETTINGS, onlyWhenHidden: false },
      user: { onlyWhenHidden: false },
    })
    const permission = makePermission('granted')
    const controller = new TaskAlertCardController(form, permission.readPermission, permission.requestPermission)
    const snapshot = controller.inject().hooks.taskAlertCard.getSnapshot()
    expect(snapshot.available).toBe(true)
    expect(snapshot.writable).toBe(true)
    expect(snapshot.dirty).toBe(false)
    expect(snapshot.permission).toBe('granted')
    expect(snapshot.fields.enabled).toEqual({ checked: true, overridden: false })
    expect(snapshot.fields.onlyWhenHidden).toEqual({ checked: false, overridden: true })
    expect(snapshot.fields.includeSubagents).toEqual({ checked: false, overridden: false })
  })

  it('reports an unserved namespace so the card renders nothing', () => {
    const form = new FakeForm({ status: 'loading' })
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(form, permission.readPermission, permission.requestPermission)
    expect(controller.inject().hooks.taskAlertCard.getSnapshot().available).toBe(false)
  })

  it('reports a read-only document', () => {
    const form = new FakeForm({ writable: false })
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(form, permission.readPermission, permission.requestPermission)
    expect(controller.inject().hooks.taskAlertCard.getSnapshot().writable).toBe(false)
  })

  it('stages edits, writes them on save, and clears the drafts when they land', async () => {
    const form = new FakeForm()
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(form, permission.readPermission, permission.requestPermission)
    const face = controller.inject()
    const store = face.hooks.taskAlertCard
    face.edit('onlyWhenHidden', false)
    expect(store.getSnapshot().dirty).toBe(true)
    expect(store.getSnapshot().fields.onlyWhenHidden).toEqual({ checked: false, overridden: true })
    face.save()
    await vi.waitFor(() => { expect(store.getSnapshot().dirty).toBe(false) })
    expect(form.snapshot.user).toEqual({ onlyWhenHidden: false })
    expect(store.getSnapshot().fields.onlyWhenHidden.overridden).toBe(true)
  })

  it('authorizes and republishes the granted permission', async () => {
    const form = new FakeForm()
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(form, permission.readPermission, permission.requestPermission)
    const face = controller.inject()
    const store = face.hooks.taskAlertCard
    expect(store.getSnapshot().permission).toBe('default')
    face.authorize()
    await vi.waitFor(() => { expect(permission.requestPermission).toHaveBeenCalled() })
    await vi.waitFor(() => { expect(store.getSnapshot().permission).toBe('granted') })
  })

  it('republishes when the permission changed elsewhere', () => {
    const form = new FakeForm()
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(form, permission.readPermission, permission.requestPermission)
    const store = controller.inject().hooks.taskAlertCard
    permission.set('denied')
    void form.set('onlyWhenHidden', false)
    expect(store.getSnapshot().permission).toBe('denied')
  })

  it('stages a reset as a clear that reverts to the composition value', async () => {
    const form = new FakeForm({
      value: { ...DEFAULT_TASK_ALERT_SETTINGS, onlyWhenHidden: false },
      user: { onlyWhenHidden: false },
      base: { onlyWhenHidden: true },
    })
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(form, permission.readPermission, permission.requestPermission)
    const face = controller.inject()
    const store = face.hooks.taskAlertCard
    face.resetField('onlyWhenHidden')
    expect(store.getSnapshot().fields.onlyWhenHidden).toEqual({ checked: true, overridden: false })
    face.save()
    await vi.waitFor(() => { expect(store.getSnapshot().dirty).toBe(false) })
    expect(form.snapshot.user).toBeUndefined()
    expect(store.getSnapshot().fields.onlyWhenHidden.checked).toBe(true)
  })

  it('keeps the drafts and marks failed when the Host rejects a write', async () => {
    const form = new RejectingForm()
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(form, permission.readPermission, permission.requestPermission)
    const face = controller.inject()
    const store = face.hooks.taskAlertCard
    face.edit('onlyWhenHidden', false)
    face.save()
    await vi.waitFor(() => { expect(store.getSnapshot().saving).toBe(false) })
    expect(store.getSnapshot().failed).toBe(true)
    expect(store.getSnapshot().dirty).toBe(true)
    expect(store.getSnapshot().fields.onlyWhenHidden.overridden).toBe(true)
  })

  it('discards staged edits and clears the failure marker', () => {
    const form = new FakeForm()
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(form, permission.readPermission, permission.requestPermission)
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
    const form = new FakeForm()
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(form, permission.readPermission, permission.requestPermission)
    const face = controller.inject()
    const store = face.hooks.taskAlertCard
    face.save()
    await vi.waitFor(() => { expect(store.getSnapshot().saving).toBe(false) })
    expect(form.snapshot.user).toBeUndefined()
  })

  it('republishes when the form changes underneath', () => {
    const form = new FakeForm()
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(form, permission.readPermission, permission.requestPermission)
    const store = controller.inject().hooks.taskAlertCard
    void form.set('onlyWhenHidden', false)
    expect(store.getSnapshot().fields.onlyWhenHidden).toEqual({ checked: false, overridden: true })
  })

  it('previews the schema default when the composition layer has no value', () => {
    const form = new FakeForm({ user: { onlyWhenHidden: false } })
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(form, permission.readPermission, permission.requestPermission)
    const face = controller.inject()
    face.resetField('onlyWhenHidden')
    expect(face.hooks.taskAlertCard.getSnapshot().fields.onlyWhenHidden).toEqual({ checked: true, overridden: false })
  })

  it('skips the unset write when the cleared field has no user entry', async () => {
    const form = new FakeForm()
    const permission = makePermission('default')
    const controller = new TaskAlertCardController(form, permission.readPermission, permission.requestPermission)
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
  it('answers the summary request with the one-liner and no controls', () => {
    const { container, queryByRole } = render(<TaskAlertCard {...makeProps({}, 'summary')} />)
    expect(container.textContent).toBe(zh['card.description'])
    expect(queryByRole('button')).toBeNull()
  })

  it('renders nothing while the namespace is unserved', () => {
    const { container } = render(<TaskAlertCard {...makeProps({ available: false })} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the authorize button and every boolean control', () => {
    render(<TaskAlertCard {...makeProps()} />)
    expect(screen.getByText(zh['field.notify'])).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['notify.authorize'] })).toBeTruthy()
    for (const field of TASK_ALERT_FIELDS) {
      expect(screen.getByLabelText(zh[`field.${field}`])).toBeTruthy()
    }
  })

  it('renders the authorize button per permission state', () => {
    const pending = render(<TaskAlertCard {...makeProps()} />)
    expect((pending.getByRole('button', { name: zh['notify.authorize'] }) as HTMLButtonElement).disabled).toBe(false)

    const granted = render(<TaskAlertCard {...makeProps({ permission: 'granted' })} />)
    expect((granted.getByRole('button', { name: zh['notify.granted'] }) as HTMLButtonElement).disabled).toBe(true)

    const denied = render(<TaskAlertCard {...makeProps({ permission: 'denied' })} />)
    expect((denied.getByRole('button', { name: zh['notify.denied'] }) as HTMLButtonElement).disabled).toBe(true)

    const unsupported = render(<TaskAlertCard {...makeProps({ permission: 'unsupported' })} />)
    expect((unsupported.getByRole('button', { name: zh['notify.unsupported'] }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('requests permission through the authorize action', () => {
    const props = makeProps()
    render(<TaskAlertCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh['notify.authorize'] }))
    expect(props.authorize).toHaveBeenCalled()
  })

  it('stages a checkbox change through the edit action', () => {
    const props = makeProps()
    render(<TaskAlertCard {...props} />)
    fireEvent.click(screen.getByLabelText<HTMLInputElement>(zh['field.onlyWhenHidden']))
    expect(props.edit).toHaveBeenCalledWith('onlyWhenHidden', false)
  })

  it('shows the overridden badge and wires the reset action', () => {
    const props = makeProps({
      fields: { ...cardState().fields, onlyWhenHidden: { checked: false, overridden: true } },
    })
    render(<TaskAlertCard {...props} />)
    expect(screen.getByText(zh['overridden'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['reset'] }))
    expect(props.resetField).toHaveBeenCalledWith('onlyWhenHidden')
  })

  it('renders the read-only notice and disables the controls', () => {
    const props = makeProps({ writable: false })
    render(<TaskAlertCard {...props} />)
    expect(screen.getByText(zh['readOnly'])).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>(zh['field.enabled']).disabled).toBe(true)
  })

  it('wires save and discard and gates them on a dirty form', () => {
    const clean = makeProps()
    render(<TaskAlertCard {...clean} />)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: zh['save'] }).disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: zh['discard'] }).disabled).toBe(true)

    cleanup()
    const dirty = makeProps({ dirty: true })
    render(<TaskAlertCard {...dirty} />)
    const save = screen.getByRole<HTMLButtonElement>('button', { name: zh['save'] })
    const discard = screen.getByRole<HTMLButtonElement>('button', { name: zh['discard'] })
    expect(save.disabled).toBe(false)
    expect(discard.disabled).toBe(false)
    fireEvent.click(save)
    expect(dirty.save).toHaveBeenCalled()
    fireEvent.click(discard)
    expect(dirty.discard).toHaveBeenCalled()
  })

  it('reports a failed save and the saving label', () => {
    const failed = makeProps({ failed: true })
    render(<TaskAlertCard {...failed} />)
    expect(screen.getByText(zh['saveFailed'])).toBeTruthy()

    cleanup()
    const saving = makeProps({ dirty: true, saving: true })
    render(<TaskAlertCard {...saving} />)
    expect(screen.getByRole('button', { name: zh['saving'] })).toBeTruthy()
  })
})
