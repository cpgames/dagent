import { useState, useEffect } from 'react';

/**
 * Custom hook that detects prefers-reduced-motion media query preference.
 *
 * Queries (prefers-reduced-motion: reduce) on mount and subscribes
 * to changes via addEventListener('change', handler).
 *
 * @returns boolean indicating if reduced motion is preferred
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() => {
    // Check initial value (SSR-safe with fallback)
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Update state if it changed since initial render
    setReducedMotion(mediaQuery.matches);

    // Subscribe to changes
    const handler = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handler);

    // Clean up listener on unmount
    return () => {
      mediaQuery.removeEventListener('change', handler);
    };
  }, []);

  return reducedMotion;
}
