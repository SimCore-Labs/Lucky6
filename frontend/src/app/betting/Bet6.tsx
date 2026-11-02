import { Lucky6 } from './Lucky6';

export function Bet6() {
  return (
    <Lucky6
      heading="BET ZERO"
      instructions="Choose 1 to 6 numbers. Every selected number must stay out of the draw."
      idPrefix="betzero"
      marketType="PICK_NUMBERS_ABSENT"
    />
  );
}
