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
      const num = parseInt(selectionValue, 10);
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
      return draw.statistics.majorityColor === selectionValue;
    }

    if (marketType === 'SUM_HIGH_MID_LOW') {
      const sum = draw.statistics.totalSum;
      if (selectionValue === 'LOW') return sum >= 15 && sum <= 120;
      if (selectionValue === 'MID') return sum >= 121 && sum <= 170;
      if (selectionValue === 'HIGH') return sum >= 171 && sum <= 280;
    }

    if (marketType === 'SUM_ODD_EVEN') {
      const sum = draw.statistics.totalSum;
      if (selectionValue === 'ODD') return sum % 2 !== 0;
      if (selectionValue === 'EVEN') return sum % 2 === 0;
    }

    if (marketType === 'FIRST_BALL_COLOR') {
      const firstBall = draw.balls.find((b) => b.orderIndex === 0);
      return firstBall ? firstBall.color === selectionValue : false;
    }

    return false;
  }
}
