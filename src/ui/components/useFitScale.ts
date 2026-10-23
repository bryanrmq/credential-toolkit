import { useEffect, useRef, useState } from 'react';

/** Scale that fits `width` px into the observed element, never above 1. Stays 1 without ResizeObserver (tests). */
export function useFitScale(width: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, scale: available === null ? 1 : Math.min(1, available / width) };
}
