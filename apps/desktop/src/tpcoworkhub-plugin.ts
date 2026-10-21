/** Optional TP Cowork Hub plugin adapter. All website authentication logic lives in the installed payload. */
import { access } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import type { BrowserWindow } from 'electron'
import type { TpcoworkHubAccountState } from './tpcoworkhub-protocol.ts'

const unavailable = (): TpcoworkHubAccountState => ({ status: 'unavailable', phase: 'idle', error: 'failed' })

/** Native authentication operations owned by the optional plugin. */
export interface DesktopTpcoworkHubExtension {
  state(): Promise<TpcoworkHubAccountState>
  start(): Promise<TpcoworkHubAccountState>
  cancel(): Promise<TpcoworkHubAccountState>
  signOut(): Promise<TpcoworkHubAccountState>
  dispose(): Promise<void>
}

/** Native dependencies available to the TP Cowork Hub adapter. */
export interface DesktopTpcoworkHubPluginOptions {
  readonly owner: () => BrowserWindow | undefined
  readonly hostUrl: () => string | undefined
  readonly send: (url: string, init: RequestInit) => Promise<Response>
  readonly changed: (state: TpcoworkHubAccountState) => void
}

function isExtension(value: unknown): value is DesktopTpcoworkHubExtension {
  return typeof value === 'object' && value !== null && ['state', 'start', 'cancel', 'signOut', 'dispose']
    .every(name => typeof Reflect.get(value, name) === 'function')
}

function isFactory(value: unknown): value is (options: DesktopTpcoworkHubPluginOptions) => unknown {
  return typeof value === 'function'
}

/** Loads the native payload on first use; an absent payload keeps the account visibly unavailable. */
export class DesktopTpcoworkHubPlugin {
  private extension: DesktopTpcoworkHubExtension | undefined
  private loading: Promise<DesktopTpcoworkHubExtension> | undefined

  /** @param path - Installed native ESM payload. @param options - Current window, Host and change-publishing authority. */
  constructor(private readonly path: string, private readonly options: DesktopTpcoworkHubPluginOptions) {}

  private load(): Promise<DesktopTpcoworkHubExtension> {
    this.loading ??= (async () => {
      await access(this.path)
      const module: unknown = await import(pathToFileURL(this.path).href)
      if (typeof module !== 'object' || module === null || !('createDesktopTpcoworkHub' in module)
        || !isFactory(module.createDesktopTpcoworkHub)) throw new Error('Invalid desktop TP Cowork Hub plugin export')
      const extension: unknown = module.createDesktopTpcoworkHub(this.options)
      if (!isExtension(extension)) throw new Error('Incompatible desktop TP Cowork Hub plugin API')
      this.extension = extension
      return extension
    })().catch((error: unknown) => { this.loading = undefined; throw error })
    return this.loading
  }

  private async run(operation: (extension: DesktopTpcoworkHubExtension) => Promise<TpcoworkHubAccountState>)
    : Promise<TpcoworkHubAccountState> {
    try { return await operation(await this.load()) }
    catch (error) { console.error('Desktop TP Cowork Hub adapter failed', error); return unavailable() }
  }

  state(): Promise<TpcoworkHubAccountState> { return this.run(extension => extension.state()) }
  start(): Promise<TpcoworkHubAccountState> { return this.run(extension => extension.start()) }
  cancel(): Promise<TpcoworkHubAccountState> { return this.run(extension => extension.cancel()) }
  signOut(): Promise<TpcoworkHubAccountState> { return this.run(extension => extension.signOut()) }

  /** Await the native adapter's final cleanup; never throws when the payload failed to load. */
  async dispose(): Promise<void> {
    try { const extension = this.extension ?? await this.loading; await extension?.dispose() }
    catch (_error) { /* receive() already reported a failed load; no adapter was created to clean up. */ }
  }
}
