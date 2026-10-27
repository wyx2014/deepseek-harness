/** A changed prepared payload must invalidate the development application's stamp. */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import { prepareDevelopmentApp } from '../scripts/development-app.ts'

vi.mock('node:child_process', async () => {
  const { cpSync } = await import('node:fs')
  return { execFileSync: vi.fn((command: string, args: string[]) => {
    if (command === '/usr/bin/ditto') cpSync(args[0]!, args[1]!, { recursive: true })
    return Buffer.alloc(0)
  }) }
})

it('rebuilds a registered development application when its selected runtime changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-development-refresh-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
  const source = join(root, 'Electron.app', 'Contents')
  mkdirSync(join(source, 'MacOS'), { recursive: true })
  mkdirSync(join(source, 'Resources'))
  writeFileSync(join(source, 'Info.plist'), '<plist><dict/></plist>')
  writeFileSync(join(source, 'MacOS', 'Electron'), 'source executable')
  mkdirSync(join(root, 'resources'))
  writeFileSync(join(root, 'resources', 'icon.icns'), 'development icon')
  const options = {
    electron: join(source, 'MacOS', 'Electron'), appRoot: root, directory: join(root, 'development'),
    home: join(root, 'home'), userData: join(root, 'user data'),
    primaryRuntimeDir: join(root, 'selected mac-arm64', 'primary-runtime'),
    mainPort: 9229, rendererPort: 9222, hostPort: 9230, openDevtools: '0',
  }
  mkdirSync(options.directory)
  const executable = prepareDevelopmentApp(options)
  const first = readFileSync(executable, 'utf8')
  prepareDevelopmentApp(options)
  const copies = (): number => vi.mocked(execFileSync).mock.calls.filter(([command]) => command === '/usr/bin/ditto').length
  expect(copies()).toBe(1)
  const next = { ...options, primaryRuntimeDir: join(root, 'selected win-x64', 'primary-runtime') }
  prepareDevelopmentApp(next)
  expect(copies()).toBe(2)
  expect(readFileSync(executable, 'utf8')).not.toBe(first)
  const stamp = JSON.parse(readFileSync(join(options.directory, 'TP Cowork.app', 'Contents', 'Resources', 'dsh-development.json'), 'utf8')) as { primaryRuntimeDir: string; launcher: string }
  expect(stamp.primaryRuntimeDir).toBe(next.primaryRuntimeDir)
  expect(stamp.launcher).toBe(readFileSync(executable, 'utf8'))
})
