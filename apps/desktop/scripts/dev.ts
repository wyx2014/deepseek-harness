/** Build and launch the unpackaged Electron shell against the current workspace. */

import { spawn, execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../src/host-protocol.ts'
import type { DesktopRelease } from '../src/release.ts'
import { developmentRuntimeDirectory, resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { canReuseDevelopmentRuntime } from './development-runtime.ts'
import { prepareDevelopmentProject } from './development-project.ts'
import { prepareDevelopmentApp } from './development-app.ts'
import { developmentArtifactStale } from './development-freshness.ts'
import { preparePrimaryRuntime } from './prepare-primary-runtime.ts'

const APP_ROOT = resolve(import.meta.dirname, '..')
const REPOSITORY_ROOT = resolve(APP_ROOT, '..', '..')
const BUILD_ROOT = join(APP_ROOT, '.desktop-build')
const DEVELOPMENT_ROOT = join(BUILD_ROOT, 'development')

interface PackageManifest {
  readonly version?: string
}

function packageVersion(path: string, subject: string): string {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as PackageManifest
  if (typeof manifest.version !== 'string') throw new Error(`desktop development: ${subject} has no version`)
  return manifest.version
}

function debugPort(name: string, fallback: number): number {
  const value = process.env[name]
  if (value === undefined || value === '') return fallback
  const port = Number(value)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`desktop development: ${name} must be an integer from 1 through 65535`)
  }
  return port
}

async function run(command: string, args: readonly string[], cwd: string, environment = process.env): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env: environment, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`desktop development: ${args.join(' ')} exited with ${String(code ?? signal)}`))
    })
  })
}

async function runPackageScript(script: string, cwd: string): Promise<void> {
  const packageManager = process.env.npm_execpath
  if (packageManager === undefined || packageManager === '') {
    throw new Error('desktop development: invoke this launcher through pnpm run dev:desktop or start:desktop')
  }
  await run(process.execPath, [packageManager, 'run', script], cwd)
}

