// Product and assistant names, in one place so they can be changed in a minute.
// Import-free: the app re-exports it (src/constants/brand.ts) and the e-mails use it.

export const APP_NAME = 'BatiNode';

/** The AI assistant that welcomes people and answers their questions. */
export const ASSISTANT_NAME = 'Nodi';

/** Wordmark shown at the top of every e-mail, served by the web app (public/brand). 400 x 95, shown at 200 x 47. */
export const EMAIL_LOGO_URL = 'https://app.batinode.be/brand/batinode-logo-email.png';

/** The same wordmark in dark letters, for the plain white e-mails written in a client's name. */
export const EMAIL_LOGO_LIGHT_URL = 'https://app.batinode.be/brand/batinode-logo-email-light.png';

// BatiNode's social pages, shown in the app and at the foot of the e-mails.
// A page with no address yet shows its logo without a link.
export const SOCIAL_LINKS: { key: 'instagram' | 'facebook' | 'linkedin' | 'tiktok'; label: string; url: string | null }[] = [
  { key: 'instagram', label: 'Instagram', url: null },
  { key: 'facebook', label: 'Facebook', url: null },
  { key: 'linkedin', label: 'LinkedIn', url: null },
  { key: 'tiktok', label: 'TikTok', url: null },
];
export const SOCIAL_ICON_URL = (key: string) => `https://app.batinode.be/brand/social/${key}.png`;
