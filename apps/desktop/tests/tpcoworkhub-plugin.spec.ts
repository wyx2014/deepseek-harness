import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import { DesktopTpcoworkHubPlugin } from '../src/tpcoworkhub-plugin.ts'

const options = { owner: () => undefined, hostUrl: () => undefined, send: vi.fn(), changed: vi.fn() }

it('keeps the account visibly unavailable when the optional native payload is absent', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const plugin = new DesktopTpcoworkHubPlugin('/missing/tpcoworkhub/desktop.js', options)
    expect(await plugin.state()).toEqual({ status: 'unavailable', phase: 'idle', error: 'failed' })
    expect(await plugin.start()).toEqual({ status: 'unavailable', phase: 'idle', error: 'failed' })
    await plugin.dispose()
  } finally { error.mockRestore() }
})

it('loads the native adapter once and delegates every operation to it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-tpcoworkhub-adapter-'))
  try {
    const path = join(root, 'desktop.mjs')
    await writeFile(path, `await new Promise(resolve => setTimeout(resolve, 20));
    export function createDesktopTpcoworkHub(options) {
      let status = 'signed_out';
      const state = () => ({ status, phase: 'idle' });
      return { state: async () => state(),
        start: async () => { status = 'signed_in'; return state() },
        cancel: async () => state(),
        signOut: async () => { status = 'signed_out'; return state() },
        dispose: async () => {},
      };
    }`)
    const plugin = new DesktopTpcoworkHubPlugin(path, options)
    expect(await plugin.state()).toEqual({ status: 'signed_out', phase: 'idle' })
    expect(await plugin.start()).toEqual({ status: 'signed_in', phase: 'idle' })
    expect(await plugin.signOut()).toEqual({ status: 'signed_out', phase: 'idle' })
    await plugin.dispose()
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('reports a failing adapter without throwing into the caller', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-tpcoworkhub-adapter-failure-'))
  try {
    const path = join(root, 'desktop.mjs')
    await writeFile(path, `export function createDesktopTpcoworkHub() {
      return { state: async () => { throw new Error('broken') }, start: async () => { throw new Error('broken') },
        cancel: async () => { throw new Error('broken') }, signOut: async () => { throw new Error('broken') }, dispose: async () => {} };
    }`)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const plugin = new DesktopTpcoworkHubPlugin(path, options)
      expect(await plugin.state()).toEqual({ status: 'unavailable', phase: 'idle', error: 'failed' })
      await plugin.dispose()
    } finally { error.mockRestore() }
  } finally { await rm(root, { recursive: true, force: true }) }
})
