import { useLocation } from 'react-router-dom';
import { ReactNode } from 'react';

/**
 * Wraps route content and re-mounts with a fade-in animation on each route
 * change. Keyed by pathname so React fully re-mounts the subtree.
 *
 * Respects `prefers-reduced-motion` via the global CSS override in index.css.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="animate-fade-in">
      {children}
    </div>
  );
}
