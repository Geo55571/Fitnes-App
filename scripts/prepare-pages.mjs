// Cloudflare Pages' uploader skips any directory named `node_modules`, but Expo's web export
// places bundled fonts and images under dist/assets/node_modules/… — so on Pages they'd be
// missing (icon fonts silently fail). Move them to assets/vendor/ and rewrite references.
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const from = path.join(dist, 'assets', 'node_modules');
const to = path.join(dist, 'assets', 'vendor');

if (!fs.existsSync(from)) {
  console.log('prepare-pages: nothing to move');
  process.exit(0);
}
fs.rmSync(to, { recursive: true, force: true });
fs.renameSync(from, to);

let files = 0;
let refs = 0;
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(js|html|json|css|map)$/.test(entry.name)) {
      const text = fs.readFileSync(p, 'utf8');
      const count = text.split('/assets/node_modules/').length - 1;
      if (count) {
        fs.writeFileSync(p, text.replaceAll('/assets/node_modules/', '/assets/vendor/'));
        files++;
        refs += count;
      }
    }
  }
};
walk(dist);
console.log(`prepare-pages: moved assets/node_modules → assets/vendor, rewrote ${refs} references in ${files} files`);
