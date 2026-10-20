/** Plugin-owned sidebar groups for Sessions without a Workspace. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/** One virtual group; real Workspace membership always takes precedence. */
export interface WorkspaceSessionGroup {
  readonly key: string
  readonly label: string
  readonly icon?: 'clock'
  readonly sessionIds: readonly SessionId[]
}

/** Observable contribution consumed through the Workspace UI service. */
export type WorkspaceSessionGroupSource = HostObservable<WorkspaceSessionGroup>
