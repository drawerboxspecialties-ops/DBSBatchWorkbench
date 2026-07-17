export function normalizeTopEdgeName(topEdge) {
  let cleanEdge = String(topEdge || '')
    .replace(/[™®©]/g, '')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^bullnose fa finished$/i.test(cleanEdge)) {
    cleanEdge = 'Bullnose Clear Foil';
  }

  return cleanEdge;
}

export function getEdgeCode(topEdge) {
  const edgeLower = (topEdge || '').toLowerCase().trim();
  if (edgeLower.includes('foil') || edgeLower.includes('bullnose') || edgeLower.includes('clear'))
    return 'CFB';
  if (edgeLower.includes('pvc')) return 'PVC';
  if (edgeLower.includes('tape')) return 'TPE';
  if (edgeLower.includes('raw') || edgeLower.includes('wood')) return 'RAW';

  const sanitized = String(topEdge || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return sanitized.slice(0, 4) || 'EDG';
}
