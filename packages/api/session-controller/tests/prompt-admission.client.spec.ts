/** Prompt routing preserves native intake and admission failure/echo semantics. */
import { describe, expect, vi } from 'vitest'
import { ok } from '@deepseek-ai/dsh-remote-mock'
import { RemoteError, type RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { createClientTest, webApp } from '@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts'
import type { PromptContentPart, SessionPromptValue, SessionRequestId } from '../src/types.ts'
import type { ClientPromptAdmission } from '../src/client/contract/prompt-admission.ts'
import { sessionBench } from './remote/bench.client.ts'

const it = createClientTest({ roster: webApp.closure(['@deepseek-ai/dsh-api-gateway']) })
const SID = SessionId('admission-session')
describe('Client prompt admission provider', () => {
  it('receives the exact request after serialization and withdraws with its fiber', async ({ mock, start }) => {
    const session = await sessionBench(mock, start, SID)
    const client = await start()
    session.bindScope(client.ctx)
    const route = vi.fn(async (
      _payload: ClientPromptAdmission,
      _next: () => Promise<RemoteResult<SessionPromptValue>>,
    ) => ok({ accepted: true as const }))
    const provider = await client.ctx.plugin({ apply(ctx) { ctx.on('client-session/prompt-admission', route) } })
    const signal = new AbortController().signal
    const content: PromptContentPart[] = [{ type: 'text', text: '/office-documents report' }, { type: 'file', receiptId: 'receipt-1' as never }]
    await expect(session.prompt(content, 'steer', signal, 'request-1' as SessionRequestId)).resolves.toEqual(ok({ accepted: true }))
    const [payload, next] = route.mock.calls[0]!
    expect(payload).toEqual({ request: { sessionId: SID, requestId: 'request-1', mode: 'steer', content, clientTimeZone: payload.request.clientTimeZone }, signal })
    expect(payload.request.clientTimeZone).toBeTypeOf('string')
    expect(next).toBeTypeOf('function')
    expect(mock.log.requests('session/prompt')).toEqual([])
    await provider.dispose()
    mock.remote.session.prompt.mockResolvedValueOnce(ok({ accepted: true }))
    await session.prompt([{ type: 'text', text: 'native' }], 'queue')
    expect(mock.log.requests('session/prompt')).toHaveLength(1)
  }, 60_000)

  it('keeps a rejected first submission blank and retires its local echo', async ({ mock, start }) => {
    const session = await sessionBench(mock, start, SID)
    const client = await start(); session.bindScope(client.ctx)
    const failure = new RemoteError('gateway/internal', 'selection unavailable', {})
    client.ctx.on('client-session/prompt-admission', async () => ({ ok: false, error: failure }))
    const submission = session.beginSubmission({ mode: 'queue', text: 'draft', attachments: [] })
    await expect(session.prompt([{ type: 'text', text: 'draft' }], 'queue', undefined, submission.requestId)).resolves.toMatchObject({ ok: false, error: failure })
    expect(session.getSnapshot().blank).toBe(true)
    expect(session.getSnapshot().pendingSubmissions).toEqual([])
    expect(session.getSnapshot().promptError?.error).toBe(failure)
  })

  it('delegates unclaimed root prompts to native transport through next', async ({ mock, start }) => {
    const session = await sessionBench(mock, start, SID)
    const client = await start(); session.bindScope(client.ctx)
    const route = vi.fn(async (_payload: ClientPromptAdmission, next: () => Promise<RemoteResult<SessionPromptValue>>) => next())
    client.ctx.on('client-session/prompt-admission', route)
    await expect(session.prompt([{ type: 'text', text: 'native' }], 'queue')).resolves.toEqual(ok({ accepted: true }))
    expect(route).toHaveBeenCalledOnce()
    expect(mock.log.requests('session/prompt')).toHaveLength(1)
  })

  it('leaves subagent continuation on its own transport', async ({ mock, start }) => {
    const session = await sessionBench(mock, start, SID, { address: { parentSessionId: SessionId('parent'), childSessionId: SID, mode: 'continuable' }, parentAvailable: true })
    const client = await start(); session.bindScope(client.ctx)
    const route = vi.fn(async (_payload: ClientPromptAdmission, next: () => Promise<RemoteResult<SessionPromptValue>>) => next())
    client.ctx.on('client-session/prompt-admission', route)
    await session.prompt([{ type: 'text', text: 'continue' }], 'queue')
    expect(route).not.toHaveBeenCalled()
    expect(mock.log.requests('subagents/prompt')).toHaveLength(1)
  })
})
