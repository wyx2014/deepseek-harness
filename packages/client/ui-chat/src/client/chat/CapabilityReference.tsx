/**
 * Catalog-backed capability mentions in sent user text: the exact skill, MCP and team tokens a reference source
 * published for the Session keep their catalog identity, label and icon. Skills preview their document; connector and
 * team mentions stay labels.
 */
import type { UserTextNodeProps, UserTextRule } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ReferenceChip, type UserTextReference } from '@deepseek-ai/dsh-client-ui-primitives'

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface UserTextDataMap {
    /** One exact catalog mention. */
    capability: UserTextReference
  }

  interface UserTextFacts {
    /** Exact capability tokens published by the Session's reference sources. */
    readonly capabilityReferences: readonly UserTextReference[]
  }
}

/** Trailing sentence punctuation a mention may carry before its boundary. */
const BOUNDARY = /^[.,;:!?，。；：！？]*(?:\s|$)/u

/** Return the nearest exact capability token standing at a whitespace boundary. */
export const capabilityReferenceRule: UserTextRule<'capability'> = {
  id: 'capability',
  // After Session references and before shape-only skill, file and folder tokens.
  order: 15,
  match(text, from, context) {
    const references = context.read('capabilityReferences')
    if (references === undefined || references.length === 0) return undefined
    let best: { start: number; end: number; data: UserTextReference } | undefined
    for (const reference of references) {
      if (reference.text.length <= 1) continue
      for (let start = text.indexOf(reference.text, from); start >= 0; start = text.indexOf(reference.text, start + 1)) {
        if (best !== undefined && start > best.start) break
        const end = start + reference.text.length
        if ((start === 0 || /\s/u.test(text.charAt(start - 1))) && BOUNDARY.test(text.slice(end))) {
          // The nearest token wins; at the same start, the longest.
          if (best === undefined || start < best.start || end > best.end) best = { start, end, data: reference }
          break
        }
      }
    }
    return best === undefined ? undefined : { id: 'capability', ...best }
  },
}

/** Session-bound actions for previewing a referenced skill. */
export interface CapabilityReferenceInjected {
  /** Open a skill by name through the Session's skill source. */
  readonly openSkill: (name: string) => void
  /** Open an absolute skill document path. */
  readonly openFile: (path: string) => void
}

type CapabilityReferenceProps = UserTextNodeProps<'capability'> & CapabilityReferenceInjected

/**
 * Render a capability chip; previews and non-skill mentions omit activation.
 * @param props - resolved catalog mention, raw token, interaction mode, and Session-bound actions.
 * @returns an inline chip.
 */
export function CapabilityReference({ node, raw, interactive, openSkill, openFile }: CapabilityReferenceProps) {
  const reference = node.data
  const label = reference.label ?? (reference.kind === 'skill' ? `/${reference.name}` : reference.name)
  const activate = interactive && reference.kind === 'skill'
    ? () => { if (reference.path === undefined) openSkill(reference.name); else openFile(reference.path) }
    : undefined
  return <ReferenceChip
    appearance={reference.kind}
    label={label}
    title={raw}
    iconSrc={reference.iconSrc}
    {...(activate === undefined ? {} : { onActivate: activate })}
  />
}
