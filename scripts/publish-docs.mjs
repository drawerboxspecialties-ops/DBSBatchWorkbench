import { cpSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';

rmSync('docs', { recursive: true, force: true });
mkdirSync('docs', { recursive: true });
cpSync('dist', 'docs', { recursive: true });

// GitHub Pages: disable Jekyll so _assets / dotfiles are served.
writeFileSync('docs/.nojekyll', '');

if (existsSync('public/samples')) {
  mkdirSync('docs/samples', { recursive: true });
  cpSync('public/samples', 'docs/samples', { recursive: true });
}

console.log('Copied dist/ → docs/ for GitHub Pages');
