'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMarkets } from '@/lib/api';
import styles from './lucky6.module.css';

export function Lucky6() {
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const marketsQuery = useQuery({
    queryKey: ['markets'],
    queryFn: ({ signal }) => getMarkets(signal),
  });
  const pickSixMarket = marketsQuery.data?.find(
    (market) => market.type === 'PICK_SIX',
  );
  const payoutTiers = selectedNumbers.includes(49)
    ? pickSixMarket?.payoutTiers?.includes49
    : pickSixMarket?.payoutTiers?.excludes49;

  function toggleNumber(number: number) {
    setSelectedNumbers((current) => {
      if (current.includes(number)) {
        return current.filter((selected) => selected !== number);
      }
      if (current.length === 6) return current;
      return [...current, number];
    });
  }

  if (marketsQuery.isPending) {
    return <Lucky6Skeleton />;
  }

  function selectLuckyDip() {
    const numbers = Array.from({ length: 49 }, (_, index) => index + 1);
    for (let index = numbers.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [numbers[index], numbers[swapIndex]] = [
        numbers[swapIndex],
        numbers[index],
      ];
    }
    setSelectedNumbers(numbers.slice(0, 6).sort((first, second) => first - second));
  }

  return (
    <section className={styles.section} aria-labelledby="lucky6-heading">
      <div className={styles.gamePanel}>
        <h2 className={styles.label} id="lucky6-heading">
          LUCKY SIX
        </h2>
        <p className={styles.instructions}>
          Choose 6 numbers. Match 3 or more to win.
        </p>
        <div
          className={styles.numberGrid}
          role="group"
          aria-label="Choose six numbers from 1 to 49"
        >
          {Array.from({ length: 49 }, (_, index) => {
            const number = index + 1;
            const color =
              number === 49
                ? styles.blackBall
                : [styles.redBall, styles.blueBall, styles.greenBall][
                    (number - 1) % 3
                  ];
            const isSelected = selectedNumbers.includes(number);

            return (
              <button
                className={`${styles.ball} ${color} ${
                  isSelected ? styles.selectedBall : ''
                }`}
                type="button"
                key={number}
                aria-label={`Select number ${number}`}
                aria-pressed={isSelected}
                disabled={selectedNumbers.length === 6 && !isSelected}
                onClick={() => toggleNumber(number)}
              >
                {number}
              </button>
            );
          })}
        </div>
      </div>
      <aside className={styles.oddsPanel} aria-labelledby="lucky6-odds-heading">
        <h3 className={styles.oddsHeading} id="lucky6-odds-heading">
          ODDS
        </h3>
        {marketsQuery.isError ? (
          <p className={styles.oddsMessage} role="alert">
            Odds are unavailable right now.
          </p>
        ) : !pickSixMarket?.payoutTiers ? (
          <p className={styles.oddsMessage}>
            Lucky Six is not currently available.
          </p>
        ) : (
          <dl className={styles.oddsList}>
            {[3, 4, 5, 6].map((matches) => (
              <div className={styles.oddsRow} key={matches}>
                <dt>{matches} Balls</dt>
                <dd>{payoutTiers?.[matches] ?? '—'}×</dd>
              </div>
            ))}
          </dl>
        )}
      </aside>
      <div className={styles.selectedBallsBox} aria-label="Selected balls">
        {selectedNumbers.map((number) => {
          const color =
            number === 49
              ? styles.blackBall
              : [styles.redBall, styles.blueBall, styles.greenBall][
                  (number - 1) % 3
                ];

          return (
            <span className={`${styles.ball} ${color}`} key={number}>
              {number}
            </span>
          );
        })}
      </div>
      <div className={styles.selectionActions}>
        <button
          className={styles.luckyDipButton}
          type="button"
          onClick={selectLuckyDip}
        >
          Lucky Dip
        </button>
        <button
          className={styles.clearButton}
          type="button"
          disabled={selectedNumbers.length === 0}
          onClick={() => setSelectedNumbers([])}
        >
          Clear Selection
        </button>
      </div>
    </section>
  );
}

function Lucky6Skeleton() {
  return (
    <section
      className={`${styles.section} ${styles.loadingSection}`}
      aria-label="Lucky Six game loading"
      aria-busy="true"
    >
      <span className={styles.screenReaderOnly} role="status">
        Loading Lucky Six game
      </span>
      <div className={styles.gamePanel} aria-hidden="true">
        <span className={`${styles.skeletonBlock} ${styles.headingSkeleton}`} />
        <span className={`${styles.skeletonBlock} ${styles.instructionsSkeleton}`} />
        <div className={styles.numberGrid}>
          {Array.from({ length: 49 }, (_, index) => (
            <span
              className={`${styles.ball} ${styles.skeletonBall}`}
              key={index}
            />
          ))}
        </div>
      </div>
      <aside className={styles.oddsPanel} aria-hidden="true">
        <span className={`${styles.skeletonBlock} ${styles.oddsHeadingSkeleton}`} />
        <div className={styles.oddsList}>
          {Array.from({ length: 4 }, (_, index) => (
            <div className={styles.oddsRowSkeleton} key={index}>
              <span className={`${styles.skeletonBlock} ${styles.oddsLabelSkeleton}`} />
              <span className={`${styles.skeletonBlock} ${styles.oddsValueSkeleton}`} />
            </div>
          ))}
        </div>
      </aside>
      <div className={styles.selectedBallsBox} aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <span className={`${styles.ball} ${styles.selectedBallSkeleton}`} key={index} />
        ))}
      </div>
      <div className={styles.selectionActions} aria-hidden="true">
        <span className={`${styles.skeletonBlock} ${styles.buttonSkeleton}`} />
        <span className={`${styles.skeletonBlock} ${styles.buttonSkeleton}`} />
      </div>
    </section>
  );
}
