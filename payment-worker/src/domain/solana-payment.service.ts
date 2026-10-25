import { Injectable, Logger } from '@nestjs/common';
import {
  address,
  createSolanaRpc,
  signature as toSignature,
} from '@solana/kit';

export interface PaymentQuote {
  solPriceUsd: number;
  expectedLamports: bigint;
  creditsToIssue: bigint;
}

export interface VerificationResult {
  verified: boolean;
  status:
    | 'VERIFIED'
    | 'FAILED'
    | 'UNDERPAID'
    | 'OVERPAID'
    | 'EXPIRED'
    | 'PENDING'
    | 'REQUIRES_REVIEW';
  actualLamports: bigint;
  signature: string;
  reason?: string;
}

const PAYMENT_FINALIZATION_GRACE_MS = 2 * 60 * 1000;
const MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';

type PaymentExpectation = {
  recipient: string;
  reference: string;
  payer: string;
  expectedLamports: bigint;
  createdAt: Date;
  expiresAt: Date;
};

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object'
    ? (value as RecordValue)
    : null;
}

function result(
  status: VerificationResult['status'],
  signature: string,
  actualLamports: bigint,
  reason?: string,
): VerificationResult {
  return { verified: status === 'VERIFIED', status, actualLamports, signature, reason };
}

export function inspectPaymentTransaction(
  rawTransaction: unknown,
  expectedSignature: string,
  expected: PaymentExpectation,
): VerificationResult {
  const transaction = asRecord(rawTransaction);
  const transactionData = asRecord(transaction?.transaction);
  const message = asRecord(transactionData?.message);
  const meta = asRecord(transaction?.meta);
  const blockTime = transaction?.blockTime;
  const signatures = transactionData?.signatures;
  const accountKeys = message?.accountKeys;
  const instructions = message?.instructions;

  if (
    !transaction ||
    !transactionData ||
    !message ||
    !meta ||
    !Array.isArray(signatures) ||
    !Array.isArray(accountKeys) ||
    !Array.isArray(instructions)
  ) {
    return result(
      'REQUIRES_REVIEW',
      expectedSignature,
      0n,
      'The finalized transaction response was incomplete.',
    );
  }
  if (!signatures.includes(expectedSignature)) {
    return result(
      'REQUIRES_REVIEW',
      expectedSignature,
      0n,
      'The transaction signature did not match the submitted signature.',
    );
  }
  if (meta.err !== null) {
    return result(
      'FAILED',
      expectedSignature,
      0n,
      'The Solana transaction failed during execution.',
    );
  }
  if (typeof blockTime !== 'number' || !Number.isFinite(blockTime)) {
    return result(
      'PENDING',
      expectedSignature,
      0n,
      'The transaction block time is not available yet.',
    );
  }

  const blockTimeMs = blockTime * 1000;
  if (
    blockTimeMs < expected.createdAt.getTime() - 30_000 ||
    blockTimeMs > expected.expiresAt.getTime() + PAYMENT_FINALIZATION_GRACE_MS
  ) {
    return result(
      'EXPIRED',
      expectedSignature,
      0n,
      'The transaction finalized outside the payment order window.',
    );
  }

  const parsedKeys = accountKeys.map((key) => {
    const record = asRecord(key);
    const pubkey = typeof key === 'string' ? key : record?.pubkey;
    return {
      pubkey: typeof pubkey === 'string' ? pubkey : '',
      signer: record?.signer === true,
    };
  });
  if (!parsedKeys.some((key) => key.pubkey === expected.reference)) {
    return result(
      'REQUIRES_REVIEW',
      expectedSignature,
      0n,
      'The transaction did not include the unique payment reference.',
    );
  }
  if (!parsedKeys.some((key) => key.pubkey === expected.payer && key.signer)) {
    return result(
      'REQUIRES_REVIEW',
      expectedSignature,
      0n,
      'The expected payer did not sign the transaction.',
    );
  }

  const transfers: bigint[] = [];
  for (const rawInstruction of instructions) {
    const instruction = asRecord(rawInstruction);
    if (instruction?.program === 'computeBudget') continue;
    if (instruction?.program !== 'system') {
      return result(
        'REQUIRES_REVIEW',
        expectedSignature,
        0n,
        'The transaction included an unexpected program instruction.',
      );
    }

    const parsed = asRecord(instruction.parsed);
    const transfer = asRecord(parsed?.info);
    if (
      parsed?.type !== 'transfer' ||
      transfer?.source !== expected.payer ||
      transfer?.destination !== expected.recipient
    ) {
      return result(
        'REQUIRES_REVIEW',
        expectedSignature,
        0n,
        'The transaction included an unexpected System Program instruction.',
      );
    }

    const amount = transfer.lamports;
    if (
      (typeof amount !== 'string' && typeof amount !== 'number') ||
      (typeof amount === 'number' && !Number.isSafeInteger(amount)) ||
      !/^\d+$/.test(String(amount))
    ) {
      return result(
        'REQUIRES_REVIEW',
        expectedSignature,
        0n,
        'The transaction contained an invalid SOL transfer amount.',
      );
    }
    transfers.push(BigInt(String(amount)));
  }

  if (transfers.length !== 1 || transfers[0] <= 0n) {
    return result(
      'REQUIRES_REVIEW',
      expectedSignature,
      transfers.reduce((sum, amount) => sum + amount, 0n),
      'The transaction must contain exactly one positive SOL transfer for this order.',
    );
  }

  const actualLamports = transfers[0];
  if (actualLamports < expected.expectedLamports) {
    return result(
      'UNDERPAID',
      expectedSignature,
      actualLamports,
      'The transaction transferred fewer lamports than the order requires.',
    );
  }
  if (actualLamports > expected.expectedLamports) {
    return result(
      'OVERPAID',
      expectedSignature,
      actualLamports,
      'The transaction transferred more lamports than the order requires.',
    );
  }
  return result('VERIFIED', expectedSignature, actualLamports);
}

