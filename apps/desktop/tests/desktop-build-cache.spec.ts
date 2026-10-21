import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { desktopBuildCacheKey, desktopBuildOutputs, withDesktopBuildCache } from '../scripts/desktop-build-cache.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

/** A committed checkout that resolves the repository's own `tar` dependency. */
function checkout(): { root: string; cache: string; packed: string } {
  const parent = mkdtempSync(join(tmpdir(), 'desktop build cache '))
  roots.push(parent)
  const root = join(parent, 'repository')
  mkdirSync(join(root, 'packages/example/src'), { recursive: true })
  writeFileSync(join(root, 'package.json'), '{}')
  writeFileSync(join(root, '.gitignore'), 'node_modules/\nlib/\napps/desktop/.desktop-build/\n.env\n')
  writeFileSync(join(root, 'packages/example/src/index.ts'), 'export const value = 1\n')
  mkdirSync(join(root, 'node_modules'))
  // Symlinks need privileges on Windows; a junction to the real dependency serves the same lookup.
  execFileSync(process.execPath, ['-e', `require('fs').symlinkSync(${JSON.stringify(resolve(import.meta.dirname, '../../../node_modules/tar'))}, ${JSON.stringify(join(root, 'node_modules/tar'))}, 'junction')`])
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' })
  git('init', '-q')
  git('add', '-A')
  git('-c', 'commit.gpgsign=false', '-c', 'user.email=fixture@example.com', '-c', 'user.name=Fixture', 'commit', '-q', '-m', 'init')
  return { root, cache: join(parent, 'cache'), packed: join(root, 'apps/desktop/.desktop-build/targets/win-x64/packed') }
}

/** Stand-in for the compile and pack stages: one ignored library output and one packed tarball. */
function fakeBuild(root: string, packed: string, calls: string[]): () => Promise<void> {
  return async () => {
    calls.push('build')
    mkdirSync(join(root, 'packages/example/lib'), { recursive: true })
    writeFileSync(join(root, 'packages/example/lib/index.js'), `built ${String(calls.length)}`)
    mkdirSync(join(packed, 'dsh'), { recursive: true })
    writeFileSync(join(packed, 'dsh/example.tgz'), 'tarball')
  }
}

it('runs the build directly when no cache directory is configured', async () => {
  const { root, packed } = checkout()
  const calls: string[] = []
  expect(await withDesktopBuildCache({ directory: undefined, root, packed, target: 'win-x64', environment: {}, log: () => {} },
    fakeBuild(root, packed, calls))).toBe(false)
  expect(calls).toEqual(['build'])
})

it('restores an identical checkout instead of building, including the packed tarballs', async () => {
  const { root, cache, packed } = checkout()
  const calls: string[] = []
  const options = { directory: cache, root, packed, target: 'win-x64', environment: { DSH_DESKTOP_PRODUCT_NAME: 'Example' }, log: () => {} }
  expect(await withDesktopBuildCache(options, fakeBuild(root, packed, calls))).toBe(false)
  rmSync(join(root, 'packages/example/lib'), { recursive: true })
  rmSync(join(root, 'apps/desktop/.desktop-build'), { recursive: true })
  expect(await withDesktopBuildCache(options, fakeBuild(root, packed, calls))).toBe(true)
  expect(calls).toEqual(['build'])
  expect(readFileSync(join(root, 'packages/example/lib/index.js'), 'utf8')).toBe('built 1')
  expect(readFileSync(join(packed, 'dsh/example.tgz'), 'utf8')).toBe('tarball')
})

it('rebuilds after a source edit, a new untracked file, or a public build setting changes, keeping one snapshot', async () => {
  const { root, cache, packed } = checkout()
  const calls: string[] = []
  const options = { directory: cache, root, packed, target: 'win-x64', environment: {}, log: () => {} }
  await withDesktopBuildCache(options, fakeBuild(root, packed, calls))
  writeFileSync(join(root, 'packages/example/src/index.ts'), 'export const value = 2\n')
  expect(await withDesktopBuildCache(options, fakeBuild(root, packed, calls))).toBe(false)
  writeFileSync(join(root, 'packages/example/src/extra.ts'), 'export {}\n')
  expect(await withDesktopBuildCache(options, fakeBuild(root, packed, calls))).toBe(false)
  expect(await withDesktopBuildCache({ ...options, environment: { DSH_DESKTOP_APP_ID: 'other' } }, fakeBuild(root, packed, calls))).toBe(false)
  expect(calls).toHaveLength(4)
  expect(readdirSync(cache).sort()).toHaveLength(2)
})

it('ignores per-run versions and signing credentials but never captures secrets or dependencies', () => {
  const { root, packed } = checkout()
  const key = desktopBuildCacheKey(root, 'win-x64', { DSH_DESKTOP_APP_ID: 'example' })
  expect(desktopBuildCacheKey(root, 'win-x64', { DSH_DESKTOP_APP_ID: 'example', DSH_DESKTOP_BUILD_VERSION: '1.2.3',
    DSH_DESKTOP_PACKAGING_RUN_DIR: '/run', DSH_DESKTOP_WINDOWS_TOKEN_PIN: 'pin', DOWNLOAD_TEST_COS_SECRET_KEY: 'secret' })).toBe(key)
  expect(desktopBuildCacheKey(root, 'mac-arm64', { DSH_DESKTOP_APP_ID: 'example' })).not.toBe(key)
  writeFileSync(join(root, '.env'), 'SECRET=1\n')
  mkdirSync(join(root, 'packages/example/lib'), { recursive: true })
  writeFileSync(join(root, 'packages/example/lib/index.js'), '')
  mkdirSync(join(root, 'apps/desktop/.desktop-build/downloads'), { recursive: true })
  writeFileSync(join(root, 'apps/desktop/.desktop-build/downloads/archive.zip'), '')
  expect(desktopBuildOutputs(root, packed)).toEqual(['apps/desktop/.desktop-build/targets/win-x64/packed/', 'packages/example/lib/index.js'])
})

it('does not cache a build that rewrites its own sources', async () => {
  const { root, cache, packed } = checkout()
  const options = { directory: cache, root, packed, target: 'win-x64', environment: {}, log: () => {} }
  await withDesktopBuildCache(options, async () => { writeFileSync(join(root, 'packages/example/src/index.ts'), 'generated\n') })
  expect(existsSync(cache)).toBe(false)
})
