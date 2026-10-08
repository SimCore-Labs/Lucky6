'use client';

import { createStore, useStore } from 'zustand';
import { createContext, useContext, useState, type ReactNode } from 'react';

export interface BetSelectionState {
  marketId: string;
  marketTitle: string;
  selectionId: string;
  selectionValue: string;
  selectionLabel: string;
  odds: number;
  oddsVersion: number;
}

export interface UiState {
  selectedBet: BetSelectionState | null;
  stakeInput: string;
  soundEnabled: boolean;
  walletModalOpen: boolean;
  selectBet: (bet: BetSelectionState) => void;
  clearBet: () => void;
  setStakeInput: (stake: string) => void;
  toggleSound: () => void;
  setWalletModalOpen: (open: boolean) => void;
}

export type UiStoreApi = ReturnType<typeof createUiStore>;

export const createUiStore = () =>
  createStore<UiState>((set) => ({
    selectedBet: null,
    stakeInput: '10',
    soundEnabled: true,
    walletModalOpen: false,
    selectBet: (bet) => set({ selectedBet: bet }),
    clearBet: () => set({ selectedBet: null }),
    setStakeInput: (stake) => set({ stakeInput: stake }),
    toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
    setWalletModalOpen: (open) => set({ walletModalOpen: open }),
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
