import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import { DesktopBrowserPlugin } from '../src/browser-plugin.ts'

it('keeps ordinary desktop browsing available when the optional native payload is absent', async () => {
  const plugin = new DesktopBrowserPlugin('/missing/dsh-browser/desktop.js', {
    userData: '/unused', window: () => undefined, hostUrl: () => undefined,
  })
  expect(await plugin.request('snapshot', {})).toMatchObject({ enabled: false, tabs: [] })
  await expect(plugin.request(42, {})).rejects.toThrow('Invalid desktop browser request')
  await expect(plugin.request('command', [])).rejects.toThrow('Invalid desktop browser request')
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const reply = vi.fn()
    await plugin.receive({ type: 'tpcowork-browser', id: 'missing' }, reply)
    expect(reply.mock.calls).toMatchObject([[{ id: 'missing', error: { code: 'native_unavailable' } }]])
    await plugin.dispose()
  } finally { error.mockRestore() }
})

it('loads the native adapter once and waits for disconnect and final cleanup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-browser-adapter-'))
  try {
    const path = join(root, 'desktop.mjs')
    await writeFile(path, `await new Promise(resolve => setTimeout(resolve, 20));
    export function createDesktopBrowser() {
      let enabled = true;
      return { willAttach: () => enabled, didAttach: () => enabled,
        request: async () => ({ enabled }),
        handleHost: async (message, reply) => reply({ id: message.id, enabled }),
        disable: async () => { await new Promise(resolve => setTimeout(resolve, 10)); enabled = false },
        dispose: async () => { enabled = false },
      };
    }`)
    const plugin = new DesktopBrowserPlugin(path, { userData: root, window: () => undefined, hostUrl: () => undefined })
    const reply = vi.fn()
    const loading = plugin.receive({ id: 'loaded' }, reply)
    const disconnecting = plugin.disconnect()
    await loading
    expect(reply).toHaveBeenCalledWith({ id: 'loaded', enabled: true })
    await disconnecting
    expect(await plugin.request('snapshot', {})).toEqual({ enabled: false })
    await plugin.dispose()
  } finally { await rm(root, { recursive: true, force: true }) }
})
