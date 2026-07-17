import { cleanMaterialName } from './materialNames.js';

export const CATEGORY_CODES = {
  'PLYWOOD SIDES': 'PLY',
  'FAA SIDES': 'FAA',
  'SOLID SIDES': 'SLD',
  'MDF / PBC / PVC & TAPE SIDES': 'MDF',
};

/**
 * Decide which material category a row belongs to.
 *
 * Order of checks mirrors the original implementation exactly:
 *   1. FAA-prefixed materials -> FAA SIDES
 *   2. MDF/PBC/melamine/particle, or PVC/tape edges -> MDF / PBC / PVC & TAPE SIDES
 *   3. ply/birch -> PLYWOOD SIDES
 *   4. solid wood species keywords -> SOLID SIDES
 *   5. fallback -> MDF / PBC / PVC & TAPE SIDES
 *
 * @param {string} material
 * @param {string} topEdge
 * @returns {string}
 */
export function getMaterialCategory(material, topEdge) {
  if (!material) return 'MDF / PBC / PVC & TAPE SIDES';
  const matLower = cleanMaterialName(material).toLowerCase().trim();
  const edgeLower = (topEdge || '').toLowerCase().trim();

  if (matLower.startsWith('faa') || matLower.includes('faa:')) return 'FAA SIDES';

  if (
    matLower.startsWith('mdf') ||
    matLower.startsWith('pbc') ||
    matLower.includes('melamine') ||
    matLower.includes('particle') ||
    edgeLower.includes('pvc') ||
    edgeLower.includes('tape')
  ) {
    return 'MDF / PBC / PVC & TAPE SIDES';
  }

  if (matLower.includes('ply') || matLower.includes('birch')) return 'PLYWOOD SIDES';

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

  return 'MDF / PBC / PVC & TAPE SIDES';
}
