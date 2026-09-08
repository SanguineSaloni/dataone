"use client";
import { classNames } from "../lib/format";
import type { ChartType } from "../lib/types";

const CHART_TYPES: Array<{ type: ChartType; icon: string; label: string }> = [
  { type: "table", icon: "▦", label: "Table" },
  { type: "bar", icon: "▊", label: "Bar" },
  { type: "line", icon: "📈", label: "Line" },
  { type: "area", icon: "🏔️", label: "Area" },
  { type: "pie", icon: "◔", label: "Pie" },
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
