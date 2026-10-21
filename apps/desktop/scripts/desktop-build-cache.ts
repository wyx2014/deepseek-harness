/**
 * Reuse the repository build and its packed tarballs across packaging runs of one checkout.
 *
 * The build stages before runtime preparation depend only on the checkout (commit, working-tree
 * changes such as product branding, untracked files), the toolchain and the public build
 * environment. A run that matches all of them restores the previous outputs instead of compiling
 * again; anything else rebuilds. The cache is opt-in through {@link DESKTOP_BUILD_CACHE_ENV}.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative, resolve, sep } from 'node:path'

/** Directory holding the snapshot of the latest build; unset disables the cache. */
export const DESKTOP_BUILD_CACHE_ENV = 'DSH_DESKTOP_BUILD_CACHE_DIR'

/** Values that change on every run or only configure signing, so they never invalidate the build. */
const VOLATILE_ENV = /^(?:DSH_DESKTOP_BUILD_VERSION|DSH_DESKTOP_PACKAGING_RUN_DIR|DSH_DESKTOP_BUILD_CACHE_DIR|DSH_DESKTOP_WINDOWS_.*)$/u
const SECRET_ENV = /KEY|SECRET|TOKEN|PASSWORD|PIN|APPLE_ID/iu

/** Snapshot metadata written beside each archive. */
interface DesktopBuildSnapshot {
  readonly schemaVersion: 1
  readonly key: string
  readonly entries: readonly string[]
}

function git(root: string, args: readonly string[]): Buffer {
  return execFileSync('git', args, { cwd: root, maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}

function nulList(output: Buffer): string[] {
  return output.toString('utf8').split('\0').filter(entry => entry !== '')
}

/**
 * Identify one build input state.
 * @param root Repository root.
 * @param target Packaging target name.
 * @param environment Environment the build stages run with.
 * @returns Hex digest that changes whenever a build input may have changed.
 */
export function desktopBuildCacheKey(root: string, target: string, environment: NodeJS.ProcessEnv): string {
  const hash = createHash('sha256')
  const field = (value: string | Buffer): void => { hash.update(String(value.length)).update(':').update(value) }
  field(git(root, ['rev-parse', 'HEAD']))
  field(git(root, ['diff', 'HEAD', '--binary']))
  for (const path of nulList(git(root, ['ls-files', '-z', '--others', '--exclude-standard'])).sort()) {
    field(path)
    field(readFileSync(join(root, path)))
  }
  const publicEnvironment = Object.entries(environment)
    .filter(([name, value]) => value !== undefined && /^(?:DSH_|DOWNLOAD_)/u.test(name)
      && !VOLATILE_ENV.test(name) && !SECRET_ENV.test(name))
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
  field(JSON.stringify({ target, node: process.version, platform: process.platform, arch: process.arch, environment: publicEnvironment }))
  return hash.digest('hex')
}

/**
 * List the ignored build outputs to capture, as repository-relative paths.
 * @param root Repository root.
 * @param packed Directory of packed tarballs inside the excluded desktop build directory.
 * @returns Ignored files, plus the packed directory with a trailing slash, produced by the build stages.
 */
export function desktopBuildOutputs(root: string, packed: string): string[] {
  // Files, not collapsed directories: an untracked directory holding only ignored content would
  // otherwise be reported whole, excluded downloads and dependencies included.
  const entries = nulList(git(root, ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--', '.',
    ':(exclude,glob)**/node_modules/**', ':(exclude,glob)**/.desktop-build/**']))
    .filter((entry) => {
      const segments = entry.split('/')
      const name = segments.at(-1) ?? ''
      return !segments.some(segment => EXCLUDED_SEGMENTS.has(segment))
        && !name.startsWith('.env') && !name.endsWith('.p12') && name !== 'CLAUDE.local.md' && name !== '.DS_Store'
    })
  return [...entries, `${relative(root, packed).split(sep).join('/')}/`].sort()
}

/** Ignored local state that no build stage produces. */
const EXCLUDED_SEGMENTS = new Set(['node_modules', '.desktop-build', '.cache', '.pnpm-store', 'coverage', 'tmp',
  '.claude', '.vscode', '.idea', '.worktrees', 'worktrees'])

function treeState(root: string): string {
  return createHash('sha256')
    .update(git(root, ['diff', 'HEAD', '--binary']))
    .update(git(root, ['ls-files', '-z', '--others', '--exclude-standard']))
    .digest('hex')
}

/** The part of the repository's `tar` dependency this cache uses. */
interface TarLibrary {
  c(options: { file: string; cwd: string; portable: boolean }, entries: readonly string[]): Promise<void>
  x(options: { file: string; cwd: string; preservePaths: boolean }): Promise<void>
}

function tarLibrary(root: string): TarLibrary {
  return createRequire(join(root, 'package.json'))('tar') as TarLibrary
}

/** Where the cache lives and what identifies one build. */
export interface DesktopBuildCacheOptions {
  /** Cache directory; undefined or blank runs the build uncached. */
  readonly directory: string | undefined
  readonly root: string
  readonly packed: string
  readonly target: string
  /** Environment the build stages run with. */
  readonly environment: NodeJS.ProcessEnv
  readonly log?: (message: string) => void
}

/**
 * Run the build stages, or restore the outputs of an identical earlier run.
 * @param options Cache location, repository, packed directory and the cache key inputs.
 * @param build Stages whose outputs are captured.
 * @returns Whether the outputs were restored instead of built.
 */
export async function withDesktopBuildCache(
  options: DesktopBuildCacheOptions,
  build: () => Promise<void>,
): Promise<boolean> {
  const log = options.log ?? ((message: string) => { process.stdout.write(`${message}\n`) })
  if (options.directory === undefined || options.directory.trim() === '') {
    await build()
    return false
  }
  const directory = resolve(options.directory)
  const key = desktopBuildCacheKey(options.root, options.target, options.environment)
  const archive = join(directory, `${key}.tar`)
  const metadata = join(directory, `${key}.json`)
  if (existsSync(archive) && existsSync(metadata)) {
    const snapshot = JSON.parse(readFileSync(metadata, 'utf8')) as DesktopBuildSnapshot
    if (snapshot.schemaVersion === 1 && snapshot.key === key) {
      // Earlier outputs of another input state must not survive beside the restored ones.
      for (const entry of snapshot.entries) rmSync(join(options.root, entry), { recursive: true, force: true })
      await tarLibrary(options.root).x({ file: archive, cwd: options.root, preservePaths: false })
      log(`desktop build cache: restored ${String(snapshot.entries.length)} build output(s) for ${key.slice(0, 12)}`)
      return true
    }
  }
  log(`desktop build cache: no build for ${key.slice(0, 12)}; building`)
  const before = treeState(options.root)
  await build()
  if (treeState(options.root) !== before) {
    log('desktop build cache: the build changed tracked or untracked sources; not caching it')
    return false
  }
  const entries = desktopBuildOutputs(options.root, options.packed)
  mkdirSync(directory, { recursive: true })
  // One snapshot per cache directory: the latest build is the only one a later run can match cheaply.
  for (const name of readdirSync(directory)) rmSync(join(directory, name), { recursive: true, force: true })
  await tarLibrary(options.root).c({ file: `${archive}.tmp`, cwd: options.root, portable: true }, entries)
  writeFileSync(metadata, `${JSON.stringify({ schemaVersion: 1, key, entries } satisfies DesktopBuildSnapshot, null, 2)}\n`)
  renameSync(`${archive}.tmp`, archive)
  log(`desktop build cache: saved ${String(entries.length)} build output(s) for ${key.slice(0, 12)}`)
  return false
}
