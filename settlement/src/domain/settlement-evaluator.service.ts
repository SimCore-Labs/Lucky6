import { Injectable, Logger } from '@nestjs/common';
import type { BallColor } from '@lucky-six/contracts';

export interface SettlementDrawData {
  balls: { number: number; color: BallColor; orderIndex: number }[];
  statistics: { totalSum: number; has49: boolean; majorityColor: BallColor | null };
}

export interface SelectionToEvaluate {
  marketType: string;
  selectionValue: string;
}

@Injectable()
export class SettlementEvaluatorService {
  private readonly logger = new Logger(SettlementEvaluatorService.name);

  /**
   * Evaluates if a given market selection won for a completed draw.
   */
  evaluateSelection(
    selection: SelectionToEvaluate,
    draw: SettlementDrawData,
  ): boolean {
    const { marketType, selectionValue } = selection;

    if (marketType === 'INDIVIDUAL_NUMBER') {
      const num = Number(selectionValue);
      if (!Number.isInteger(num) || num < 1 || num > 49) {
        throw new Error(`Unsupported number selection: ${selectionValue}`);
      }
      return draw.balls.some((b) => b.number === num);
    }

    if (marketType === 'BLACK_JACKPOT') {
      if (selectionValue === 'YES') return draw.statistics.has49;
      if (selectionValue === 'NO') return !draw.statistics.has49;
    }

    if (marketType === 'COLOR_MAJORITY') {
      if (selectionValue === 'NO_MAJORITY') {
        return draw.statistics.majorityColor === null;
      }
      if (!['RED', 'BLUE', 'GREEN'].includes(selectionValue)) {
        throw new Error(`Unsupported majority-color selection: ${selectionValue}`);
      }
      return draw.statistics.majorityColor === selectionValue;
    }

    if (marketType === 'SUM_HIGH_MID_LOW') {
      const sum = draw.statistics.totalSum;
      if (selectionValue === 'LOW') return sum >= 21 && sum <= 120;
      if (selectionValue === 'MID') return sum >= 121 && sum <= 170;
      if (selectionValue === 'HIGH') return sum >= 171 && sum <= 279;
      throw new Error(`Unsupported total-sum band: ${selectionValue}`);
    }

    if (marketType === 'SUM_OVER_UNDER') {
      const sum = draw.statistics.totalSum;
      if (selectionValue === 'OVER') return sum >= 123;
      if (selectionValue === 'UNDER') return sum <= 122;
      throw new Error(`Unsupported over/under selection: ${selectionValue}`);
    }

    if (marketType === 'SUM_ODD_EVEN') {
      const sum = draw.statistics.totalSum;
      if (selectionValue === 'ODD') return sum % 2 !== 0;
      if (selectionValue === 'EVEN') return sum % 2 === 0;
      throw new Error(`Unsupported sum-parity selection: ${selectionValue}`);
    }

    if (marketType === 'COLOR_COUNT') {
      if (selectionValue === 'BLACK:1') {
        return draw.balls.some((ball) => ball.number === 49);
      }
      const match = /^(RED|BLUE|GREEN):([0-6])$/.exec(selectionValue);
      if (!match) {
        throw new Error(`Unsupported color-count selection: ${selectionValue}`);
      }
      const actualCount = draw.balls.filter(
        (ball) => ball.color === match[1],
      ).length;
      return actualCount === Number(match[2]);
    }

    if (marketType === 'FIRST_BALL_COLOR') {
      if (!['RED', 'BLUE', 'GREEN', 'BLACK'].includes(selectionValue)) {
        throw new Error(`Unsupported first-ball color: ${selectionValue}`);
      }
      const firstBall = draw.balls.find((b) => b.orderIndex === 0);
      return firstBall ? firstBall.color === selectionValue : false;
    }

    throw new Error(`Unsupported market type: ${marketType}`);
  }

  countPickSixMatches(
    selectedNumbers: number[],
    draw: SettlementDrawData,
  ): number {
    if (
      selectedNumbers.length !== 6 ||
      new Set(selectedNumbers).size !== 6 ||
      selectedNumbers.some(
        (number) => !Number.isInteger(number) || number < 1 || number > 49,
      )
    ) {
      throw new Error('Pick-six ticket must contain six distinct numbers from 1 to 49.');
    }
    const drawnNumbers = new Set(draw.balls.map((ball) => ball.number));
    return selectedNumbers.filter((number) => drawnNumbers.has(number)).length;
  }
}
