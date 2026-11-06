import { Platform } from 'react-native';

// Meta pixel for the web app, loaded only after the visitor accepts it in the cookie banner.
// It never runs on the suppliers' e-mail links (/offre, /bon) nor while a sign-in link still
// carries its token in the address, and it sends no personal data (no advanced matching).

const PIXEL_ID = '1604783871421166';
const KEY = 'bn_consent';
const SIX_MONTHS = 182 * 24 * 3600 * 1000;

export type Consent = 'yes' | 'no';

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...a: unknown[]) => void;
  queue: unknown[];
  push: unknown;
  loaded: boolean;
  version: string;
  disablePushState?: boolean;
};
type PixelWindow = Window & { fbq?: Fbq; _fbq?: Fbq };

const web = Platform.OS === 'web' && typeof window !== 'undefined';

/** Pages where the pixel never runs: suppliers' private links and the admin. */
export function privatePath(path: string): boolean {
  return /^\/(offre|bon|admin)(\/|$)/.test(path);
}

/** Whether the address still holds a secret (sign-in or reset link). */
function secretInUrl(): boolean {
  return /access_token|refresh_token|token_hash|[?&]code=|[?&]token=/.test(window.location.hash + window.location.search);
}

export function readConsent(): Consent | null {
  if (!web) return null;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { choice: Consent; at: number } | null;
    return v && Date.now() - v.at < SIX_MONTHS ? v.choice : null;
  } catch {
    return null;
  }
}

export function saveConsent(choice: Consent) {
  if (!web) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ choice, at: Date.now() }));
  } catch {
    // Private browsing: the banner simply shows again next time.
  }
}

let loaded = false;

/** Loads the pixel if the visitor accepted and the page is safe to report. Returns whether it runs. */
export function startPixel(path: string): boolean {
  if (!web || loaded) return loaded;
  if (readConsent() !== 'yes' || privatePath(path) || secretInUrl()) return false;
  loaded = true;
  const w = window as PixelWindow;
  const n = function (...args: unknown[]) {
    if (n.callMethod) n.callMethod(...args);
    else n.queue.push(args);
  } as Fbq;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  // Page views are sent by us, only for safe pages: no automatic tracking of address changes.
  n.disablePushState = true;
  w.fbq = n;
  if (!w._fbq) w._fbq = n;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(s);
  n('set', 'autoConfig', false, PIXEL_ID);
  n('init', PIXEL_ID);
  return true;
}

/** Sends an event if the pixel runs and the current page is not private. */
export function track(event: string, params?: Record<string, string | number>) {
  if (!web || !startPixel(window.location.pathname) || privatePath(window.location.pathname) || secretInUrl()) return;
  (window as PixelWindow).fbq?.('track', event, params);
}
