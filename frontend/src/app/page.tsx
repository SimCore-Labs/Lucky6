import { LobbyPage } from '@/components/lobby/LobbyPage';
import { GameShell } from '@/components/layout/GameShell';
import { Providers } from '@/providers/Providers';

export default function HomePage() {
  return (
    <Providers>
      <GameShell>
        <LobbyPage />
      </GameShell>
    </Providers>
  );
}
