function normalizeFilterValue(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Filter the full items array down to only those that are active (not removed).
 *
 * Matches the original getActiveItems logic exactly:
 *  - If no filter state is set, returns items unchanged (fast path).
 *  - An item passes if:
 *      its orderId is in activeOrderIds (or the item has no orderId), AND
 *      its material is not in removedMaterials (case-insensitive), AND
 *      its topEdge is not in removedTopEdges (case-insensitive).
 *
 * @param {object[]} items
 * @param {object}   filterState
 * @param {string[]} filterState.activeOrderIds
 * @param {string[]} filterState.removedOrderIds
 * @param {string[]} filterState.removedMaterials
 * @param {string[]} filterState.removedTopEdges
 * @returns {object[]}
 */
export function getActiveItems(items, { activeOrderIds, removedOrderIds, removedMaterials, removedTopEdges }) {
  if (
    activeOrderIds.length === 0 &&
    removedOrderIds.length === 0 &&
    removedMaterials.length === 0 &&
    removedTopEdges.length === 0
  ) {
    return items;
  }

  const removedMaterialKeys = removedMaterials.map(normalizeFilterValue);
  const removedTopEdgeKeys  = removedTopEdges.map(normalizeFilterValue);

  return items.filter(item => {
    const orderAllowed    = !item.orderId || activeOrderIds.includes(item.orderId);
    const materialAllowed = !removedMaterialKeys.includes(normalizeFilterValue(item.material));
    const topEdgeAllowed  = !removedTopEdgeKeys.includes(normalizeFilterValue(item.topEdge));
    return orderAllowed && materialAllowed && topEdgeAllowed;
  });
}
