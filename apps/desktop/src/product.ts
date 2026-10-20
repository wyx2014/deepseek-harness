/** Product-owned build inputs and relocatable bundle defaults carried by Desktop. */

import { readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { DesktopRuntimeDescriptor } from './runtime-tree.ts'

/** Product bundle defaults sealed into the runtime inventory. */
export const DESKTOP_PRODUCT_FILE = 'desktop-product.json'
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u

/** Build inputs resolved relative to the product configuration, outside the harness fork. */
export interface DesktopProduct {
  readonly config: string
  readonly productName: string
  readonly artifactPrefix: string
  readonly appId: string
  readonly bundles: readonly string[]
  readonly prepare: string
  readonly packages: string
  readonly icon: string | undefined
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function bundles(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((name): name is string => typeof name === 'string' && PACKAGE_NAME.test(name))
    || new Set(value).size !== value.length) {
    throw new Error('desktop product: bundles must be distinct npm package names')
  }
  return value
}

function productPath(root: string, value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`desktop product: ${field} must name a relative path`)
  const path = resolve(root, value)
  const offset = relative(root, path)
  if (isAbsolute(value) || isAbsolute(offset) || offset === '..' || offset.startsWith('../') || offset.startsWith('..\\')) {
    throw new Error(`desktop product: ${field} must stay inside the product directory`)
  }
  return path
}

/**
 * Read product branding, bundle names, and its Node preparation script before building.
 * @param path - Product JSON filename; preparation and package paths resolve beside it.
 * @returns Validated build inputs; rejects malformed configuration or a missing preparation script.
 */
export function readDesktopProduct(path: string): DesktopProduct {
  const config = resolve(path)
  const value: unknown = JSON.parse(readFileSync(config, 'utf8'))
  if (!record(value) || value.schemaVersion !== 1
    || typeof value.productName !== 'string' || !value.productName.trim() || /[\x00-\x1f<>:"/\\|?*]/u.test(value.productName)
    || typeof value.artifactPrefix !== 'string' || !/^[a-z0-9][a-z0-9-]*$/u.test(value.artifactPrefix)
    || typeof value.appId !== 'string' || !/^[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z][A-Za-z0-9-]*)+$/u.test(value.appId)) {
    throw new Error('desktop product: expected schemaVersion 1, productName, artifactPrefix and appId')
  }
  const prepare = productPath(dirname(config), value.prepare, 'prepare')
  if (!statSync(prepare).isFile()) throw new Error('desktop product: prepare must name a Node script')
  const icon = value.icon === undefined ? undefined : productPath(dirname(config), value.icon, 'icon')
  if (icon !== undefined && !statSync(icon).isFile()) throw new Error('desktop product: icon must name an image file')
  return { config, productName: value.productName, artifactPrefix: value.artifactPrefix, appId: value.appId,
    bundles: bundles(value.bundles), prepare, packages: productPath(dirname(config), value.packages, 'packages'), icon }
}

/**
 * Read the bundled profile defaults; older runtimes without product metadata use no extra bundles.
 * @param root - Package-set, build project, or installed runtime directory.
 * @param runtime - Installed inventory used to reject missing metadata or unavailable product packages.
 * @returns Ordered product bundles, excluding the shared Web defaults.
 */
export function readDesktopProductBundles(root: string, runtime?: DesktopRuntimeDescriptor): readonly string[] {
  let text: string
  try { text = readFileSync(join(root, DESKTOP_PRODUCT_FILE), 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !runtime?.files.some(file => file.path === DESKTOP_PRODUCT_FILE)) return []
    throw error
  }
  const value: unknown = JSON.parse(text)
  if (!record(value) || value.schemaVersion !== 1) throw new Error('desktop product: invalid bundled profile defaults')
  const names = bundles(value.bundles)
  for (const name of names) {
    if (runtime !== undefined && !runtime.sharedPackages.some(pkg => pkg.name === name)) {
      throw new Error(`desktop product: runtime omits bundle ${name}`)
    }
  }
  return names
}
