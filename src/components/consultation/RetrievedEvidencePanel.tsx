import { useState } from 'react'
import {
  Search,
  FileText,
  ExternalLink,
  MapPin,
  Filter,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { RetrievalHit, RetrievalQuery } from '@/types/consultation'

interface RetrievedEvidencePanelProps {
  query: RetrievalQuery
  hits: RetrievalHit[]
  selectedId: string | null
  onSelect: (hit: RetrievalHit) => void
  activeFilters: string[]
  onToggleFilter: (filter: string) => void
}

export function RetrievedEvidencePanel({
  query,
  hits,
  selectedId,
  onSelect,
  activeFilters,
  onToggleFilter,
}: RetrievedEvidencePanelProps) {
  const [toast, setToast] = useState<string | null>(null)

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 2200)
  }

  const selected = hits.find((h) => h.documentId === selectedId) ?? null

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>검색된 업무 근거</CardTitle>
              <Badge variant="neutral">Retrieval Result</Badge>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">
              RAG 근거 · 사내 지식 검색 시스템이 찾은 원문입니다.
            </p>
          </div>
          <Badge variant="default">{hits.length}건</Badge>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-3">
            <div className="flex items-center gap-2 text-[11px] font-medium text-neutral-500">
              <Search className="h-3.5 w-3.5" />
              {query.methodLabel}
            </div>
            <div className="mt-2 flex items-start gap-2">
              <span className="shrink-0 text-xs text-neutral-400">Query</span>
              <p className="text-xs font-medium leading-relaxed text-neutral-900">
                “{query.rawQuery}”
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-neutral-400" />
            {query.filters.map((filter) => {
              const active = activeFilters.includes(filter)
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => onToggleFilter(filter)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors',
                    active
                      ? 'border-kb-dark-gray bg-kb-dark-gray text-kb-yellow-light'
                      : 'border-neutral-200 bg-white text-kb-gray hover:border-kb-gray/40',
                  )}
                >
                  {filter}
                </button>
              )
            })}
          </div>

          <div className="space-y-3">
            {hits.map((hit) => (
              <EvidenceCard
                key={hit.documentId}
                hit={hit}
                selected={hit.documentId === selectedId}
                onSelect={() => onSelect(hit)}
                onOpenDocument={() =>
                  showToast(`${hit.title} ${hit.version} 원문 위치로 이동 (데모)`)
                }
                onViewSection={() => onSelect(hit)}
              />
            ))}
          </div>

          {toast && (
            <p className="text-xs text-neutral-500">{toast}</p>
          )}
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>원문 조항 상세</CardTitle>
            <Badge variant="success">선택됨</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Meta label="문서" value={`${selected.title} ${selected.version}`} />
              <Meta label="저장소" value={selected.repository} />
              <Meta label="장" value={selected.chapter} />
              <Meta label="조항" value={selected.section} />
              <Meta label="시행일" value={selected.effectiveDate} />
              <Meta label="관련도" value={`${selected.relevance}%`} />
            </dl>

            <blockquote className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3.5 text-sm leading-relaxed text-neutral-900">
              “{selected.passage}”
            </blockquote>

            <p className="text-[11px] leading-none text-neutral-400">
              경로: {selected.sourceUrl}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function EvidenceCard({
  hit,
  selected,
  onSelect,
  onOpenDocument,
  onViewSection,
}: {
  hit: RetrievalHit
  selected: boolean
  onSelect: () => void
  onOpenDocument: () => void
  onViewSection: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'w-full cursor-pointer rounded-xl border px-4 py-3.5 text-left transition-colors',
        selected
          ? 'border-kb-dark-gray bg-white'
          : 'border-neutral-200 bg-white hover:border-kb-gray/30',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-neutral-400" />
            <h4 className="truncate text-sm font-semibold text-neutral-900">
              {hit.title} {hit.version}
            </h4>
          </div>
          <ul className="mt-2 space-y-1 text-xs text-neutral-500">
            <li>{hit.chapter}</li>
            <li>{hit.section}</li>
            <li>관련도 {hit.relevance}%</li>
            <li>시행일 {hit.effectiveDate}</li>
          </ul>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Badge variant={hit.relevance >= 90 ? 'success' : 'default'}>
            {hit.relevance}%
          </Badge>
          <div className="flex flex-wrap justify-end gap-1">
            {hit.matchType.map((type) => (
              <span
                key={type}
                className="rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-400"
              >
                {type}
              </span>
            ))}
          </div>
        </div>
      </div>

      <blockquote className="mt-3 border-l-2 border-kb-yellow pl-3 text-xs leading-relaxed text-neutral-700">
        “{hit.passage}”
      </blockquote>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-neutral-400">{hit.repository}</span>
        <span className="ml-auto flex gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onOpenDocument}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            원문 보기
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onViewSection}
          >
            <MapPin className="h-3.5 w-3.5" />
            문서 위치 열기
          </Button>
        </span>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-[11px] text-neutral-400">{label}</dt>
      <dd className="text-xs font-medium leading-snug text-neutral-900 break-words">
        {value}
      </dd>
    </div>
  )
}
