'use client';

import { useState } from 'react';
import { BettingHeader } from './BettingHeader';
import { BettingInitiator } from './BettingInitiator';
import Image from 'next/image';
import { Bet6 } from './Bet6';
import { HighLow } from './HighLow';
import { LatestDrawSection } from './LatestDrawSection';
import { Lucky6 } from './Lucky6';
import { OddEven } from './OddEven';
import { Rainbow } from './Rainbow';
import { TotalColor } from './TotalColor';
import styles from './page.module.css';

const games = [
  { id: 'lucky-six', label: 'Lucky Six', image: '/6ix.png' },
  { id: 'bet-zero', label: 'Bet Zero', image: '/zero.png' },
  { id: 'rainbow', label: 'Rainbow', image: '/rainbow.png' },
  { id: 'high-low', label: 'High Low', image: '/high-low.png' },
  { id: 'odd-even', label: 'Odd Even', image: '/odd-even.png' },
  { id: 'total-color', label: 'Total Color', image: '/total.png' },
] as const;

type GameId = (typeof games)[number]['id'];

export default function BettingPage() {
  const [selectedGame, setSelectedGame] = useState<GameId | null>(null);

  return (
    <div className={styles.page}>
      <BettingHeader />
      <main className={styles.content} aria-label="Betting page">
        <LatestDrawSection />
        <nav className={styles.sectionSlot} aria-label="Choose a game">
          <div className={styles.sectionLogos}>
            {games.map((game) => {
              const isSelected = selectedGame === game.id;
              return (
                <button
                  className={`${styles.gameLogo} ${
                    isSelected ? styles.selectedGame : ''
                  }`}
                  type="button"
                  key={game.id}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedGame(game.id)}
                >
                  <Image
                    className={styles.sectionLogo}
                    src={game.image}
                    alt=""
                    width={64}
                    height={64}
                  />
                  <span>{game.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
        {selectedGame === null ? (
          <section className={styles.emptyStage} aria-live="polite">
            <span className={styles.emptyBall} aria-hidden="true">
              49
            </span>
            <h1>Select one of the games to begin playing</h1>
          </section>
        ) : (
          <div className={styles.gameStage} aria-live="polite">
            {selectedGame === 'lucky-six' && <Lucky6 />}
            {selectedGame === 'bet-zero' && <Bet6 />}
            {selectedGame === 'rainbow' && <Rainbow />}
            {selectedGame === 'high-low' && <HighLow />}
            {selectedGame === 'odd-even' && <OddEven />}
            {selectedGame === 'total-color' && <TotalColor />}
          </div>
        )}
        <BettingInitiator />
      </main>
    </div>
  );
}
