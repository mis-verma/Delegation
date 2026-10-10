import { Rectangle } from 'recharts';

interface ColumnProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  /** Nothing was due: draw a soft placeholder column instead of a filled bar. */
  empty: boolean;
  radius?: number;
  /** Write "Nothing due" in the column. Off for the second column of a pair, so it is said once per module. */
  words?: boolean;
}

/**
 * One column of the score charts. A column with work behind it is a filled bar with rounded top corners.
 * One with nothing due is a soft tinted column the full height of the lane with "Nothing due" written in
 * it when there is room, so it reads as "nothing here yet" and never as a score of zero. Colours come
 * from the theme tokens, so it follows light and dark.
 */
export const ScoreColumn = ({ empty, radius = 8, words = true, ...props }: ColumnProps) => {
  const { x = 0, y = 0, width = 0, height = 0 } = props;
  if (empty) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    // Two short lines need about 44px across; a thinner column stays a plain placeholder.
    const showWords = words && width >= 44 && height >= 60;
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={Math.max(0, width)}
          height={Math.max(0, height)}
          rx={radius}
          ry={radius}
          fill="color-mix(in oklab, var(--color-primary-500) 7%, transparent)"
          stroke="color-mix(in oklab, var(--color-primary-500) 18%, transparent)"
          strokeWidth={1}
        />
        {showWords && (
          <text x={cx} y={cy} textAnchor="middle" fill="var(--color-text-muted)" fontSize={12} fontWeight={600}>
            <tspan x={cx} dy={-4}>Nothing</tspan>
            <tspan x={cx} dy={15}>due</tspan>
          </text>
        )}
      </g>
    );
  }
  return <Rectangle {...(props as object)} radius={[radius, radius, 0, 0]} />;
};
