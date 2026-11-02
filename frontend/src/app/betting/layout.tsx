import type { ReactNode } from 'react';
import { Providers } from '@/providers/Providers';

export default function BettingLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <Providers>{children}</Providers>;
}
