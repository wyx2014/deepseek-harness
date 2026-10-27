/** Whole-Session deletion uses the real provider and kernel writer exclusion. */
import { mkdtemp, readdir, rm, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SESSION_FORMAT_VERSION, SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import { SessionAlreadyExistsError, SessionAlreadyOwnedError, SessionPersistenceChangedError,
  SessionPersistenceNotFoundError, SessionPersistence, SessionDeletionUnsupportedError } from '@deepseek-ai/dsh-session-persistence'
import * as JsonlPersistence from '../src/index.ts'
import { sessionDir } from '../src/format.ts'
import { SessionWriteLease } from '../src/lease.ts'

const failures = vi.hoisted(() => ({ unlink: false }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rm: async (...args: Parameters<typeof actual.rm>) => {
    if (failures.unlink && String(args[0]).endsWith('.jsonl')) {
      failures.unlink = false
      throw Object.assign(new Error('injected unlink failure'), { code: 'EACCES' })
    }
    return actual.rm(...args)
  } }
})
const contexts: Context[] = []
const roots: string[] = []
afterEach(async () => {
  failures.unlink = false
  vi.restoreAllMocks()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function mount(root?: string, compression: 'none' | 'zstd' = 'none') {
  if (!root) { root = await mkdtemp(join(tmpdir(), 'session-delete-')); roots.push(root) }
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  const fiber = await ctx.plugin(JsonlPersistence, { root, compression })
  return { ctx, persistence: ctx.sessionPersistence, root, fiber }
}
const header = (id = 'owned'): SessionHeader => ({ id: SessionId(id), version: SESSION_FORMAT_VERSION,
  createdAt: Date.now(), isSeeded: false, delegationDepth: 0 })
async function store(h: Awaited<ReturnType<typeof mount>>, meta = header()) {
  const writer = await h.persistence.create(meta)
  await writer.flush()
  await writer.close()
  return { meta, revision: (await h.persistence.stat(meta.id))!.revision }
}

describe('JSONL Session deletion', () => {
  it.each(['none', 'zstd'] as const)('removes all %s generations, survives restart and seals identity reuse', async (compression) => {
    const h = await mount(undefined, compression)
    const { meta, revision } = await store(h)
    const dir = sessionDir(h.root, meta.cwd, meta.id)
    const suffix = compression === 'none' ? '.jsonl' : '.jsonl.zstd'
    await writeFile(join(dir, `session.v3${suffix}`), 'historical predecessor')
    const lockBefore = compression === 'none' ? await stat(join(dir, 'session.lock')) : undefined
    await expect(h.persistence.delete(meta.id, { expectedRevision: revision })).resolves.toBe(true)
    expect((await readdir(dir)).filter(name => name.includes('.jsonl'))).toEqual([])
    if (lockBefore) expect((await stat(join(dir, 'session.lock'))).ino).toBe(lockBefore.ino)
    await expect(h.persistence.stat(meta.id)).resolves.toBeUndefined()
    await expect(h.persistence.list()).resolves.toEqual([])
    await expect(h.persistence.open(meta.id, 'write')).rejects.toBeInstanceOf(SessionPersistenceNotFoundError)
    const restarted = await mount(h.root, compression)
    await expect(restarted.persistence.open(meta.id, 'read')).rejects.toBeInstanceOf(SessionPersistenceNotFoundError)
    await expect(restarted.persistence.list()).resolves.toEqual([])
    await expect(restarted.persistence.delete(meta.id, { expectedRevision: revision })).resolves.toBe(false)
    await expect(restarted.persistence.create(meta)).rejects.toBeInstanceOf(SessionAlreadyExistsError)
  })

  it('refuses pending creators, same-instance writers, foreign writers and live Sessions', async () => {
    const h = await mount()
    const meta = header()
    const creator = await h.persistence.create(meta)
    await expect(h.persistence.delete(meta.id, { expectedRevision: undefined })).rejects.toBeInstanceOf(SessionAlreadyOwnedError)
    await creator.flush()
    await creator.close()
    const revision = (await h.persistence.stat(meta.id))!.revision
    const other = await mount(h.root)
    const writer = await other.persistence.open(meta.id, 'write')
    await expect(h.persistence.delete(meta.id, { expectedRevision: revision })).rejects.toBeInstanceOf(SessionAlreadyOwnedError)
    await writer.close()
    const live = h.ctx.sessions.prepare(meta.id)
    const detach = h.ctx.sessions.enter(live)
    await expect(h.persistence.delete(meta.id, { expectedRevision: revision })).rejects.toBeInstanceOf(SessionAlreadyOwnedError)
    detach()
    await expect(h.persistence.delete(meta.id, { expectedRevision: revision })).resolves.toBe(true)
  })

  it('refuses changed or uninspected Sessions, and respects cancellation before commit', async () => {
    const h = await mount()
    const { meta, revision } = await store(h)
    const writer = await h.persistence.open(meta.id, 'write')
    await writer.append([{ seq: SessionSeq(0), time: Date.now(), type: 'turn/start', data: { turn: 1 } }])
    await writer.close()
    await expect(h.persistence.delete(meta.id, { expectedRevision: revision })).rejects.toBeInstanceOf(SessionPersistenceChangedError)
    await expect(h.persistence.delete(meta.id, { expectedRevision: undefined })).rejects.toBeInstanceOf(SessionPersistenceChangedError)
    const controller = new AbortController()
    controller.abort(new Error('cancel delete'))
    await expect(h.persistence.delete(meta.id, { expectedRevision: (await h.persistence.stat(meta.id))!.revision,
      signal: controller.signal })).rejects.toThrow('cancel delete')
    expect(await h.persistence.stat(meta.id)).toBeDefined()
  })

  it('keeps partial physical deletion hidden across restart and retries projection failures', async () => {
    const h = await mount()
    const { meta, revision } = await store(h)
    failures.unlink = true
    await expect(h.persistence.delete(meta.id, { expectedRevision: revision })).rejects.toThrow('injected unlink failure')
    await expect(h.persistence.stat(meta.id)).resolves.toBeUndefined()
    const restarted = await mount(h.root)
    await expect(restarted.persistence.list()).resolves.toEqual([])
    const listener = vi.fn().mockRejectedValueOnce(new Error('projection failed')).mockResolvedValue(undefined)
    restarted.ctx.on('session-persistence/deleted', listener)
    await expect(restarted.persistence.delete(meta.id, { expectedRevision: undefined })).rejects.toBeInstanceOf(AggregateError)
    await expect(restarted.persistence.delete(meta.id, { expectedRevision: undefined })).resolves.toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)
    expect((await readdir(sessionDir(h.root, meta.cwd, meta.id))).filter(name => name.includes('.jsonl'))).toEqual([])
  })

  it('treats only real absence as idempotent and waits for membership cleanup', async () => {
    const h = await mount()
    let release!: () => void
    const barrier = new Promise<void>((resolve) => { release = resolve })
    const listener = vi.fn(() => barrier)
    h.ctx.on('session-persistence/deleted', listener)
    let done = false
    const deleting = h.persistence.delete(SessionId('missing'), { expectedRevision: undefined }).then((value) => { done = true; return value })
    await vi.waitFor(() => { expect(listener).toHaveBeenCalledOnce() })
    expect(done).toBe(false)
    let disposed = false
    const unload = h.fiber.dispose().then(() => { disposed = true })
    expect(disposed).toBe(false)
    release()
    await expect(deleting).resolves.toBe(false)
    await unload
    expect(disposed).toBe(true)
    await expect(h.persistence.delete(SessionId('other'), { expectedRevision: undefined })).rejects.toThrow('stopping')
  })

  it('explicitly refuses deletion for a provider inheriting the unsupported default', async () => {
    const h = await mount()
    await expect(SessionPersistence.prototype.delete.call(h.persistence, SessionId('unsupported'),
      { expectedRevision: undefined })).rejects.toBeInstanceOf(SessionDeletionUnsupportedError)
  })

  it('preserves deletion and lease-release failures together and permits a fresh retry', async () => {
    const h = await mount()
    const { meta, revision } = await store(h)
    // oxlint-disable-next-line typescript/unbound-method -- invoked with the original lease via call below.
    const release = SessionWriteLease.prototype.release
    vi.spyOn(SessionWriteLease.prototype, 'release').mockImplementationOnce(async function (this: SessionWriteLease) {
      await release.call(this)
      throw new Error('injected release failure')
    })
    failures.unlink = true
    let failure: unknown
    try { await h.persistence.delete(meta.id, { expectedRevision: revision }) }
    catch (error) { failure = error }
    expect(failure).toBeInstanceOf(AggregateError)
    if (!(failure instanceof AggregateError)) throw new Error('expected both failures')
    expect(failure.errors.map((error: Error) => error.message)).toEqual(['injected unlink failure', 'injected release failure'])
    await expect(h.persistence.delete(meta.id, { expectedRevision: undefined })).resolves.toBe(false)
  })
})
