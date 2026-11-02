import { BettingHeader } from './BettingHeader';
import styles from './page.module.css';

export default function BettingLoading() {
  return (
    <div className={styles.page}>
      <BettingHeader loading />
      <main
        className={`${styles.content} ${styles.loadingContent}`}
        aria-label="Loading betting page"
        aria-busy="true"
      >
        <span className={styles.loadingStatus} role="status">
          Loading betting page
        </span>
        <section className={styles.loadingDraw} aria-hidden="true">
          <span className={`${styles.loadingSkeleton} ${styles.loadingTitle}`} />
          <div className={styles.loadingBalls}>
            {Array.from({ length: 6 }, (_, index) => (
              <span className={styles.loadingBall} key={index} />
            ))}
          </div>
          <span className={`${styles.loadingSkeleton} ${styles.loadingTimer}`} />
        </section>
        <nav className={styles.loadingGames} aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <span className={styles.loadingGame} key={index}>
              <span className={styles.loadingGameLogo} />
              <span className={`${styles.loadingSkeleton} ${styles.loadingGameLabel}`} />
            </span>
          ))}
        </nav>
        <section className={styles.loadingGameStage} aria-hidden="true">
          <span className={`${styles.loadingSkeleton} ${styles.loadingGameTitle}`} />
          <div className={styles.loadingSelectionGrid}>
            {Array.from({ length: 24 }, (_, index) => (
              <span className={styles.loadingSelectionBall} key={index} />
            ))}
          </div>
        </section>
        <section className={styles.loadingInitiator} aria-hidden="true">
          <span className={styles.loadingInput} />
          <span className={styles.loadingInput} />
          <span className={styles.loadingPayout} />
        </section>
      </main>
    </div>
  );
}
