/**
 * Task-complete alert preferences, shared by both halves: the Host entry that
 * owns them, the plain section the browser binds, and the defaults applied
 * before the first accepted section arrives. Deliberately dependency-free —
 * the browser half imports this module, so nothing here may pull a schema
 * library or any other Node-only code into the client bundle.
 */

/**
 * Settings namespace. A dsh profile serves one settings section per active
 * plugin entry, keyed by that entry's id, so this string is the entry id the
 * bundle patch mounts (`cordis.patch.yml`) — not an independently registered
 * namespace. Renaming it detaches every stored user value from the card.
 */
export const TASK_ALERT_SETTINGS_NAMESPACE = 'ui-task-alert'

/** Profile package whose bundle patch mounts this plugin. */
export const TASK_ALERT_PACKAGE_NAME = 'dsh-ui-task-notify'

/**
 * Key the Plugins page looks this row's configuration up under: the page keys
 * a row's page by `<bundle package name>#<row id>`, and the row id is the
 * settings namespace.
 */
export const TASK_ALERT_ROW_CONFIG_KEY = `${TASK_ALERT_PACKAGE_NAME}#${TASK_ALERT_SETTINGS_NAMESPACE}`

/** Durable task-alert section shared by the Host Config and the browser form. */
export interface TaskAlertSettings {
  /** Master switch: when false the alert does nothing. */
  enabled: boolean
  /** Only alert while the page is hidden (a visible page needs no reminder). */
  onlyWhenHidden: boolean
  /** Also alert when a subagent session finishes; top-level sessions only by default. */
  includeSubagents: boolean
  /** Also alert when a session is waiting on the user (approval, question, plan review). */
  interactionAlert: boolean
}

/** Defaults applied before the first Host settings sync resolves the section. */
export const DEFAULT_TASK_ALERT_SETTINGS: TaskAlertSettings = {
  enabled: true,
  onlyWhenHidden: true,
  includeSubagents: false,
  interactionAlert: true,
}
