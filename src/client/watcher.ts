/** Idle-edge and interaction-edge detection over the client runtime sources. */

import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TaskAlertInteractionKind } from './alert.ts'

/** The watcher surface; created per plugin activation. */
export interface IdleWatcher {
  /** Unsubscribe from both sources and drop the ledgers. */
  dispose(): void
}

/**
 * The pending-interaction shape this watcher reads off the `uiSession` map.
 * The session UI adapter owns the full value (identity, key, kind); the alert
 * only needs the domain-owned discriminator, so it narrows structurally
 * instead of importing the adapter's declaration-merged union.
 */
export interface PendingInteractionView {
  /** Domain-owned interaction discriminator (`approval`, `question`, `plan-review`). */
  readonly kind: string
}

/** Interaction kinds this plugin ships notification copy for. */
const ALERTABLE_KINDS: readonly TaskAlertInteractionKind[] = ['approval', 'question', 'plan-review']

/**
 * Whether one domain-owned interaction kind is one this plugin can present.
 * A kind contributed by another package must not reach the copy lookup.
 * @param kind - the interaction's own discriminator.
 * @returns whether the plugin ships copy for it.
 */
function isAlertableKind(kind: string): kind is TaskAlertInteractionKind {
  return (ALERTABLE_KINDS as readonly string[]).includes(kind)
}

/**
 * Watch the sessions list for running→idle edges — the host-authoritative
 * "agent finished" signal streamed as `host/session-status` frames and folded
 * into each list row's `running` bit — and the session UI adapter's pending-
 * interaction map for "waiting on the user" edges. A running→idle edge fires
 * exactly when a tracked session's agent driver drained (which spans
 * consecutive queued turns, so a multi-turn goal alerts once, at true
 * quiescence). A pending-interaction edge fires the first time a tracked
 * session shows a kind, once per kind (a replacement request of the same kind
 * does not re-alert; a different kind does). The first snapshot only
 * establishes the baseline: sessions already idle or already waiting never
 * alert, and a session that was running before a reconnect alerts on its
 * observed idle if the edge was missed while disconnected.
 * @param list - the sessions list observable (`ctx.sessions.list`).
 * @param pendingInteractions - the pending-interaction map observable
 * (`ctx.uiSession.pendingInteractions`), keyed by Session.
 * @param readIncludeSubagents - resolve the current subagent-session preference.
 * @param readInteractionAlert - resolve the current interaction-alert preference.
 * @param onIdle - invoked per tracked session that just went idle, with its display title.
 * @param onInteraction - invoked per tracked session that just started waiting on
 * the user, with the interaction kind and the session's display title.
 * @returns the watcher surface.
 */
export function createIdleWatcher(
  list: ObservableSnapshot<SessionListState>,
  pendingInteractions: ObservableSnapshot<ReadonlyMap<SessionId, PendingInteractionView>>,
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
    const pending = pendingInteractions.getSnapshot()
    for (const id of snapshot.ids) {
      const entry = snapshot.byId[id]
      if (entry === undefined) continue
      if (!includeSubagents && entry.origin === 'subagent') continue
      const now = entry.running
      const prev = prevRunning.get(id) ?? false
      prevRunning.set(id, now)
      if (prev && !now) onIdle(id, entry.displayTitle)
      // The interaction map is owned by the Session UI adapter and carries the
      // live kind per Session; the list row supplies the display title and the
      // subagent origin the preference gates on.
      const kind = pending.get(id)?.kind
      if (interactionAlert && kind !== undefined && isAlertableKind(kind)) {
        if (prevInteraction.get(id) !== kind) {
          prevInteraction.set(id, kind)
          onInteraction(id, kind, entry.displayTitle)
        }
      } else {
        // Settled, not yet alertable, or gated off: drop the ledger so the
        // next appearance (or the preference turning on) is a fresh edge.
        prevInteraction.delete(id)
      }
    }
    for (const id of [...prevRunning.keys()]) {
      if (snapshot.byId[id] === undefined) prevRunning.delete(id)
    }
    for (const id of [...prevInteraction.keys()]) {
      if (!pending.has(id)) prevInteraction.delete(id)
    }
  }

  sync()
  const unsubscribeList = list.subscribe(sync)
  const unsubscribePending = pendingInteractions.subscribe(sync)

  return {
    dispose(): void {
      unsubscribeList()
      unsubscribePending()
      prevRunning.clear()
      prevInteraction.clear()
    },
  }
}
