import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const expoBin = path.join(rootDir, '..', 'node_modules', '.bin', 'expo');

const siteUrl = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://stockaisle.com';

await rm(distDir, { recursive: true, force: true });

execFileSync(
  expoBin,
  ['export', '--platform', 'web', '--output-dir', 'dist'],
  {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      EXPO_PUBLIC_LOGIN_URL: process.env.EXPO_PUBLIC_LOGIN_URL ?? 'https://admin.stockaisle.com',
      EXPO_PUBLIC_SITE_URL: siteUrl,
      EXPO_PUBLIC_MS_FORMS_URL: process.env.EXPO_PUBLIC_MS_FORMS_URL ?? '',
      EXPO_PUBLIC_RECAPTCHA_SITE_KEY:
        process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY ?? '6LffaLYsAAAAABkEv1tP3xdicF6uM6oauyydT0xK',
    },
  },
);

await mkdir(distDir, { recursive: true });

await writeFile(
  path.join(distDir, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
  'utf8',
);

await writeFile(
  path.join(distDir, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteUrl}/</loc></url>\n  <url><loc>${siteUrl}/careers</loc></url>\n  <url><loc>${siteUrl}/faq</loc></url>\n  <url><loc>${siteUrl}/privacy-policy</loc></url>\n  <url><loc>${siteUrl}/cookie-policy</loc></url>\n</urlset>\n`,
  'utf8',
);

console.log(`Landing site built at ${distDir}`);
