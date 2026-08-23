/** Host registration for the browser task-complete alert preferences. */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { TASK_ALERT_SETTINGS_NAMESPACE, TaskAlertSettingsSchema } from './task-alert-settings.ts'

export {
  DEFAULT_TASK_ALERT_SETTINGS, TASK_ALERT_SETTINGS_NAMESPACE, TaskAlertSettingsSchema,
  type TaskAlertSettings,
} from './task-alert-settings.ts'

const ALERT_NAMESPACE = settingsNamespace(TASK_ALERT_SETTINGS_NAMESPACE)

/**
 * Register the durable alert section when the Host composes settings.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(ALERT_NAMESPACE, TaskAlertSettingsSchema)
  })
}
