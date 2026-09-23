/** The task-alert configuration on the Plugins page: the row's one-liner or its form. */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the plugins.row.config SlotMap merge declared by the Plugins page.
// Cross-plugin collaboration goes through the slot system, never a value import
// (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { TASK_ALERT_FIELDS, type TaskAlertCardFace, type TaskAlertField } from './task-alert-form.ts'
import type { TaskAlertKey } from './locales.ts'
import css from './TaskAlertCard.module.css'

/** Props the renderer binds for the task-alert row page. */
export type TaskAlertCardProps =
  PropsRuntime<'plugins.row.config'>
  & PropsLocale<'settings.taskAlert'>
  & InjectFace<TaskAlertCardFace>

/** Copy and actions one boolean control needs. */
interface BooleanFieldProps {
  field: TaskAlertField
  t: (key: TaskAlertKey) => string
  checked: boolean
  overridden: boolean
  disabled: boolean
  onEdit(checked: boolean): void
  onReset(): void
}

/**
 * Render the task-alert row's configuration as the Plugins page asks for it:
 * the one-liner for `summary`, the form with its own save control for `page`.
 * The page owns the row's head, so the form is the whole body.
 * @param props - the view asked for, locale copy, the card snapshot, and its form actions.
 * @returns the one-liner, or nothing when the namespace is unavailable.
 */
export function TaskAlertCard(props: TaskAlertCardProps) {
  const { t } = props
  const state = props.useTaskAlertCard(snapshot => snapshot)
  if (props.view === 'summary') return t('card.description')
  if (!state.available) return null
  const blocked = !state.dirty || state.saving
  return (
    <div className={css.body}>
      {!state.writable ? <p className={css.readOnly} role="status">{t('readOnly')}</p> : null}
      <div className={css.field}>
        <div className={css.head}>
          <label className={css.label} htmlFor="task-alert-notify">{t('field.notify')}</label>
          <button
            type="button"
            className={css.authorize}
            disabled={state.permission !== 'default'}
            onClick={props.authorize}
          >
            {t(state.permission === 'granted'
              ? 'notify.granted'
              : state.permission === 'denied'
                ? 'notify.denied'
                : state.permission === 'unsupported'
                  ? 'notify.unsupported'
                  : 'notify.authorize')}
          </button>
        </div>
        <p className={css.hint}>{t('field.notify.hint')}</p>
      </div>
      {TASK_ALERT_FIELDS.map(field => (
        <BooleanField
          key={field}
          field={field}
          t={t}
          checked={state.fields[field].checked}
          overridden={state.fields[field].overridden}
          disabled={!state.writable}
          onEdit={(checked) => { props.edit(field, checked) }}
          onReset={() => { props.resetField(field) }}
        />
      ))}
      <div className={css.footer}>
        {state.failed ? <p className={css.failed} role="status">{t('saveFailed')}</p> : null}
        <button
          type="button"
          className={css.discard}
          disabled={!state.dirty || state.saving}
          onClick={props.discard}
        >
          {t('discard')}
        </button>
        <button
          type="button"
          className={css.save}
          disabled={blocked}
          onClick={props.save}
        >
          {t(state.saving ? 'saving' : 'save')}
        </button>
      </div>
    </div>
  )
}

/**
 * One boolean control: a labelled checkbox with the overridden badge and its
 * reset, plus a one-line hint. Nothing here writes — the card's save is the
 * single point where a draft becomes a document mutation.
 * @param props - the field's copy, its checked state, and the edit actions.
 * @returns the labelled control.
 */
function BooleanField(props: BooleanFieldProps) {
  const { t } = props
  return (
    <div className={css.field}>
      <div className={css.head}>
        <label className={css.label} htmlFor={`task-alert-${props.field}`}>{t(`field.${props.field}`)}</label>
        {props.overridden
          ? (
            <span className={css.badges}>
              <span className={css.badge}>{t('overridden')}</span>
              <button
                type="button"
                className={css.reset}
                disabled={props.disabled}
                onClick={() => { props.onReset() }}
              >
                {t('reset')}
              </button>
            </span>
          )
          : null}
        <input
          id={`task-alert-${props.field}`}
          className={css.input}
          type="checkbox"
          checked={props.checked}
          disabled={props.disabled}
          onChange={(event) => { props.onEdit(event.target.checked) }}
        />
      </div>
      <p className={css.hint}>{t(`field.${props.field}.hint`)}</p>
    </div>
  )
}
