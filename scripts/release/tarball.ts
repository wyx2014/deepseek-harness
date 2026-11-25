/**
 * Reading packed npm tarballs and the order file that accompanies them.
 *
 * The release steps after pack treat a directory of tarballs as the unit of
 * work, so they read what a tarball declares rather than what the checkout
 * currently says.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { list } from 'tar'

/** Name of the file recording the order in which a packed family uploads. */
export const PUBLISH_ORDER_FILE = 'publish-order.txt'

/** What a packed tarball calls itself. */
export interface PackedIdentity {
  /** Package name from the packed manifest. */
  readonly name: string
  /** Package version from the packed manifest. */
  readonly version: string
}

/**
 * List a tarball's members.
 * @param tarball - absolute tarball path.
 * @returns Every path inside the archive.
 */
export function tarballFiles(tarball: string): string[] {
  const files: string[] = []
  list({ file: tarball, sync: true, strict: true, onReadEntry: (entry) => { files.push(entry.path) } })
  return files
}

/**
 * Read the manifest contained in a packed tarball, without consulting the checkout.
 * @param tarball - Absolute tarball path.
 * @returns The packed package.json object.
 */
export function packedManifest(tarball: string): Record<string, unknown> {
  // npm tarballs carry UTF-8 paths. Windows bsdtar can reject unrelated entries outside the system code page.
  const chunks: Buffer[] = []
  list({
    file: tarball,
    sync: true,
    strict: true,
    filter: path => path === 'package/package.json',
    onReadEntry: (entry) => { entry.on('data', (chunk) => { chunks.push(chunk) }) },
  })
  if (chunks.length === 0) throw new Error(`${tarball} has no manifest`)
  const manifest: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error(`${tarball} has no manifest`)
  return manifest as Record<string, unknown>
}

/**
 * Read a packed tarball's own identity.
 * @param tarball - Absolute tarball path.
 * @returns The name and version the tarball declares.
 */
export function packedIdentity(tarball: string): PackedIdentity {
  const { name, version } = packedManifest(tarball)
  if (typeof name !== 'string' || typeof version !== 'string') throw new Error(`${tarball} manifest lacks name/version`)
  return { name, version }
}

/**
 * Read a packed directory's upload order.
 * @param directory - absolute path of a pack output directory.
 * @returns Tarball filenames in upload order.
 */
export function readPublishOrder(directory: string): string[] {
  return readFileSync(join(directory, PUBLISH_ORDER_FILE), 'utf8').split('\n').filter(line => line !== '')
}
