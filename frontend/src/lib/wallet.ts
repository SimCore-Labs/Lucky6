import { createClient } from '@solana/kit';
import { walletWithoutSigner } from '@solana/kit-plugin-wallet';

export const walletClient = createClient().use(
  walletWithoutSigner({ chain: 'solana:mainnet' }),
);

export function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
