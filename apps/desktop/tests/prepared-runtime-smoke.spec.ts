import { existsSync, mkdtempSync, rmSync, writeFileSync, type WriteStream } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { finished } from 'node:stream/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { smokePreparedRuntime } from '../scripts/smoke-prepared-runtime.ts'
import { smokeDesktopRuntime } from '../scripts/smoke-runtime.ts'
import { verifyDesktopRuntime, writeDesktopRuntime } from '../src/runtime-tree.ts'
import { runtimeFixture, writePackage } from './runtime-fixture.ts'

const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'))
const { createPackageWithOptions } = builderRequire('@electron/asar') as {
  createPackageWithOptions: (source: string, destination: string, options: object) => Promise<WriteStream>
}

const { payload } = vi.hoisted(() => ({ payload: vi.fn(async (..._args: unknown[]) => ({ stdout: '' })) }))
vi.mock('node:child_process', async (importOriginal) => {
  const { promisify } = await import('node:util')
  return { ...await importOriginal<typeof import('node:child_process')>(),
    execFile: Object.assign(vi.fn(), { [promisify.custom]: payload }) }
})
vi.mock('../scripts/smoke-runtime.ts', () => ({ smokeDesktopRuntime: vi.fn(async () => {}) }))

const roots: string[] = []
const hostArch = Object.getOwnPropertyDescriptor(process, 'arch')!
afterEach(() => {
  Object.defineProperty(process, 'arch', hostArch)
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

it('retains payload progress and termination details when the child fails', async () => {
  const root = mkdtempSync(join(tmpdir(), 'prepared-runtime-failure-'))
  roots.push(root)
  const fixture = runtimeFixture(root)
  const target = { platform: 'win32' as const, arch: 'x64' }
  writeDesktopRuntime(root, fixture.release, fixture.sharedPackages.map(entry => entry.name), target)
  const descriptor = await verifyDesktopRuntime(root, fixture.release.version, target)
  const failure = Object.assign(new Error('payload timed out'), {
    stdout: 'payload output\n', stderr: 'runtime payload: pty\n', killed: true, signal: 'SIGTERM',
  })
  payload.mockRejectedValueOnce(failure)
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  await expect(smokePreparedRuntime(root, join(root, 'electron'), join(root, 'runtime'), descriptor)).rejects.toBe(failure)
  expect(stdout).toHaveBeenCalledWith('payload output\n')
  expect(stderr).toHaveBeenCalledWith('runtime payload: pty\n')
  expect(stderr).toHaveBeenCalledWith('runtime payload: killed=true, signal=SIGTERM\n')
  expect(smokeDesktopRuntime).not.toHaveBeenCalled()
})

it('smokes an x64 target verified on an arm64 build host without revalidating against the host', async () => {
  const root = mkdtempSync(join(tmpdir(), 'prepared-runtime-target-'))
  roots.push(root)
  const fixture = runtimeFixture(root)
  const target = { platform: 'darwin' as const, arch: 'x64' }
  writeDesktopRuntime(root, fixture.release, fixture.sharedPackages.map(entry => entry.name), target)
  Object.defineProperty(process, 'arch', { ...hostArch, value: 'arm64' })
  await expect(verifyDesktopRuntime(root, fixture.release.version, { ...target, arch: process.arch }))
    .rejects.toThrow(/incompatible/u)
  const descriptor = await verifyDesktopRuntime(root, fixture.release.version, target)
  const electron = join(root, 'target-electron')
  const resources = join(root, 'runtime')
  await smokePreparedRuntime(root, electron, resources, descriptor)
  expect(payload.mock.calls[0]![0]).toBe(electron)
  expect(payload.mock.calls[0]![1]).toEqual(expect.arrayContaining([root, resources]))
  expect(smokeDesktopRuntime).toHaveBeenCalledWith(root, electron, descriptor, expect.any(Object), resources, [])
  const environment = vi.mocked(smokeDesktopRuntime).mock.calls[0]![3]
  expect(existsSync(environment.NARB_NATIVE_CACHE_DIR!)).toBe(false)
})

it.each([1, 99])('reads and validates product defaults inside a real ASAR with schema %i', async (schemaVersion) => {
  const root = mkdtempSync(join(tmpdir(), 'prepared-product-archive-'))
  roots.push(root)
  const source = join(root, 'source')
  const dsh = join(source, 'dsh')
  const fixture = runtimeFixture(dsh)
  const name = '@example/desktop-product'
  const pkg = writePackage(join(dsh, 'node_modules'), name, { dsh: { bundle: { patch: './bundle.yml' } } })
  writeFileSync(join(pkg, 'bundle.yml'), '[]\n')
  writeFileSync(join(dsh, 'desktop-product.json'), JSON.stringify({ schemaVersion, bundles: [name] }))
  const descriptor = writeDesktopRuntime(dsh, fixture.release, [...fixture.sharedPackages.map(pkg => pkg.name), name])
  const archive = join(root, 'app.asar')
  await finished(await createPackageWithOptions(source, archive, {}))
  rmSync(source, { recursive: true })
  const archivedDsh = join(archive, 'dsh')
  const electron = join(root, 'electron')
  const resources = join(root, 'runtime')
  if (schemaVersion === 1) {
    await smokePreparedRuntime(archivedDsh, electron, resources, descriptor)
    expect(smokeDesktopRuntime).toHaveBeenCalledWith(archivedDsh, electron, descriptor, expect.any(Object), resources, [name])
  } else {
    await expect(smokePreparedRuntime(archivedDsh, electron, resources, descriptor)).rejects.toThrow(/invalid bundled profile defaults/u)
    expect(payload).not.toHaveBeenCalled()
    expect(smokeDesktopRuntime).not.toHaveBeenCalled()
  }
})
