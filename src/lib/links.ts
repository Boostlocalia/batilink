import { Platform } from 'react-native';

/** Public address of the web app (referral links, shared pages). */
export function appUrl(): string {
  const configured = process.env.EXPO_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return 'https://app.batinode.be';
}

export function referralUrl(code: string): string {
  return `${appUrl()}/bienvenue?ref=${encodeURIComponent(code)}`;
}
