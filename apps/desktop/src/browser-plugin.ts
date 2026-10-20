/** Optional browser plugin adapter. Guests never receive this primary-window API. */
import { access } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import type { BrowserWindow, WebContents, WebPreferences } from 'electron'

/** Native attachment hooks and lifecycle owned by the optional plugin. */
export interface DesktopBrowserExtension {
  willAttach(owner: WebContents, event: Electron.Event, preferences: WebPreferences, params: Record<string, string>): boolean
  didAttach(owner: WebContents, guest: WebContents): boolean
  handleHost(message: unknown, reply: (message: object) => void): Promise<void>
  request(operation: string, payload?: unknown): Promise<unknown>
  disable(): Promise<void>
  dispose(): Promise<void>
}

/** Native dependencies available to the browser adapter. */
export interface DesktopBrowserPluginOptions {
  readonly userData: string
  readonly window: () => BrowserWindow | undefined
  readonly hostUrl: () => string | undefined
}

function isExtension(value: unknown): value is DesktopBrowserExtension {
  return typeof value === 'object' && value !== null && ['willAttach', 'didAttach', 'handleHost', 'request', 'disable', 'dispose']
    .every(name => typeof Reflect.get(value, name) === 'function')
}

function isFactory(value: unknown): value is (options: DesktopBrowserPluginOptions) => unknown {
  return typeof value === 'function'
}

/** Loads the native payload on first use; an absent payload gives the Host an actionable error. */
export class DesktopBrowserPlugin {
  private extension: DesktopBrowserExtension | undefined
  private loading: Promise<DesktopBrowserExtension> | undefined

  /** @param path - Installed native ESM payload. @param options - Current window and storage authority. */
  constructor(private readonly path: string, private readonly options: DesktopBrowserPluginOptions) {}

  private load(): Promise<DesktopBrowserExtension> {
    this.loading ??= (async () => {
      await access(this.path)
      const module: unknown = await import(pathToFileURL(this.path).href)
      if (typeof module !== 'object' || module === null || !('createDesktopBrowser' in module)
        || !isFactory(module.createDesktopBrowser)) throw new Error('Invalid desktop browser plugin export')
      const extension: unknown = module.createDesktopBrowser(this.options)
      if (!isExtension(extension)) throw new Error('Incompatible desktop browser plugin API')
      this.extension = extension
      return extension
    })().catch((error: unknown) => { this.loading = undefined; throw error })
    return this.loading
  }

  /** @returns Whether the optional plugin claimed this lease. */
  willAttach(...args: Parameters<DesktopBrowserExtension['willAttach']>): boolean { return this.extension?.willAttach(...args) ?? false }
  /** @returns Whether the optional plugin owns the guest's partition. */
  didAttach(...args: Parameters<DesktopBrowserExtension['didAttach']>): boolean { return this.extension?.didAttach(...args) ?? false }

  /** Route only the private browser envelope; the plugin validates operation payloads. */
  async receive(message: unknown, reply: (message: object) => void): Promise<void> {
    try { await (await this.load()).handleHost(message, reply) }
    catch (error) {
      const id = typeof message === 'object' && message !== null && 'id' in message ? message.id : 'invalid'
      reply({ type: 'tpcowork-browser', version: 1, kind: 'result', id, error: {
        code: 'native_unavailable', message: 'Rebuild and install the DSH browser desktop assets before enabling this plugin.',
      } })
      console.error('Desktop browser adapter failed', error)
    }
  }

  /** Validate renderer IPC before forwarding to the native operation parser. */
  async request(operation: unknown, payload: unknown): Promise<unknown> {
    if (typeof operation !== 'string' || (payload !== undefined && (typeof payload !== 'object' || payload === null || Array.isArray(payload)))) {
      throw new Error('Invalid desktop browser request')
    }
    if (operation === 'snapshot' && this.extension === undefined) return { enabled: false, tabs: [], downloads: [], permissions: {}, requests: [] }
    return (await this.load()).request(operation, payload)
  }

  /** Cancel native work when its Host exits, retaining persistent website data. */
  async disconnect(): Promise<void> {
    const extension = await this.loadedForCleanup()
    await extension?.disable()
  }
  /** Await the native adapter's final cleanup. */
  async dispose(): Promise<void> {
    const extension = await this.loadedForCleanup()
    await extension?.dispose()
  }

  private async loadedForCleanup(): Promise<DesktopBrowserExtension | undefined> {
    try { return this.extension ?? await this.loading }
    catch (_error) {
      // receive() reports failed loading; no adapter was created to clean up.
      return undefined
    }
  }
}
