// @vitest-environment jsdom
// Capability mentions in sent user text through the production UserText evaluator and node components.
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createElement, type ComponentProps, type ReactNode } from 'react'
import { Context } from '@deepseek-ai/cordis'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import type { UserTextReference } from '@deepseek-ai/dsh-client-ui-primitives'
import type { UserTextNodeOwnerProps } from '../../ui-conversation/src/client/contract/slots.ts'
import type { UserTextNode } from '../../ui-conversation/src/client/contract/user-text.ts'
import { UserTextRegistry } from '../../ui-conversation/src/client/conversation/user-text-registry.ts'
import { PlainUserText, SessionReference, UserText } from '../../ui-conversation/src/client/user-text/UserText.tsx'
import { sessionReferenceRule } from '../../ui-conversation/src/client/user-text/session-reference-rule.ts'
import { CapabilityReference, capabilityReferenceRule } from '../src/client/chat/CapabilityReference.tsx'

afterEach(cleanup)

const catalog: readonly UserTextReference[] = [
  { text: '$office-docx', kind: 'skill', name: 'office-docx', label: 'Word 文档', iconSrc: 'data:image/png;base64,AA==' },
  { text: '$review', kind: 'skill', name: 'review', path: '/skills/review/SKILL.md' },
  { text: '@聚源', kind: 'mcp', name: '聚源' },
  { text: '@资产投研团队', kind: 'team', name: '资产投研团队' },
]

function renderText(text: string, capabilityReferences: readonly UserTextReference[], interactive = true) {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  const registry = new UserTextRegistry(ctx)
  registry.register(sessionReferenceRule)
  registry.register(capabilityReferenceRule)
  const openSkill = vi.fn()
  const openFile = vi.fn()
  type Props = ComponentProps<typeof UserText>
  const renderSlot = ((name: string, input: object) => {
    if (name !== 'conversation.user.text.node') throw new Error(`Unexpected Slot: ${name}`)
    const owner = input as UserTextNodeOwnerProps & { node: UserTextNode }
    if (owner.node.id === 'capability') {
      return createElement(CapabilityReference, { ...owner, openSkill, openFile } as ComponentProps<typeof CapabilityReference>)
    }
    if (owner.node.id === 'session') return createElement(SessionReference, owner as ComponentProps<typeof SessionReference>)
    return createElement(PlainUserText, owner as ComponentProps<typeof PlainUserText>)
  }) as Props['renderSlot']
  const view = render(createElement(UserText, {
    text,
    facts: { capabilityReferences },
    interactive,
    useUserTextRevision: bindSnapshotSelector({ getSnapshot: () => registry.getSnapshot(), subscribe: l => registry.subscribe(l) }),
    createUserTextEvaluator: () => registry.createEvaluator(),
    reportTransformFailure: (error: unknown): never => { throw error },
    renderSlot,
  } as unknown as Props) as ReactNode as never)
  return { view, openSkill, openFile }
}

describe('capability references', () => {
  it('shows a skill\'s friendly label and icon and opens its canonical skill', () => {
    const { view, openSkill } = renderText('请用 $office-docx 写', catalog)
    const button = view.getByRole('button', { name: 'Word 文档' })
    expect(button.title).toBe('$office-docx')
    expect(button.querySelector('img')).not.toBeNull()
    fireEvent.click(button)
    expect(openSkill).toHaveBeenCalledWith('office-docx')
  })

  it('opens a skill by its document path when the catalog supplies one', () => {
    const { view, openFile, openSkill } = renderText('$review。', catalog)
    fireEvent.click(view.getByRole('button', { name: '/review' }))
    expect(openFile).toHaveBeenCalledWith('/skills/review/SKILL.md')
    expect(openSkill).not.toHaveBeenCalled()
  })

  it('keeps connector and team mentions as inert labels and leaves embedded tokens plain', () => {
    const { view, openFile, openSkill } = renderText('@聚源， @资产投研团队 x@聚源 $office-docxy', catalog)
    for (const kind of ['mcp', 'team']) {
      const label = view.container.querySelector(`[data-ref-chip="${kind}"]`)!
      expect(label.tagName).toBe('SPAN')
      expect(label.querySelector('svg')).not.toBeNull()
      fireEvent.click(label)
    }
    expect(view.container.querySelectorAll('[data-ref-chip]')).toHaveLength(2)
    expect(openFile).not.toHaveBeenCalled()
    expect(openSkill).not.toHaveBeenCalled()
  })

  it('renders previews and messages without a catalog as plain text', () => {
    expect(renderText('$office-docx', [], true).view.container.querySelector('[data-ref-chip]')).toBeNull()
    const preview = renderText('$office-docx', catalog, false).view
    expect(preview.queryByRole('button')).toBeNull()
    expect(preview.container.querySelector('[data-ref-chip="skill"]')?.textContent).toBe('Word 文档')
  })
})
