import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getExpectedGenesisHash,
  inspectPaymentTransaction,
} from './solana-payment.service.js';

const payer = '11111111111111111111111111111111';
const recipient = 'Vote111111111111111111111111111111111111111';
const reference = 'SysvarRent111111111111111111111111111111111';
const signature = '1'.repeat(88);
const createdAt = new Date('2026-01-01T00:00:00.000Z');
const expiresAt = new Date('2026-01-01T00:15:00.000Z');
const expected = {
  recipient,
  reference,
  payer,
  expectedLamports: 25_000_000n,
  createdAt,
  expiresAt,
};

function transaction(
  overrides: {
    amount?: string | number | bigint;
    destination?: string;
    reference?: string;
    signer?: boolean;
    signature?: string;
    blockTime?: number | bigint;
    extraInstruction?: Record<string, unknown>;
  } = {},
) {
  return {
    blockTime: overrides.blockTime ?? createdAt.getTime() / 1000 + 30,
    transaction: {
      signatures: [overrides.signature ?? signature],
      message: {
        accountKeys: [
          { pubkey: payer, signer: overrides.signer ?? true },
          { pubkey: recipient, signer: false },
          { pubkey: overrides.reference ?? reference, signer: false },
        ],
        instructions: [
          {
            program: 'system',
            parsed: {
              type: 'transfer',
              info: {
                source: payer,
                destination: overrides.destination ?? recipient,
                lamports: overrides.amount ?? '25000000',
              },
            },
          },
          ...(overrides.extraInstruction ? [overrides.extraInstruction] : []),
        ],
      },
    },
    meta: { err: null },
  };
}

test('verifies an exact transfer with the order reference and expected payer', () => {
  const result = inspectPaymentTransaction(transaction(), signature, expected);
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.verified, true);
  assert.equal(result.actualLamports, 25_000_000n);
});

test('verifies transactions whose Solana Kit block time is a bigint', () => {
  const result = inspectPaymentTransaction(
    transaction({ blockTime: BigInt(createdAt.getTime() / 1000 + 30) }),
    signature,
    expected,
  );
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.actualLamports, 25_000_000n);
});

test('verifies transfer amounts returned by Solana Kit as bigint', () => {
  const result = inspectPaymentTransaction(
    transaction({ amount: 25_000_000n }),
    signature,
    expected,
  );
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.actualLamports, 25_000_000n);
});

test('rejects a self-transfer that does not pay the treasury', () => {
  const result = inspectPaymentTransaction(
    transaction({ destination: payer }),
    signature,
    { ...expected, recipient: payer },
  );
  assert.equal(result.status, 'REQUIRES_REVIEW');
  assert.equal(result.actualLamports, 0n);
  assert.match(result.reason ?? '', /same wallet/);
});

test('does not verify a transaction that omits the unique order reference', () => {
  const result = inspectPaymentTransaction(
    transaction({ reference: 'Stake11111111111111111111111111111111111111' }),
    signature,
    expected,
  );
  assert.equal(result.status, 'REQUIRES_REVIEW');
});

test('requires the authenticated payer to sign the transfer', () => {
  const result = inspectPaymentTransaction(
    transaction({ signer: false }),
    signature,
    expected,
  );
  assert.equal(result.status, 'REQUIRES_REVIEW');
});

test('classifies underpayments and overpayments without crediting either', () => {
  const underpaid = inspectPaymentTransaction(
    transaction({ amount: '24999999' }),
    signature,
    expected,
  );
  const overpaid = inspectPaymentTransaction(
    transaction({ amount: '25000001' }),
    signature,
    expected,
  );
  assert.equal(underpaid.status, 'UNDERPAID');
  assert.equal(underpaid.verified, false);
  assert.equal(overpaid.status, 'OVERPAID');
  assert.equal(overpaid.verified, false);
});

test('rejects extra programs and signatures outside the order window', () => {
  const unexpectedProgram = inspectPaymentTransaction(
    transaction({
      extraInstruction: { program: 'memo', parsed: { type: 'memo' } },
    }),
    signature,
    expected,
  );
  const latePayment = inspectPaymentTransaction(
    transaction({ blockTime: expiresAt.getTime() / 1000 + 180 }),
    signature,
    expected,
  );
  assert.equal(unexpectedProgram.status, 'REQUIRES_REVIEW');
  assert.equal(latePayment.status, 'EXPIRED');
});

test('uses the Devnet genesis hash when configured', () => {
  assert.equal(
    getExpectedGenesisHash('devnet'),
    'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  );
});
