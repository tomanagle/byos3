/**
 * Build-time feature flags. Kept tiny and literal so they tree-shake.
 */

/**
 * When true, EVERY route renders the waiting-list screen instead of the app or landing page (the
 * gate lives in `routes/__root.tsx`). Flip to true for a pre-launch "waitlist only" deployment;
 * false runs the real app (landing page when logged out, file workspace when logged in).
 */
export const SHOW_WAITING_SCREEN = false;
