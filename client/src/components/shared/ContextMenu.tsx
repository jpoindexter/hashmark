import { useState, useEffect, useRef, useCallback, type CSSProperties, type ReactNode } from "react";

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  danger?: boolean;
  separator?: boolean;
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number } | null;
  onClose: () => void;
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 199,
};

const menuBase: CSSProperties = {
  position: "fixed",
  zIndex: 200,
  background: "var(--bg-3)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  padding: "4px 0",
  minWidth: 160,
  boxShadow: "var(--shadow-md)",
};

const itemBase: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  height: 28,
  padding: "0 12px",
  fontSize: 12,
  fontFamily: "var(--font-ui)",
  color: "var(--text-dim)",
  cursor: "pointer",
  border: "none",
  background: "none",
  width: "100%",
  textAlign: "left",
  outline: "none",
};

const separatorStyle: CSSProperties = {
  height: 1,
  background: "var(--border-dim)",
  margin: "4px 0",
};

function clampPosition(x: number, y: number, menuWidth: number, menuHeight: number) {
  const pad = 8;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - pad);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - pad);
  return { x: Math.max(pad, clampedX), y: Math.max(pad, clampedY) };
}

export default function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [clamped, setClamped] = useState<{ x: number; y: number } | null>(null);

  // Filter to only actionable items (not separators) for keyboard nav
  const actionableIndices = items.reduce<number[]>((acc, item, i) => {
    if (!item.separator) acc.push(i);
    return acc;
  }, []);

  // Clamp position after first render so we know the menu dimensions
  useEffect(() => {
    if (!position || !menuRef.current) {
      setClamped(null);
      return;
    }
    const rect = menuRef.current.getBoundingClientRect();
    setClamped(clampPosition(position.x, position.y, rect.width, rect.height));
  }, [position]);

  // Reset focus index when menu opens
  useEffect(() => {
    setFocusIndex(-1);
  }, [position]);

  // Escape to close
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!position) return;

    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIndex((prev) => {
        const currentPos = actionableIndices.indexOf(prev);
        const next = currentPos < actionableIndices.length - 1 ? currentPos + 1 : 0;
        return actionableIndices[next];
      });
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIndex((prev) => {
        const currentPos = actionableIndices.indexOf(prev);
        const next = currentPos > 0 ? currentPos - 1 : actionableIndices.length - 1;
        return actionableIndices[next];
      });
      return;
    }

    if (e.key === "Enter" && focusIndex >= 0) {
      e.preventDefault();
      const item = items[focusIndex];
      if (item && !item.separator) {
        onClose();
        item.onClick();
      }
    }
  }, [position, focusIndex, items, actionableIndices, onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!position) return null;

  // Use raw position initially, then clamped once measured
  const displayPos = clamped ?? position;

  return (
    <>
      {/* Invisible overlay to catch outside clicks */}
      <div style={overlayStyle} onMouseDown={onClose} />

      <div
        ref={menuRef}
        role="menu"
        style={{
          ...menuBase,
          left: displayPos.x,
          top: displayPos.y,
          // Hide until clamped to prevent flicker
          opacity: clamped ? 1 : 0,
        }}
      >
        {items.map((item, i) => {
          if (item.separator) {
            return <div key={i} style={separatorStyle} />;
          }

          const focused = i === focusIndex;
          const isDanger = item.danger === true;

          return (
            <ContextMenuItemRow
              key={i}
              item={item}
              focused={focused}
              isDanger={isDanger}
              onClose={onClose}
              onHover={() => setFocusIndex(i)}
            />
          );
        })}
      </div>
    </>
  );
}

function ContextMenuItemRow({
  item,
  focused,
  isDanger,
  onClose,
  onHover,
}: {
  item: ContextMenuItem;
  focused: boolean;
  isDanger: boolean;
  onClose: () => void;
  onHover: () => void;
}) {
  const baseColor = isDanger ? "var(--red)" : "var(--text-dim)";
  const hoverBg = isDanger ? "var(--red-bg)" : "var(--active-bg)";
  const hoverColor = isDanger ? "var(--red)" : "var(--text)";

  return (
    <button
      role="menuitem"
      style={{
        ...itemBase,
        color: focused ? hoverColor : baseColor,
        background: focused ? hoverBg : "none",
      }}
      onMouseEnter={onHover}
      onClick={() => {
        onClose();
        item.onClick();
      }}
    >
      {item.icon && (
        <span style={{ display: "flex", alignItems: "center", flexShrink: 0, width: 14 }}>
          {item.icon}
        </span>
      )}
      {item.label}
    </button>
  );
}
