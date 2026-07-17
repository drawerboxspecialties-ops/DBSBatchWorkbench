export function formatInches(value) {
  return Number(value).toFixed(2).replace(/\.?0+$/, '');
}

export function getSheetWidth(material) {
  const materialLower = String(material || '').toLowerCase();
  if (materialLower.includes('birch') || materialLower.includes('(60)')) {
    return 60;
  }
  return 48;
}

export function parseFraction(valStr) {
  valStr = String(valStr ?? '')
    .trim()
    .replace(/[""″]/g, '')
    .replace(/\bin(?:ches)?\.?$/i, '')
    .replace(/^(-?\d+)-(\d+\/\d+)$/, '$1 $2')
    .replace(/\s+/g, ' ');

  if (!valStr) return 0;

  if (valStr.includes('/')) {
    const parts = valStr.split(' ');
    let whole = 0;
    let fraction = parts[0];

    if (parts.length === 2) {
      whole = Number(parts[0]);
      fraction = parts[1];
    }

    const fracParts = fraction.split('/');
    const numerator = Number(fracParts[0]);
    const denominator = Number(fracParts[1]);

    if (!Number.isFinite(whole) || !Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return 0;
    }

    return whole + (numerator / denominator);
  }

  const parsed = Number(valStr);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function materialGetsTopEdgeAllowance(material = '') {
  const matLower = String(material || '').toLowerCase().trim();
  return (
    matLower.startsWith('faa') ||
    matLower.includes('faa:') ||
    matLower.includes('ply') ||
    matLower.includes('birch') ||
    matLower.includes('solid') ||
    matLower.includes('alder') ||
    matLower.includes('mahogany') ||
    matLower.includes('cedar') ||
    matLower.includes('beech') ||
    matLower.includes('maple') ||
    matLower.includes('oak') ||
    matLower.includes('cherry') ||
    matLower.includes('walnut') ||
    matLower.includes('fir')
  );
}

export function isMdfPbcMaterial(material = '') {
  const matLower = String(material || '').toLowerCase().trim();
  return matLower.startsWith('mdf') || matLower.startsWith('pbc') || matLower.includes('melamine') || matLower.includes('particle');
}

export function topEdgeGetsAllowance(topEdge = '') {
  const edgeLower = String(topEdge || '').toLowerCase().trim();
  if (!edgeLower) return false;
  if (edgeLower.includes('pvc') || edgeLower.includes('tape') || edgeLower.includes('band')) {
    return false;
  }
  return edgeLower.includes('bullnose') || edgeLower.includes('flat') || edgeLower.includes('foil');
}

export function getCutHeight(height, topEdge = '', material = '') {
  const parsedHeight = Number(height);
  if (!Number.isFinite(parsedHeight) || parsedHeight <= 0) {
    return 0;
  }

  const edgeAllowance = materialGetsTopEdgeAllowance(material) && topEdgeGetsAllowance(topEdge) ? 0.2 : 0;
  return Number((Math.ceil(parsedHeight) + edgeAllowance).toFixed(2));
}

export function isUnsupportedMdfPbcTopEdge(material = '', topEdge = '') {
  return isMdfPbcMaterial(material) && topEdgeGetsAllowance(topEdge);
}

export function getMaterialCategory(material, topEdge) {
  const matLower = String(material || '').toLowerCase().trim();
  const edgeLower = String(topEdge || '').toLowerCase().trim();

  if (matLower.startsWith('faa') || matLower.includes('faa:')) {
    return 'FAA SIDES';
  }

  if (edgeLower.includes('pvc') || edgeLower.includes('tape') || edgeLower.includes('wood tape')) {
    return 'MDF / PBC / PVC & TAPE SIDES';
  }

  if (matLower.includes('ply') || matLower.includes('birch')) {
    return 'PLYWOOD SIDES';
  }

  if (
    matLower.startsWith('uf') ||
    matLower.startsWith('pf') ||
    matLower.includes('solid') ||
    matLower.includes('alder') ||
    matLower.includes('mahogany') ||
    matLower.includes('cedar') ||
    matLower.includes('beech') ||
    matLower.includes('maple') ||
    matLower.includes('oak') ||
    matLower.includes('cherry') ||
    matLower.includes('walnut') ||
    matLower.includes('fir')
  ) {
    return 'SOLID SIDES';
  }

  if (matLower.startsWith('mdf') || matLower.startsWith('pbc') || matLower.includes('melamine') || matLower.includes('particle')) {
    return 'MDF / PBC / PVC & TAPE SIDES';
  }

  return 'MDF / PBC / PVC & TAPE SIDES';
}

export function packRipHeights(heights, usableWidth, kerf) {
  const sheets = [];
  const sortedHeights = [...heights].sort((a, b) => b - a);

  sortedHeights.forEach(height => {
    let bestSheet = null;
    let bestRemaining = Infinity;

    sheets.forEach(sheet => {
      const nextUsed = sheet.rips.length === 0 ? height : sheet.used + kerf + height;
      if (nextUsed <= usableWidth && usableWidth - nextUsed < bestRemaining) {
        bestSheet = sheet;
        bestRemaining = usableWidth - nextUsed;
      }
    });

    if (!bestSheet) {
      bestSheet = { rips: [], used: 0 };
      sheets.push(bestSheet);
    }

    bestSheet.used = bestSheet.rips.length === 0 ? height : bestSheet.used + kerf + height;
    bestSheet.rips.push(height);
  });

  return sheets;
}

export function summarizeSheetPatterns(sheets, usableWidth) {
  const patternMap = {};

  sheets.forEach(sheet => {
    const counts = {};
    sheet.rips.forEach(height => {
      const key = formatInches(height);
      counts[key] = (counts[key] || 0) + 1;
    });

    const ripCounts = Object.keys(counts)
      .map(Number)
      .sort((a, b) => b - a)
      .map(height => ({ height: formatInches(height), count: counts[formatInches(height)] }));
    const pattern = ripCounts.map(rip => `${rip.height}x${rip.count}`).join('|');
    const waste = formatInches(usableWidth - sheet.used);
    const key = `${pattern}|${waste}`;

    if (!patternMap[key]) {
      patternMap[key] = { ripCounts, waste, count: 0 };
    }
    patternMap[key].count++;
  });

  return Object.values(patternMap).sort((a, b) => b.count - a.count || Number(a.waste) - Number(b.waste));
}

export function getCutOptimizationGroups(list, catName) {
  if (catName === 'SOLID SIDES' || catName === 'FAA SIDES') return [];

  const kerf = 0.188;
  const trimPerSide = 0.25;
  const grouped = {};

  list.forEach(row => {
    const sheetWidth = getSheetWidth(row.material);
    const key = `${row.topEdge}|${row.material}|${sheetWidth}`;
    if (!grouped[key]) {
      grouped[key] = {
        topEdge: row.topEdge,
        material: row.material,
        sheetWidth,
        usableWidth: sheetWidth - (2 * trimPerSide),
        heights: []
      };
    }

    for (let i = 0; i < row.rips; i++) {
      grouped[key].heights.push(row.height);
    }
  });

  return Object.values(grouped)
    .sort((a, b) =>
      String(a.material).localeCompare(String(b.material), undefined, { sensitivity: 'base' }) ||
      String(a.topEdge).localeCompare(String(b.topEdge), undefined, { sensitivity: 'base' }) ||
      a.sheetWidth - b.sheetWidth
    )
    .map(group => {
      const sheets = packRipHeights(group.heights, group.usableWidth, kerf);
      return {
        ...group,
        kerf,
        trimPerSide,
        sheets,
        patterns: summarizeSheetPatterns(sheets, group.usableWidth)
      };
    });
}

export function getOptimizedSheetTotal(list, catName) {
  return getCutOptimizationGroups(list, catName).reduce((total, group) => total + group.sheets.length, 0);
}
