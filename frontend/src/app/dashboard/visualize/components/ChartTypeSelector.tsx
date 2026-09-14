"use client";
import { classNames } from "../lib/format";
import type { ChartType } from "../lib/types";

const CHART_TYPES: Array<{ type: ChartType; icon: React.ReactNode; label: string }> = [
  { type: "table", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /></svg>, label: "Table" },
  { type: "bar", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="4" y="4" width="6" height="16" rx="1" /><rect x="14" y="4" width="6" height="16" rx="1" /></svg>, label: "Bar" },
  { type: "line", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></svg>, label: "Line" },
  { type: "area", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 20L12 4l8 16" /><path d="M12 11l-3 4h6z" /></svg>, label: "Area" },
  { type: "pie", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 3v9l6.36 6.36" /></svg>, label: "Pie" },
  { type: "scatter", icon: "⁘", label: "Scatter" },
  { type: "kpi", icon: "#", label: "KPI" },
];

interface ChartTypeSelectorProps {
  value: ChartType;
  onChange: (type: ChartType) => void;
  dimensionCount: number;
  measureCount: number;
}

/** Chart types incompatible with the current field config are grayed out
 * (edge case: "pie requires exactly one dimension + one measure"). */
function isCompatible(type: ChartType, dimensionCount: number, measureCount: number): boolean {
  switch (type) {
    case "pie":
      return dimensionCount === 1 && measureCount === 1;
    case "kpi":
      return dimensionCount === 0 && measureCount === 1;
    case "scatter":
      return measureCount >= 2;
    case "table":
      return true;
    default:
      return dimensionCount >= 1 && measureCount >= 1;
  }
}

export default function ChartTypeSelector({ value, onChange, dimensionCount, measureCount }: ChartTypeSelectorProps) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Chart type">
      {CHART_TYPES.map((ct) => {
        // Never disable the currently-selected option — including on first
        // load, before any fields are picked, when the default ("bar") is
        // not yet compatible with an empty config. A disabled active
        // selection can't be re-focused and reads as "the whole panel is
        // unresponsive" (bug report B06).
        const active = value === ct.type;
        const compatible = active || isCompatible(ct.type, dimensionCount, measureCount);
        return (
          <button
            key={ct.type}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={!compatible}
            onClick={() => onChange(ct.type)}
            title={!compatible ? `${ct.label} needs a different field configuration` : ct.label}
            className={classNames(
              "flex flex-col items-center gap-1 px-3 py-2 rounded-lg border text-xs min-w-[64px]",
              active
                ? "bg-info/15 border-info/30 text-info"
                : "border-border-strong text-fg-subtle hover:bg-surface-overlay",
              !compatible && "opacity-30 cursor-not-allowed",
            )}
          >
            <span className="text-base">{ct.icon}</span>
            {ct.label}
          </button>
        );
      })}
    </div>
  );
}
