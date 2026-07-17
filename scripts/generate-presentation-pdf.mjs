/**
 * Generates public/PRESENTATION.pdf from public/presentation.html
 * using Puppeteer (print-to-PDF). Run: npm run presentation:pdf
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const htmlPath = join(root, 'public', 'presentation.html');
const pdfPath = join(root, 'public', 'PRESENTATION.pdf');

if (!existsSync(htmlPath)) {
  console.error('Missing public/presentation.html');
  process.exit(1);
}

const html = readFileSync(htmlPath, 'utf8');

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const url = `http://127.0.0.1:${port}/`;

let puppeteer;
try {
  puppeteer = await import('puppeteer');
} catch {
  console.error('Install puppeteer first: npm install --save-dev puppeteer');
  server.close();
  process.exit(1);
}

const browser = await puppeteer.default.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: pdfPath,
    format: 'Letter',
    printBackground: true,
    margin: { top: '0.35in', right: '0.35in', bottom: '0.35in', left: '0.35in' },
  });
  console.log(`Wrote ${pdfPath}`);
} finally {
  await browser.close();
  server.close();
}
