/**
 * Pure RFC-4180-ish CSV parser used by the app.
 *
 * Handles quoted fields, escaped double quotes, embedded newlines inside quotes,
 * and both comma and tab delimiters. Returns { headers, rows }.
 *
 * Parsing is intentionally pure: no DOM, no alerts, no side effects.
 * Callers decide what to do with malformed input.
 *
 * @param {string} text
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseCSV(text) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let currentField = '';

  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const nextChar = normalized[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"' && currentField === '') {
        inQuotes = true;
      } else if (char === ',' || char === '\t') {
        row.push(currentField.trim());
        currentField = '';
      } else if (char === '\n') {
        row.push(currentField.trim());
        lines.push(row);
        row = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || row.length > 0) {
    row.push(currentField.trim());
    lines.push(row);
  }

  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0].map((h) => h.trim());
  const rows = lines
    .slice(1)
    .filter((r) => r.length > 0 && r.some((cell) => cell.trim() !== ''))
    .map((r) => r.map((cell) => (cell || '').trim()));

  return { headers, rows };
}

/**
 * Quote-escape a single CSV cell value per RFC 4180.
 * @param {unknown} value
 * @returns {string}
 */
export function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Build a CSV string from headers + rows.
 * @param {string[]} headers
 * @param {string[][]} rows
 * @returns {string}
 */
export function convertToCSV(headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach((row) => lines.push(row.map(csvEscape).join(',')));
  return lines.join('\n');
}

/**
 * HTML-escape a value for safe innerHTML insertion.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[char];
  });
}

/**
 * HTML-escape a value for use inside an HTML attribute (also escapes backticks).
 * @param {unknown} value
 * @returns {string}
 */
export function escapeAttr(value) {
  return escapeHTML(value).replace(/`/g, '&#96;');
}
