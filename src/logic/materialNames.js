export function cleanMaterialName(material) {
  if (material && material.includes(',')) {
    return material.split(',')[0].trim();
  }
  return (material || '').trim();
}

export function cleanExportMaterialCharacters(value) {
  return String(value || '')
    .replace(/[™®©]/g, '')
    .replace(/[^A-Za-z0-9 -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeThicknessText(value) {
  return String(value || '')
    .replace(/\b(\d+)\s*mm\b/gi, '$1mm')
    .replace(/\b(\d+)\s*m\b/gi, '$1mm')
    .replace(/\b(\d+)\s+(\d+)\/(\d+)\b/g, '$1-$2-$3')
    .replace(/\b(\d+)\/(\d+)\b/g, '$1-$2')
    .replace(/\b(\d{1,2})\s+(\d{1,2})\b/g, '$1-$2');
}

export function extractThicknessTokens(value) {
  const matches =
    normalizeThicknessText(value).match(/\b\d+(?:-\d+){0,2}\s*(?:mm|mil|in|inch|inches)?\b/gi) || [];
  return [...new Set(matches.map(cleanExportMaterialCharacters).filter(Boolean))];
}

export function removeExportToken(value, token) {
  if (!token) return value;
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.replace(new RegExp(`\\b${escapedToken}\\b`, 'i'), ' ').replace(/\s+/g, ' ').trim();
}

export function formatExportMaterialWordOrder(value, thicknessTokens) {
  const modifierTokens = [];
  let name = value.replace(/\s+/g, ' ').trim();

  if (/\bPF\b/i.test(name)) {
    modifierTokens.push('PF');
    name = removeExportToken(name, 'PF');
  }

  thicknessTokens.forEach((token) => {
    name = removeExportToken(name, token);
  });

  return [name]
    .concat(modifierTokens, thicknessTokens)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function shortenExportMaterialName(value, requiredTokens) {
  const name = value.replace(/\s+/g, ' ').trim();
  if (name.length <= 32) return name;

  const suffixTokens = requiredTokens.filter((token) => token && name.includes(token));
  let baseName = name;
  suffixTokens.forEach((token) => {
    baseName = removeExportToken(baseName, token);
  });

  const baseWords = baseName.split(' ').filter(Boolean);
  const suffix = suffixTokens.join(' ');
  let shortened = [baseWords.join(' '), suffix].filter(Boolean).join(' ').trim();

  while (shortened.length > 32 && baseWords.length > 0) {
    baseWords.pop();
    shortened = [baseWords.join(' '), suffix].filter(Boolean).join(' ').trim();
  }

  if (shortened.length <= 32) return shortened;
  return shortened.slice(0, 32).trim();
}

export function shortenLongMaterialWords(value) {
  return String(value || '')
    .split(' ')
    .map((word, idx, words) => {
      const isFirst = idx === 0;
      const isLast = idx === words.length - 1;
      if (isFirst || isLast || word.length <= 8 || /^[A-Z0-9-]+$/.test(word)) {
        return word;
      }
      return word.slice(0, 4);
    })
    .join(' ');
}

export function getExportMaterialName(material) {
  const originalName = cleanMaterialName(material);
  const thicknessTokens = extractThicknessTokens(originalName);
  let name = normalizeThicknessText(originalName)
    .replace(/\bprefinsihed\b/gi, 'PF')
    .replace(/\bprefinished\b/gi, 'PF')
    .replace(/\bpre[\s-]*finished\b/gi, 'PF')
    .replace(/\bhard[\s-]*rock[\s-]*melamine\b/gi, 'HRM')
    .replace(/\bhardrock[\s-]*melamine\b/gi, 'HRM')
    .replace(/\bhard[\s-]*rock[\s-]*maple\b/gi, 'HRM')
    .replace(/\bhardrock[\s-]*maple\b/gi, 'HRM')
    .replace(/\bplywood\b/gi, 'ply')
    .replace(/\bparticle[\s-]*board\b/gi, 'PB');

  name = cleanExportMaterialCharacters(name);
  name = formatExportMaterialWordOrder(name, thicknessTokens);
  name = shortenLongMaterialWords(name);
  return shortenExportMaterialName(name, thicknessTokens);
}
