'use client';

import { useQuery } from '@tanstack/react-query';
import { getMarkets } from '@/lib/api';
import { useUiStore } from '@/store/ui/useUiStore';
import styles from './lucky6.module.css';

const EMPTY_NUMBERS: number[] = [];

export function Lucky6({
  heading = 'LUCKY SIX',
  instructions = 'Choose 1 to 6 numbers. Every selected number must appear.',
  idPrefix = 'lucky6',
  marketType = 'PICK_NUMBERS_APPEAR',
}: {
  heading?: string;
  instructions?: string;
  idPrefix?: string;
  marketType?: 'PICK_NUMBERS_APPEAR' | 'PICK_NUMBERS_ABSENT';
}) {
  const selectedBet = useUiStore((state) =>
    state.selectedBets.find((bet) => bet.key === marketType),
  );
  const selectedNumbers = selectedBet?.numbers ?? EMPTY_NUMBERS;
  const selectBet = useUiStore((state) => state.selectBet);
  const removeBet = useUiStore((state) => state.removeBet);
  const marketsQuery = useQuery({
    queryKey: ['markets'],
    queryFn: ({ signal }) => getMarkets(signal),
  });
  const pickMarket = marketsQuery.data?.find(
    (market) => market.type === marketType,
  );
  const pickSelection = pickMarket?.selections.find(
    (selection) =>
      selection.value ===
      `${selectedNumbers.length}:${selectedNumbers.includes(49) ? '1' : '0'}`,
  );
  const maxStake = Number(pickSelection?.maxStake ?? pickMarket?.maxStake ?? 50);
  const pickOdds = Array.from({ length: 6 }, (_, index) => {
    const count = index + 1;
    return {
      count,
      without49: pickMarket?.selections.find(
        (selection) => selection.value === `${count}:0`,
      ),
      with49: pickMarket?.selections.find(
        (selection) => selection.value === `${count}:1`,
      ),
    };
  });

  function toggleNumber(number: number) {
    const next = selectedNumbers.includes(number)
    ? selectedNumbers.filter((selected) => selected !== number)
    : selectedNumbers.length === 6
      ? selectedNumbers
      : [...selectedNumbers, number].sort((first, second) => first - second);
    updateBet(next);
  }

  function updateBet(numbers: number[]) {
    if (numbers.length === 0) {
      removeBet(marketType);
      return;
    }
    const selection = pickMarket?.selections.find(
      (item) =>
        item.value === `${numbers.length}:${numbers.includes(49) ? '1' : '0'}`,
    );
    if (!pickMarket || !selection) {
      removeBet(marketType);
      return;
    }
    selectBet({
      key: marketType,
      marketId: pickMarket.id,
      marketType,
      marketTitle: pickMarket.title,
      selectionId: selection.id,
      selectionValue: selection.value,
      selectionLabel: `${numbers.length} number${numbers.length === 1 ? '' : 's'} ${
        marketType === 'PICK_NUMBERS_APPEAR' ? 'to appear' : 'not to appear'
      }${numbers.includes(49) ? ', including 49' : ''}`,
      odds: selection.currentOdds,
      oddsVersion: selection.oddsVersion,
      maxStake: selection.maxStake ?? pickMarket.maxStake ?? '50',
      numbers,
    });
  }

  if (marketsQuery.isPending) {
    return <Lucky6Skeleton heading={heading} idPrefix={idPrefix} />;
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
    const selection = numbers.slice(0, 6).sort((first, second) => first - second);
    updateBet(selection);
  }

  return (
    <section
      className={styles.section}
      aria-labelledby={`${idPrefix}-heading`}
    >
      <div className={styles.gamePanel}>
        <h2 className={styles.label} id={`${idPrefix}-heading`}>
          {heading}
        </h2>
        <p className={styles.instructions}>
          {instructions}
        </p>
        <div
          className={styles.numberGrid}
          role="group"
          aria-label="Choose one to six numbers from 1 to 49"
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
      <aside
        className={styles.oddsPanel}
        aria-labelledby={`${idPrefix}-odds-heading`}
      >
        <h3 className={styles.oddsHeading} id={`${idPrefix}-odds-heading`}>
          ODDS
        </h3>
        {marketsQuery.isError ? (
          <p className={styles.oddsMessage} role="alert">
            Odds are unavailable right now.
          </p>
        ) : !pickMarket ? (
          <p className={styles.oddsMessage}>
            {heading} is not currently available.
          </p>
        ) : (
          <>
            <table className={styles.pickOddsTable}>
              <thead>
                <tr>
                  <th scope="col">Picks</th>
                  <th scope="col">Without 49</th>
                  <th scope="col">With 49</th>
                </tr>
              </thead>
              <tbody>
                {pickOdds.map(({ count, without49, with49 }) => (
                  <tr key={count}>
                    <th scope="row">{count}</th>
                    {[without49, with49].map((selection, index) => {
                      const includes49 = index === 1;
                      const isSelected =
                        selectedNumbers.length === count &&
                        selectedNumbers.includes(49) === includes49;
                      const isUnavailable =
                        !selection || Number(selection.maxStake ?? pickMarket.maxStake ?? 50) < 1;

                      return (
                        <td
                          className={
                            isSelected ? styles.selectedPickOdds : undefined
                          }
                          key={includes49 ? 'with49' : 'without49'}
                        >
                          {isUnavailable ? '—' : `${selection.currentOdds}×`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {selectedNumbers.length > 0 && maxStake >= 1 && (
              <p className={styles.oddsMessage}>
                Max stake {maxStake} credits.
              </p>
            )}
          </>
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
          onClick={() => {
            removeBet(marketType);
          }}
        >
          Clear Selection
        </button>
      </div>
    </section>
  );
}

function Lucky6Skeleton({
  heading,
  idPrefix,
}: {
  heading: string;
  idPrefix: string;
}) {
  return (
    <section
      className={`${styles.section} ${styles.loadingSection}`}
      aria-labelledby={`${idPrefix}-loading-heading`}
      aria-busy="true"
    >
      <span
        className={styles.screenReaderOnly}
        id={`${idPrefix}-loading-heading`}
        role="status"
      >
        Loading {heading} game
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
