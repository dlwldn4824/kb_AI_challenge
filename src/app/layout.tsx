import type { Metadata } from 'next';
import './globals.css';
import { Stage } from './stage';

export const metadata: Metadata = {
  title: '답변등기',
  description: 'AI 상담 초안 검토·승인·발송 콘솔 (합성 데모)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-stage text-ink">
        <Stage>{children}</Stage>
      </body>
    </html>
  );
}
