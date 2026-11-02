import { BettingHeader } from './BettingHeader';
import styles from './page.module.css';

export default function BettingLoading() {
  return (
    <div className={styles.page}>
      <BettingHeader loading />
      <main className={styles.content} aria-label="Loading betting page" />
    </div>
  );
}
