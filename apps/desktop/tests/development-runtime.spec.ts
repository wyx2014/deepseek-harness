/** Development reuse requires current inputs and complete interpreter entry points. */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { workspaceDependencyPaths, type PrimaryRuntimeManifest } from '../../../packages/skill/tool-workspace-dependencies/src/index.ts'
import { primaryRuntimePayloadDigest, type PrimaryRuntimeTarget } from '../../../scripts/primary-runtime/prepare.ts'
import lock from '../../../scripts/primary-runtime/lock.json' with { type: 'json' }
import { canReuseDevelopmentRuntime } from '../scripts/development-runtime.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function fixture(target: PrimaryRuntimeTarget = 'mac-x64') {
  const runtime = await mkdtemp(join(tmpdir(), 'desktop-runtime-reuse-'))
  roots.push(runtime)
  const manifest: PrimaryRuntimeManifest = {
    desktopVersion: '1.0.0', platform: target === 'win-x64' ? 'win32' : target.startsWith('linux-') ? 'linux' : 'darwin',
    arch: target.endsWith('arm64') ? 'arm64' : 'x64', python: lock.pythonVersion,
    node: lock.nodeVersion, pnpm: '11.28.5', pythonPackages: lock.pythonPackages,
    payloadDigest: primaryRuntimePayloadDigest(target, lock, '11.28.5'),
  }
  const root = join(runtime, 'primary-runtime')
  const entries = workspaceDependencyPaths(root, manifest)
  for (const path of [entries.python, entries.node!, entries.pnpm!, join(runtime, 'office-skills/scripts/check_office.py')]) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, 'fixture')
  }
  for (const path of [entries.pythonPackages, entries.nodePackages!]) await mkdir(path, { recursive: true })
  const manifestPath = join(root, 'runtime.json')
  await writeFile(manifestPath, JSON.stringify(manifest))
  return { runtime, manifest, manifestPath, entries, target }
}

it.each(['mac-x64', 'mac-arm64', 'win-x64', 'linux-x64'] as const)('reuses complete %s resources without modifying them', async (target) => {
  const { runtime, manifestPath } = await fixture(target)
  const before = await readFile(manifestPath, 'utf8')
  expect(canReuseDevelopmentRuntime(runtime, target, '1.0.0', '11.28.5')).toBe(true)
  expect(await readFile(manifestPath, 'utf8')).toBe(before)
})

it('requires preparation when version, package manager, target, or locked payload changes', async () => {
  const { runtime, manifest, manifestPath } = await fixture()
  expect(canReuseDevelopmentRuntime(runtime, 'mac-x64', '2.0.0', '11.28.5')).toBe(false)
  expect(canReuseDevelopmentRuntime(runtime, 'mac-x64', '1.0.0', '11.28.6')).toBe(false)
  expect(canReuseDevelopmentRuntime(runtime, 'mac-arm64', '1.0.0', '11.28.5')).toBe(false)
  await writeFile(manifestPath, JSON.stringify({ ...manifest, payloadDigest: '0'.repeat(64) }))
  expect(canReuseDevelopmentRuntime(runtime, 'mac-x64', '1.0.0', '11.28.5')).toBe(false)
})

it.each(['python', 'node', 'pnpm', 'pythonPackages', 'nodePackages', 'office', 'manifest'] as const)(
  'requires preparation when %s is missing', async (name) => {
    const { runtime, entries, manifestPath } = await fixture()
    const path = name === 'office' ? join(runtime, 'office-skills/scripts/check_office.py')
      : name === 'manifest' ? manifestPath : entries[name]!
    await rm(path, { recursive: true, force: true })
    expect(canReuseDevelopmentRuntime(runtime, 'mac-x64', '1.0.0', '11.28.5')).toBe(false)
  },
)

it('reports malformed metadata without treating it as a reusable payload', async () => {
  const { runtime, manifestPath } = await fixture()
  await writeFile(manifestPath, '{}')
  expect(() => canReuseDevelopmentRuntime(runtime, 'mac-x64', '1.0.0', '11.28.5')).toThrow('invalid metadata')
})
