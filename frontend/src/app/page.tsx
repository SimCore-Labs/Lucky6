'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getApiHealth } from '@/lib/api';
import styles from './page.module.css';

const ballSlots = Array.from({ length: 6 }, (_, index) => index + 1);

export default function HomePage() {
  const health = useQuery({
    queryKey: ['api-health'],
    queryFn: ({ signal }) => getApiHealth(signal),
    refetchInterval: 30_000,
  });

  const apiOnline = health.data?.status === 'ok';

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Lucky Six home">
          <span className={styles.brandMark}>6</span>
          <span>Lucky Six</span>
        </Link>
        <nav className={styles.navigation} aria-label="Main navigation">
          <a className={styles.activeLink} href="#draw">Draw</a>
          <a href="#markets">Markets</a>
          <a href="#how-it-works">How it works</a>
        </nav>
        <button className={styles.walletButton} type="button" disabled>
          Wallet sign-in coming soon
        </button>
      </header>

      <section className={styles.intro} id="draw">
        <div className={styles.introCopy}>
          <p className={styles.kicker}>A new draw, every five minutes</p>
          <h1>Six numbers.<br />A moment of possibility.</h1>
          <p className={styles.lede}>
            Follow the draw, explore the game and see what is coming next.
            Results and markets will appear here when the game services are ready.
          </p>
        </div>
        <aside className={styles.connection} aria-live="polite">
          <span className={`${styles.connectionDot} ${apiOnline ? styles.online : ''}`} />
          <div>
            <strong>{health.isPending ? 'Checking API' : apiOnline ? 'API connected' : 'API unavailable'}</strong>
            <p>
              {apiOnline
                ? 'Backend and data services are responding.'
                : health.error instanceof Error
                  ? health.error.message
                  : 'Configure the frontend API URL and start the backend.'}
            </p>
          </div>
          <button
            className={styles.retryButton}
            type="button"
            onClick={() => void health.refetch()}
            aria-label="Retry API connection"
          >
            Retry
          </button>
        </aside>
      </section>

      <section className={styles.drawPanel} aria-labelledby="draw-title">
        <div className={styles.drawHeading}>
          <div>
            <p className={styles.sectionLabel}>Live draw</p>
            <h2 id="draw-title">Waiting for the first draw</h2>
          </div>
          <span className={styles.phaseBadge}>Not scheduled</span>
        </div>
        <div className={styles.ballRow} aria-label="No result published yet">
          {ballSlots.map((slot) => (
            <span className={styles.ball} key={slot} aria-label={`Ball ${slot}, pending`}>
              <span>—</span>
            </span>
          ))}
        </div>
        <div className={styles.drawFooter}>
          <span>Draw results will be published by the game engine.</span>
          <span className={styles.serverNote}>Server-synchronised</span>
        </div>
      </section>

      <section className={styles.lowerGrid} id="markets">
        <article className={styles.infoPanel}>
          <p className={styles.sectionLabel}>Markets</p>
          <h2>Built around the draw</h2>
          <p>
            Market definitions and odds are served by the backend. They will
            show here once those API endpoints are implemented.
          </p>
          <span className={styles.soonTag}>Connecting soon</span>
        </article>
        <article className={styles.infoPanel} id="how-it-works">
          <p className={styles.sectionLabel}>Your account</p>
          <h2>Wallet first</h2>
          <p>
            Wallet connection is not authentication. Sign-in and account
            features will be enabled after the secure challenge flow is ready.
          </p>
          <span className={styles.soonTag}>No wallet connected</span>
        </article>
      </section>

      <footer className={styles.footer}>
        <span>Lucky Six</span>
        <span>Results, odds and balances come from the server.</span>
      </footer>
    </main>
  );
}
