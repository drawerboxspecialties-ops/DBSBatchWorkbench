/**
 * Minimal Code 128 (subset B) SVG barcode for batch keys.
 * Encodes printable ASCII (32–126) — enough for OptiCut batch names.
 */

/** Code 128 patterns: 11 modules each (bar/space widths), values 0–106. */
const PATTERNS = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
];

const START_B = 104;
const STOP = 106;

/**
 * Encode text as Code 128B symbol values (including start + checksum + stop).
 * @param {string} text
 * @returns {number[] | null}
 */
export function encodeCode128Values(text) {
  const raw = String(text ?? '');
  if (!raw.length) return null;
  const values = [START_B];
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code < 32 || code > 126) return null;
    values.push(code - 32);
  }
  let checksum = values[0];
  for (let i = 1; i < values.length; i += 1) {
    checksum += values[i] * i;
  }
  values.push(checksum % 103);
  values.push(STOP);
  return values;
}

/**
 * Build an inline SVG Code 128 barcode.
 * @param {string} text
 * @param {{ height?: number, moduleWidth?: number, includeLabel?: boolean }} [options]
 * @returns {string} SVG markup, or empty string if text cannot be encoded
 */
export function buildCode128Svg(text, options = {}) {
  const values = encodeCode128Values(text);
  if (!values) return '';

  const moduleWidth = Math.max(1, Number(options.moduleWidth) || 1.4);
  const barHeight = Math.max(20, Number(options.height) || 36);
  const includeLabel = options.includeLabel !== false;
  const label = String(text);
  const labelH = includeLabel ? 12 : 0;
  const quiet = 10;

  let x = quiet;
  const rects = [];
  values.forEach((value) => {
    const pattern = PATTERNS[value];
    if (!pattern) return;
    let drawBar = true;
    for (let i = 0; i < pattern.length; i += 1) {
      const w = Number(pattern[i]) * moduleWidth;
      if (drawBar) {
        rects.push(
          `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${barHeight}" fill="#000"/>`
        );
      }
      x += w;
      drawBar = !drawBar;
    }
  });

  const width = x + quiet;
  const height = barHeight + labelH + (includeLabel ? 2 : 0);
  const labelSvg = includeLabel
    ? `<text x="${(width / 2).toFixed(2)}" y="${barHeight + 11}" text-anchor="middle" font-family="ui-monospace, Consolas, monospace" font-size="9" fill="#111">${escapeXml(label)}</text>`
    : '';

  return `<svg class="code128-barcode" xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(2)}" height="${height}" viewBox="0 0 ${width.toFixed(2)} ${height}" role="img" aria-label="${escapeXml(label)}">${rects.join('')}${labelSvg}</svg>`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
