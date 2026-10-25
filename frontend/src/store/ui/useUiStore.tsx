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
  walletProfile: { walletId: string; address: string; balance: string } | null;
  toast: { message: string; tone: 'success' | 'error' | 'info'; id: number } | null;
  selectBet: (bet: BetSelectionState) => void;
  clearBet: () => void;
  setStakeInput: (stake: string) => void;
  toggleSound: () => void;
  setWalletModalOpen: (open: boolean) => void;
  setWalletProfile: (profile: UiState['walletProfile']) => void;
  showToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
  clearToast: () => void;
}

export type UiStoreApi = ReturnType<typeof createUiStore>;

export const createUiStore = () =>
  createStore<UiState>((set) => ({
    selectedBet: null,
    stakeInput: '10',
    soundEnabled: true,
    walletModalOpen: false,
    walletProfile: null,
    toast: null,
    selectBet: (bet) => set({ selectedBet: bet }),
    clearBet: () => set({ selectedBet: null }),
    setStakeInput: (stake) => set({ stakeInput: stake }),
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
