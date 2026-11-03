import { createClient } from '@solana/kit';
import { walletWithoutSigner } from '@solana/kit-plugin-wallet';

export type SolanaNetwork = 'mainnet' | 'devnet';

export function createWalletClient(network: SolanaNetwork) {
  return createClient().use(
    walletWithoutSigner({
      chain: network === 'devnet' ? 'solana:devnet' : 'solana:mainnet',
      storage: null,
    }),
  );
}

export function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
