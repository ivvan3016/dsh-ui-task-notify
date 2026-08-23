/** `task-alert` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'task-alert'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title.done': 'dsh 已完成',
  'card.title': '任务完成提醒',
  'card.description': 'agent 完成任务时弹出 Windows 系统通知。',
  'field.enabled': '启用提醒',
  'field.enabled.hint': '关闭后 agent 完成任务不再发出任何提醒。',
  'field.notify': '系统通知',
  'field.notify.hint': '点击按钮授予浏览器通知权限；授权后 agent 完成任务会弹出 Windows 系统通知（自带提示音，整个窗口最小化时也能显示）。',
  'notify.authorize': '授权',
  'notify.granted': '已授权',
  'notify.denied': '已拒绝',
  'notify.unsupported': '不支持',
  'field.onlyWhenHidden': '仅页面后台时提醒',
  'field.onlyWhenHidden.hint': '页面可见时不需要提醒，因为你正在看。',
  'field.includeSubagents': '子代理完成也提醒',
  'field.includeSubagents.hint': '默认只提醒顶层会话；打开后每个子会话完成都会提醒。',
  'overridden': '已覆盖',
  'reset': '恢复默认',
  'readOnly': '本部署的设置为只读。',
  'expand': '展开设置',
  'collapse': '收起设置',
  'save': '保存',
  'saving': '保存中…',
  'discard': '放弃修改',
  'unsaved': '未保存',
  'saveFailed': '本部署没有接受这些值，已保留供你修改。',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<TaskAlertKey, string> = {
  'title.done': 'dsh completed',
  'card.title': 'Task-complete alert',
  'card.description': 'Shows a Windows notification when an agent finishes.',
  'field.enabled': 'Enable the alert',
  'field.enabled.hint': 'When off, a finished agent raises no reminder at all.',
  'field.notify': 'System notification',
  'field.notify.hint': 'Grant browser notification permission here; once granted, a finished agent shows a Windows notification (it carries its own sound and stays visible while the whole window is minimized).',
  'notify.authorize': 'Authorize',
  'notify.granted': 'Authorized',
  'notify.denied': 'Denied',
  'notify.unsupported': 'Unsupported',
  'field.onlyWhenHidden': 'Alert only while the page is hidden',
  'field.onlyWhenHidden.hint': 'A visible page needs no reminder, because you are watching it.',
  'field.includeSubagents': 'Alert on subagent completions too',
  'field.includeSubagents.hint': 'Top-level sessions only by default; enable for a signal on every child session.',
  'overridden': 'Overridden',
  'reset': 'Reset to default',
  'readOnly': 'This deployment stores settings read-only.',
  'expand': 'Show settings',
  'collapse': 'Hide settings',
  'save': 'Save',
  'saving': 'Saving…',
  'discard': 'Discard',
  'unsaved': 'Unsaved',
  'saveFailed': 'The deployment did not accept these values; they were left for you to correct.',
}

/** Key domain of the `task-alert` namespace (zh is the source of truth). */
export type TaskAlertKey = keyof typeof zh
