/** Idle-edge detection over the sessions list snapshot. */

import type {
  ObservableSnapshot, SessionId, SessionListState,
} from '@deepseek-ai/dsh-client-runtime/client'

/** The watcher surface; created per plugin activation. */
export interface IdleWatcher {
  /** Unsubscribe from the list snapshot and drop the running-state ledger. */
  dispose(): void
}

/**
 * Watch the sessions list for running→idle edges — the host-authoritative
 * "agent finished" signal streamed as `host/session-status` frames and folded
 * into each list row's `running` bit. An edge fires exactly when a tracked
 * session's agent driver drained (which spans consecutive queued turns, so a
 * multi-turn goal alerts once, at true quiescence). The first snapshot only
 * establishes the baseline: sessions already idle never alert, and a session
 * that was running before a reconnect alerts on its observed idle if the
 * edge was missed while disconnected.
 * @param list - the sessions list observable.
 * @param readIncludeSubagents - resolve the current subagent-session preference.
 * @param onIdle - invoked per tracked session that just went idle, with its display title.
 * @returns the watcher surface.
 */
export function createIdleWatcher(
  list: ObservableSnapshot<SessionListState>,
  readIncludeSubagents: () => boolean,
  onIdle: (sessionId: SessionId, sessionTitle: string | undefined) => void,
): IdleWatcher {
  const prevRunning = new Map<SessionId, boolean>()

  const sync = (): void => {
    const snapshot = list.getSnapshot()
    const includeSubagents = readIncludeSubagents()
    for (const id of snapshot.ids) {
      const entry = snapshot.byId[id]
      if (entry === undefined) continue
      if (!includeSubagents && entry.origin === 'subagent') continue
      const now = entry.running
      const prev = prevRunning.get(id) ?? false
      prevRunning.set(id, now)
      if (prev && !now) onIdle(id, entry.displayTitle)
    }
    for (const id of [...prevRunning.keys()]) {
      if (snapshot.byId[id] === undefined) prevRunning.delete(id)
    }
  }

  sync()
  const unsubscribe = list.subscribe(sync)

  return {
    dispose(): void {
      unsubscribe()
      prevRunning.clear()
    },
  }
}
