import { BettingPage } from '@/components/betting/BettingPage';
import { GameShell } from '@/components/layout/GameShell';
import { Providers } from '@/providers/Providers';

export default function BettingRoute() {
  return (
    <Providers>
      <GameShell>
        <BettingPage />
      </GameShell>
    </Providers>
  );
}
