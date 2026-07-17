import { getMaterialCategory, isUnsupportedMdfPbcTopEdge } from './calculatorLogic.js';

export const CATEGORY_PLYWOOD  = 'PLYWOOD SIDES';
export const CATEGORY_FAA      = 'FAA SIDES';
export const CATEGORY_SOLID    = 'SOLID SIDES';
export const CATEGORY_MDF      = 'MDF / PBC / PVC & TAPE SIDES';

export const CATEGORIES = [CATEGORY_PLYWOOD, CATEGORY_FAA, CATEGORY_SOLID, CATEGORY_MDF];

/**
 * Return short display name for a category key.
 * @param {string} category
 * @returns {string}
 */
export function getCategoryDisplayName(category) {
  const names = {
    [CATEGORY_PLYWOOD]: 'Plywood',
    [CATEGORY_SOLID]:   'Solid',
    [CATEGORY_FAA]:     'FAA',
    [CATEGORY_MDF]:     'MDF / PBC',
  };
  return names[category] || category;
}

/**
 * Aggregate parsed items into category groups with exact math from original.
 *
 * Group key: topEdge|material|height
 *
 * Dimensional rows:
 *   perimeter = (2 * depth) + (2 * width)
 *   parts    += qty * 4
 *   totalInches += perimeter * qty
 *
 * preCalculated rows:
 *   boxes          += item.qty  (already computed per item in parseCSV)
 *   parts          += item.parts
 *   preCalculatedLF    += item.lf
 *   preCalculatedRips  += item.rips
 *
 * Final per-group:
 *   lf   = hasPreCalculated ? preCalculatedLF : totalInches / 12 ; ceil
 *   ripSize = birch(!faa) ? 60 : 96.5
 *   rips = hasPreCalculated ? preCalculatedRips : totalInches / ripSize ; ceil
 *   boxes = hasPreCalculated && parts > 0 ? ceil(parts / 4) : g.boxes
 *
 * @param {object[]} reportItems  Items from parseTopEdgeCSV (filtered by getActiveItems)
 * @returns {{ groupedCategories: object, groups: object[] }}
 */
export function buildReportData(reportItems) {
  const groupedCategories = {
    [CATEGORY_PLYWOOD]: [],
    [CATEGORY_FAA]:     [],
    [CATEGORY_SOLID]:   [],
    [CATEGORY_MDF]:     [],
  };

  const rawGroups = {};

  reportItems.forEach(item => {
    const key = `${item.topEdge}|${item.material}|${item.height}`;
    if (!rawGroups[key]) {
      rawGroups[key] = {
        topEdge: item.topEdge,
        material: item.material,
        height: item.height,
        boxes: 0,
        parts: 0,
        totalInches: 0,
        preCalculatedLF: 0,
        preCalculatedRips: 0,
        hasPreCalculated: false,
        orderIds: [],
      };
    }

    if (item.orderId && !rawGroups[key].orderIds.includes(item.orderId)) {
      rawGroups[key].orderIds.push(item.orderId);
    }

    if (item.preCalculated) {
      rawGroups[key].boxes            += item.qty;
      rawGroups[key].parts            += item.parts;
      rawGroups[key].preCalculatedLF  += item.lf;
      rawGroups[key].preCalculatedRips += item.rips;
      rawGroups[key].hasPreCalculated  = true;
    } else {
      const perimeter = (2 * item.depth) + (2 * item.width);
      rawGroups[key].boxes       += item.qty;
      rawGroups[key].parts       += item.qty * 4;
      rawGroups[key].totalInches += perimeter * item.qty;
    }
  });

  const groups = [];

  for (const k in rawGroups) {
    const g = rawGroups[k];
    const cat = getMaterialCategory(g.material, g.topEdge);

    const lf = g.hasPreCalculated ? g.preCalculatedLF : (g.totalInches / 12);

    const isBalticBirch = g.material.toLowerCase().includes('birch') && !g.material.toLowerCase().includes('faa');
    const ripSize = isBalticBirch ? 60.0 : 96.5;
    const ripLabel = isBalticBirch ? '60" (5x5)' : '96.5"';
    const rips = g.hasPreCalculated ? g.preCalculatedRips : (g.totalInches / ripSize);

    const lfRound   = Math.ceil(lf);
    const ripsRound = Math.ceil(rips);
    const parts     = g.parts;
    const boxes     = g.hasPreCalculated && parts > 0 ? Math.ceil(parts / 4) : g.boxes;

    const groupObj = {
      topEdge:           g.topEdge,
      material:          g.material,
      height:            g.height,
      unsupportedTopEdge: isUnsupportedMdfPbcTopEdge(g.material, g.topEdge),
      boxes,
      parts,
      lf:      lfRound,
      rips:    ripsRound,
      ripSize: ripLabel,
      category: cat,
      orderIds: g.orderIds,
    };

    groupedCategories[cat].push(groupObj);
    groups.push(groupObj);
  }

  return { groupedCategories, groups };
}
