/**
 * The task-alert card's staged form over the `ui-task-alert` settings
 * namespace. Booleans have no invalid draft, so the model is a leaner cousin
 * of the plugin-configuration CardForm: staged edits, override markers by
 * user-layer presence, reset-as-clear, and one revision-fenced save. The
 * system-notification permission is not a settings field — the card carries
 * the live permission state and an authorize action beside the form.
 */

// Type-only: the settings-namespace scope contract owned by the settings domain.
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { TaskAlertPermission } from './alert.ts'
import {
  DEFAULT_TASK_ALERT_SETTINGS, type TaskAlertSettings,
} from '../task-alert-settings.ts'

/** The boolean fields this card edits, in render order. */
export const TASK_ALERT_FIELDS = ['enabled', 'onlyWhenHidden', 'includeSubagents', 'interactionAlert'] as const

/** One field of the `ui-task-alert` section. */
export type TaskAlertField = typeof TASK_ALERT_FIELDS[number]

/** One boolean control as the card renders it. */
export interface TaskAlertFieldState {
  /** The checked state a save would leave (staged, or the effective value). */
  checked: boolean
  /** Whether a save would leave a user-layer entry for this field. */
  overridden: boolean
}

/** Form state the card renders. */
export interface TaskAlertCardState {
  /** False while the namespace is not served to this client; the card renders nothing. */
  available: boolean
  /** Whether the Host document accepts writes. */
  writable: boolean
  /** Whether the form holds edits that a save would write. */
  dirty: boolean
  /** Whether a save is crossing the wire. */
  saving: boolean
  /** Whether the last save did not land as staged; cleared by the next edit or save. */
  failed: boolean
  /** Browser notification permission driving the authorize button. */
  permission: TaskAlertPermission
  /** One state per field, keyed in render order. */
  fields: Record<TaskAlertField, TaskAlertFieldState>
}

/** The write actions the card's slot entry injects. */
export interface TaskAlertCardActions {
  /** Stage one field's checked state. */
  edit(field: TaskAlertField, checked: boolean): void
  /** Stage a clear, so saving lets the field re-inherit the composition layer. */
  resetField(field: TaskAlertField): void
  /** Write every staged edit, then re-seed from what the Host accepted. */
  save(): void
  /** Drop every staged edit. */
  discard(): void
  /** Ask the browser for notification permission; the snapshot republishes when it settles. */
  authorize(): void
}

/** The registration-side face the card's slot entry injects. */
export interface TaskAlertCardFace extends TaskAlertCardActions {
  hooks: {
    /** Card snapshot bound by the renderer as useTaskAlertCard. */
    taskAlertCard: SnapshotStore<TaskAlertCardState>
  }
}

/**
 * Bridges the `ui-task-alert` scope onto the card's staged form, and the
 * browser notification permission onto the authorize button. The store is
 * created once so the renderer's hook binding keeps one stable source across
 * re-registrations.
 */
export class TaskAlertCardController {
  private readonly staged = new Map<TaskAlertField, boolean | null>()
  private readonly listeners = new Set<() => void>()
  private readonly store: SnapshotStore<TaskAlertCardState>
  private saving = false
  private failed = false

  /**
   * @param scope - the bound settings scope for the `ui-task-alert` namespace.
   * @param readPermission - read the current browser notification permission.
   * @param requestPermission - request browser notification permission (user
   *   gesture context), resolving to the permission after the request settles.
   */
  constructor(
    private readonly scope: SettingsScope<TaskAlertSettings>,
    private readonly readPermission: () => TaskAlertPermission,
    private readonly requestPermission: () => Promise<TaskAlertPermission>,
  ) {
    this.store = createSnapshotStore(this.projection())
    this.listeners.add(() => { this.store.set(this.projection()) })
    scope.subscribe(() => { this.publish() })
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its form actions.
   */
  inject(): TaskAlertCardFace {
    return {
      hooks: { taskAlertCard: this.store },
      edit: (field, checked) => { this.stage(field, checked) },
      resetField: (field) => { this.stage(field, null) },
      save: () => { void this.save() },
      discard: () => { this.discard() },
      authorize: () => { void this.authorize() },
    }
  }

  private async authorize(): Promise<void> {
    await this.requestPermission()
    this.publish()
  }

  private projection(): TaskAlertCardState {
    const snapshot = this.scope.getSnapshot()
    const fields = {} as Record<TaskAlertField, TaskAlertFieldState>
    for (const field of TASK_ALERT_FIELDS) fields[field] = this.field(field)
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      dirty: this.staged.size > 0,
      saving: this.saving,
      failed: this.failed,
      permission: this.readPermission(),
      fields,
    }
  }

  private field(field: TaskAlertField): TaskAlertFieldState {
    const staged = this.staged.get(field)
    if (staged !== undefined) {
      // A staged clear previews the composition value the field reverts to.
      return { checked: staged ?? this.baseChecked(field), overridden: staged !== null }
    }
    return { checked: this.effectiveChecked(field), overridden: this.stored(field) }
  }

  private effectiveChecked(field: TaskAlertField): boolean {
    const value = this.sectionValue(field)
    return value === undefined ? DEFAULT_TASK_ALERT_SETTINGS[field] : value === true
  }

  private async save(): Promise<void> {
    if (this.staged.size === 0 || this.saving) return
    this.saving = true
    this.failed = false
    this.publish()
    let landed = true
    for (const [field, value] of this.staged) {
      if (value === null) {
        if (this.stored(field)) {
          await this.scope.unset(field)
          landed = !this.stored(field) && landed
        }
      } else {
        await this.scope.set(field, value)
        landed = this.userLayer()?.[field] === value && landed
      }
    }
    if (landed) this.staged.clear()
    this.saving = false
    this.failed = !landed
    this.publish()
  }

  private stage(field: TaskAlertField, value: boolean | null): void {
    this.staged.set(field, value)
    this.failed = false
    this.publish()
  }

  private discard(): void {
    if (this.staged.size === 0 && !this.failed) return
    this.staged.clear()
    this.failed = false
    this.publish()
  }

  private publish(): void {
    for (const listener of this.listeners) listener()
  }

  private snapshotOf(): SettingsScopeSnapshot<TaskAlertSettings> {
    return this.scope.getSnapshot()
  }

  private sectionValue(field: TaskAlertField): unknown {
    return this.snapshotOf().value?.[field]
  }

  private baseChecked(field: TaskAlertField): boolean {
    const base = this.snapshotOf().base as Partial<TaskAlertSettings> | undefined
    const composed = base?.[field]
    return composed === undefined ? DEFAULT_TASK_ALERT_SETTINGS[field] : composed
  }

  private userLayer(): Partial<TaskAlertSettings> | undefined {
    return this.snapshotOf().user as Partial<TaskAlertSettings> | undefined
  }

  private stored(field: TaskAlertField): boolean {
    const user = this.userLayer()
    return user !== undefined && Object.hasOwn(user, field)
  }
}
