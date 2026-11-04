/** Desktop profile initialization and native recovery. */

import {
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  closeSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { join } from 'node:path'
import {
  DESKTOP_HOST_PACKAGE,
  desktopCorePackageOverrides,
  verifyDesktopCorePackageSet,
} from './core-package-set.ts'
import type { DesktopPaths } from './paths.ts'
import type { DesktopRelease } from './release.ts'
import { readDesktopRuntime } from './runtime-tree.ts'
import { readDesktopProductBundles } from './product.ts'
import {
  initProfile, PROFILE_TEMPLATES, readProfileManifest, removeLinkProjections, sanitizeProfile, writeProfileManifest, type ProfileTemplate,
} from '@deepseek-ai/dsh-app-boot'

const PROJECT_NAME = '@deepseek-ai/dsh-desktop-runtime'
const DSH_PACKAGE = '@deepseek-ai/dsh'
const CORE_BUILD_PACKAGE = '@deepseek-ai/dsh-subprocess-local'
const WEB_PROFILE = PROFILE_TEMPLATES.web as ProfileTemplate
const WORKSPACE_SETTINGS = 'nodeLinker: hoisted\nautoInstallPeers: false\n'
const PRODUCT_BUNDLE_HISTORY = 'dshDesktopProductBundles'
function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, undefined, 2)}\n`, { mode: 0o600 })
}

function workspaceFile(overrides: Readonly<Record<string, string>> = {}): string {
  const entries = Object.entries(overrides).sort(([left], [right]) => left.localeCompare(right))
  const overrideSection = entries.length === 0
    ? ''
    : `overrides:\n${entries.map(([name, spec]) => `  ${JSON.stringify(name)}: ${JSON.stringify(spec)}`).join('\n')}\n`
  if (entries.length === 0) return `packages:\n  - .\n\n${WORKSPACE_SETTINGS}`
  const coreBuildSpec = overrides[CORE_BUILD_PACKAGE]
  const coreBuildKey = coreBuildSpec === undefined
    ? CORE_BUILD_PACKAGE
    : `${CORE_BUILD_PACKAGE}@${coreBuildSpec.replace('file:./', 'file:')}`
  return `packages:\n  - .\n\n${overrideSection}${WORKSPACE_SETTINGS}allowBuilds:\n  node-pty: true\n  koffi: true\n  fs-ext: true\n  ${JSON.stringify(coreBuildKey)}: true\n  '@google/genai': false\n  protobufjs: false\n  node-addon-require-builtin: false\n`
}

function migrateProfileSettings(projectDir: string): void {
  const path = join(projectDir, 'pnpm-workspace.yaml')
  if (!existsSync(path)) return
  const legacy = `packages:\n  - .\n\n${WORKSPACE_SETTINGS}strictDepBuilds: true\nallowBuilds:\n  node-pty: true\n  koffi: true\n  fs-ext: true\n  "${CORE_BUILD_PACKAGE}": true\n  '@google/genai': false\n  protobufjs: false\n  node-addon-require-builtin: false\n`
  if (readFileSync(path, 'utf8').replaceAll('\r\n', '\n') === legacy) {
    writeFileSync(path, workspaceFile())
  }
}

/** Initializes the Desktop profile and disables third-party bundles during recovery. */
export class DesktopProjectManager {
  /**
   * @param paths - Electron-owned package state and reserved desktop profile paths.
   * @param runtime - location of the bundled application runtime.
   */
  constructor(
    readonly paths: DesktopPaths,
    readonly runtime: { readonly dsh: string },
  ) {}

  /**
   * Back up the profile patch and disable third-party bundles and automatic product enrollment without loading application resources.
   * The caller must stop the Host first.
   * @returns Backup path after the locked profile write, or undefined if the patch was absent.
   */
  async disableAllPlugins(): Promise<string | undefined> {
    return this.withLock(() => {
      const backup = sanitizeProfile('dsh', this.paths.profile, WEB_PROFILE.bundles)
      if (existsSync(join(this.paths.profile, 'package.json'))) {
        const manifest = { ...readProfileManifest('dsh', this.paths.profile), [PRODUCT_BUNDLE_HISTORY]: false }
        writeProfileManifest(this.paths.profile, manifest)
      }
      return backup
    })
  }

  /**
   * Load application metadata and prepare the external plugin profile without installing packages.
   */
  async applyRelease(): Promise<void> {
    await this.withLock(() => {
      // Validation only: an unreadable or mismatched runtime descriptor stops preparation before the Host starts.
      const runtime = readDesktopRuntime(this.runtime.dsh)
      const productBundles = readDesktopProductBundles(this.runtime.dsh, runtime)
      migrateProfileSettings(this.paths.profile)
      createPluginProfile(this.paths.profile, productBundles)
      removeLinkProjections(this.paths.profile)
    })
  }

  private async withLock<T>(operation: () => T | Promise<T>): Promise<T> {
    mkdirSync(this.paths.profile, { recursive: true, mode: 0o700 })
    const lockPath = join(realpathSync(this.paths.profile), 'lock')
    let descriptor: number
    try {
      descriptor = openSync(lockPath, 'wx', 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        const lock = lstatSync(lockPath)
        if (lock.isSymbolicLink() || !lock.isFile()) {
          throw new Error('desktop project: profile lock is not a regular file')
        }
        const owner = Number.parseInt(readFileSync(lockPath, 'utf8').trim(), 10)
        let active = !Number.isSafeInteger(owner) || owner <= 0
        if (!active) {
          try {
            process.kill(owner, 0)
            active = true
          } catch (signalError) {
            active = (signalError as NodeJS.ErrnoException).code !== 'ESRCH'
          }
        }
        if (active) throw new Error('desktop project: another profile operation is active')
        unlinkSync(lockPath)
        descriptor = openSync(lockPath, 'wx', 0o600)
      } else {
        throw error
      }
    }
    try {
      writeSync(descriptor, `${String(process.pid)}\n`)
      fsyncSync(descriptor)
      return await operation()
    } finally {
      closeSync(descriptor)
      unlinkSync(lockPath)
    }
  }
}

/** Create build-only project metadata for materializing the signed runtime. */
export function createRuntimeProjectMetadata(projectDir: string, release: DesktopRelease): void {
  mkdirSync(projectDir, { recursive: true, mode: 0o700 })
  const packageSet = verifyDesktopCorePackageSet(projectDir, release.version)
  const manifest = {
    name: PROJECT_NAME,
    private: true,
    version: '0.0.0',
    dependencies: desktopCorePackageOverrides(packageSet),
    dsh: { profile: { bundles: [...new Set([...WEB_PROFILE.bundles, ...readDesktopProductBundles(projectDir)])] } },
  }
  writeJson(join(projectDir, 'package.json'), manifest)
  writeFileSync(
    join(projectDir, 'pnpm-workspace.yaml'),
    workspaceFile(desktopCorePackageOverrides(packageSet)),
    { mode: 0o600 },
  )
}

/**
 * Create metadata for the unpackaged development project that links the current workspace.
 * @param projectDir - Disposable development profile directory.
 * @param release - Release identity shared by the linked CLI package and Electron shell.
 */
export function createDevelopmentProjectMetadata(projectDir: string, release: DesktopRelease): void {
  mkdirSync(projectDir, { recursive: true, mode: 0o700 })
  const manifest = {
    name: PROJECT_NAME,
    private: true,
    version: '0.0.0',
    dependencies: {
      [DSH_PACKAGE]: release.version,
      [DESKTOP_HOST_PACKAGE]: release.version,
    },
    dsh: { profile: { bundles: [...WEB_PROFILE.bundles] } },
  }
  writeJson(join(projectDir, 'package.json'), manifest)
  writeFileSync(join(projectDir, 'pnpm-workspace.yaml'), workspaceFile(), { mode: 0o600 })
}

/**
 * Initialize profile files and enable newly shipped product bundles once, retaining user configuration.
 * @param projectDir - User profile directory.
 * @param productBundles - Installed product defaults; an empty list only initializes missing profile files.
 */
export function createPluginProfile(projectDir: string, productBundles: readonly string[] = []): void {
  initProfile(projectDir, [...new Set([...WEB_PROFILE.bundles, ...productBundles])])
  if (productBundles.length === 0) return
  const manifest = readProfileManifest('dsh', projectDir)
  const previous = PRODUCT_BUNDLE_HISTORY in manifest ? manifest[PRODUCT_BUNDLE_HISTORY] : []
  // Recovery disables automatic product enrollment, including on profiles created before history was recorded.
  if (previous === false) return
  if (!Array.isArray(previous) || !previous.every((name: unknown) => typeof name === 'string')) {
    throw new Error(`desktop project: ${PRODUCT_BUNDLE_HISTORY} in ${join(projectDir, 'package.json')} must be a bundle-name array or false`)
  }
  if (previous.length === productBundles.length && previous.every((name, index) => name === productBundles[index])) return
  if (manifest.dsh !== undefined && (manifest.dsh === null || typeof manifest.dsh !== 'object' || Array.isArray(manifest.dsh))
    || manifest.dsh?.profile !== undefined && (manifest.dsh.profile === null || typeof manifest.dsh.profile !== 'object' || Array.isArray(manifest.dsh.profile))) {
    throw new Error(`desktop project: dsh.profile in ${join(projectDir, 'package.json')} must hold an object`)
  }
  const enabled = manifest.dsh?.profile?.bundles ?? []
  if (!Array.isArray(enabled) || !enabled.every((name: unknown) => typeof name === 'string')) {
    throw new Error(`desktop project: dsh.profile.bundles in ${join(projectDir, 'package.json')} must be a bundle-name array`)
  }
  const additions = productBundles.filter(name => !previous.includes(name) && !enabled.includes(name))
  const updated = {
    ...manifest,
    dsh: { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: [...enabled, ...additions] } },
    [PRODUCT_BUNDLE_HISTORY]: [...productBundles],
  }
  writeProfileManifest(projectDir, updated)
}
