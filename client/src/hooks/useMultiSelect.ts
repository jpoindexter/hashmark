import { useState, useCallback, useRef } from "react";

export function useMultiSelect<T extends string>(orderedIds: T[]) {
  const [selected, setSelected] = useState<Set<T>>(new Set());
  const lastClicked = useRef<T | null>(null);

  const handleClick = useCallback((id: T, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    const mod = e.metaKey || e.ctrlKey;

    if (e.shiftKey && lastClicked.current) {
      const startIdx = orderedIds.indexOf(lastClicked.current);
      const endIdx = orderedIds.indexOf(id);
      if (startIdx >= 0 && endIdx >= 0) {
        const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        setSelected(prev => {
          const next = new Set(prev);
          for (let i = lo; i <= hi; i++) next.add(orderedIds[i]);
          return next;
        });
        return;
      }
    }

    if (mod) {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      // Plain click: clear selection, just set anchor for future shift-clicks
      setSelected(new Set());
    }

    lastClicked.current = id;
  }, [orderedIds]);

  const clear = useCallback(() => setSelected(new Set()), []);
  const selectAll = useCallback(() => setSelected(new Set(orderedIds)), [orderedIds]);

  return { selected, handleClick, clear, selectAll, setSelected };
}
