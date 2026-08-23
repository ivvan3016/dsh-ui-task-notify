/** Task-complete alert engine: a browser (Windows) notification. */

import type { TaskAlertSettings } from '../task-alert-settings.ts'
import type { TaskAlertKey } from './locales.ts'

/** Notification tag: a later alert replaces an earlier one instead of stacking. */
const NOTIFICATION_TAG = 'dsh-task-alert'

/** Browser notification permission, plus the unsupported-environment case. */
export type TaskAlertPermission = 'granted' | 'denied' | 'default' | 'unsupported'

/** The alert surface the watcher drives; created per plugin activation. */
export interface TaskAlert {
  /**
   * React to one agent-finish edge, applying the current settings gates.
   * @param sessionTitle - the finishing session's display title, when known.
   */
  notify(sessionTitle?: string): void
  /** The current browser notification permission (unsupported when the API is absent). */
  notificationPermission(): TaskAlertPermission
  /**
   * Ask the browser for notification permission (safe to call from a user
   * gesture; a settled or denied permission returns as-is without prompting).
   * @returns the permission after the request settles.
   */
  requestNotificationPermission(): Promise<TaskAlertPermission>
}

/**
 * Create the alert engine. The Windows toast (browser Notification) is the
 * only channel: it carries its own system sound and stays visible while the
 * whole window is minimized. Whether it fires is gated by the browser's own
 * notification permission — the card's authorize button requests it.
 * @param translate - live locale translation over this plugin's namespace.
 * @param readSettings - resolve the current durable preferences.
 * @returns the alert surface.
 */
export function createTaskAlert(
  translate: (key: TaskAlertKey) => string,
  readSettings: () => TaskAlertSettings,
): TaskAlert {
  const permission = (): TaskAlertPermission =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission

  const showNotification = (sessionTitle: string | undefined): void => {
    if (permission() !== 'granted') return
    const notification = new Notification(translate('title.done'), {
      ...(sessionTitle === undefined ? {} : { body: sessionTitle }),
      tag: NOTIFICATION_TAG,
    })
    notification.onclick = () => { window.focus() }
  }

  return {
    notify(sessionTitle?: string): void {
      const settings = readSettings()
      if (!settings.enabled) return
      if (settings.onlyWhenHidden && !document.hidden) return
      showNotification(sessionTitle)
    },
    notificationPermission: permission,
    async requestNotificationPermission(): Promise<TaskAlertPermission> {
      if (permission() !== 'default') return permission()
      return Notification.requestPermission()
    },
  }
}
