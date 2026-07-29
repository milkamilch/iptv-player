import { useState, useEffect, useCallback } from 'react';

/**
 * Fenstert eine Liste gleich hoher Zeilen in einem scrollenden Container.
 * Gerendert wird nur der sichtbare Ausschnitt plus Puffer; oben und unten
 * hält je eine leere Zeile den Scrollbalken auf die volle Höhe.
 */
export function useVirtualRows({ ref, count, estimatedRowHeight, overscan = 3 }) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [rowHeight, setRowHeight] = useState(estimatedRowHeight);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => { setScrollTop(el.scrollTop); setViewport(el.clientHeight); };
    el.addEventListener('scroll', sync, { passive: true });
    // Die Leiste hängt an der Fensterhöhe und wächst z.B. beim Vollbildwechsel.
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    sync();
    return () => { el.removeEventListener('scroll', sync); ro.disconnect(); };
  }, [ref]);

  // Die echte Zeilenhöhe wird gemessen, nicht geglaubt: ändert jemand später
  // das Padding, verrutscht die Virtualisierung sonst stillschweigend.
  const measure = useCallback((node) => {
    if (node && node.offsetHeight > 0 && node.offsetHeight !== rowHeight) {
      setRowHeight(node.offsetHeight);
    }
  }, [rowHeight]);

  const perScreen = viewport > 0 ? Math.ceil(viewport / rowHeight) : 0;
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const last = Math.min(count, first + perScreen + overscan * 2);

  const scrollToIndex = useCallback((i) => {
    const el = ref.current;
    if (!el || i < 0) return;
    const top = i * rowHeight;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowHeight > el.scrollTop + el.clientHeight) {
      el.scrollTop = top + rowHeight - el.clientHeight;
    }
  }, [ref, rowHeight]);

  return {
    first,
    last,
    padTop: first * rowHeight,
    padBottom: Math.max(0, (count - last) * rowHeight),
    measure,
    scrollToIndex,
  };
}
