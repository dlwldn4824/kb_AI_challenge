# KB AI Guardian

KB 금융 챌린지용 AI 상담 운영 콘솔입니다.  
상담사가 고객 발송 전 AI 초안·정책 근거(RAG)·운영 검증을 한 화면에서 검토합니다.

## Stack

- React + TypeScript + Vite
- Tailwind CSS
- Claude (Anthropic) — 초안 생성 / 위험 표현 하이라이트 2-pass

## Setup

```bash
npm install
cp .env.example .env.local
# .env.local에 ANTHROPIC_API_KEY 설정
npm run dev
```

## Notes

- `.env.local`은 커밋하지 않습니다.
- 개발 서버 프록시: `/api/ask-ai`, `/api/review-risks`
