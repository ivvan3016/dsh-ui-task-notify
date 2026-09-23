/**
 * Task-complete alert plugin, browser half: watches the sessions list for
 * agent running→idle edges and the session UI adapter's status map for
 * sessions waiting on the user, and, while the page is hidden, raises a
 * browser (Windows) notification. The behavior gates are the live preferences
 * of the `ui-task-alert` Host entry, which the running page reads through the
 * settings service and edits through the card this half registers on the
 * Plugins page; the package issues no RPC and renders nothing outside it.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the ConfigForm contract and the ctx.configForms Context merge.
// Cross-plugin collaboration goes through the service, never a value import
// (client bundle purity gate).
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: the ctx.uiSession Context merge; its per-session status map is
// the live "waiting on the user" source this half alerts on.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: the ctx.sessions Context merge (the list snapshot feed).
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: the ctx.slots Context merge owned by the renderer registry.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the plugins.row.config SlotMap merge declared by the Plugins page
// (the row page this card occupies).
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import {
  DEFAULT_TASK_ALERT_SETTINGS, TASK_ALERT_ROW_CONFIG_KEY, TASK_ALERT_SETTINGS_NAMESPACE,
  type TaskAlertSettings,
} from '../task-alert-settings.ts'
import { createTaskAlert } from './alert.ts'
import { createIdleWatcher } from './watcher.ts'
import { TaskAlertCardController } from './task-alert-form.ts'
import { TaskAlertCard } from './TaskAlertCard.tsx'
import { en, NS, zh, type TaskAlertKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Task-complete alert copy. */
    'settings.taskAlert': TaskAlertKey
  }
}

/** Required services: the sessions list, the session UI adapter, the settings forms, locale, and slots. */
export const inject = ['sessions', 'uiSession', 'configForms', 'locale', 'slots']

/**
 * Resolve the live preferences, falling back to the schema defaults until the
 * first accepted section arrives.
 * @param form - the Host entry's shared configuration form.
 * @returns the effective settings.
 */
function readSettings(form: ConfigForm<TaskAlertSettings>): TaskAlertSettings {
  const value = form.getSnapshot().value
  return { ...DEFAULT_TASK_ALERT_SETTINGS, ...(value ?? {}) }
}

/**
 * Client plugin body: register the dictionaries, bind the Host entry's
 * configuration form, wire the idle and pending-interaction watcher to the
 * alert engine, and register the Plugins-page card that edits the preferences.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-task-alert: dictionaries')
  const form = ctx.configForms.get<TaskAlertSettings>(TASK_ALERT_SETTINGS_NAMESPACE)
  const alert = createTaskAlert(ctx.locale.bind(NS), () => readSettings(form))
  const watcher = createIdleWatcher(
    ctx.sessions.list,
    ctx.uiSession.sessionStatus,
    () => readSettings(form).includeSubagents,
    (_sessionId, sessionTitle) => { alert.notify(sessionTitle) },
    () => readSettings(form).interactionAlert,
    (_sessionId, kind, sessionTitle) => { alert.notifyInteraction(kind, sessionTitle) },
  )
  ctx.effect(() => () => {
    watcher.dispose()
  }, 'ui-task-alert: idle watcher')

  const card = new TaskAlertCardController(
    form,
    () => alert.notificationPermission(),
    () => alert.requestNotificationPermission(),
  )
  // The card appears only while the Host serves the namespace: an entry that
  // publishes no live settings has no section, and a deployment without this
  // plugin shows no trace of the page.
  ctx.effect(() => ctx.configForms.whileServed([TASK_ALERT_SETTINGS_NAMESPACE], () => ctx.slots.inject(
    'plugins.row.config',
    () => ctx.slots.register({
      name: 'plugins.row.config',
      key: TASK_ALERT_ROW_CONFIG_KEY,
      locale: NS,
      inject: () => card.inject(),
    }, TaskAlertCard),
  )), 'ui-task-alert: settings card')
}
