'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMarkets } from '@/lib/api';
import styles from './high-low.module.css';

const outcomes = [
  {
    value: 'HIGH',
    label: 'High',
    boundary: '171–279',
    indicatorClass: styles.triangleUp,
  },
  {
    value: 'MID',
    label: 'Mid',
    boundary: '121–170',
    indicatorClass: styles.rectangle,
  },
  {
    value: 'LOW',
    label: 'Low',
    boundary: '21–120',
    indicatorClass: styles.triangleDown,
  },
] as const;

export function HighLow() {
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const marketsQuery = useQuery({
    queryKey: ['markets'],
    queryFn: ({ signal }) => getMarkets(signal),
  });
  const market = marketsQuery.data?.find(
    (item) => item.type === 'SUM_HIGH_MID_LOW',
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
    return <HighLowSkeleton />;
  }

  return (
    <section className={styles.section} aria-labelledby="high-low-heading">
      <div className={styles.gamePanel}>
        <h2 className={styles.heading} id="high-low-heading">
          HIGH LOW
        </h2>
        <p className={styles.instructions}>
          Predict the total of the numbers drawn. Select if the total will be
          High, Mid, or Low.
        </p>
        {marketsQuery.isError ? (
          <p className={styles.message} role="alert">
            High Low selections are unavailable right now.
          </p>
        ) : activeOutcomes.length === 0 ? (
          <p className={styles.message}>
            High Low is not currently available.
          </p>
        ) : (
          <div
            className={styles.outcomes}
            role="group"
            aria-label="Choose whether the total will be high, mid, or low"
          >
            {activeOutcomes.map((outcome) => {
              const isSelected = selectedOutcome === outcome.value;

              return (
                <button
                  className={`${styles.outcome} ${
                    isSelected ? styles.selectedOutcome : ''
                  }`}
                  type="button"
                  key={outcome.value}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedOutcome(outcome.value)}
                >
                  <span
                    className={`${styles.outcomeIndicator} ${outcome.indicatorClass}`}
                  >
                    <span className={styles.shapeLabel}>{outcome.label}</span>
                  </span>
                  <span className={styles.outcomeBoundary}>
                    {outcome.boundary}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <aside className={styles.oddsPanel} aria-labelledby="high-low-odds-heading">
        <h3 className={styles.oddsHeading} id="high-low-odds-heading">
          ODDS
        </h3>
        {marketsQuery.isError ? (
          <p className={styles.message} role="alert">
            Odds are unavailable right now.
          </p>
        ) : activeOutcomes.length === 0 ? (
          <p className={styles.message}>High Low odds are not available.</p>
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

function HighLowSkeleton() {
  return (
    <section
      className={`${styles.section} ${styles.loadingSection}`}
      aria-labelledby="high-low-loading-heading"
      aria-busy="true"
    >
      <span
        className={styles.screenReaderOnly}
        id="high-low-loading-heading"
        role="status"
      >
        Loading High Low game
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
                className={`${styles.skeletonBlock} ${styles.skeletonIndicator}`}
              />
              <span
                className={`${styles.skeletonBlock} ${styles.labelSkeleton}`}
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
                className={`${styles.skeletonBlock} ${styles.oddsLabelSkeleton}`}
              />
              <span
                className={`${styles.skeletonBlock} ${styles.oddsValueSkeleton}`}
              />
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}
