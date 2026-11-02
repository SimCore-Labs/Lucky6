'use client';

import { useQuery } from '@tanstack/react-query';
import { getMarkets } from '@/lib/api';
import { useUiStore } from '@/store/ui/useUiStore';
import styles from './odd-even.module.css';

const outcomes = [
  { value: 'ODD', label: 'Odd' },
  { value: 'EVEN', label: 'Even' },
] as const;

export function OddEven() {
  const selectedOutcome = useUiStore(
    (state) =>
      state.selectedBets.find((bet) => bet.marketType === 'SUM_ODD_EVEN')
        ?.selectionValue ?? null,
  );
  const selectBet = useUiStore((state) => state.selectBet);
  const removeBet = useUiStore((state) => state.removeBet);
  const marketsQuery = useQuery({
    queryKey: ['markets'],
    queryFn: ({ signal }) => getMarkets(signal),
  });
  const market = marketsQuery.data?.find(
    (item) => item.type === 'SUM_ODD_EVEN',
  );
  const selectionByValue = new Map(
    (market?.selections ?? []).map((selection) => [
      selection.value,
      selection,
    ]),
  );
  const activeOutcomes = outcomes.filter((outcome) =>
    selectionByValue.has(outcome.value),
  );

  if (marketsQuery.isPending) {
    return <OddEvenSkeleton />;
  }

  return (
    <section className={styles.section} aria-labelledby="odd-even-heading">
      <div className={styles.gamePanel}>
        <h2 className={styles.heading} id="odd-even-heading">
          ODD EVEN
        </h2>
        <p className={styles.instructions}>
          Predict whether the total sum will be odd or even.
        </p>
        {marketsQuery.isError ? (
          <p className={styles.message} role="alert">
            Odd Even selections are unavailable right now.
          </p>
        ) : activeOutcomes.length === 0 ? (
          <p className={styles.message}>
            Odd Even is not currently available.
          </p>
        ) : (
          <div
            className={styles.outcomes}
            role="group"
            aria-label="Choose whether the total sum is odd or even"
          >
            {activeOutcomes.map((outcome) => {
              const selection = selectionByValue.get(outcome.value);
              if (!selection) return null;

              const isSelected = selectedOutcome === outcome.value;
              if (!market) return null;
              return (
                <button
                  className={`${styles.outcome} ${
                    isSelected ? styles.selectedOutcome : ''
                  }`}
                  type="button"
                  key={selection.id}
                  aria-pressed={isSelected}
                  onClick={() => {
                    if (isSelected) {
                      removeBet(market.type);
                      return;
                    }
                    selectBet({
                      key: market.type,
                      marketId: market.id,
                      marketType: market.type,
                      marketTitle: market.title,
                      selectionId: selection.id,
                      selectionValue: selection.value,
                      selectionLabel: outcome.label,
                      odds: selection.currentOdds,
                      oddsVersion: selection.oddsVersion,
                      maxStake: selection.maxStake ?? market.maxStake ?? '50',
                    });
                  }}
                >
                  <span>{outcome.label}</span>
                  <span className={styles.odds}>{selection.currentOdds}×</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <aside className={styles.oddsPanel} aria-labelledby="odd-even-odds-heading">
        <h3 className={styles.oddsHeading} id="odd-even-odds-heading">
          ODDS
        </h3>
        {marketsQuery.isError ? (
          <p className={styles.message} role="alert">
            Odds are unavailable right now.
          </p>
        ) : activeOutcomes.length === 0 ? (
          <p className={styles.message}>Odd Even odds are not available.</p>
        ) : (
          <dl className={styles.oddsList}>
            {activeOutcomes.map((outcome) => {
              const selection = selectionByValue.get(outcome.value);
              if (!selection) return null;

              return (
                <div
                  className={`${styles.oddsRow} ${
                    selectedOutcome === outcome.value
                      ? styles.selectedOdds
                      : ''
                  }`}
                  key={selection.id}
                >
                  <dt>{outcome.label}</dt>
                  <dd>{selection.currentOdds}×</dd>
                </div>
              );
            })}
          </dl>
        )}
      </aside>
    </section>
  );
}

function OddEvenSkeleton() {
  return (
    <section
      className={`${styles.section} ${styles.loadingSection}`}
      aria-labelledby="odd-even-loading-heading"
      aria-busy="true"
    >
      <span
        className={styles.screenReaderOnly}
        id="odd-even-loading-heading"
        role="status"
      >
        Loading Odd Even game
      </span>
      <div className={styles.gamePanel} aria-hidden="true">
        <span className={`${styles.skeletonBlock} ${styles.headingSkeleton}`} />
        <span
          className={`${styles.skeletonBlock} ${styles.instructionsSkeleton}`}
        />
        <div className={styles.outcomes}>
          {outcomes.map((outcome) => (
            <span className={styles.outcomeSkeleton} key={outcome.value}>
              <span
                className={`${styles.skeletonBlock} ${styles.labelSkeleton}`}
              />
              <span
                className={`${styles.skeletonBlock} ${styles.oddsSkeleton}`}
              />
            </span>
          ))}
        </div>
      </div>
      <aside className={styles.oddsPanel} aria-hidden="true">
        <span
          className={`${styles.skeletonBlock} ${styles.oddsHeadingSkeleton}`}
        />
        <div className={styles.oddsList}>
          {outcomes.map((outcome) => (
            <div className={styles.oddsRow} key={outcome.value}>
              <span
                className={`${styles.skeletonBlock} ${styles.labelSkeleton}`}
              />
              <span
                className={`${styles.skeletonBlock} ${styles.oddsSkeleton}`}
              />
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}
