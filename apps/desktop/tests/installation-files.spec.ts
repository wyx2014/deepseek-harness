import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { INSTALLATION_FILES_NAME as WRITTEN_NAME, writeInstallationFiles } from '../scripts/installation-files.mjs'
import { renderCrashReport } from '../src/crash-report.ts'
import { INSTALLATION_FILES_NAME, inspectInstallation } from '../src/installation-files.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function resources(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'desktop-installation-'))
  roots.push(root)
  await mkdir(join(root, 'app.asar.unpacked/dsh/node_modules/koffi'), { recursive: true })
  await mkdir(join(root, 'runtime/python'), { recursive: true })
  await writeFile(join(root, 'app.asar'), 'archive')
  await writeFile(join(root, 'app.asar.unpacked/dsh/node_modules/koffi/package.json'), '{}')
  await writeFile(join(root, 'app.asar.unpacked/dsh/node_modules/koffi/index.js'), 'module.exports = 1')
  await writeFile(join(root, 'runtime/python/cache.pyc'), 'compiled')
  return root
}

it('records every shipped file and finds an intact installation complete', async () => {
  const root = await resources()
  expect(WRITTEN_NAME).toBe(INSTALLATION_FILES_NAME)
  expect(await writeInstallationFiles(root)).toBe(4)
  const list = JSON.parse(await readFile(join(root, INSTALLATION_FILES_NAME), 'utf8')) as { files: [string, number][] }
  expect(list.files).toEqual([
    ['app.asar', 7],
    ['app.asar.unpacked/dsh/node_modules/koffi/index.js', 18],
    ['app.asar.unpacked/dsh/node_modules/koffi/package.json', 2],
    ['runtime/python/cache.pyc', 8],
  ])
  expect(await inspectInstallation(root)).toEqual({ total: 4, missing: [], changed: [] })
  // Writing the list again does not record the list itself.
  expect(await writeInstallationFiles(root)).toBe(4)
})

it('names removed files and files whose size changed', async () => {
  const root = await resources()
  await writeInstallationFiles(root)
  await rm(join(root, 'app.asar.unpacked/dsh/node_modules/koffi'), { recursive: true })
  await writeFile(join(root, 'runtime/python/cache.pyc'), 'recompiled by the interpreter')
  const inspection = await inspectInstallation(root)
  expect(inspection).toEqual({
    total: 4,
    missing: ['app.asar.unpacked/dsh/node_modules/koffi/index.js', 'app.asar.unpacked/dsh/node_modules/koffi/package.json'],
    changed: ['runtime/python/cache.pyc'],
  })
  const report = renderCrashReport({
    source: 'host', phase: 'startup', error: new Error('ENOENT'), rendererConsole: [], installation: inspection!,
    app: { name: 'TP Cowork', version: '0.2.1', platform: 'win32', arch: 'x64', electron: '43.0.0', node: '24.17.0', locale: 'en' },
    time: new Date('2026-11-10T05:51:35.392Z'),
  })
  expect(report).toContain('--- installation files ---\n4 files shipped, 2 missing, 1 with a different size\nmissing (2):\n'
    + '  app.asar.unpacked/dsh/node_modules/koffi/index.js\n  app.asar.unpacked/dsh/node_modules/koffi/package.json\n'
    + 'different size (1):\n  runtime/python/cache.pyc\n')
})

it('reports nothing when the package recorded no usable list', async () => {
  const root = await resources()
  expect(await inspectInstallation(root)).toBeUndefined()
  for (const content of ['not json', '{"schemaVersion":2,"files":[]}', '{"schemaVersion":1,"files":[["a"]]}']) {
    await writeFile(join(root, INSTALLATION_FILES_NAME), content)
    expect(await inspectInstallation(root)).toBeUndefined()
  }
})
