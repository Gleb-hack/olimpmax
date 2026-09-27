import { useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

// Owned by the authenticated layout, so positions disappear on sign-out.
export function useCatalogNavigation() {
  const { pathname, search } = useLocation();
  const [catalogTo, setCatalogTo] = useState('/catalog');
  const positions = useRef(new Map<string, number>());
  const previousPath = useRef<string | null>(null);

  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);

  useLayoutEffect(() => {
    const pathnameChanged = previousPath.current !== pathname;
    previousPath.current = pathname;
    if (pathname !== '/catalog') {
      if (pathnameChanged) window.scrollTo(0, 0);
      return;
    }
    const key = pathname + search;
    setCatalogTo(key);
    const target = positions.current.get(key) ?? 0;
    let restoring = true;
    const restore = () => {
      if (!restoring) return;
      window.scrollTo(0, target);
      if (Math.abs(window.scrollY - target) < 1) restoring = false;
    };
    // A cold query cache needs the list to finish loading before it can scroll.
    const observer = new ResizeObserver(restore);
    observer.observe(document.body);
    const stopRestoring = () => { restoring = false; };
    const save = () => { if (!restoring) positions.current.set(key, window.scrollY); };
    window.addEventListener('scroll', save, { passive: true });
    window.addEventListener('wheel', stopRestoring, { passive: true });
    window.addEventListener('touchstart', stopRestoring, { passive: true });
    window.addEventListener('keydown', stopRestoring);
    restore();
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', save);
      window.removeEventListener('wheel', stopRestoring);
      window.removeEventListener('touchstart', stopRestoring);
      window.removeEventListener('keydown', stopRestoring);
    };
  }, [pathname, search]);

  return catalogTo;
}
