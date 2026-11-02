'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMarkets } from '@/lib/api';
import styles from './total-color.module.css';

const outcomes = [
  {
    value: 'BLUE',
    label: 'Blue',
    ballClass: styles.blueBall,
  },
  {
    value: 'GREEN',
    label: 'Green',
    ballClass: styles.greenBall,
  },
  {
    value: 'RED',
    label: 'Red',
    ballClass: styles.redBall,
  },
  {
    value: 'NO_MAJORITY',
    label: 'No winning color',
    ballClass: styles.blackBall,
  },
] as const;

export function TotalColor() {
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const marketsQuery = useQuery({
    queryKey: ['markets'],
    queryFn: ({ signal }) => getMarkets(signal),
  });
  const market = marketsQuery.data?.find(
    (item) => item.type === 'COLOR_MAJORITY',
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
    return <TotalColorSkeleton />;
  }

  return (
    <section className={styles.section} aria-labelledby="total-color-heading">
      <div className={styles.gamePanel}>
        <h2 className={styles.heading} id="total-color-heading">
          TOTAL COLOR
        </h2>
        <p className={styles.instructions}>
          Predict which color will appear most in the draw.
        </p>
        {marketsQuery.isError ? (
          <p className={styles.message} role="alert">
            Total Color selections are unavailable right now.
          </p>
        ) : activeOutcomes.length === 0 ? (
          <p className={styles.message}>
            Total Color is not currently available.
          </p>
        ) : (
          <div
            className={styles.outcomes}
            role="group"
            aria-label="Choose the color that will appear most"
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
                    className={`${styles.ball} ${outcome.ballClass}`}
                    aria-hidden="true"
                  />
                  <span className={styles.outcomeLabel}>{outcome.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <aside
        className={styles.oddsPanel}
        aria-labelledby="total-color-odds-heading"
      >
        <h3 className={styles.oddsHeading} id="total-color-odds-heading">
          ODDS
        </h3>
        {marketsQuery.isError ? (
          <p className={styles.message} role="alert">
            Odds are unavailable right now.
          </p>
        ) : activeOutcomes.length === 0 ? (
          <p className={styles.message}>Total Color odds are not available.</p>
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
                  <dt>
                    <span
                      className={`${styles.oddsBall} ${outcome.ballClass}`}
                      aria-hidden="true"
                    />
                    <span>{outcome.label}</span>
                  </dt>
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

function TotalColorSkeleton() {
  return (
    <section
      className={`${styles.section} ${styles.loadingSection}`}
      aria-labelledby="total-color-loading-heading"
      aria-busy="true"
    >
      <span
        className={styles.screenReaderOnly}
        id="total-color-loading-heading"
        role="status"
      >
        Loading Total Color game
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
                className={`${styles.skeletonBlock} ${styles.skeletonBall}`}
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
              <span className={styles.skeletonOddsLabel}>
                <span
                  className={`${styles.skeletonBlock} ${styles.oddsBallSkeleton}`}
                />
                <span
                  className={`${styles.skeletonBlock} ${styles.labelSkeleton}`}
                />
              </span>
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
