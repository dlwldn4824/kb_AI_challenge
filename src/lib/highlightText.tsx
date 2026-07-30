import type { ReactNode } from 'react'
import type { RiskFlag, RiskSeverity } from '@/types/consultation'
import { cn } from '@/lib/utils'

const severityClass: Record<RiskSeverity, string> = {
  high: 'bg-red-200/90 text-red-950 decoration-red-400',
  medium: 'bg-amber-200/90 text-amber-950 decoration-amber-400',
  low: 'bg-orange-100 text-orange-950 decoration-orange-300',
}

interface Segment {
  text: string
  flag?: RiskFlag
}

/** 위험 구문을 긴 것부터 매칭해 겹치지 않게 분할 */
export function buildHighlightSegments(
  text: string,
  flags: RiskFlag[],
): Segment[] {
  if (!text) return []
  if (flags.length === 0) return [{ text }]

  const sorted = [...flags]
    .filter((f) => f.phrase)
    .sort((a, b) => b.phrase.length - a.phrase.length)

  type Match = { start: number; end: number; flag: RiskFlag }
  const matches: Match[] = []

  for (const flag of sorted) {
    let from = 0
    while (from < text.length) {
      const idx = text.indexOf(flag.phrase, from)
      if (idx === -1) break
      const end = idx + flag.phrase.length
      const overlaps = matches.some((m) => idx < m.end && end > m.start)
      if (!overlaps) {
        matches.push({ start: idx, end, flag })
      }
      from = idx + 1
    }
  }

  matches.sort((a, b) => a.start - b.start)

  const segments: Segment[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.start > cursor) {
      segments.push({ text: text.slice(cursor, match.start) })
    }
    segments.push({
      text: text.slice(match.start, match.end),
      flag: match.flag,
    })
    cursor = match.end
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor) })
  }

  return segments
}

export function renderHighlightedText(
  text: string,
  flags: RiskFlag[],
  activeId?: string | null,
  onSelect?: (id: string) => void,
): ReactNode {
  const segments = buildHighlightSegments(text, flags)

  return segments.map((seg, i) => {
    if (!seg.flag) {
      return <span key={i}>{seg.text}</span>
    }

    const active = activeId === seg.flag.id
    const flagId = seg.flag.id
    return (
      <mark
        key={i}
        data-risk-id={flagId}
        title={`${seg.flag.category}: ${seg.flag.reviewHint}`}
        onClick={() => onSelect?.(flagId)}
        className={cn(
          'cursor-pointer rounded-[3px] px-0.5 py-px font-medium underline decoration-2 underline-offset-2',
          severityClass[seg.flag.severity],
          active && 'ring-2 ring-offset-1 ring-amber-500',
        )}
      >
        {seg.text}
      </mark>
    )
  })
}
