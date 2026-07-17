import fs from 'node:fs';
import { parseCSV } from '../src/logic/csv.js';
import { mapHeaders } from '../src/logic/headers.js';
import { splitDataIntoGroups, normalizeTopEdges, defaultFrontTopEdgesFromBacks } from '../src/logic/grouping.js';
import { getCutListPrintSections } from '../src/logic/cutListPrint.js';
import { buildCutListPrintCard } from '../src/ui/cutListPrintView.js';

const csvPath = process.argv[2] || 'c:/Users/kovas/Downloads/OPTICUT.csv';
const text = fs.readFileSync(csvPath, 'utf8');
const { headers, rows } = parseCSV(text);
const colIndices = mapHeaders(headers);
const data = rows;
normalizeTopEdges(data, colIndices);
defaultFrontTopEdgesFromBacks(data, colIndices);

const groups = splitDataIntoGroups(data, colIndices, 999, {}, true, false);

console.log('Batches:', Object.keys(groups).length);
for (const [key, batch] of Object.entries(groups).sort()) {
  const sections = getCutListPrintSections(batch, colIndices);
  console.log(`\n=== ${key} | ${batch.totalBoxes} boxes ===`);
  for (const s of sections) {
    const sumBx = s.rows.reduce((a, r) => a + r.boxes, 0);
    const sumPcs = s.rows.reduce((a, r) => a + r.parts, 0);
    const headerBx = batch.orderColTotals?.[s.order] ?? '?';
    console.log(`Order ${s.order}: header=${headerBx}bx rows=${s.rows.length} sumBx=${sumBx} sumPcs=${sumPcs}`);
    if (sumBx !== headerBx) console.log('  *** BOX MISMATCH ***');
    for (const r of s.rows) {
      if (r.parts % 4 !== 0 && r.boxes === Math.ceil(r.parts / 4)) {
        // partial box - flag
      }
      const odd = r.parts % 4 !== 0 ? ' (partial)' : '';
      console.log(`  W${r.width} FB${r.fbLength} LR${r.lrLength} -> ${r.boxes}bx ${r.parts}pcs${odd}`);
    }
  }
  const html = buildCutListPrintCard(key, batch, colIndices, { index: 1, count: 4 });
  const orderBlocks = (html.match(/cutlist-order-block/g) || []).length;
  const tables = (html.match(/cutlist-table--flow/g) || []).length;
  console.log(`HTML: ${orderBlocks} order blocks, ${tables} tables`);
}
