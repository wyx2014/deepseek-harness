import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { create as createTar } from 'tar'
import { afterEach, describe, expect, it } from 'vitest'
import { capture, pnpmCommand } from './process.ts'
import { packedIdentity, tarballFiles } from './tarball.ts'

const directories: string[] = []

afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

/**
 * Pack one manifest into a tarball shaped like `npm pack` output.
 * @returns Absolute path of the archive.
 */
async function packedTarball(name: string, version: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-tarball-'))
  directories.push(directory)
  const contents = join(directory, 'package')
  await mkdir(contents)
  await writeFile(join(contents, 'package.json'), JSON.stringify({ name, version }))
  await writeFile(join(contents, 'index.js'), '')
  await writeFile(join(contents, '工作_招手打招呼.webm'), 'fixture')
  const archive = join(directory, `${name.replaceAll('/', '-').replace('@', '')}-${version}.tgz`)
  await createTar({ file: archive, cwd: directory, gzip: true }, ['package'])
  return archive
}

describe('release process helpers', () => {
  it('runs pnpm through a JavaScript entry, which spawnSync can start on Windows', () => {
    const [command, ...args] = pnpmCommand()
    expect(command === 'pnpm' || /node(?:\.exe)?$/iu.test(command)).toBe(true)
    if (command !== 'pnpm') expect(args[0]).toMatch(/pnpm/u)
    expect(capture(command, [...args, '--version'])).toMatch(/^\d+\.\d+\.\d+/u)
  })
})

describe('release tarball readers', () => {
  it('lists UTF-8 members of an archive under an absolute path', async () => {
    const archive = await packedTarball('@deepseek-ai/dsh-probe', '1.2.3')
    expect(tarballFiles(archive)).toEqual(expect.arrayContaining([
      'package/package.json', 'package/index.js', 'package/工作_招手打招呼.webm',
    ]))
  })

  it('reads the package manifest alongside UTF-8 member names', async () => {
    const archive = await packedTarball('@deepseek-ai/dsh-probe', '1.2.3')
    expect(packedIdentity(archive)).toEqual({ name: '@deepseek-ai/dsh-probe', version: '1.2.3' })
  })
})
