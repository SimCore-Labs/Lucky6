'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ApiError, getCurrentDraw, getMarkets } from '@/lib/api';
import { GameBall } from '@/components/game/GameBall';
import styles from './lobby-page.module.css';

function drawErrorText(error: unknown) {
  if (error instanceof ApiError && error.status === 404) {
    return 'No active draw is available right now.';
  }
  return 'Draw information is temporarily unavailable.';
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ').toLowerCase();
}

export function LobbyPage() {
  const drawQuery = useQuery({
    queryKey: ['draw', 'current'],
    queryFn: ({ signal }) => getCurrentDraw(signal),
  });
  const marketsQuery = useQuery({
    queryKey: ['markets'],
    queryFn: ({ signal }) => getMarkets(signal),
  });
  const draw = drawQuery.data;
  const latestResult = draw?.latestResult;
  const latestBalls = latestResult?.balls
    ? [...latestResult.balls].sort((first, second) => first.orderIndex - second.orderIndex)
    : [];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.eyebrow}><span className={styles.eyebrowDot} /> LUCKY6 GAME ROOM</span>
          <h1>Pick your six.<br /><span>Own the moment.</span></h1>
          <p>A fresh draw, a clean ticket, and your numbers in play. Start with a preview—real-value wagering is not live.</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryButton} href="/betting">
              Build a ticket <span aria-hidden="true">↗</span>
            </Link>
            <Link className={styles.secondaryLink} href="/tv">Watch results <span aria-hidden="true">→</span></Link>
          </div>
          <div className={styles.heroFootnote}><span>01</span> Six distinct numbers <i /> 1—49</div>
        </div>
        <div className={styles.heroArtwork} aria-hidden="true">
          <div className={styles.artHalo} />
          <div className={styles.artOrbit} />
          <div className={`${styles.artBall} ${styles.artBallOne}`}>06</div>
          <div className={`${styles.artBall} ${styles.artBallTwo}`}>18</div>
          <div className={`${styles.artBall} ${styles.artBallThree}`}>27</div>
          <div className={`${styles.artBall} ${styles.artBallFour}`}>34</div>
          <div className={`${styles.artBall} ${styles.artBallFive}`}>41</div>
          <div className={`${styles.artBall} ${styles.artBallSix}`}>49</div>
          <span className={styles.artLabel}>SIX / FORTY-NINE</span>
        </div>
      </section>

      <section className={styles.dashboard} aria-label="Draw status and latest result">
        <article className={styles.drawCard}>
          <div className={styles.cardHeading}>
            <span className={styles.sectionKicker}>NEXT DRAW</span>
            <span className={styles.liveBadge}><span /> {draw ? statusLabel(draw.status) : 'checking'}</span>
          </div>
          {drawQuery.isPending ? (
            <div className={styles.drawLoading} aria-label="Loading next draw">
              <span /><span /><span /><span /><span /><span />
              <div className={styles.skeletonLine} />
            </div>
          ) : drawQuery.isError ? (
            <div className={styles.drawUnavailable} role="status">
              <span>{drawErrorText(drawQuery.error)}</span>
              <button type="button" onClick={() => drawQuery.refetch()}>Try again</button>
            </div>
          ) : draw ? (
            <>
              <div className={styles.drawNumber}>Draw <strong>#{draw.drawNumber}</strong></div>
              <div className={styles.drawMeta}>
                <span>Closes</span>
                <time dateTime={draw.closeAt}>{new Date(draw.closeAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time>
              </div>
              <Link className={styles.drawLink} href="/betting">Choose your numbers <span aria-hidden="true">→</span></Link>
            </>
          ) : null}
        </article>

        <article className={styles.resultCard}>
          <div className={styles.cardHeading}>
            <span className={styles.sectionKicker}>LATEST RESULT</span>
            {latestResult && <span className={styles.resultDraw}>DRAW #{latestResult.drawNumber}</span>}
          </div>
          {drawQuery.isPending ? (
            <div className={styles.resultSkeleton} aria-label="Loading latest result">
              {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
            </div>
          ) : drawQuery.isError ? (
            <div className={styles.resultUnavailable}>Results will appear when draw data is available.</div>
          ) : latestBalls.length ? (
            <>
              <div className={styles.resultBalls}>
                {latestBalls.map((ball) => (
                  <GameBall key={`${latestResult?.id}-${ball.orderIndex}`} number={ball.number} color={ball.color} />
                ))}
              </div>
              <div className={styles.resultFooter}>
                <span>Sum <strong>{latestResult?.statistics?.totalSum ?? latestBalls.reduce((sum, ball) => sum + ball.number, 0)}</strong></span>
                <Link href="/tv">All results <span aria-hidden="true">→</span></Link>
              </div>
            </>
          ) : (
            <div className={styles.resultUnavailable}>No completed draw to show yet.</div>
          )}
        </article>
      </section>

      <section className={styles.gamesSection}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionKicker}>PICK YOUR GAME</span>
            <h2>Play your way</h2>
          </div>
          <Link className={styles.viewAll} href="/betting">Open ticket builder <span aria-hidden="true">→</span></Link>
        </div>
        {marketsQuery.isPending ? (
          <div className={styles.gameGrid} aria-label="Loading games">
            {[0, 1, 2].map((item) => <div className={styles.gameSkeleton} key={item} />)}
          </div>
        ) : marketsQuery.isError ? (
          <div className={styles.marketUnavailable} role="status">
            <span>Game markets are temporarily unavailable.</span>
            <button type="button" onClick={() => marketsQuery.refetch()}>Retry</button>
          </div>
        ) : marketsQuery.data?.length ? (
          <div className={styles.gameGrid}>
            {marketsQuery.data.map((market, index) => (
              <Link className={styles.gameCard} href="/betting" key={market.id}>
                <span className={`${styles.gameIcon} ${styles[`gameIcon${index % 3}`]}`}>
                  {index === 0 ? '6' : index === 1 ? '◉' : '↗'}
                </span>
                <span className={styles.gameText}>
                  <strong>{market.title}</strong>
                  <span>{market.description || `${market.selections.length} available selections`}</span>
                </span>
                <span className={styles.gameArrow} aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.marketUnavailable}>
            No active markets are currently available.
          </div>
        )}
      </section>

      <footer className={styles.disclaimer}>
        <span className={styles.disclaimerMark}>i</span>
        <p>Lucky6 is in preview. Credits shown in the app are simulated; real-value wagering is not available.</p>
      </footer>
    </div>
  );
}
