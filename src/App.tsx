import { useEffect, useMemo, useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { BottomActionBar } from '@/components/layout/BottomActionBar'
import { ConversationPanel } from '@/components/consultation/ConversationPanel'
import { ResponseEditor } from '@/components/consultation/ResponseEditor'
import { RetrievedEvidencePanel } from '@/components/consultation/RetrievedEvidencePanel'
import { ValidationPanel } from '@/components/consultation/ValidationPanel'
import { mockSession } from '@/data/mockSession'
import {
  analyzeResponseRisks,
  refineAndReviewResponse,
} from '@/lib/askAi'
import {
  toggleValidationCheck,
  deriveSessionState,
} from '@/lib/validation'
import type {
  ConditionalApproval,
  RetrievalHit,
  RiskFlag,
  SessionStatus,
  ValidationCheck,
} from '@/types/consultation'

function filterHits(hits: RetrievalHit[], activeFilters: string[]): RetrievalHit[] {
  if (activeFilters.length === 0) return hits

  const categoryFilters = activeFilters.filter(
    (f) => f === '이체 제한' || f === '고객 상담',
  )
  const otherFilters = activeFilters.filter(
    (f) => f !== '이체 제한' && f !== '고객 상담',
  )

  return hits.filter((hit) => {
    const othersOk = otherFilters.every((filter) => {
      if (filter === '시행 중 정책만') return true
      if (filter === '최신 버전') return hit.relevance >= 80
      return true
    })
    if (!othersOk) return false
    if (categoryFilters.length === 0) return true

    return categoryFilters.some((filter) => {
      if (filter === '이체 제한') {
        return (
          hit.title.includes('이체') ||
          hit.passage.includes('이체') ||
          hit.passage.includes('제한') ||
          hit.chapter.includes('제한')
        )
      }
      if (filter === '고객 상담') {
        return (
          hit.title.includes('상담') ||
          hit.title.includes('본인확인') ||
          hit.passage.includes('응대') ||
          hit.passage.includes('본인확인') ||
          hit.passage.includes('본인 확인')
        )
      }
      return false
    })
  })
}

export default function App() {
  const session = mockSession
  const [response, setResponse] = useState(session.aiResponse)
  const [asking, setAsking] = useState(false)
  const [askPhase, setAskPhase] = useState<'idle' | 'draft' | 'review'>('idle')
  const [askError, setAskError] = useState<string | null>(null)
  const [riskFlags, setRiskFlags] = useState<RiskFlag[]>([])
  const [activeRiskId, setActiveRiskId] = useState<string | null>(null)
  const [checks, setChecks] = useState<ValidationCheck[]>(session.validationChecks)
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>(session.status)
  const [conditionalApproval, setConditionalApproval] = useState<ConditionalApproval>(
    session.conditionalApproval,
  )
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(
    session.retrievalHits[0]?.documentId ?? null,
  )
  const [activeFilters, setActiveFilters] = useState<string[]>([
    ...session.retrievalQuery.filters,
  ])

  const filteredHits = useMemo(
    () => filterHits(session.retrievalHits, activeFilters),
    [activeFilters, session.retrievalHits],
  )

  const selectedHit =
    filteredHits.find((h) => h.documentId === selectedEvidenceId) ??
    filteredHits[0] ??
    null

  const derived = useMemo(
    () =>
      deriveSessionState({
        checks,
        sessionStatus,
        conditionalApproval,
      }),
    [checks, sessionStatus, conditionalApproval],
  )

  function handleToggleFilter(filter: string) {
    setActiveFilters((prev) =>
      prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter],
    )
  }

  function handleSelectEvidence(hit: RetrievalHit) {
    setSelectedEvidenceId(hit.documentId)
  }

  function handleToggleCheck(checkId: string) {
    setChecks((prev) => toggleValidationCheck(prev, checkId))
  }

  function handleResolveApproval() {
    setConditionalApproval((prev) => ({ ...prev, resolved: true }))
  }

  function handleSend() {
    if (!derived.readyToSend) return
    setSessionStatus('sent')
  }

  useEffect(() => {
    let cancelled = false

    async function runInitialTwoPass() {
      setAsking(true)
      setAskError(null)
      setActiveRiskId(null)
      try {
        const { response: next, flags } = await refineAndReviewResponse({
          instruction:
            '검색된 정책 근거를 바탕으로 고객에게 보낼 응답 초안을 작성하세요. 즉시 해제를 확정하지 마세요.',
          currentResponse: session.aiResponse,
          evidence: session.retrievalHits,
          onPhase: (phase) => {
            if (!cancelled) setAskPhase(phase)
          },
        })
        if (!cancelled) {
          setResponse(next)
          setRiskFlags(flags)
          setActiveRiskId(flags[0]?.id ?? null)
        }
      } catch (error) {
        if (!cancelled) {
          // 초안 생성 실패 시 기존 mock으로 위험 분석만 시도
          setAskPhase('review')
          try {
            const flags = await analyzeResponseRisks({
              response: session.aiResponse,
              evidence: session.retrievalHits,
            })
            if (!cancelled) {
              setRiskFlags(flags)
              setActiveRiskId(flags[0]?.id ?? null)
            }
          } catch (reviewError) {
            setAskError(
              reviewError instanceof Error
                ? reviewError.message
                : error instanceof Error
                  ? error.message
                  : 'AI 요청에 실패했습니다.',
            )
          }
        }
      } finally {
        if (!cancelled) {
          setAsking(false)
          setAskPhase('idle')
        }
      }
    }

    void runInitialTwoPass()
    return () => {
      cancelled = true
    }
  }, [session.aiResponse, session.retrievalHits])

  async function handleAskAi(instruction: string) {
    setAsking(true)
    setAskError(null)
    setActiveRiskId(null)
    try {
      const { response: next, flags } = await refineAndReviewResponse({
        instruction,
        currentResponse: response,
        evidence: filteredHits,
        onPhase: setAskPhase,
      })
      setResponse(next)
      setRiskFlags(flags)
      setActiveRiskId(flags[0]?.id ?? null)
    } catch (error) {
      setAskError(
        error instanceof Error ? error.message : 'AI 요청에 실패했습니다.',
      )
    } finally {
      setAsking(false)
      setAskPhase('idle')
    }
  }

  function handleChangeResponse(next: string) {
    setResponse(next)
    setRiskFlags([])
    setActiveRiskId(null)
  }

  const policyReference = selectedHit
    ? {
        title: `${selectedHit.title} ${selectedHit.version}`,
        section: `${selectedHit.chapter} · ${selectedHit.section}`,
      }
    : session.policyReference

  return (
    <div className="flex h-screen min-w-[1280px] overflow-hidden bg-neutral-100">
      <Sidebar activeId="ai-consultation" />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="AI 상담" operator={session.operator} />

        <main className="grid min-h-0 flex-1 grid-cols-[1.3fr_2.2fr_1.5fr] gap-4 overflow-hidden px-5 py-4">
          <section className="min-h-0 min-w-0 overflow-y-auto">
            <ConversationPanel
              messages={session.conversation}
              caseInfo={session.caseInfo}
            />
          </section>

          <section className="min-h-0 min-w-0 space-y-4 overflow-y-auto">
            <ResponseEditor
              value={response}
              onChange={handleChangeResponse}
              evidenceCount={filteredHits.length}
              riskFlags={riskFlags}
              activeRiskId={activeRiskId}
              onSelectRisk={setActiveRiskId}
              onAskAi={handleAskAi}
              asking={asking}
              askPhase={askPhase}
              askError={askError}
            />
            <RetrievedEvidencePanel
              query={session.retrievalQuery}
              hits={filteredHits}
              selectedId={selectedHit?.documentId ?? null}
              onSelect={handleSelectEvidence}
              activeFilters={activeFilters}
              onToggleFilter={handleToggleFilter}
            />
          </section>

          <section className="min-h-0 min-w-0 overflow-y-auto">
            <ValidationPanel
              checks={checks}
              policyReference={policyReference}
              documentCount={filteredHits.length}
              activity={derived.activity}
              conditionalApproval={conditionalApproval}
              metadata={session.metadata}
              onToggleCheck={handleToggleCheck}
              onResolveApproval={handleResolveApproval}
            />
          </section>
        </main>

        <BottomActionBar
          statusLabel={derived.statusLabel}
          readyToSend={derived.readyToSend}
          sent={sessionStatus === 'sent'}
          onSaveDraft={() => undefined}
          onSend={handleSend}
        />
      </div>
    </div>
  )
}
