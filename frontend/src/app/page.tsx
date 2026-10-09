'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCurrentDraw, getMarkets } from '@/lib/api';
import type { CurrentDrawResponse, MarketResponse } from '@/lib/api';
import styles from './page.module.css';

const ballColors: Record<string, string> = {
  BLUE: 'blue',
  YELLOW: 'gold',
  RED: 'coral',
  GREEN: 'mint',
  BLACK: 'black',
};

function formatCountdown(milliseconds: number): string {
  if (milliseconds <= 0) return '00:00';
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function DrawStage({
  draw,
  loading,
  error,
  now,
}: {
  draw?: CurrentDrawResponse;
  loading: boolean;
  error: boolean;
  now: number;
}) {
  const balls = draw?.balls
    ? [...draw.balls].sort((first, second) => first.orderIndex - second.orderIndex)
    : [];
  const remaining = draw ? new Date(draw.closeAt).getTime() - now : 0;

  return (
    <section className={styles.drawCard} aria-labelledby="draw-title">
      <div className={styles.cardGrain} aria-hidden="true" />
      <header className={styles.drawHeader}>
        <div className={styles.liveStatus}>
          <span className={styles.liveDot} />
          {draw?.status === 'OPEN' ? 'Taking entries' : 'Live draw'}
        </div>
        <span className={styles.roundNumber}>
          {draw ? `Round ${draw.drawNumber}` : 'Next round'}
        </span>
      </header>

      <div className={styles.drawCenter}>
        <p className={styles.drawEyebrow}>Six numbers. One moment.</p>
        <h2 id="draw-title" className={styles.drawTitle}>
          {loading ? 'Finding your draw' : error ? 'Draw unavailable' : 'The next draw'}
        </h2>
        <p className={styles.drawCaption}>
          {error
            ? 'We could not reach the live draw. Check back in a moment.'
            : draw?.status === 'OPEN'
              ? 'The balls are still in the drum.'
              : 'The live result appears here as it unfolds.'}
        </p>

        <div className={styles.ballTrack} aria-label={`${balls.length} of 6 numbers drawn`}>
          {Array.from({ length: 6 }, (_, index) => {
            const ball = balls[index];
            const color = ball ? ballColors[ball.color] ?? 'blue' : undefined;
            return (
              <div
                className={`${styles.ball} ${color ? styles[color] : styles.ballWaiting}`}
                key={ball?.orderIndex ?? index}
                aria-label={ball ? `Number ${ball.number}` : 'Number pending'}
              >
                <span>{ball ? ball.number : <i />}</span>
              </div>
            );
          })}
        </div>

        <div className={styles.countdownRow}>
          <span>{draw?.status === 'OPEN' ? 'Entries close in' : 'Draw status'}</span>
          <strong>
            {loading ? '--:--' : draw?.status === 'OPEN' ? formatCountdown(remaining) : draw?.status ?? 'Waiting'}
          </strong>
        </div>
      </div>

      <footer className={styles.drawFooter}>
        <div>
          <span className={styles.footerLabel}>Draw rhythm</span>
          <strong>Every five minutes</strong>
        </div>
        <div className={styles.orbitMark} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </footer>
    </section>
  );
}

function MarketBoard({
  markets,
  loading,
  error,
}: {
  markets: MarketResponse[];
  loading: boolean;
  error: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <section className={styles.marketSection} id="markets" aria-labelledby="markets-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionKicker}>The board</p>
          <h2 id="markets-title">Choose your angle.</h2>
        </div>
        <p className={styles.sectionNote}>
          {loading ? 'Loading live prices' : error ? 'Prices are temporarily unavailable' : `${markets.length} live markets`}
        </p>
      </div>

      {error ? (
        <div className={styles.emptyState} role="status">
          <strong>Markets could not load.</strong>
          <span>The board will reconnect automatically.</span>
        </div>
      ) : loading ? (
        <div className={styles.emptyState} role="status">Loading live markets…</div>
      ) : (
        <div className={styles.marketGrid}>
          {markets.map((market, index) => (
            <article className={styles.marketCard} key={market.id}>
              <div className={styles.marketTopline}>
                <span className={styles.marketIndex}>{String(index + 1).padStart(2, '0')}</span>
                <span className={styles.marketType}>{market.type.replaceAll('_', ' ').toLowerCase()}</span>
              </div>
              <h3>{market.title}</h3>
              <p className={styles.marketDescription}>{market.description}</p>
              <div className={styles.selectionList}>
                {market.selections.map((selection) => {
                  const selectionKey = `${market.id}:${selection.id}`;
                  const isSelected = selected === selectionKey;
                  return (
                    <button
                      className={`${styles.selection} ${isSelected ? styles.selectionActive : ''}`}
                      type="button"
                      key={selection.id}
                      aria-pressed={isSelected}
                      onClick={() => setSelected(isSelected ? null : selectionKey)}
                    >
                      <span className={styles.selectionName}>
                        <span className={styles.selectionMark} aria-hidden="true" />
                        {selection.label}
                      </span>
                      <span className={styles.odds}>{selection.currentOdds.toFixed(2)}×</span>
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function HomePage() {
  const [now, setNow] = useState(0);
  const drawQuery = useQuery({
    queryKey: ['current-draw'],
    queryFn: ({ signal }) => getCurrentDraw(signal),
    refetchInterval: 15_000,
  });
  const marketsQuery = useQuery({
    queryKey: ['markets'],
    queryFn: ({ signal }) => getMarkets(signal),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const updateTime = () => setNow(Date.now());
    updateTime();
    const interval = window.setInterval(updateTime, 1_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.pageShell}>
        <header className={styles.topbar}>
          <a className={styles.brand} href="#top" aria-label="Lucky Six home">
            <span className={styles.brandMark} aria-hidden="true">
              <svg viewBox="0 0 38 38" fill="none">
                <path d="M19 2.5 33.2 10.7v16.6L19 35.5 4.8 27.3V10.7L19 2.5Z" />
                <path d="M23.6 10.2h-7.1l-1 7.2c.9-.7 1.9-1 3.2-1 3.2 0 5.1 1.9 5.1 5s-2.2 5.2-5.6 5.2c-2.4 0-4.3-.9-5.7-2.7" />
              </svg>
            </span>
            <span className={styles.brandName}>lucky<span>six</span></span>
          </a>

          <nav className={styles.navigation} aria-label="Main navigation">
            <a className={styles.navActive} href="#draw">Live draw</a>
            <a href="#markets">Markets</a>
            <a href="#how-to-play">How it works</a>
          </nav>

          <span className={styles.walletNote}>Wallet access is next</span>
        </header>

        <section className={styles.hero} id="top">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span className={styles.eyebrowLine} />
              A little luck. A live draw.
            </p>
            <h1>Six balls.<br />A whole new <em>moment.</em></h1>
            <p className={styles.heroDescription}>
              Pick a side before the drum turns. Watch six numbers land, live,
              every five minutes.
            </p>
            <a className={styles.primaryLink} href="#markets">
              Explore the markets
              <span aria-hidden="true">↘</span>
            </a>
            <div className={styles.heroFootnote}>
              <span className={styles.footnoteRule} />
              <span>Live prices · Public draw record</span>
            </div>
          </div>

          <div className={styles.drawWrap} id="draw">
            <DrawStage
              draw={drawQuery.data}
              loading={drawQuery.isPending}
              error={drawQuery.isError}
              now={now}
            />
          </div>
        </section>

        <div className={styles.infoRail} id="how-to-play">
          <span className={styles.infoLabel}>How to play</span>
          <p>Choose a market</p>
          <span className={styles.railArrow} aria-hidden="true">→</span>
          <p>Watch six balls draw</p>
          <span className={styles.railArrow} aria-hidden="true">→</span>
          <p>See the result live</p>
          <span className={styles.infoAside}>Simple by design.</span>
        </div>

        <MarketBoard
          markets={marketsQuery.data ?? []}
          loading={marketsQuery.isPending}
          error={marketsQuery.isError}
        />

        <footer className={styles.siteFooter}>
          <a className={styles.footerBrand} href="#top">Lucky Six</a>
          <span>Play thoughtfully. Results are recorded on the public ledger.</span>
          <a href="#top">Back to top <span aria-hidden="true">↑</span></a>
        </footer>
      </div>
    </main>
  );
}
