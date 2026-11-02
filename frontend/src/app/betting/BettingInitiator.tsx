import styles from './betting-initiator.module.css';

export function BettingInitiator() {
  return (
    <section className={styles.panel} aria-label="Betting initiator">
      <div className={styles.stakeFields}>
        <div className={styles.stakeInputs}>
          <label className={styles.stakeField} htmlFor="max-stake">
            <span>Max stake</span>
            <input
              className={styles.stakeInput}
              id="max-stake"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="0.00"
            />
          </label>
          <label className={styles.stakeField} htmlFor="total-stake">
            <span>Total stake</span>
            <input
              className={styles.stakeInput}
              id="total-stake"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="0.00"
            />
          </label>
        </div>
        <div className={styles.payout}>
          <span>Max payout</span>
          <output aria-label="Maximum payout not calculated">—</output>
        </div>
      </div>
    </section>
  );
}
