export function scatterOrdersIntoChunks(sortedOrders, maxOrders) {
  const limit = Math.max(1, parseInt(maxOrders) || sortedOrders.length || 1);
  const chunkCount = Math.max(1, Math.ceil(sortedOrders.length / limit));
  const chunks = Array.from({ length: chunkCount }, () => []);

  sortedOrders.forEach((order, idx) => {
    chunks[idx % chunkCount].push(order);
  });

  validateOrderChunks(sortedOrders, chunks, limit);
  return chunks;
}

export function validateOrderChunks(sourceOrders, chunks, limit) {
  const seen = new Set();

  chunks.forEach((chunk) => {
    if (chunk.length > limit) {
      throw new Error('A split batch exceeds the max order limit.');
    }

    chunk.forEach((order) => {
      if (seen.has(order)) {
        throw new Error(`Order ${order} appears in more than one split batch.`);
      }
      seen.add(order);
    });
  });

  if (seen.size !== sourceOrders.length) {
    throw new Error('One or more orders are missing from split batches.');
  }
}
