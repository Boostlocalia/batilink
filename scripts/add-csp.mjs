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
const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />\n    `;
// The app opens in French; Dutch speakers switch in the app.
fs.writeFileSync(file, html.replace('<html lang="en">', '<html lang="fr">').replace('<meta charset="utf-8" />\n    ', `<meta charset="utf-8" />\n    ${meta}`));
console.log('CSP added to', file);
