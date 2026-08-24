/** Idle-edge and interaction-edge detection over the sessions list snapshot. */

import type {
  ObservableSnapshot, SessionId, SessionListState,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { TaskAlertInteractionKind } from './alert.ts'

/** The watcher surface; created per plugin activation. */
export interface IdleWatcher {
  /** Unsubscribe from the list snapshot and drop the ledgers. */
  dispose(): void
}

/**
 * Watch the sessions list for running→idle edges — the host-authoritative
 * "agent finished" signal streamed as `host/session-status` frames and folded
 * into each list row's `running` bit — and for "waiting on the user" edges —
 * the `pendingInteraction` status the client runtime derives from
 * `approval/requested`, `question/requested`, and plan-review frames. A
 * running→idle edge fires exactly when a tracked session's agent driver
 * drained (which spans consecutive queued turns, so a multi-turn goal alerts
 * once, at true quiescence). A pending-interaction edge fires the first time
 * a tracked session shows a status, once per status value (a repeated frame
 * for the same session/kind does not re-alert). The first snapshot only
 * establishes the baseline: sessions already idle or already waiting never
 * alert, and a session that was running before a reconnect alerts on its
 * observed idle if the edge was missed while disconnected.
 * @param list - the sessions list observable.
 * @param readIncludeSubagents - resolve the current subagent-session preference.
 * @param readInteractionAlert - resolve the current interaction-alert preference.
 * @param onIdle - invoked per tracked session that just went idle, with its display title.
 * @param onInteraction - invoked per tracked session that just started waiting on
 * the user, with the interaction kind and the session's display title.
 * @returns the watcher surface.
 */
export function createIdleWatcher(
  list: ObservableSnapshot<SessionListState>,
  readIncludeSubagents: () => boolean,
  onIdle: (sessionId: SessionId, sessionTitle: string | undefined) => void,
  readInteractionAlert: () => boolean,
  onInteraction: (sessionId: SessionId, kind: TaskAlertInteractionKind, sessionTitle: string | undefined) => void,
): IdleWatcher {
  const prevRunning = new Map<SessionId, boolean>()
  const prevInteraction = new Map<SessionId, string>()

  const sync = (): void => {
    const snapshot = list.getSnapshot()
    const includeSubagents = readIncludeSubagents()
    const interactionAlert = readInteractionAlert()
    for (const id of snapshot.ids) {
      const entry = snapshot.byId[id]
      if (entry === undefined) continue
      if (!includeSubagents && entry.origin === 'subagent') continue
      const now = entry.running
      const prev = prevRunning.get(id) ?? false
      prevRunning.set(id, now)
      if (prev && !now) onIdle(id, entry.displayTitle)
      // The live entry carries `pendingInteraction` (SessionListEntry), typed
      // as SessionSummary by the list snapshot: read it structurally, since
      // the runtime guarantees the field but the published type may lag.
      const pending = (entry as { pendingInteraction?: string }).pendingInteraction
      if (interactionAlert && pending !== undefined) {
        const seen = prevInteraction.get(id)
        if (seen !== pending) {
          prevInteraction.set(id, pending)
          onInteraction(id, pending as TaskAlertInteractionKind, entry.displayTitle)
        }
      } else {
        prevInteraction.delete(id)
      }
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
      prevInteraction.clear()
    },
  }
}
