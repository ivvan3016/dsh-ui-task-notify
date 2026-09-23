/** Host registration for the browser task-complete alert preferences. */

import type { Context, Volatile } from '@deepseek-ai/cordis'
// Type-only: the ctx.settings service merge and its presentation-policy call.
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { DEFAULT_TASK_ALERT_SETTINGS } from './task-alert-settings.ts'

export {
  DEFAULT_TASK_ALERT_SETTINGS, TASK_ALERT_PACKAGE_NAME, TASK_ALERT_ROW_CONFIG_KEY,
  TASK_ALERT_SETTINGS_NAMESPACE, type TaskAlertSettings,
} from './task-alert-settings.ts'

/**
 * Live task-alert preferences as the Host Config projects them. Every field is
 * a reference, so the running page reads the current value at each alert
 * without waiting for a reload.
 */
export interface Config {
  /** Master switch: when false the alert does nothing. */
  enabled: Volatile<boolean>
  /** Only alert while the page is hidden. */
  onlyWhenHidden: Volatile<boolean>
  /** Also alert when a subagent session finishes. */
  includeSubagents: Volatile<boolean>
  /** Also alert when a session is waiting on the user. */
  interactionAlert: Volatile<boolean>
}

/**
 * The plugin entry's live Config. Volatile fields are also what makes the
 * section servable: the Host describes a settings section only for an entry
 * whose schema publishes at least one live field, and the browser card appears
 * only while the Host serves this namespace.
 */
export const Config = z.object({
  enabled: z.boolean().default(DEFAULT_TASK_ALERT_SETTINGS.enabled).volatile(),
  onlyWhenHidden: z.boolean().default(DEFAULT_TASK_ALERT_SETTINGS.onlyWhenHidden).volatile(),
  includeSubagents: z.boolean().default(DEFAULT_TASK_ALERT_SETTINGS.includeSubagents).volatile(),
  interactionAlert: z.boolean().default(DEFAULT_TASK_ALERT_SETTINGS.interactionAlert).volatile(),
})

/**
 * Withhold the Host's auto-generated section page: this package ships its own
 * card on the Plugins page, and the namespace itself is served either way.
 * @param ctx - Host plugin context.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
}
