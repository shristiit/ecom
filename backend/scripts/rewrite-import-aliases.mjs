import fs from 'node:fs';
import path from 'node:path';

const distRoot = path.resolve('dist');

const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
}

if (fs.existsSync(distRoot)) {
  walk(distRoot);
}

for (const filePath of files) {
  const directory = path.dirname(filePath);
  const source = fs.readFileSync(filePath, 'utf8');

  const rewritten = source.replace(/(['"])@backend\/([^'"]+)\1/g, (_match, quote, subpath) => {
    const target = path.join(distRoot, subpath);
    let relativePath = path.relative(directory, target).split(path.sep).join('/');

    if (!relativePath.startsWith('.')) {
      relativePath = `./${relativePath}`;
    }

    return `${quote}${relativePath}${quote}`;
  });

  if (rewritten !== source) {
    fs.writeFileSync(filePath, rewritten);
  }
}
