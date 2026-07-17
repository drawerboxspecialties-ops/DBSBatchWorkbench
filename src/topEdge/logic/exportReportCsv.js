import { getCategoryDisplayName } from './buildReportData.js';

function escapeCSV(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/**
 * Build the CSV export string from computed report groups.
 * Returns a plain string — caller is responsible for downloading it.
 *
 * Columns: Category, Top Edge, Material, Boxes, Parts, Height,
 *          LF (Rounded), Rips (Rounded), Rip Size
 *
 * @param {object[]} groups        Report groups from buildReportData
 * @param {object}   [options]
 * @param {string}   [options.notesInput]        Active orders / notes text
 * @param {boolean}  [options.includeRemovedNote] Add "includes removed rows" header
 * @returns {string}
 */
export function buildExportCsvString(groups, { notesInput = '', includeRemovedNote = false } = {}) {
  const rows = [];

  if (notesInput) {
    rows.push(escapeCSV(`Orders Included in Batch: ${notesInput}`));
    rows.push('');
  }

  if (includeRemovedNote) {
    rows.push(escapeCSV('Export includes rows removed from the live report.'));
    rows.push('');
  }

  rows.push(
    ['Category', 'Top Edge', 'Material', 'Boxes', 'Parts', 'Height', 'LF (Rounded)', 'Rips (Rounded)', 'Rip Size']
      .map(escapeCSV)
      .join(',')
  );

  groups.forEach(g => {
    rows.push(
      [
        getCategoryDisplayName(g.category),
        g.topEdge,
        g.material,
        g.boxes,
        g.parts,
        g.height,
        g.lf,
        g.rips,
        g.ripSize,
      ]
        .map(escapeCSV)
        .join(',')
    );
  });

  const grandBoxes = groups.reduce((a, b) => a + b.boxes, 0);
  const grandParts = groups.reduce((a, b) => a + b.parts, 0);
  const grandLF    = groups.reduce((a, b) => a + b.lf, 0);
  const grandRips  = groups.reduce((a, b) => a + b.rips, 0);

  rows.push('');
  rows.push(
    ['TOTAL BATCH', '', '', grandBoxes, grandParts, '', grandLF, grandRips, '']
      .map(escapeCSV)
      .join(',')
  );

  return rows.join('\n');
}
