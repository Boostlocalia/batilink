// Adds a Content-Security-Policy to the exported web app (GitHub Pages cannot send
// security headers). Run after `expo export`: node scripts/add-csp.mjs dist/index.html
import fs from 'node:fs';

const file = process.argv[2] ?? 'dist/index.html';
const supabase = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://bkmzstdviytslegbxsax.supabase.co').replace(/\/$/, '');
const ws = supabase.replace(/^https:/, 'wss:');

const policy = [
  "default-src 'self'",
  "script-src 'self'",
  // react-native-web writes its styles inline.
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} ${ws}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const html = fs.readFileSync(file, 'utf8');
if (html.includes('Content-Security-Policy')) process.exit(0);
// Link previews (WhatsApp, iMessage, LinkedIn…), home-screen icon and installable app.
const site = 'https://app.batinode.be';
const title = 'BatiNode · Une demande de prix, tous vos fournisseurs';
const description = 'Envoyez une demande de prix aux fournisseurs autour de votre chantier et comparez les offres ligne par ligne. Entreprises vérifiées, en français et en néerlandais.';
const share = [
  `<meta name="description" content="${description}" />`,
  '<meta name="theme-color" content="#09090b" />',
  '<meta name="apple-mobile-web-app-title" content="BatiNode" />',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
  '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />',
  '<link rel="manifest" href="/manifest.webmanifest" />',
  '<meta property="og:type" content="website" />',
  '<meta property="og:site_name" content="BatiNode" />',
  `<meta property="og:url" content="${site}/" />`,
  `<meta property="og:title" content="${title}" />`,
  `<meta property="og:description" content="${description}" />`,
  `<meta property="og:image" content="${site}/og-image.png" />`,
  '<meta property="og:image:width" content="1200" />',
  '<meta property="og:image:height" content="630" />',
  '<meta property="og:image:alt" content="Logo BatiNode : une demande de prix, tous vos fournisseurs" />',
  '<meta property="og:locale" content="fr_BE" />',
  '<meta property="og:locale:alternate" content="nl_BE" />',
  '<meta name="twitter:card" content="summary_large_image" />',
  `<meta name="twitter:image" content="${site}/og-image.png" />`,
].join('\n    ');
const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />\n    ${share}\n    `;
// The app opens in French; Dutch speakers switch in the app.
fs.writeFileSync(file, html.replace('<html lang="en">', '<html lang="fr">').replace('<meta charset="utf-8" />\n    ', `<meta charset="utf-8" />\n    ${meta}`));
console.log('CSP added to', file);
