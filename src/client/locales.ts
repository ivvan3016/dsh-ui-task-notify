/** `settings.taskAlert` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.taskAlert'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title.done': 'dsh 已完成',
  'title.interaction': 'dsh 需要你处理',
  'card.description': 'agent 完成任务或需要你处理时弹出 Windows 系统通知。',
  'field.enabled': '启用提醒',
  'field.enabled.hint': '关闭后 agent 完成任务或需要你处理时不再发出任何提醒。',
  'field.notify': '系统通知',
  'field.notify.hint': '点击按钮授予浏览器通知权限；授权后 agent 完成任务或需要你处理时会弹出 Windows 系统通知（自带提示音，整个窗口最小化时也能显示）。',
  'notify.authorize': '授权',
  'notify.granted': '已授权',
  'notify.denied': '已拒绝',
  'notify.unsupported': '不支持',
  'field.onlyWhenHidden': '仅页面后台时提醒',
  'field.onlyWhenHidden.hint': '页面可见时不需要提醒，因为你正在看。',
  'field.includeSubagents': '子代理完成也提醒',
  'field.includeSubagents.hint': '默认只提醒顶层会话；打开后每个子会话完成都会提醒。',
  'field.interactionAlert': '需要你处理时也提醒',
  'field.interactionAlert.hint': 'agent 发起审批、提问或计划审查等需要你参与的交互时弹出通知。',
  'interaction.approval': '有请求等待审批',
  'interaction.question': '有提问等待回答',
  'interaction.plan-review': '有计划等待审查',
  'overridden': '已覆盖',
  'reset': '恢复默认',
  'readOnly': '本部署的设置为只读。',
  'save': '保存',
  'saving': '保存中…',
  'discard': '放弃修改',
  'saveFailed': '本部署没有接受这些值，已保留供你修改。',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<TaskAlertKey, string> = {
  'title.done': 'dsh completed',
  'title.interaction': 'dsh needs your input',
  'card.description': 'Shows a Windows notification when an agent finishes or needs your input.',
  'field.enabled': 'Enable the alert',
  'field.enabled.hint': 'When off, a finished agent or one waiting on you raises no reminder at all.',
  'field.notify': 'System notification',
  'field.notify.hint': 'Grant browser notification permission here; once granted, a finished agent or one waiting on you shows a Windows notification (it carries its own sound and stays visible while the whole window is minimized).',
  'notify.authorize': 'Authorize',
  'notify.granted': 'Authorized',
  'notify.denied': 'Denied',
  'notify.unsupported': 'Unsupported',
  'field.onlyWhenHidden': 'Alert only while the page is hidden',
  'field.onlyWhenHidden.hint': 'A visible page needs no reminder, because you are watching it.',
  'field.includeSubagents': 'Alert on subagent completions too',
  'field.includeSubagents.hint': 'Top-level sessions only by default; enable for a signal on every child session.',
  'field.interactionAlert': 'Alert when your input is needed',
  'field.interactionAlert.hint': 'Notifies on approval requests, questions, and plan reviews that wait on you.',
  'interaction.approval': 'Approval request pending',
  'interaction.question': 'Question waiting for an answer',
  'interaction.plan-review': 'Plan review waiting for you',
  'overridden': 'Overridden',
  'reset': 'Reset to default',
  'readOnly': 'This deployment stores settings read-only.',
  'save': 'Save',
  'saving': 'Saving…',
  'discard': 'Discard',
  'saveFailed': 'The deployment did not accept these values; they were left for you to correct.',
}

/** Key domain of the `settings.taskAlert` namespace (zh is the source of truth). */
export type TaskAlertKey = keyof typeof zh
