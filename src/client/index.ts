/**
 * Task-complete alert plugin, browser half: watches the sessions list for
 * agent running→idle edges and, while the page is hidden, flashes the
 * document title and plays a Web Audio beep. The behavior gates are durable
 * preferences in the `ui-task-alert` settings namespace, editable through the
 * card this half registers in the Plugins configuration tab; the package
 * issues no RPC and renders nothing outside that card.
 */
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the ctx.settingsScope Context merge. Cross-plugin collaboration
// goes through the service, never a value import (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the settings.plugin.item SlotMap merge declared by the Plugins
// configuration section (the card registers into that keyed slot).
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import {
  DEFAULT_TASK_ALERT_SETTINGS, TASK_ALERT_SETTINGS_NAMESPACE,
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
    'task-alert': TaskAlertKey
  }
}

/** Required services: the sessions list, the settings scope, locale, and slots. */
export const inject = ['sessions', 'settingsScope', 'locale', 'slots']

/**
 * Resolve the durable preferences, falling back to the schema defaults until
 * the first Host sync resolves the section.
 * @param scope - the bound task-alert settings scope.
 * @returns the effective settings.
 */
function readSettings(scope: SettingsScope<TaskAlertSettings>): TaskAlertSettings {
  const value = scope.getSnapshot().value
  return { ...DEFAULT_TASK_ALERT_SETTINGS, ...(value ?? {}) }
}

/**
 * Client plugin body: register the dictionaries, bind the settings scope, wire
 * the idle watcher to the alert engine, and register the Plugins card that
 * edits the preferences.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-task-alert: dictionaries')
  const scope = ctx.settingsScope.bind<TaskAlertSettings>({ namespace: TASK_ALERT_SETTINGS_NAMESPACE })
  const alert = createTaskAlert(ctx.locale.bind(NS), () => readSettings(scope))
  const watcher = createIdleWatcher(
    ctx.sessions.list,
    () => readSettings(scope).includeSubagents,
    (_sessionId, sessionTitle) => { alert.notify(sessionTitle) },
  )
  ctx.effect(() => () => {
    watcher.dispose()
  }, 'ui-task-alert: idle watcher')

  const card = new TaskAlertCardController(
    scope,
    () => alert.notificationPermission(),
    () => alert.requestNotificationPermission(),
  )
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: TASK_ALERT_SETTINGS_NAMESPACE,
    locale: NS,
    inject: () => card.inject(),
  }, TaskAlertCard))
}
