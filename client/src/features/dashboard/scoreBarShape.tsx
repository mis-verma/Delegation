import { Rectangle } from 'recharts';

interface ColumnProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  /** Nothing was due: draw the lane as an empty, outlined bar instead of a filled one. */
  empty: boolean;
  radius?: number;
}

/**
 * One column of the score charts. A column with work behind it is a filled bar with rounded top corners. One
 * with nothing due is an empty outlined bar the full height of the lane, so it reads as "nothing here yet"
 * and not as a score of zero. Colours come from the theme tokens, so it follows light and dark.
 */
export const ScoreColumn = ({ empty, radius = 8, ...props }: ColumnProps) => {
  const { x = 0, y = 0, width = 0, height = 0 } = props;
  if (empty) {
    return (
      <rect
        x={x + 0.75}
        y={y + 0.75}
        width={Math.max(0, width - 1.5)}
        height={Math.max(0, height - 1.5)}
        rx={radius}
        ry={radius}
        fill="none"
        stroke="var(--color-border-hover)"
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
    );
  }
  return <Rectangle {...(props as object)} radius={[radius, radius, 0, 0]} />;
};
