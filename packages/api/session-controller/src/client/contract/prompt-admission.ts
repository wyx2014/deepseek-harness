/** Optional Client routing after command arbitration and attachment serialization. */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionPromptRequest, SessionPromptValue } from '../../types.ts'

/** Exact request presented to optional prompt admission providers. */
export interface ClientPromptAdmission {
  readonly request: SessionPromptRequest
  readonly signal: AbortSignal | undefined
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Route a root Session prompt to an admission provider, or delegate to native transport.
     * Providers preserve the complete request and own rejection reporting through RemoteResult.
     * Command execution and addressed subagent continuation do not enter this waterfall.
     * @param payload - Exact native request and optional caller cancellation.
     * @param next - Native prompt transport or the next admission provider.
     * @returns Acceptance or a structured admission failure.
     * @mode waterfall
     */
    'client-session/prompt-admission'(
      payload: ClientPromptAdmission,
      next: () => Promise<RemoteResult<SessionPromptValue>>,
    ): Promise<RemoteResult<SessionPromptValue>>
  }
}
