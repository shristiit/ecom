import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');

const loginUrl = process.env.LOGIN_URL ?? 'https://admin.stockaisle.com/login';

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await cp(srcDir, distDir, { recursive: true });

const indexPath = path.join(distDir, 'index.html');
const indexHtml = await readFile(indexPath, 'utf8');
await writeFile(indexPath, indexHtml.replaceAll('__LOGIN_URL__', loginUrl), 'utf8');

console.log(`Landing site built at ${distDir}`);
