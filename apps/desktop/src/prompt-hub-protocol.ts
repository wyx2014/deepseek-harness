/** Private PromptHub bridge; credentials never cross into the application renderer. */
export const PROMPT_HUB_IPC = {
  state: 'tpcowork-prompthub:state', start: 'tpcowork-prompthub:start', cancel: 'tpcowork-prompthub:cancel',
  signOut: 'tpcowork-prompthub:sign-out', changed: 'tpcowork-prompthub:changed',
} as const

/** Safe account and authentication progress for the sidebar. */
export interface PromptHubAccountState {
  readonly status: 'signed_out' | 'signed_in' | 'expired' | 'unconfigured' | 'unavailable'
  readonly phase: 'idle' | 'waiting' | 'committing'
  readonly user?: { readonly id: string; readonly username: string; readonly name?: string }
  readonly error?: 'failed' | 'timeout'
}

/** Website authentication operations available to the primary application document. */
export interface DesktopPromptHubApi {
  /** @returns the shared Host account without credentials. */
  state(): Promise<PromptHubAccountState>
  /** @returns the verified account after website authentication, or a safe failure state. */
  start(): Promise<PromptHubAccountState>
  /** @returns after closing the callback listener, or after a credential commit already in progress settles. */
  cancel(): Promise<PromptHubAccountState>
  /** @returns the state after deleting the shared Host session. */
  signOut(): Promise<PromptHubAccountState>
  /** @param listener - receives account changes. @returns listener disposer. */
  subscribe(listener: (state: PromptHubAccountState) => void): () => void
}
