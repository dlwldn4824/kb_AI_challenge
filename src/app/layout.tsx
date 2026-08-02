import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Stage } from './stage';

/** 본문 — Pretendard Variable */
const pretendard = localFont({
  src: '../../public/fonts/PretendardVariable.woff2',
  weight: '45 920',
  display: 'block',
  variable: '--font-pretendard',
});

/**
 * 제목·소제목 — GFC Red Spirit
 *   Black(900) = 제목 / Bold(700) = 소제목
 */
const redSpirit = localFont({
  src: [
    {
      path: '../../public/fonts/GFCRedSpirit-Bold.ttf',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../../public/fonts/GFCRedSpirit-Black.ttf',
      weight: '900',
      style: 'normal',
    },
  ],
  display: 'block',
  variable: '--font-red-spirit',
});

export const metadata: Metadata = {
  title: '답변등기',
  description: 'AI 상담 초안 검토·승인·발송 콘솔 (합성 데모)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${pretendard.variable} ${redSpirit.variable}`}>
      <body className="bg-stage font-sans text-ink antialiased">
        <Stage>{children}</Stage>
      </body>
    </html>
  );
}
