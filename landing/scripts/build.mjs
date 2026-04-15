import { execFileSync } from 'node:child_process';
import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const publicDir = path.join(rootDir, 'public');
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
    },
  },
);

await mkdir(distDir, { recursive: true });

try {
  const publicStat = await stat(publicDir);
  if (publicStat.isDirectory()) {
    await cp(publicDir, distDir, { recursive: true });
  }
} catch {}

await writeFile(
  path.join(distDir, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
  'utf8',
);

await writeFile(
  path.join(distDir, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteUrl}/</loc></url>\n  <url><loc>${siteUrl}/how-it-works</loc></url>\n  <url><loc>${siteUrl}/pricing</loc></url>\n  <url><loc>${siteUrl}/faq</loc></url>\n  <url><loc>${siteUrl}/contact</loc></url>\n  <url><loc>${siteUrl}/careers</loc></url>\n  <url><loc>${siteUrl}/privacy-policy</loc></url>\n  <url><loc>${siteUrl}/cookie-policy</loc></url>\n</urlset>\n`,
  'utf8',
);

console.log(`Landing site built at ${distDir}`);
