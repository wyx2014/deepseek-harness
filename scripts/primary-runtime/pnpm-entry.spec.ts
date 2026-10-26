import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { prepareRuntimePnpm } from './prepare.ts'

interface RenameReport {
  attempts: number
  delays: number[]
  observed: string[]
  code: string | null
  arguments: string[]
}

/** Exercise the actual shipped launcher in an isolated process with a controlled OS boundary. */
async function runRename(platform: string, errors: string[], wrapped = true): Promise<{
  status: number | null
  source: string | undefined
  destination: string
  report: RenameReport
}> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-pnpm-rename-'))
  try {
    await mkdir(join(root, 'bin'))
    await writeFile(join(root, 'replacement'), 'new manifest')
    await writeFile(join(root, 'package.json'), 'old manifest')
    // The mock owns only the callback rename and clock. Actual file replacement
    // remains native, and every failed attempt checks the original still exists.
    await writeFile(join(root, 'preload.mjs'), `
      import fs from 'node:fs'
      Object.defineProperty(process, 'platform', { value: ${JSON.stringify(platform)} })
      const errors = ${JSON.stringify(errors)}
      const rename = fs.rename
      const report = globalThis.report = { attempts: 0, delays: [], observed: [] }
      let now = 0
      Object.defineProperty(globalThis, 'performance', { value: { now: () => now } })
      globalThis.setTimeout = (callback, delay) => {
        report.delays.push(delay)
        now += delay
        queueMicrotask(callback)
      }
      fs.rename = (source, destination, callback) => {
        const code = errors[Math.min(report.attempts++, errors.length - 1)]
        if (code) {
          report.observed.push(fs.readFileSync(destination, 'utf8'))
          queueMicrotask(() => callback(Object.assign(new Error('rename blocked'), { code })))
        } else rename(source, destination, callback)
      }
    `)
    await writeFile(join(root, 'bin', 'pnpm.mjs'), `
      import fs from 'node:fs'
      fs.rename('replacement', 'package.json', (error) => {
        fs.writeFileSync('report.json', JSON.stringify({ ...globalThis.report,
          code: error?.code ?? null, arguments: process.argv.slice(2) }))
        if (error) process.exitCode = 1
      })
    `)
    if (wrapped) await prepareRuntimePnpm(root)
    const result = spawnSync(process.execPath, ['--import', join(root, 'preload.mjs'), join(root, 'bin', 'pnpm.mjs'), 'add', 'file:plugin'], {
      cwd: root, encoding: 'utf8', timeout: 10_000,
    })
    expect(result.error, result.stderr).toBeUndefined()
    expect(result.signal, result.stderr).toBeNull()
    return {
      status: result.status,
      source: await readFile(join(root, 'replacement'), 'utf8').catch((error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
        throw error
      }),
      destination: await readFile(join(root, 'package.json'), 'utf8'),
      report: JSON.parse(await readFile(join(root, 'report.json'), 'utf8')) as RenameReport,
    }
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
}

it('exposes the unwrapped atomic-rename regression', async () => {
  const result = await runRename('win32', ['EPERM', ''], false)
  expect(result.status).toBe(1)
  expect(result.report).toMatchObject({ attempts: 1, delays: [], code: 'EPERM' })
  expect(result.source).toBe('new manifest')
  expect(result.destination).toBe('old manifest')
})

it('recovers transient Windows sharing errors without removing the existing manifest', async () => {
  const result = await runRename('win32', ['EPERM', 'EACCES', 'EBUSY', ''])
  expect(result.status).toBe(0)
  expect(result.source).toBeUndefined()
  expect(result.destination).toBe('new manifest')
  expect(result.report).toEqual({ attempts: 4, delays: [10, 20, 40],
    observed: ['old manifest', 'old manifest', 'old manifest'], code: null, arguments: ['add', 'file:plugin'] })
})

it.each(['EPERM', 'EACCES', 'EBUSY'])('bounds persistent %s errors and preserves both files', async (code) => {
  const result = await runRename('win32', [code])
  expect(result.status).toBe(1)
  expect(result.report.code).toBe(code)
  expect(result.report.delays.reduce((sum, delay) => sum + delay, 0)).toBe(5000)
  expect(result.source).toBe('new manifest')
  expect(result.destination).toBe('old manifest')
})

it('reports non-sharing errors immediately', async () => {
  const result = await runRename('win32', ['ENOENT'])
  expect(result.status).toBe(1)
  expect(result.report).toMatchObject({ attempts: 1, delays: [], code: 'ENOENT' })
})

it('leaves POSIX rename behavior unchanged', async () => {
  const result = await runRename('linux', ['EPERM', ''])
  expect(result.status).toBe(1)
  expect(result.report).toMatchObject({ attempts: 1, delays: [], code: 'EPERM' })
})
