/** Check payloads and Host boot with private native-cache and Harness directories. */
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { readAsar } from 'app-builder-lib/out/asar/asar.js'
import { runtimeArchivePath } from '../../desktop-host/src/office-engine.ts'
import { desktopNodeEnvironment } from '../src/node-environment.ts'
import type { DesktopRuntimeDescriptor } from '../src/runtime-tree.ts'
import { DESKTOP_PRODUCT_FILE, parseDesktopProductBundles, readDesktopProductBundles } from '../src/product.ts'
import { scrubWindowsSigningEnvironment } from './windows-sign.mjs'
import { smokeDesktopRuntime } from './smoke-runtime.ts'
import { verifyRuntimeArchive } from './verify-runtime-archive.ts'

/**
 * Exercise real runtime files and Host composition, including an ASAR root when packaged.
 * @param root Prepared or archived dsh directory.
 * @param node Target Electron executable.
 * @param resourcesRuntime External runtime directory beside the archive.
 * @param descriptor Runtime descriptor already verified against the selected target, which may differ from the build host.
 * @returns Resolves after archive integrity, payload checks, Host startup, Office conversion and teardown.
 */
export async function smokePreparedRuntime(
  root: string, node: string, resourcesRuntime: string, descriptor: DesktopRuntimeDescriptor,
): Promise<void> {
  const cache = await mkdtemp(join(tmpdir(), 'desktop-native-smoke-'))
  const environment = { ...scrubWindowsSigningEnvironment(process.env), NODE_OPTIONS: '',
    NARB_NATIVE_CACHE_DIR: cache, NARB_DISABLE_NATIVE_CACHE: '0' }
  try {
    const archive = runtimeArchivePath(root)
    let productBundles: readonly string[] = []
    if (archive === undefined) {
      productBundles = readDesktopProductBundles(root, descriptor)
    } else {
      await verifyRuntimeArchive(archive, descriptor)
      if (descriptor.files.some(file => file.path === DESKTOP_PRODUCT_FILE)) {
        const contents = await (await readAsar(archive)).readFile(join('dsh', DESKTOP_PRODUCT_FILE))
        productBundles = parseDesktopProductBundles(contents.toString('utf8'), descriptor)
      }
    }
    const { stdout } = await promisify(execFile)(node, [
      '--expose-internals', resolve(import.meta.dirname, '../tests/fixtures/runtime-payload-smoke.mjs'), root, resourcesRuntime,
    ], { timeout: 120_000, windowsHide: true,
      env: desktopNodeEnvironment(node, join(resourcesRuntime, 'bin'), environment) }).catch((error: unknown) => {
      if (error instanceof Error) {
        if ('stdout' in error && typeof error.stdout === 'string') process.stdout.write(error.stdout)
        if ('stderr' in error && typeof error.stderr === 'string') process.stderr.write(error.stderr)
        if ('killed' in error && 'signal' in error) {
          process.stderr.write(`runtime payload: killed=${String(error.killed)}, signal=${String(error.signal)}\n`)
        }
      }
      throw error
    })
    process.stdout.write(stdout)
    await smokeDesktopRuntime(root, node, descriptor, environment, resourcesRuntime, productBundles)
  } finally {
    await rm(cache, { recursive: true, force: true })
  }
}
