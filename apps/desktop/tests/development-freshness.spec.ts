import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { developmentArtifactStale } from '../scripts/development-freshness.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function file(path: string, seconds: number): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, '')
  utimesSync(path, seconds, seconds)
}

it('rebuilds artifacts that are missing or older than a source, ignoring dependencies and build output', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-freshness-'))
  roots.push(root)
  file(join(root, 'shell/src/main.ts'), 100)
  file(join(root, 'shell/src/node_modules/dep.js'), 900)
  file(join(root, 'shell/src/.cache/state'), 900)
  file(join(root, 'shell/lib/main.js'), 200)
  file(join(root, 'web/index.html'), 300)
  file(join(root, 'web/dist/index.html'), 200)
  const shell = { name: 'shell', output: join(root, 'shell/lib/main.js'), inputs: [join(root, 'shell/src'), join(root, 'shell/missing.ts')] }
  expect(developmentArtifactStale(shell)).toBe(false)
  expect(developmentArtifactStale({ name: 'web', output: join(root, 'web/dist/index.html'), inputs: [join(root, 'web/index.html')] })).toBe(true)
  expect(developmentArtifactStale({ name: 'unbuilt', output: join(root, 'other/lib/out.js'), inputs: [] })).toBe(true)
  file(join(root, 'shell/src/nested/added.ts'), 250)
  expect(developmentArtifactStale(shell)).toBe(true)
})

it('sees an upstream artifact rebuilt earlier in the same launch', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-freshness-'))
  roots.push(root)
  file(join(root, 'lib/index.js'), 100)
  file(join(root, 'dist/index.html'), 200)
  const page = { name: 'page', output: join(root, 'dist/index.html'), inputs: [join(root, 'lib/index.js')] }
  expect(developmentArtifactStale(page)).toBe(false)
  file(join(root, 'lib/index.js'), 300)
  expect(developmentArtifactStale(page)).toBe(true)
})
