'use client';

import { useQuery } from '@tanstack/react-query';
import { getMarkets } from '@/lib/api';
import { useUiStore } from '@/store/ui/useUiStore';
import styles from './rainbow.module.css';

const colors = [
  { value: 'BLUE', label: 'Blue', ballClass: styles.blueBall },
  { value: 'RED', label: 'Red', ballClass: styles.redBall },
  { value: 'GREEN', label: 'Green', ballClass: styles.greenBall },
] as const;
const counts = [0, 2, 3, 4, 5, 6] as const;

export function Rainbow() {
  const selectedBets = useUiStore((state) => state.selectedBets);
  const selectedOutcomes = selectedBets
    .filter((bet) => bet.marketType === 'COLOR_COUNT')
    .map((bet) => bet.selectionValue);
  const selectBet = useUiStore((state) => state.selectBet);
  const marketsQuery = useQuery({
    queryKey: ['markets'],
    queryFn: ({ signal }) => getMarkets(signal),
  });
  const colorCountMarket = marketsQuery.data?.find(
    (market) => market.type === 'COLOR_COUNT',
  );
  const selections = colorCountMarket?.selections ?? [];
  const selectionByValue = new Map(
    selections.map((selection) => [selection.value, selection]),
  );

  if (marketsQuery.isPending) {
    return <RainbowSkeleton />;
  }

  return (
    <section className={styles.section} aria-labelledby="rainbow-heading">
      <div className={styles.gamePanel}>
        <h2 className={styles.heading} id="rainbow-heading">
          RAINBOW
        </h2>
        <p className={styles.instructions}>
          Predict how many colors will be in the draw.
        </p>
        {marketsQuery.isError ? (
          <p className={styles.message} role="alert">
            Rainbow selections are unavailable right now.
          </p>
        ) : !counts.some((count) =>
            colors.some((color) =>
              selectionByValue.has(`${color.value}:${count}`),
            ),
          ) ? (
          <p className={styles.message}>
            Rainbow is not currently available.
          </p>
        ) : (
          <div
            className={styles.selectionGrid}
            role="group"
            aria-label="Choose a color and exact ball count"
          >
            {colors.map((color) => (
              <div
                className={styles.colorRow}
                key={color.value}
                role="group"
                aria-label={`${color.label} exact ball count choices`}
              >
                {counts.map((count) => {
                  const selection = selectionByValue.get(
                    `${color.value}:${count}`,
                  );
                  if (!selection) {
                    return (
                      <span
                        className={styles.unavailableCell}
                        key={count}
                        aria-hidden="true"
                      />
                    );
                  }
                  const isSelected = selectedOutcomes.includes(selection.value);

                  return (
                    <button
                      className={`${styles.ball} ${color.ballClass} ${
                        isSelected ? styles.selectedBall : ''
                      }`}
                      type="button"
                      key={selection.id}
                      aria-label={`Select exactly ${count} ${color.label.toLowerCase()} balls`}
                      aria-pressed={isSelected}
                      onClick={() => {
                        if (!colorCountMarket) return;
                        selectBet(
                          {
                            key: selection.id,
                            marketId: colorCountMarket.id,
                            marketType: colorCountMarket.type,
                            marketTitle: colorCountMarket.title,
                            selectionId: selection.id,
                            selectionValue: selection.value,
                            selectionLabel: selection.label,
                            odds: selection.currentOdds,
                            oddsVersion: selection.oddsVersion,
                            maxStake:
                              selection.maxStake ??
                              colorCountMarket.maxStake ??
                              '50',
                          },
                          true,
                        );
                      }}
                    >
                      {count}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
      <aside className={styles.oddsPanel} aria-labelledby="rainbow-odds-heading">
        <h3 className={styles.oddsHeading} id="rainbow-odds-heading">
          ODDS
        </h3>
        {marketsQuery.isError ? (
          <p className={styles.message} role="alert">
            Odds are unavailable right now.
          </p>
        ) : !counts.some((count) =>
            colors.some((color) =>
              selectionByValue.has(`${color.value}:${count}`),
            ),
          ) ? (
          <p className={styles.message}>Rainbow odds are not available.</p>
        ) : (
          <div className={styles.oddsTableScroll}>
            <table className={styles.oddsTable}>
              <caption className={styles.screenReaderOnly}>
                Active exact color count odds
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className={styles.screenReaderOnly}>Color</span>
                  </th>
                  {counts.map((count) => (
                    <th scope="col" key={count}>
                      {count}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {colors.map((color) => (
                  <tr key={color.value}>
                    <th scope="row" aria-label={`${color.label} odds`}>
                      <span
                        className={`${styles.colorBall} ${color.ballClass}`}
                        aria-hidden="true"
                      />
                    </th>
                    {counts.map((count) => {
                      const selection = selectionByValue.get(
                        `${color.value}:${count}`,
                      );
                      return (
                        <td
                          className={
                            selection !== undefined &&
                            selectedOutcomes.includes(selection.value)
                              ? styles.selectedOdds
                              : undefined
                          }
                          key={count}
                        >
                          {selection ? `${selection.currentOdds}×` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </aside>
    </section>
  );
}

function RainbowSkeleton() {
  return (
    <section
      className={`${styles.section} ${styles.loadingSection}`}
      aria-labelledby="rainbow-loading-heading"
      aria-busy="true"
    >
      <span
        className={styles.screenReaderOnly}
        id="rainbow-loading-heading"
        role="status"
      >
        Loading Rainbow game
      </span>
      <div className={styles.gamePanel} aria-hidden="true">
        <span className={`${styles.skeletonBlock} ${styles.headingSkeleton}`} />
        <span
          className={`${styles.skeletonBlock} ${styles.instructionsSkeleton}`}
        />
        <div className={styles.skeletonGrid}>
          {Array.from({ length: 21 }, (_, index) => (
            <span
              className={`${styles.skeletonBlock} ${styles.skeletonBall}`}
              key={index}
            />
          ))}
        </div>
      </div>
      <aside className={styles.oddsPanel} aria-hidden="true">
        <span
          className={`${styles.skeletonBlock} ${styles.oddsHeadingSkeleton}`}
        />
        <div className={styles.skeletonOddsTable}>
          {Array.from({ length: 24 }, (_, index) => (
            <span
              className={`${styles.skeletonBlock} ${styles.skeletonOddsCell}`}
              key={index}
            />
          ))}
        </div>
      </aside>
    </section>
  );
}
