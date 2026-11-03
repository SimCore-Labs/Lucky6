'use client';

import HomeOutlined from '@mui/icons-material/HomeOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import WalletOutlined from '@mui/icons-material/WalletOutlined';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useRef, useState } from 'react';
import { BettingHeader } from './BettingHeader';
import Image from 'next/image';
import { BettingInitiator } from './BettingInitiator';
import { Bet6 } from './Bet6';
import { HighLow } from './HighLow';
import { LatestDrawSection } from './LatestDrawSection';
import { Lucky6 } from './Lucky6';
import { OddEven } from './OddEven';
import { Rainbow } from './Rainbow';
import { TotalColor } from './TotalColor';
import { BettingHub } from './BettingHub';
import {
  ApiError,
  getMyBets,
  getWalletMe,
  getWalletTransactions,
  walletMeQueryKey,
} from '@/lib/api';
import { useUiStore } from '@/store/ui/useUiStore';
import styles from './page.module.css';

const games = [
  { id: 'lucky-six', label: 'Lucky Six', image: '/6ix.png' },
  { id: 'bet-zero', label: 'Bet Zero', image: '/zero.png' },
  { id: 'rainbow', label: 'Rainbow', image: '/rainbow.png' },
  { id: 'high-low', label: 'High Low', image: '/high-low.png' },
  { id: 'odd-even', label: 'Odd Even', image: '/odd-even.png' },
  { id: 'total-color', label: 'Total Color', image: '/total.png' },
] as const;

type GameId = (typeof games)[number]['id'];
type PageSection = 'play' | 'bets' | 'profile';

gsap.registerPlugin(useGSAP);

