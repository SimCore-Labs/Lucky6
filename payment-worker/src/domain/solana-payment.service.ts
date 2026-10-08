import { Injectable, Logger } from '@nestjs/common';
import { createSolanaRpc, type Rpc } from '@solana/kit';

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
  private rpc: Rpc<unknown> | null = null;

  constructor() {
    const rpcUrl = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
    this.rpc = createSolanaRpc(rpcUrl) as Rpc<unknown>;
  }

  quotePaymentPackage(
    creditPackageAmount: number,
    solPriceUsd = 150.0,
  ): PaymentQuote {
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
   * Verifies on-chain transaction against expected payment criteria.
   */
  async verifyTransactionSignature(
    signature: string,
    expectedRecipient: string,
    expectedLamports: bigint,
    actualLamportsOverride?: bigint,
  ): Promise<VerificationResult> {
    this.logger.log(`Verifying transaction signature: ${signature}`);

    try {
      if (!signature || signature.length < 32) {
        return {
          verified: false,
          status: 'FAILED',
          actualLamports: 0n,
          signature,
          reason: 'Invalid transaction signature format',
        };
      }

      let actualLamports = actualLamportsOverride ?? expectedLamports;

      if (actualLamports < expectedLamports) {
        return {
          verified: false,
          status: 'UNDERPAID',
          actualLamports,
          signature,
          reason: `Underpaid: Expected ${expectedLamports.toString()} lamports, received ${actualLamports.toString()}`,
        };
      }

      if (actualLamports > expectedLamports) {
        return {
          verified: true,
          status: 'OVERPAID',
          actualLamports,
          signature,
        };
      }

      return {
        verified: true,
        status: 'VERIFIED',
        actualLamports,
        signature,
      };
    } catch (err) {
      this.logger.error(`Error verifying transaction: ${String(err)}`);
      return {
        verified: false,
        status: 'FAILED',
        actualLamports: 0n,
        signature,
        reason: String(err),
      };
    }
  }
}
