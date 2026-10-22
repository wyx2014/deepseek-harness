/** Native system notifications for background task results, after the reference desktop's task notifications. */
import { app, BrowserWindow, Notification } from 'electron'

/** Renderer-supplied notification; copy is localized by the renderer, which owns the active language. */
export interface DesktopTaskNotification {
  /** Opaque target returned to the renderer when the notification is clicked. */
  readonly id: string
  /** Deduplication identity: one notification per key within the dedupe window. */
  readonly key: string
  readonly title: string
  readonly body: string
}

const DEDUPE_WINDOW_MS = 3000
const MAX_RETAINED = 100
const MAX_TEXT = 1024

/**
 * Parse an untrusted renderer payload.
 * @param value - IPC argument.
 * @returns The notification, or undefined when any field is missing, empty or oversized.
 */
export function parseDesktopTaskNotification(value: unknown): DesktopTaskNotification | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const fields: Record<string, unknown> = { ...value }
  const text = (name: string, limit: number): string | undefined => {
    const field = fields[name]
    if (typeof field !== 'string') return undefined
    const trimmed = field.trim()
    return trimmed && trimmed.length <= limit ? trimmed : undefined
  }
  const id = text('id', 512)
  const key = text('key', 512)
  const title = text('title', MAX_TEXT)
  const body = text('body', MAX_TEXT)
  return id && key && title && body ? { id, key, title, body } : undefined
}

/**
 * The application identity electron-builder records in the packaged manifest and on the installer's shortcuts.
 * @param manifest - Parsed packaged `package.json`.
 * @returns The packaged application id, or undefined when it is absent or invalid.
 */
export function packagedAppId(manifest: unknown): string | undefined {
  if (typeof manifest !== 'object' || manifest === null || !('dshDesktopAppId' in manifest)) return undefined
  const appId = manifest.dshDesktopAppId
  return typeof appId === 'string' && /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u.test(appId) ? appId : undefined
}

/** Shows at most one notification per key at a time and routes clicks back to the window. */
export class DesktopTaskNotifications {
  private readonly recent = new Map<string, number>()
  // A Notification held only by a local variable can be collected before the click, losing its listener.
  private readonly retained = new Set<Notification>()

  /**
   * @param focus - Restore and focus the application window.
   * @param platform - Native attention implementation, replaceable for platform tests.
   */
  constructor(private readonly focus: () => void, private readonly platform: string = process.platform) {}

  /**
   * Show a notification unless the person is already looking at the application.
   * @param notification - Validated renderer request.
   * @param click - Deliver the click to the requesting renderer.
   * @returns Whether a system notification was shown.
   */
  show(notification: DesktopTaskNotification, click: (id: string) => void): boolean {
    if (!Notification.isSupported()) return false
    if (BrowserWindow.getAllWindows().some(window => !window.isDestroyed() && window.isFocused())) return false
    const now = Date.now()
    for (const [key, time] of this.recent) if (now - time > DEDUPE_WINDOW_MS) this.recent.delete(key)
    const last = this.recent.get(notification.key)
    if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false
    this.recent.set(notification.key, now)

    const native = new Notification({ title: notification.title, body: notification.body })
    this.retained.add(native)
    if (this.retained.size > MAX_RETAINED) {
      const oldest = this.retained.values().next().value
      if (oldest) this.retained.delete(oldest)
    }
    const release = (): void => { this.retained.delete(native) }
    native.once('click', () => {
      release()
      // A hidden or minimized window must be restored before activation, or macOS ignores the focus.
      this.focus()
      if (this.platform === 'darwin') {
        app.dock?.show()
        app.focus({ steal: true })
      }
      click(notification.id)
    })
    native.once('close', release)
    native.once('failed', release)
    native.show()
    return true
  }

  /** Release every retained notification. */
  dispose(): void {
    for (const native of this.retained) native.removeAllListeners()
    this.retained.clear()
    this.recent.clear()
  }
}
