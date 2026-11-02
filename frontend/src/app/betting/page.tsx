import { BettingHeader } from './BettingHeader';
import { LatestDrawSection } from './LatestDrawSection';
import styles from './page.module.css';

export default function BettingPage() {
  return (
    <div className={styles.page}>
      <BettingHeader />
      <main className={styles.content} aria-label="Betting page">
        <LatestDrawSection />
      </main>
    </div>
  );
}
