import { afterEach, expect, it, vi } from 'vitest'
import { DesktopTaskNotifications, packagedAppId, parseDesktopTaskNotification } from '../src/task-notifications.ts'

const native = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events')
  const notices: Notice[] = []
  class Notice extends EventEmitter {
    static isSupported = vi.fn(() => true)
    show = vi.fn()
    constructor(readonly options: unknown) { super(); notices.push(this) }
  }
  const windows: { isDestroyed(): boolean; isFocused(): boolean }[] = []
  return { notices, Notice, windows, app: { dock: { show: vi.fn() }, focus: vi.fn() } }
})
vi.mock('electron', () => ({ Notification: native.Notice, app: native.app, BrowserWindow: { getAllWindows: () => native.windows } }))
afterEach(() => {
  native.notices.length = 0
  native.windows.length = 0
  vi.clearAllMocks()
  vi.useRealTimers()
  native.Notice.isSupported.mockReturnValue(true)
})

const request = { id: 'session:one', key: 'completed:one', title: 'Task completed', body: 'Task: Fix the build' }

it('accepts only complete, bounded renderer requests', () => {
  expect(parseDesktopTaskNotification({ ...request, title: '  Task completed  ', extra: true })).toEqual(request)
  expect(parseDesktopTaskNotification({ ...request, body: '   ' })).toBeUndefined()
  expect(parseDesktopTaskNotification({ ...request, title: 'x'.repeat(1025) })).toBeUndefined()
  expect(parseDesktopTaskNotification({ id: 'a', key: 'b', title: 'c' })).toBeUndefined()
  expect(parseDesktopTaskNotification('notification')).toBeUndefined()
})

it('reads the packaged application identity used by the installer shortcuts', () => {
  expect(packagedAppId({ dshDesktopAppId: 'com.tpcowork.desktop' })).toBe('com.tpcowork.desktop')
  expect(packagedAppId({ dshDesktopAppId: 'not an id' })).toBeUndefined()
  expect(packagedAppId({})).toBeUndefined()
})

it.each(['win32', 'darwin'])('shows a native notification in the background and focuses the window on click: %s', (platform) => {
  const focus = vi.fn()
  const click = vi.fn()
  native.windows.push({ isDestroyed: () => false, isFocused: () => false })
  const notifications = new DesktopTaskNotifications(focus, platform)
  expect(notifications.show(request, click)).toBe(true)
  expect(native.notices).toHaveLength(1)
  expect(native.notices[0]!.options).toEqual({ title: request.title, body: request.body })
  expect(native.notices[0]!.show).toHaveBeenCalledOnce()
  native.notices[0]!.emit('click')
  expect(focus).toHaveBeenCalledOnce()
  expect(click).toHaveBeenCalledWith('session:one')
  if (platform === 'darwin') expect(native.app.focus).toHaveBeenCalledWith({ steal: true })
  else expect(native.app.focus).not.toHaveBeenCalled()
})

it('stays quiet while the application is focused, unsupported, or repeating the same key', () => {
  vi.useFakeTimers()
  const notifications = new DesktopTaskNotifications(vi.fn(), 'win32')
  native.windows.push({ isDestroyed: () => false, isFocused: () => true })
  expect(notifications.show(request, vi.fn())).toBe(false)
  native.windows.length = 0
  native.Notice.isSupported.mockReturnValue(false)
  expect(notifications.show(request, vi.fn())).toBe(false)
  native.Notice.isSupported.mockReturnValue(true)
  expect(notifications.show(request, vi.fn())).toBe(true)
  expect(notifications.show({ ...request, id: 'session:one:again' }, vi.fn())).toBe(false)
  expect(notifications.show({ ...request, key: 'completed:two' }, vi.fn())).toBe(true)
  vi.advanceTimersByTime(3001)
  expect(notifications.show(request, vi.fn())).toBe(true)
  expect(native.notices).toHaveLength(3)
})
