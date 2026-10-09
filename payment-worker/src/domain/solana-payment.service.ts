import { Injectable, Logger } from '@nestjs/common';
import { createSolanaRpc, signature as toSignature } from '@solana/kit';

export interface PaymentQuote {
  solPriceUsd: number;
  expectedLamports: bigint;
  creditsToIssue: bigint;
}

export interface VerificationResult {
  verified: boolean;
  status: 'VERIFIED' | 'FAILED' | 'UNDERPAID' | 'OVERPAID' | 'EXPIRED' | 'PENDING';
  actualLamports: bigint;
  signature: string;
  reason?: string;
}

@Injectable()
export class SolanaPaymentService {
  private readonly logger = new Logger(SolanaPaymentService.name);
  private readonly rpc: ReturnType<typeof createSolanaRpc>;

  constructor() {
    const rpcUrl = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
    this.rpc = createSolanaRpc(rpcUrl);
    this.logger.log(`Solana RPC initialized: ${rpcUrl}`);
  }

  private cachedSolPriceUsd: number | null = null;
  private cachedAt: number = 0;
  private priceFetchPromise: Promise<number> | null = null;
  private readonly PRICE_CACHE_TTL_MS = 60_000;
  private readonly MAX_PRICE_AGE_MS = 180_000;

  async fetchSolPriceUsd(): Promise<number> {
    const now = Date.now();
    if (this.cachedSolPriceUsd && now - this.cachedAt < this.PRICE_CACHE_TTL_MS) {
      return this.cachedSolPriceUsd;
    }
    if (this.priceFetchPromise) {
      return this.priceFetchPromise;
    }

    this.priceFetchPromise = (async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_last_updated_at=true', {
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);
        const data = await response.json();
        const price = data?.solana?.usd;
        const updatedAt = data?.solana?.last_updated_at;
        
        if (typeof price !== 'number' || price <= 0 || !updatedAt) {
          throw new Error('Invalid CoinGecko SOL/USD response');
        }

        const observedAt = updatedAt * 1000;
        if (now - observedAt > this.MAX_PRICE_AGE_MS) {
          throw new Error('CoinGecko returned a stale SOL/USD quote');
        }

        this.cachedSolPriceUsd = price;
        this.cachedAt = now;
        this.logger.log(`Fetched live SOL price: $${price}`);
        return price;
      } catch (err) {
        this.logger.error(`Failed to fetch live SOL price: ${err}`);
        if (this.cachedSolPriceUsd) {
          this.logger.warn(`Falling back to cached SOL price: $${this.cachedSolPriceUsd}`);
          return this.cachedSolPriceUsd;
        }
        this.logger.warn('Falling back to static default SOL price: $150.0');
        return 150.0;
      } finally {
        this.priceFetchPromise = null;
      }
    })();

    return this.priceFetchPromise;
  }

  /**
   * Quote how many lamports a credit package costs given a live SOL price.
   */
  async quotePaymentPackage(
    creditPackageAmount: number,
  ): Promise<PaymentQuote> {
    const solPriceUsd = await this.fetchSolPriceUsd();
    // 1 SIM Credit = $0.01 USD
    const usdCost = creditPackageAmount * 0.01;
    const solRequired = usdCost / solPriceUsd;
    const lamportsRequired = BigInt(Math.round(solRequired * 1_000_000_000));

    return {
      solPriceUsd,
      expectedLamports: lamportsRequired,
      creditsToIssue: BigInt(creditPackageAmount),
    };
  }

  /**
   * Verifies a Solana on-chain transaction and checks:
   *  - The transaction is finalized
   *  - The treasury wallet received SOL (via postBalance - preBalance on the recipient account)
   *  - The amount received matches (or exceeds) the expected lamports
   *
   * Uses the official @solana/kit v2 RPC pattern: rpc.getTransaction(sig).send()
   */
  async verifyTransactionSignature(
    txSignature: string,
    expectedRecipient: string,
    expectedLamports: bigint,
  ): Promise<VerificationResult> {
    this.logger.log(`Verifying on-chain tx: ${txSignature}`);

    if (!txSignature || txSignature.length < 32) {
      return {
        verified: false,
        status: 'FAILED',
        actualLamports: 0n,
        signature: txSignature,
        reason: 'Invalid transaction signature format',
      };
    }

    try {
      // @solana/kit v2 pattern: cast signature to the branded type, then .send()
      const sig = toSignature(txSignature);

      const tx = await this.rpc.getTransaction(sig, {
        encoding: 'jsonParsed',
        maxSupportedTransactionVersion: 0,
        commitment: 'finalized',
      }).send();

      if (!tx) {
        return {
          verified: false,
          status: 'PENDING',
          actualLamports: 0n,
          signature: txSignature,
          reason: 'Transaction not found — may still be pending finalization',
        };
      }

      if (tx.meta?.err) {
        return {
          verified: false,
          status: 'FAILED',
          actualLamports: 0n,
          signature: txSignature,
          reason: `Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`,
        };
      }

      // Extract account keys from the parsed message
      const accountKeys: string[] =
        (tx.transaction?.message as any)?.accountKeys?.map(
          (k: any) => (typeof k === 'string' ? k : k?.pubkey ?? ''),
        ) ?? [];

      const recipientIndex = accountKeys.findIndex(
        (k) => k === expectedRecipient,
      );

      if (recipientIndex === -1) {
        return {
          verified: false,
          status: 'FAILED',
          actualLamports: 0n,
          signature: txSignature,
          reason: `Treasury wallet ${expectedRecipient} not found in transaction accounts`,
        };
      }

      // Calculate actual lamports received: postBalance - preBalance for the recipient account
      const preBalance = BigInt(tx.meta?.preBalances?.[recipientIndex] ?? 0);
      const postBalance = BigInt(tx.meta?.postBalances?.[recipientIndex] ?? 0);
      const actualLamports = postBalance - preBalance;

      this.logger.log(
        `Recipient balance change: ${preBalance} → ${postBalance} (${actualLamports} lamports)`,
      );

      if (actualLamports <= 0n) {
        return {
          verified: false,
          status: 'FAILED',
          actualLamports,
          signature: txSignature,
          reason: 'No SOL received by the treasury wallet in this transaction',
        };
      }

      if (actualLamports < expectedLamports) {
        return {
          verified: false,
          status: 'UNDERPAID',
          actualLamports,
          signature: txSignature,
          reason: `Underpaid: expected ${expectedLamports} lamports, received ${actualLamports}`,
        };
      }

      // Accept exact amount or overpayment (credits issued for exact amount only)
      return {
        verified: true,
        status: actualLamports > expectedLamports ? 'OVERPAID' : 'VERIFIED',
        actualLamports,
        signature: txSignature,
      };
    } catch (err) {
      this.logger.error(`Error verifying transaction: ${String(err)}`);
      return {
        verified: false,
        status: 'FAILED',
        actualLamports: 0n,
        signature: txSignature,
        reason: String(err),
      };
    }
  }
}
