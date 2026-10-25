import styles from './game-ball.module.css';

export type BallColor = 'red' | 'blue' | 'green' | 'yellow' | 'neutral';

export function getBallColor(color?: string): BallColor {
  const normalized = color?.toLowerCase();
  if (normalized === 'red' || normalized === 'blue' || normalized === 'green' || normalized === 'yellow') {
    return normalized;
  }
  return 'neutral';
}

export function GameBall({
  number,
  color,
  selected = false,
  onClick,
  disabled = false,
}: {
  number: number;
  color?: string;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const className = [
    styles.ball,
    styles[getBallColor(color)],
    selected ? styles.selected : '',
  ].filter(Boolean).join(' ');
  const label = `Number ${number}${color ? `, ${color.toLowerCase()}` : ''}`;

  if (!onClick) {
    return <span className={className} role="img" aria-label={label}>{number}</span>;
  }

  return (
    <button
      className={className}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={selected}
    >
      {number}
    </button>
  );
}
