import type { ReactNode } from 'react'
import { ICON_MEDIUM_STROKE, ICON_REGULAR_STROKE, IconUsersOutlineMedium, IconUsersOutlineRegular } from './icons/index.tsx'
import type { IconProps } from './icons/props.ts'
import {
  BrowseOutlineArtwork, ChatLinesOutlineArtwork, FolderCloseArtwork,
} from './icons/shared-artwork.tsx'

/** Reference domains with distinct composer and transcript glyphs. */
export type ReferenceIconKind = 'session' | 'file' | 'folder' | 'skill' | 'mcp' | 'team'

/** Props shared by inline reference glyphs. */
export interface ReferenceIconProps extends IconProps {
  kind: ReferenceIconKind
}

interface WeightedReferenceIconProps extends ReferenceIconProps {
  strokeWidth: number
}

/**
 * Render the icon that identifies one inline reference domain.
 * @param props - Reference kind, optional size, and optional CSS class.
 * @returns The corresponding decorative current-color SVG glyph.
 */
function ReferenceIconArtwork({ kind, size = 16, className, strokeWidth }: WeightedReferenceIconProps): ReactNode {
  switch (kind) {
    case 'session': return <ChatLinesOutlineArtwork size={size} className={className} strokeWidth={strokeWidth} />
    case 'file': return <BrowseOutlineArtwork size={size} className={className} strokeWidth={strokeWidth} />
    case 'folder': return <FolderCloseArtwork size={size} className={className} strokeWidth={strokeWidth} />
    case 'team': {
      const Icon = strokeWidth === ICON_REGULAR_STROKE ? IconUsersOutlineRegular : IconUsersOutlineMedium
      return <Icon size={size} className={className} />
    }
    case 'skill': return (
      <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth * 1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72M14 7l3 3M5 6v4M19 14v4M10 2v2M7 8H3M21 16h-4M11 3H9" />
      </svg>
    )
    case 'mcp': return (
      <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth * 1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1zM17 21v-2M19 14V6.5a3.5 3.5 0 0 0-7 0v11a3.5 3.5 0 0 1-7 0V10M21 21v-2M3 5V3M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2zM7 5V3" />
      </svg>
    )
  }
}

/**
 * Render a regular one-pixel reference icon.
 * @param props - Reference kind, size, and optional class.
 * @returns The regular decorative reference glyph.
 */
export function ReferenceIconRegular(props: ReferenceIconProps): ReactNode {
  return <ReferenceIconArtwork {...props} strokeWidth={ICON_REGULAR_STROKE} />
}

/**
 * Render a medium 1.3px reference icon.
 * @param props - Reference kind, size, and optional class.
 * @returns The medium decorative reference glyph.
 */
export function ReferenceIconMedium(props: ReferenceIconProps): ReactNode {
  return <ReferenceIconArtwork {...props} strokeWidth={ICON_MEDIUM_STROKE} />
}
