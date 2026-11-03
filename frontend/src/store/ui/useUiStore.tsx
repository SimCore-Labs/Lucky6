'use client';

import { createStore, useStore } from 'zustand';
import { createContext, useContext, useState, type ReactNode } from 'react';

export interface BetSelectionState {
  key: string;
  marketId: string;
  marketType: string;
  marketTitle: string;
  selectionId: string;
  selectionValue: string;
  selectionLabel: string;
  odds: number;
  oddsVersion: number;
  minStake: string;
  maxStake: string;
  stake: string;
  numbers?: number[];
  idempotencyKey?: string;
}

export type BetSelectionInput = Omit<
  BetSelectionState,
  'stake' | 'idempotencyKey'
>;

export interface UiState {
  selectedBets: BetSelectionState[];
  soundEnabled: boolean;
  walletModalOpen: boolean;
  walletProfile: { walletId: string; address: string; balance: string } | null;
  toast: { message: string; tone: 'success' | 'error' | 'info'; id: number } | null;
  selectBet: (bet: BetSelectionInput, allowMultiple?: boolean) => void;
  removeBet: (key: string) => void;
  updateBetQuote: (
    key: string,
    quote: Pick<
      BetSelectionState,
      'odds' | 'oddsVersion' | 'minStake' | 'maxStake'
    >,
  ) => void;
  clearBets: () => void;
  setBetStake: (key: string, stake: string) => void;
  setBetIdempotencyKey: (key: string, idempotencyKey: string) => void;
  toggleSound: () => void;
  setWalletModalOpen: (open: boolean) => void;
  setWalletProfile: (profile: UiState['walletProfile']) => void;
  showToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
  clearToast: () => void;
}

export type UiStoreApi = ReturnType<typeof createUiStore>;

export const createUiStore = () =>
  createStore<UiState>((set) => ({
    selectedBets: [],
    soundEnabled: true,
    walletModalOpen: false,
    walletProfile: null,
    toast: null,
    selectBet: (bet, allowMultiple = false) =>
      set((state) => {
        const existing = state.selectedBets.find(
          (selected) => selected.key === bet.key,
        );
        if (allowMultiple && existing) {
          return {
            selectedBets: state.selectedBets.filter(
              (selected) => selected.key !== bet.key,
            ),
          };
        }

        const sameWager =
          existing?.selectionId === bet.selectionId &&
          existing?.selectionValue === bet.selectionValue &&
          JSON.stringify(existing?.numbers) === JSON.stringify(bet.numbers) &&
          existing?.oddsVersion === bet.oddsVersion;
        const nextBet: BetSelectionState = {
          ...bet,
          stake: existing?.stake ?? '10',
          idempotencyKey: sameWager ? existing?.idempotencyKey : undefined,
        };
        if (allowMultiple) {
          return { selectedBets: [...state.selectedBets, nextBet] };
        }
        return { selectedBets: [nextBet] };
      }),
    removeBet: (key) =>
      set((state) => ({
        selectedBets: state.selectedBets.filter((bet) => bet.key !== key),
      })),
    updateBetQuote: (key, quote) =>
      set((state) => ({
        selectedBets: state.selectedBets.map((bet) =>
          bet.key === key
            ? { ...bet, ...quote, idempotencyKey: undefined }
            : bet,
        ),
      })),
    clearBets: () => set({ selectedBets: [] }),
    setBetStake: (key, stake) =>
      set((state) => ({
        selectedBets: state.selectedBets.map((bet) =>
          bet.key === key ? { ...bet, stake, idempotencyKey: undefined } : bet,
        ),
      })),
    setBetIdempotencyKey: (key, idempotencyKey) =>
      set((state) => ({
        selectedBets: state.selectedBets.map((bet) =>
          bet.key === key ? { ...bet, idempotencyKey } : bet,
        ),
      })),
    toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
    setWalletModalOpen: (open) => set({ walletModalOpen: open }),
    setWalletProfile: (walletProfile) => set({ walletProfile }),
    showToast: (message, tone = 'info') =>
      set({ toast: { message, tone, id: Date.now() } }),
    clearToast: () => set({ toast: null }),
  }));

const UiStoreContext = createContext<UiStoreApi | null>(null);

export function UiStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createUiStore());
  return (
    <UiStoreContext.Provider value={store}>
      {children}
    </UiStoreContext.Provider>
  );
}

export function useUiStore<T>(selector: (state: UiState) => T): T {
  const store = useContext(UiStoreContext);
  if (!store) {
    throw new Error('useUiStore must be used within UiStoreProvider');
  }
  return useStore(store, selector);
}
