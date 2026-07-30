import path from 'path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { IncomingMessage, ServerResponse } from 'http'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function callClaude(params: {
  apiKey: string
  system: string
  userContent: string
  maxTokens?: number
}) {
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': params.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: params.maxTokens ?? 1024,
      system: params.system,
      messages: [{ role: 'user', content: params.userContent }],
    }),
  })

  const data = (await anthropicRes.json()) as {
    content?: Array<{ type: string; text?: string }>
    error?: { message?: string }
  }

  const text =
    data.content
      ?.filter((c) => c.type === 'text')
      .map((c) => c.text || '')
      .join('\n')
      .trim() || ''

  return { ok: anthropicRes.ok, status: anthropicRes.status, text, error: data.error }
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1))
    }
    throw new Error('JSON 파싱 실패')
  }
}

function anthropicAskProxy(apiKey: string): Plugin {
  return {
    name: 'anthropic-ask-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ask-ai', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method Not Allowed' })
          return
        }

        if (!apiKey) {
          sendJson(res, 500, {
            error: 'ANTHROPIC_API_KEY가 .env.local에 설정되지 않았습니다.',
          })
          return
        }

        try {
          const raw = await readBody(req)
          const body = JSON.parse(raw || '{}') as {
            instruction?: string
            currentResponse?: string
            conversation?: string
            evidence?: string
          }

          const instruction = body.instruction?.trim()
          if (!instruction) {
            sendJson(res, 400, { error: 'instruction이 필요합니다.' })
            return
          }

          const system = `당신은 KB국민은행 내부 AI 상담 응답 작성 도우미입니다.
상담원이 고객에게 보낼 응답 초안을 수정·개선합니다.
규칙:
- 반드시 제공된 검색 근거(원문) 안에서만 답변하세요. 근거에 없는 내용을 지어내지 마세요.
- 고객에게 보낼 최종 응답 문장만 출력하세요.
- 설명, 머리말, 따옴표, 마크다운을 넣지 마세요.
- 한국어로 작성하세요.
- 확정되지 않은 해제 약속은 단정하지 말고, 확인 절차를 안내하세요.
- 은행 내부 운영 톤으로 정중하고 명확하게 작성하세요.`

          const userContent = `고객 대화:
${body.conversation || '(없음)'}

검색 시스템이 찾은 정책 근거(원문):
${body.evidence || '(검색 근거 없음)'}

현재 AI 답변 초안:
${body.currentResponse || '(없음)'}

상담원 요청:
${instruction}

위 검색 근거 안에서만, 요청을 반영한 새로운 고객 응답을 작성하세요.`

          const result = await callClaude({ apiKey, system, userContent })

          if (!result.ok) {
            sendJson(res, result.status, {
              error: result.error?.message || 'Anthropic API 요청 실패',
            })
            return
          }

          sendJson(res, 200, { response: result.text })
        } catch (error) {
          sendJson(res, 500, {
            error:
              error instanceof Error ? error.message : '서버 오류가 발생했습니다.',
          })
        }
      })

      server.middlewares.use('/api/review-risks', async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method Not Allowed' })
          return
        }

        if (!apiKey) {
          sendJson(res, 500, {
            error: 'ANTHROPIC_API_KEY가 .env.local에 설정되지 않았습니다.',
          })
          return
        }

        try {
          const raw = await readBody(req)
          const body = JSON.parse(raw || '{}') as {
            response?: string
            conversation?: string
            evidence?: string
          }

          const draft = body.response?.trim()
          if (!draft) {
            sendJson(res, 400, { error: 'response가 필요합니다.' })
            return
          }

          const system = `당신은 KB국민은행 내부 AI 응답 리스크 검토관입니다.
상담사가 고객에게 보내기 전, AI 답변 초안에서 확인이 필요한 위험 표현을 찾습니다.

반드시 JSON만 출력하세요. 마크다운·설명 금지.
형식:
{
  "flags": [
    {
      "phrase": "초안에 실제로 등장하는 연속 구문(짧게)",
      "category": "확정표현|오안내위험|근거불일치|개인정보|면책부족|기타",
      "severity": "high|medium|low",
      "reason": "왜 위험한지 한 문장",
      "reviewHint": "상담사가 무엇을 확인해야 하는지 한 문장"
    }
  ]
}

규칙:
- phrase는 초안 원문에 그대로 존재하는 부분 문자열이어야 합니다.
- 확정 약속(즉시/바로/반드시 해제 등), 정책과 어긋날 수 있는 안내, 근거에 없는 단정, 민감정보 노출 후보를 우선합니다.
- 위험이 없으면 flags는 빈 배열입니다.
- 최대 6개까지 중요한 것만 반환합니다.`

          const userContent = `고객 대화:
${body.conversation || '(없음)'}

검색 근거(원문):
${body.evidence || '(없음)'}

AI 답변 초안:
${draft}

위 초안에서 상담사가 확인해야 할 위험 구문을 JSON으로 반환하세요.`

          const result = await callClaude({
            apiKey,
            system,
            userContent,
            maxTokens: 1200,
          })

          if (!result.ok) {
            sendJson(res, result.status, {
              error: result.error?.message || 'Anthropic API 요청 실패',
            })
            return
          }

          try {
            const parsed = extractJsonObject(result.text) as {
              flags?: unknown
            }
            const flags = Array.isArray(parsed.flags) ? parsed.flags : []
            sendJson(res, 200, { flags })
          } catch {
            sendJson(res, 200, { flags: [] })
          }
        } catch (error) {
          sendJson(res, 500, {
            error:
              error instanceof Error ? error.message : '서버 오류가 발생했습니다.',
          })
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.ANTHROPIC_API_KEY || ''

  return {
    plugins: [react(), tailwindcss(), anthropicAskProxy(apiKey)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
