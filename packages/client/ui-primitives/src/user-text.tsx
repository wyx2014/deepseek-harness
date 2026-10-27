/** Inline text and reference presentation; business rules supply resolved JSON data and actions. */
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { ReferenceIconRegular, type ReferenceIconKind } from './ReferenceIcon.tsx'
import css from './user-text.module.css'
import markdownCss from './markdown/MarkdownText.module.css'

/** Plain text follows the wrapping and typography of its host. */
export interface UserTextRunProps {
  readonly text: string
}

/**
 * Render an uninterpreted inline text run.
 * @param props - text retained verbatim from the caller's document.
 * @returns one inline run without Markdown or reference recognition.
 */
export function UserTextRun({ text }: UserTextRunProps): ReactNode {
  return <span className={css.plainRun}>{text}</span>
}

/** Exact capability mentions supplied by a reference source's catalog. */
export interface UserTextReference {
  /** Complete serialized token, including its trigger. */
  readonly text: string
  readonly kind: 'skill' | 'mcp' | 'team'
  /** Skill lookup name or connector/team display name. */
  readonly name: string
  /** Localized display label; lookup and clipboard tokens retain their canonical names. */
  readonly label?: string
  /** Decorative image URL supplied by the reference source. */
  readonly iconSrc?: string
  /** Absolute skill document path, independent of whether the skill is currently enabled. */
  readonly path?: string
}

/** Presentation selected by a reference renderer, independent of its matching grammar. */
export interface ReferenceChipProps {
  readonly appearance: ReferenceIconKind | 'skill' | 'command'
  readonly label: string
  readonly title: string
  /** Decorative image replacing the appearance glyph, such as a connector's catalog icon. */
  readonly iconSrc?: string | undefined
  /** Absent for display-only references and previews. */
  readonly onActivate?: () => void
}

/**
 * Render a reference label or its explicitly supplied activation action.
 * Text selection and repeated pointer clicks do not activate the reference.
 * @param props - resolved visual fields and optional action from the owning renderer.
 * @returns an inline label, or a keyboard-accessible button when activation is supplied.
 */
export function ReferenceChip({ appearance, label, title, iconSrc, onActivate }: ReferenceChipProps): ReactNode {
  const slash = appearance === 'skill' || appearance === 'command'
  const contents = <>
    {iconSrc !== undefined && <img src={iconSrc} alt="" width={16} height={16} className={css.refIcon} />}
    {iconSrc === undefined && !slash && <ReferenceIconRegular kind={appearance} size={16} className={css.refIcon} />}
    {label}
  </>
  // Connector and team mentions read as labels rather than links.
  const className = clsx(css.refChip, slash && css.slashChip, (appearance === 'mcp' || appearance === 'team') && css.capabilityLabel)
  return onActivate === undefined
    ? <span className={className} data-ref-chip={appearance} title={title}>{contents}</span>
    : <button
      type="button"
      className={clsx(className, markdownCss.fileMention)}
      data-ref-chip={appearance}
      title={title}
      onClick={(event) => {
        if (event.detail > 1 || (event.detail !== 0 && event.currentTarget.ownerDocument.getSelection()?.isCollapsed === false)) return
        onActivate()
      }}
    >{contents}</button>
}
