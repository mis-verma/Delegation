import { Rectangle } from 'recharts';

interface ColumnProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  empty: boolean;
  radius?: number;
  words?: boolean;
}

export const ScoreColumn = ({ empty, radius = 8, words = true, ...props }: ColumnProps) => {
  const { x = 0, y = 0, width = 0, height = 0 } = props;
  if (empty) {
    const cx = x + width / 2;
    const cy = y + height / 2;
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
