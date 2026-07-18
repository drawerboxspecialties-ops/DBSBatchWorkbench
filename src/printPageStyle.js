const STYLE_ID = 'dbs-print-page-style';

/**
 * Inject a print-only @page rule for the current print job.
 * Needed because OptiCut is landscape and Top Edge is portrait — a single
 * static @page in CSS cannot serve both tools in one app.
 *
 * @param {'opticut' | 'top-edge'} mode
 */
export function setPrintPageStyle(mode) {
  clearPrintPageStyle();
  const style = document.createElement('style');
  style.id = STYLE_ID;
  if (mode === 'top-edge') {
    style.textContent = '@media print { @page { size: letter; margin: 0; } }';
  } else {
    style.textContent = '@media print { @page { size: letter landscape; margin: 0.12in; } }';
  }
  document.head.appendChild(style);
}

export function clearPrintPageStyle() {
  document.getElementById(STYLE_ID)?.remove();
}
