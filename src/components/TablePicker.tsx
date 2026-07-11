import { useEffect, useState } from "react";

interface TablePickerProps {
  maxRows: number;
  maxCols: number;
  onSelect: (rows: number, cols: number) => void;
  onClose: () => void;
}

export function TablePicker({ maxRows, maxCols, onSelect, onClose }: TablePickerProps) {
  const [hovered, setHovered] = useState({ rows: 0, cols: 0 });

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="table-picker" role="dialog" aria-label="选择表格大小">
      <div className="table-picker-size">
        {hovered.rows ? `${hovered.rows} 行 × ${hovered.cols} 列` : "选择行列数"}
      </div>
      <div
        className="table-picker-grid"
        style={{ gridTemplateColumns: `repeat(${maxCols}, 16px)` }}
      >
        {Array.from({ length: maxRows * maxCols }, (_, index) => {
          const row = Math.floor(index / maxCols) + 1;
          const col = (index % maxCols) + 1;
          const highlighted = row <= hovered.rows && col <= hovered.cols;
          return (
            <button
              type="button"
              key={`${row}-${col}`}
              aria-label={`${row} 行 ${col} 列`}
              className={`table-picker-cell ${highlighted ? "highlighted" : ""}`}
              onMouseEnter={() => setHovered({ rows: row, cols: col })}
              onFocus={() => setHovered({ rows: row, cols: col })}
              onClick={() => onSelect(row, col)}
            />
          );
        })}
      </div>
    </div>
  );
}