@Injectable()
export class SolanaPaymentService {
  private readonly logger = new Logger(SolanaPaymentService.name);
  private readonly rpc: ReturnType<typeof createSolanaRpc>;
  private verifiedRpcUrl = '';
  private rpcVerifiedAt = 0;

  constructor() {
    const rpcUrl =
      process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
    this.rpc = createSolanaRpc(rpcUrl);
    this.logger.log(`Solana RPC initialized: ${rpcUrl}`);
  }

  async getRecentSignatures(reference: string): Promise<string[]> {
    await this.assertMainnetRpc();
    const signatures = await this.rpc
      .getSignaturesForAddress(address(reference), {
        commitment: 'confirmed',
        limit: 20,
      })
      .send();
    return signatures.map((item) => item.signature);
  }

  private async assertMainnetRpc(): Promise<void> {
    if (
      this.verifiedRpcUrl === (process.env.SOLANA_RPC_URL ?? '') &&
      Date.now() - this.rpcVerifiedAt < 60_000
    ) {
      return;
    }
    const genesisHash = await this.rpc.getGenesisHash().send();
    if (genesisHash !== MAINNET_GENESIS_HASH) {
      throw new Error('Configured Solana RPC is not connected to mainnet.');
    }
    this.verifiedRpcUrl = process.env.SOLANA_RPC_URL ?? '';
    this.rpcVerifiedAt = Date.now();
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
        if (
          this.cachedSolPriceUsd &&
          now - this.cachedAt <= this.MAX_PRICE_AGE_MS
        ) {
          this.logger.warn(
            `Using a recent cached SOL price: $${this.cachedSolPriceUsd}`,
          );
          return this.cachedSolPriceUsd;
        }
        throw new Error('A current SOL/USD price is unavailable.');
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
    expectedPayer: string,
    expectedReference: string,
    createdAt: Date,
    expiresAt: Date,
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
      await this.assertMainnetRpc();
      // @solana/kit v2 pattern: cast signature to the branded type, then .send()
      const sig = toSignature(txSignature);

      const tx = await this.rpc.getTransaction(sig, {
        encoding: 'jsonParsed',
        maxSupportedTransactionVersion: 0,
        commitment: 'finalized',
      }).send();

      if (!tx) {
        return result(
          'PENDING',
          txSignature,
          0n,
          'The transaction may still be pending finalization.',
        );
      }
      return inspectPaymentTransaction(tx, txSignature, {
        recipient: expectedRecipient,
        reference: expectedReference,
        payer: expectedPayer,
        expectedLamports,
        createdAt,
        expiresAt,
      });
    } catch (err) {
      this.logger.error(`Could not verify transaction yet: ${String(err)}`);
      return {
        verified: false,
        status: 'PENDING',
        actualLamports: 0n,
        signature: txSignature,
        reason: String(err),
      };
    }
  }
}
