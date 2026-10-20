/** Private protocol shared with the separately packaged native browser plugin. */
export const BROWSER_PLUGIN_IPC = { request: 'tpcowork-browser:request', event: 'tpcowork-browser:event' } as const

/** JSON operations exposed to the authenticated application document. */
export interface DesktopBrowserAutomation {
  readonly version: 1
  request(operation: string, payload?: Record<string, unknown>): Promise<unknown>
  subscribe(listener: (event: { kind: string; payload: unknown }) => void): () => void
}
