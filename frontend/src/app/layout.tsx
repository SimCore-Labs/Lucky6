import type { Metadata, Viewport } from 'next';
import { Providers } from '@/providers/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lucky Six',
  description: 'The next draw starts here.',
};

export const viewport: Viewport = {
  themeColor: '#101a2a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
