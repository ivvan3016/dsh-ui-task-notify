/** Task-complete alert preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the task-alert plugin. */
export const TASK_ALERT_SETTINGS_NAMESPACE = 'ui-task-alert'

/** Durable task-alert section shared by the Host schema and the browser scope. */
export interface TaskAlertSettings {
  /** Master switch: when false the alert does nothing. */
  enabled: boolean
  /** Only alert while the page is hidden (a visible page needs no reminder). */
  onlyWhenHidden: boolean
  /** Also alert when a subagent session finishes; top-level sessions only by default. */
  includeSubagents: boolean
}

/** Defaults applied before the first Host settings sync resolves the section. */
export const DEFAULT_TASK_ALERT_SETTINGS: TaskAlertSettings = {
  enabled: true,
  onlyWhenHidden: true,
  includeSubagents: false,
}

/** Durable task-alert schema; also the wire envelope the browser scope validates against. */
export const TaskAlertSettingsSchema: z<TaskAlertSettings> = z.object({
  enabled: z.boolean().default(true),
  onlyWhenHidden: z.boolean().default(true),
  includeSubagents: z.boolean().default(false),
})
