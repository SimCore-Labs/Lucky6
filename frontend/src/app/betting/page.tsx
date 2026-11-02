import { BettingHeader } from './BettingHeader';
import { LatestDrawSection } from './LatestDrawSection';
import { Lucky6 } from './Lucky6';
import styles from './page.module.css';

export default function BettingPage() {
  return (
    <div className={styles.page}>
      <BettingHeader />
      <main className={styles.content} aria-label="Betting page">
        <LatestDrawSection />
        <Lucky6 />
      </main>
    </div>
  );
}
