/** Host registration for the browser task-complete alert preferences. */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: the ctx.settings Context merge owned by the settings service.
import type {} from '@deepseek-ai/dsh-settings'
import { TASK_ALERT_SETTINGS_NAMESPACE, TaskAlertSettingsSchema } from './task-alert-settings.ts'

export {
  DEFAULT_TASK_ALERT_SETTINGS, TASK_ALERT_SETTINGS_NAMESPACE, TaskAlertSettingsSchema,
  type TaskAlertSettings,
} from './task-alert-settings.ts'

/**
 * Register the durable alert section when the Host composes settings.
 *
 * The namespace carries no caller-side branding: `settings.register` validates
 * it and owns the registration's effect.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(TASK_ALERT_SETTINGS_NAMESPACE, TaskAlertSettingsSchema)
  })
}
