import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { writeAtomic } from '../src/atomic.ts'

const state = vi.hoisted(() => ({ refuseRenames: false }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    rename: (async (...args: Parameters<typeof actual.rename>) => {
      if (state.refuseRenames) throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' })
      return actual.rename(...args)
    }),
  }
})

const directories: string[] = []

afterEach(async () => {
  state.refuseRenames = false
  vi.restoreAllMocks()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

it('saves workspace.json on a Windows machine whose security software refuses every rename', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  state.refuseRenames = true
  const directory = await mkdtemp(join(tmpdir(), 'storage-json-'))
  directories.push(directory)
  const path = join(directory, 'workspace.json')
  await writeFile(path, '{"workspaces":[]}')

  await writeAtomic(path, '{"workspaces":["D:\\\\workspace\\\\AI\\\\2026"]}')

  expect(await readFile(path, 'utf8')).toBe('{"workspaces":["D:\\\\workspace\\\\AI\\\\2026"]}')
  expect(await readdir(directory)).toEqual(['workspace.json'])
})
