/** Private TP Cowork Hub bridge; credentials never cross into the application renderer. */
export const TPCOWORK_HUB_IPC = {
  state: 'tpcoworkhub:state', start: 'tpcoworkhub:start', cancel: 'tpcoworkhub:cancel',
  signOut: 'tpcoworkhub:sign-out', changed: 'tpcoworkhub:changed',
} as const

/** Safe account and authentication progress for the sidebar. */
export interface TpcoworkHubAccountState {
  readonly status: 'signed_out' | 'signed_in' | 'expired' | 'unconfigured' | 'unavailable'
  readonly phase: 'idle' | 'waiting' | 'committing'
  readonly user?: { readonly id: string; readonly username: string; readonly name?: string }
  readonly error?: 'failed' | 'timeout'
}

/** Website authentication operations available to the primary application document. */
export interface DesktopTpcoworkHubApi {
  /** @returns the shared Host account without credentials. */
  state(): Promise<TpcoworkHubAccountState>
  /** @returns the verified account after website authentication, or a safe failure state. */
  start(): Promise<TpcoworkHubAccountState>
  /** @returns after closing the callback listener, or after a credential commit already in progress settles. */
  cancel(): Promise<TpcoworkHubAccountState>
  /** @returns the state after deleting the shared Host session. */
  signOut(): Promise<TpcoworkHubAccountState>
  /** @param listener - receives account changes. @returns listener disposer. */
  subscribe(listener: (state: TpcoworkHubAccountState) => void): () => void
}
