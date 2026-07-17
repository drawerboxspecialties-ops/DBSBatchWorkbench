const SAW_SYNC_URL = 'http://localhost:8787/sync-report';

/**
 * POST the current report to the local saw-dashboard server.
 *
 * Payload shape matches the original index.html syncReportToSaw exactly:
 *   { title, orders, summary, html, syncedBy }
 *
 * @param {object}   payload
 * @param {string}   payload.title      Report title string
 * @param {string[]} payload.orders     Active order IDs
 * @param {object}   payload.summary    { parts, boxes, lf, rips, sheets }
 * @param {string}   payload.html       Full saw-report HTML string
 * @param {string}   [payload.syncedBy] Identifier for the sender
 * @returns {Promise<object>}  Parsed JSON response (may be {})
 * @throws  {Error} on non-OK response or network failure
 */
export async function syncReportToSaw({ title, orders, summary, html, syncedBy }) {
  const response = await fetch(SAW_SYNC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, orders, summary, html, syncedBy }),
  });

  if (!response.ok) {
    throw new Error(`Sync failed with status ${response.status}`);
  }

  return response.json().catch(() => ({}));
}
