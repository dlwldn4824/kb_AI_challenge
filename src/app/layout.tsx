import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Stage } from './stage';

/** 로컬 번들 폰트 — 런타임 외부 요청 없음, basePath 도 Next 가 처리한다. */
const pretendard = localFont({
  src: '../../public/fonts/PretendardVariable.woff2',
  weight: '45 920',
  display: 'block',
  variable: '--font-pretendard',
});

export const metadata: Metadata = {
  title: '답변등기',
  description: 'AI 상담 초안 검토·승인·발송 콘솔 (합성 데모)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body className="bg-stage text-ink">
        <Stage>{children}</Stage>
      </body>
    </html>
  );
}
