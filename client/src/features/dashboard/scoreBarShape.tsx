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
    // "Nothing / due" needs about 44px across; a column down to 32px says "None"; thinner stays plain.
    const showWords = words && width >= 32 && height >= 60;
    const twoLines = width >= 44;
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
            {twoLines ? (
              <>
                <tspan x={cx} dy={-4}>Nothing</tspan>
                <tspan x={cx} dy={15}>due</tspan>
              </>
            ) : (
              <tspan x={cx} dy={4}>None</tspan>
            )}
          </text>
        )}
      </g>
    );
  }
  const floor = 3;
  if (height < floor) {
    return <Rectangle {...(props as object)} y={y + height - floor} height={floor} radius={[Math.min(radius, 2), Math.min(radius, 2), 0, 0]} />;
  }
  return <Rectangle {...(props as object)} radius={[radius, radius, 0, 0]} />;
};
