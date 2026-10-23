import { type RefObject, useEffect } from 'react';

/**
 * Adds `is-visible` to the `.reveal` elements inside `ref` once they scroll into view, so they fade
 * in (styles.css; skipped under reduced motion). Without IntersectionObserver they show at once.
 * When `content` changes, the `.reveal` elements added since are watched too.
 */
export function useReveal(ref: RefObject<HTMLElement | null>, content?: unknown): void {
  useEffect(() => {
    const elements = [...(ref.current?.querySelectorAll<HTMLElement>('.reveal:not(.is-visible)') ?? [])];
    if (typeof IntersectionObserver === 'undefined') {
      for (const element of elements) element.classList.add('is-visible');
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 },
    );
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [ref, content]);
}