export default function BettingPage() {
  const [selectedGame, setSelectedGame] = useState<GameId | null>(null);
  const [section, setSection] = useState<PageSection>('play');
  const contentRef = useRef<HTMLElement>(null);
  const selectedBets = useUiStore((state) => state.selectedBets);
  const clearBets = useUiStore((state) => state.clearBets);

  const walletQuery = useQuery({
    queryKey: walletMeQueryKey,
    queryFn: async ({ signal }) => {
      try {
        return await getWalletMe(signal);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 30_000,
  });
  const betsQuery = useQuery({
    queryKey: ['bets'],
    queryFn: ({ signal }) => getMyBets(signal, 50),
    enabled: Boolean(walletQuery.data),
    staleTime: 15_000,
  });
  const transactionsQuery = useInfiniteQuery({
    queryKey: ['wallet', walletQuery.data?.walletId, 'transactions'],
    queryFn: ({ signal, pageParam }) =>
      getWalletTransactions({ signal, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: section === 'profile' && Boolean(walletQuery.data),
  });

  useGSAP(
    () => {
      if (!contentRef.current) return;
      const reducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      gsap.fromTo(
        contentRef.current,
        { autoAlpha: 0, y: 8 },
        {
          autoAlpha: 1,
          y: 0,
          duration: reducedMotion ? 0 : 0.18,
          ease: 'power2.out',
        },
      );
    },
    { dependencies: [section], scope: contentRef, revertOnUpdate: true },
  );

  const activeBetCount =
    betsQuery.data?.filter((bet) => bet.status === 'ACCEPTED').length ?? 0;
  const navItems = [
    { id: 'play', label: 'Play', Icon: HomeOutlined },
    { id: 'bets', label: 'Bets', Icon: ReceiptLongOutlined },
    { id: 'profile', label: 'Profile', Icon: WalletOutlined },
  ] as const;

  function navigateTo(nextSection: PageSection) {
    setSection(nextSection);
  }

  return (
    <div className={styles.page}>
      <BettingHeader />
      <nav className={`${styles.navigation} ${styles.desktopNavigation}`} aria-label="Main navigation">
        {navItems.map(({ id, label, Icon }) => (
          <button
            className={`${styles.navigationItem} ${
              section === id ? styles.navigationItemSelected : ''
            }`}
            type="button"
            key={id}
            aria-current={section === id ? 'page' : undefined}
            onClick={() => navigateTo(id)}
          >
            <Icon className={styles.navigationIcon} fontSize="small" />
            <span>{label}</span>
            {id === 'bets' && activeBetCount > 0 && (
              <span className={styles.navigationBadge}>{activeBetCount}</span>
            )}
          </button>
        ))}
      </nav>
      <main
        className={styles.content}
        aria-label={`${section === 'play' ? 'Betting' : section === 'bets' ? 'Bets' : 'Profile'} page`}
        ref={contentRef}
      >
        {section === 'play' ? (
          <>
            <LatestDrawSection />
            {selectedBets.length > 0 && (
              <button
                className={styles.slipIndicator}
                type="button"
                onClick={() => navigateTo('bets')}
                aria-label={`View bet slip with ${selectedBets.length} ${
                  selectedBets.length === 1 ? 'selection' : 'selections'
                }`}
              >
                <span>
                  Bet slip
                  <strong>
                    {selectedBets.length}{' '}
                    {selectedBets.length === 1 ? 'selection' : 'selections'}
                  </strong>
                </span>
                <span className={styles.slipIndicatorAction}>View slip</span>
              </button>
            )}
            <nav className={styles.sectionSlot} aria-label="Choose a game">
              <div className={styles.sectionLogos}>
                {games.map((game) => {
                  const isSelected = selectedGame === game.id;
                  return (
                    <button
                      className={`${styles.gameLogo} ${
                        isSelected ? styles.selectedGame : ''
                      }`}
                      type="button"
                      key={game.id}
                      aria-pressed={isSelected}
                      onClick={() => {
                        if (selectedGame !== game.id) clearBets();
                        setSelectedGame(game.id);
                      }}
                    >
                      <Image
                        className={styles.sectionLogo}
                        src={game.image}
                        alt=""
                        width={64}
                        height={64}
                      />
                      <span>{game.label}</span>
                    </button>
                  );
                })}
              </div>
            </nav>
            {selectedGame === null ? (
              <section className={styles.emptyStage} aria-live="polite">
                <span className={styles.emptyBall} aria-hidden="true">
                  49
                </span>
                <h1>Select one of the games to begin playing</h1>
              </section>
            ) : (
              <div className={styles.gameStage} aria-live="polite">
                {selectedGame === 'lucky-six' && <Lucky6 />}
                {selectedGame === 'bet-zero' && <Bet6 />}
                {selectedGame === 'rainbow' && <Rainbow />}
                {selectedGame === 'high-low' && <HighLow />}
                {selectedGame === 'odd-even' && <OddEven />}
                {selectedGame === 'total-color' && <TotalColor />}
              </div>
            )}
            <BettingInitiator />
          </>
        ) : (
          <BettingHub
            key={section}
            section={section}
            wallet={walletQuery.data}
            walletLoading={walletQuery.isPending}
            walletError={walletQuery.error}
            bets={betsQuery.data ?? []}
            betsLoading={betsQuery.isPending}
            betsError={betsQuery.error}
            transactions={
              transactionsQuery.data?.pages.flatMap((page) => page.entries) ?? []
            }
            transactionsLoading={transactionsQuery.isPending}
            transactionsError={
              transactionsQuery.isError && !transactionsQuery.data
                ? transactionsQuery.error
                : null
            }
            transactionsHasMore={transactionsQuery.hasNextPage}
            transactionsLoadingMore={transactionsQuery.isFetchingNextPage}
            transactionsMoreError={
              transactionsQuery.isFetchNextPageError
                ? transactionsQuery.error
                : null
            }
            onLoadMoreTransactions={() => void transactionsQuery.fetchNextPage()}
            onPlay={() => navigateTo('play')}
          />
        )}
      </main>
      <nav className={`${styles.navigation} ${styles.mobileNavigation}`} aria-label="Main navigation">
        {navItems.map(({ id, label, Icon }) => (
          <button
            className={`${styles.navigationItem} ${
              section === id ? styles.navigationItemSelected : ''
            }`}
            type="button"
            key={id}
            aria-current={section === id ? 'page' : undefined}
            onClick={() => navigateTo(id)}
          >
            <span className={styles.navigationIconWrap}>
              <Icon className={styles.navigationIcon} fontSize="small" />
              {id === 'bets' && activeBetCount > 0 && (
                <span className={styles.navigationBadge}>{activeBetCount}</span>
              )}
            </span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