async function launchElectron(): Promise<void> {
  const require = createRequire(import.meta.url)
  const electron: unknown = require('electron')
  if (typeof electron !== 'string') throw new Error('desktop development: electron executable is unavailable')
  const mainPort = debugPort('DSH_DESKTOP_MAIN_INSPECT_PORT', 9229)
  const rendererPort = debugPort('DSH_DESKTOP_RENDERER_DEBUG_PORT', 9222)
  const hostPort = debugPort('DSH_DESKTOP_HOST_INSPECT_PORT', 9230)
  const home = resolve(process.env.DSH_HOME ?? join(DEVELOPMENT_ROOT, 'home'))
  const userData = resolve(process.env.DSH_DESKTOP_USER_DATA_DIR ?? join(DEVELOPMENT_ROOT, 'electron-user-data'))
  const primaryRuntimeDir = process.env.DSH_DESKTOP_PRIMARY_RUNTIME_DIR ?? developmentRuntimeDirectory()
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    DSH_HOME: home,
    DSH_DESKTOP_PRIMARY_RUNTIME_DIR: primaryRuntimeDir,
    DSH_DESKTOP_HOST_INSPECT_PORT: String(hostPort),
    DSH_DESKTOP_OPEN_DEVTOOLS: process.env.DSH_DESKTOP_OPEN_DEVTOOLS ?? '1',
    ELECTRON_ENABLE_LOGGING: process.env.ELECTRON_ENABLE_LOGGING ?? '1',
  }
  console.log(`desktop development: DSH_HOME=${home}`)
  console.log(`desktop development: userData=${userData}`)
  console.log(`desktop development: inspectors main=${String(mainPort)}, renderer=${String(rendererPort)}, host=${String(hostPort)}`)
  if (process.platform === 'darwin') {
    const executable = prepareDevelopmentApp({ electron, appRoot: APP_ROOT, directory: DEVELOPMENT_ROOT, home, userData, primaryRuntimeDir,
      mainPort, rendererPort, hostPort, openDevtools: environment.DSH_DESKTOP_OPEN_DEVTOOLS! })
    await run(executable, [], APP_ROOT, environment)
    return
  }
  await run(electron, [
    `--inspect=127.0.0.1:${String(mainPort)}`,
    `--remote-debugging-port=${String(rendererPort)}`,
    `--user-data-dir=${userData}`,
    APP_ROOT,
  ], APP_ROOT, environment)
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    'skip-build': { type: 'boolean', default: false },
    'rebuild-runtime': { type: 'boolean', default: false },
  } })
  if (!values['skip-build']) {
    await runPackageScript('build:artifacts', REPOSITORY_ROOT)
    await runPackageScript('build', APP_ROOT)
  } else {
    // Reuse the full build, but never launch a shell or page older than its own sources.
    const web = join(REPOSITORY_ROOT, 'apps', 'web')
    const bootPage = join(REPOSITORY_ROOT, 'packages', 'client', 'web')
    // The web page bundles the boot page from its built lib, so the libraries rebuild first.
    for (const artifact of [
      { name: 'client libraries', output: join(bootPage, 'lib', 'index.js'), cwd: REPOSITORY_ROOT, script: 'build:lib:client',
        inputs: [join(bootPage, 'src')] },
      { name: 'desktop shell', output: join(APP_ROOT, 'lib', 'main.js'), cwd: APP_ROOT, script: 'build',
        inputs: ['src', 'renderer', 'tsdown.config.ts', 'package.json'].map(path => join(APP_ROOT, path)) },
      { name: 'web page', output: join(web, 'dist', 'index.html'), cwd: REPOSITORY_ROOT, script: 'build:web',
        inputs: [...['src', 'public', 'index.html', 'vite.config.ts'].map(path => join(web, path)), join(bootPage, 'lib', 'index.js')] },
    ]) {
      if (!developmentArtifactStale(artifact)) continue
      console.log(`desktop development: rebuilding the ${artifact.name}, its sources changed`)
      await runPackageScript(artifact.script, artifact.cwd)
    }
  }
  // TP Cowork's product plugins live in a sibling checkout and load from there, except the browser's desktop half,
  // which is copied into this app. The product launcher rebuilds whichever changed; it marks a launch it started
  // itself, having prepared them already.
  const product = resolve(process.env.DSH_DESKTOP_PRODUCT_DIR ?? join(REPOSITORY_ROOT, '..', 'tp-coworkdsh'))
  const prepare = join(product, 'scripts', 'dev-desktop.mjs')
  if (process.env.TPCOWORK_PLUGINS_PREPARED !== '1' && existsSync(prepare)) {
    console.log('desktop development: preparing TP Cowork plugins')
    await run(process.execPath, [prepare, '--plugins-only'], product)
  }
  for (const path of [
    join(APP_ROOT, 'lib', 'main.js'),
    join(REPOSITORY_ROOT, 'apps', 'desktop-host', 'lib', 'index.js'),
  ]) {
    if (!existsSync(path)) throw new Error(`desktop development: missing built artifact ${path}`)
  }
  const version = packageVersion(join(APP_ROOT, 'package.json'), 'desktop package')
  const pnpmVersion = packageVersion(join(APP_ROOT, 'node_modules', 'pnpm', 'package.json'), 'pnpm package')
  const release: DesktopRelease = {
    schemaVersion: 1,
    version,
    hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
    nodeVersion: execFileSync(createRequire(import.meta.url)('electron') as string, ['-p', 'process.versions.node'],
      { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }).trim(),
    pnpmVersion,
  }
  prepareDevelopmentProject({
    projectDir: join(DEVELOPMENT_ROOT, 'project'),
    cliDir: join(REPOSITORY_ROOT, 'apps', 'cli'),
    hostDir: join(REPOSITORY_ROOT, 'apps', 'desktop-host'),
    dependencyDir: join(REPOSITORY_ROOT, 'node_modules', '.pnpm', 'node_modules'),
    release,
    target: resolveDesktopBuildTarget(),
  })
  if (values['skip-build'] && !values['rebuild-runtime']
    && canReuseDevelopmentRuntime(resolveDesktopTargetBuildPaths().runtime, resolveDesktopBuildTarget(), version, pnpmVersion)) {
    console.log('desktop development: reusing prepared interpreters and Office resources')
  } else {
    console.log('desktop development: preparing interpreters and Office resources')
    await preparePrimaryRuntime()
  }
  await launchElectron()
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
