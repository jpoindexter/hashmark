import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";

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

  const actionableIndices = useMemo(
    () => items.reduce<number[]>((acc, item, i) => { if (!item.separator) acc.push(i); return acc; }, []),
    [items]
  );

  useEffect(() => {
    if (!position || !menuRef.current) {
      setClamped(null);
      return;
    }
    const rect = menuRef.current.getBoundingClientRect();
    setClamped(clampPosition(position.x, position.y, rect.width, rect.height));
  }, [position]);

  useEffect(() => {
    setFocusIndex(-1);
  }, [position]);

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
        item.onClick();
        onClose();
      }
    }
  }, [position, focusIndex, items, actionableIndices, onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!position) return null;

  const displayPos = clamped ?? position;

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={onClose} />

      <div
        ref={menuRef}
        role="menu"
        className="context-menu"
        style={{
          left: displayPos.x,
          top: displayPos.y,
          opacity: clamped ? 1 : 0,
        }}
      >
        {items.map((item, i) => {
          if (item.separator) {
            return <div key={i} className="context-menu-separator" />;
          }

          return (
            <ContextMenuItemRow
              key={i}
              item={item}
              focused={i === focusIndex}
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
  onClose,
  onHover,
}: {
  item: ContextMenuItem;
  focused: boolean;
  onClose: () => void;
  onHover: () => void;
}) {
  const isDanger = item.danger === true;
  const itemClass = `context-menu-item${isDanger ? " context-menu-item-danger" : ""}`;

  return (
    <button
      role="menuitem"
      className={itemClass}
      style={focused ? {
        background: isDanger ? "var(--red-bg)" : "var(--active-bg)",
        color: isDanger ? "var(--red)" : "var(--text)",
      } : undefined}
      onMouseEnter={onHover}
      onClick={() => {
        item.onClick();
        onClose();
      }}
    >
      {item.icon && (
        <span className="flex-center" style={{ flexShrink: 0, width: 14 }}>
          {item.icon}
        </span>
      )}
      {item.label}
    </button>
  );
}
