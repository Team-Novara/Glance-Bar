export type StatusRailAccent = "violet" | "green" | "orange" | "cyan";

type StatusRailProps = {
  value: number;
  label: string;
  accent: StatusRailAccent;
  active?: boolean;
  shimmer?: boolean;
  indeterminate?: boolean;
};

export function StatusRail({
  value,
  label,
  accent,
  active = false,
  shimmer = false,
  indeterminate = false,
}: StatusRailProps) {
  const safeValue = Math.max(0, Math.min(100, value));
  const showShimmer = indeterminate || (active && shimmer && safeValue > 0 && safeValue < 100);
  const fillWidth = Math.max(12, safeValue);

  return (
    <span
      className={`product-status-track product-status-track-${accent}${indeterminate ? " is-indeterminate" : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : safeValue}
    >
      <span style={indeterminate ? undefined : { width: `${fillWidth}%` }} />
      {showShimmer ? <span className="product-status-track-shimmer" aria-hidden="true" /> : null}
    </span>
  );
}
