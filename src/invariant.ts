/**
 * Package-owned invariant companion for `dsh-ui-task-notify`.
 * @module dsh-ui-task-notify/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = 'dsh-ui-task-notify'

/** Cordis companion plugin name. */
export const name = 'dsh-ui-task-notify-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package is a pure observer of the sessions list
 * snapshot and the settings scope, driving only a browser notification as a
 * side effect. It emits no cordis events, owns no cross-plugin mutable
 * state, and its single subscription proves disposal through the HMR-safety
 * spec.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
