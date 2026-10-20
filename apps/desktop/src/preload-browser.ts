/** Lease-scoped browser operations and one main-process event subscription per window. */
import { ipcRenderer } from 'electron'
import type { DesktopBrowserBridge, DesktopBrowserLeaseId } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types'
import { DESKTOP_IPC } from './ipc.ts'
import { BROWSER_PLUGIN_IPC, type DesktopBrowserAutomation } from './browser-plugin-protocol.ts'

/** @returns the fixed browser plugin API, with listener cleanup and no general IPC access. */
export function createDesktopBrowserAutomation(): DesktopBrowserAutomation {
  return {
    version: 1,
    request: (operation, payload) => ipcRenderer.invoke(BROWSER_PLUGIN_IPC.request, operation, payload),
    subscribe(listener) {
      const receive = (_event: Electron.IpcRendererEvent, value: unknown): void => {
        if (typeof value !== 'object' || value === null || !('kind' in value) || typeof value.kind !== 'string' || !('payload' in value)) return
        try { listener({ kind: value.kind, payload: value.payload }) }
        catch (error) { console.error('Desktop browser event listener failed', error) }
      }
      ipcRenderer.on(BROWSER_PLUGIN_IPC.event, receive)
      return () => { ipcRenderer.removeListener(BROWSER_PLUGIN_IPC.event, receive) }
    },
  }
}

/** @returns browser operations that expose neither IPC nor Electron objects. */
export function createDesktopBrowserBridge(): DesktopBrowserBridge {
  const listeners = new Map<DesktopBrowserLeaseId, Set<(url: string) => void>>()
  ipcRenderer.on(DESKTOP_IPC.browserOpenRequested, (_event, request: unknown) => {
    if (typeof request !== 'object' || request === null || !('lease' in request) || !('url' in request)
      || typeof request.lease !== 'string' || typeof request.url !== 'string') return
    const callbacks = listeners.get(request.lease as DesktopBrowserLeaseId)
    if (callbacks === undefined) return
    for (const callback of [...callbacks]) {
      try { callback(request.url) }
      catch (error) { console.error('Desktop browser link handler failed', error) }
    }
  })
  return {
    acquire: workspace => ipcRenderer.invoke(DESKTOP_IPC.browserAcquire, workspace) as ReturnType<DesktopBrowserBridge['acquire']>,
    release: lease => ipcRenderer.invoke(DESKTOP_IPC.browserRelease, lease) as Promise<void>,
    onOpenRequested(lease, listener) {
      let callbacks = listeners.get(lease)
      if (callbacks === undefined) { callbacks = new Set(); listeners.set(lease, callbacks) }
      callbacks.add(listener)
      return () => {
        callbacks.delete(listener)
        if (callbacks.size === 0 && listeners.get(lease) === callbacks) listeners.delete(lease)
      }
    },
  }
}
