import { describe, expect, it } from 'vitest';
import {
  formatDecimalForDisplay,
  getSummaryHeight,
  roundWidthUpToWhole,
  getStackMatrixWidth,
  getNumericSortValue,
  getFractionalSortValue,
  formatWidthQtyNote,
} from '../src/logic/widths.js';

const cols = { w: 3, width: 7 };

describe('formatDecimalForDisplay', () => {
  it('strips trailing zeros from decimals', () => {
    expect(formatDecimalForDisplay('4.500000')).toBe('4.5');
    expect(formatDecimalForDisplay('4.000000')).toBe('4');
    expect(formatDecimalForDisplay('3.937')).toBe('3.937');
  });
  it('returns non-decimals unchanged', () => {
    expect(formatDecimalForDisplay('hello')).toBe('hello');
    expect(formatDecimalForDisplay('12')).toBe('12');
  });
  it('handles null/undefined', () => {
    expect(formatDecimalForDisplay(null)).toBe('');
    expect(formatDecimalForDisplay(undefined)).toBe('');
  });
});

describe('getSummaryHeight (Width vs W rule)', () => {
  it('uses Width (drawer height) when present', () => {
    const row = ['', '', '', '3.937', '', '', '', '4.000000', ''];
    expect(getSummaryHeight(row, cols)).toBe('4.000000');
  });
  it('falls back to W only when the Width column index is missing', () => {
    const row = ['', '', '', '3.937', '', '', '', '', ''];
    expect(getSummaryHeight(row, { w: 3, width: -1 })).toBe('3.937');
  });
  it('returns 0 when Width column exists but is empty (does not fall back to W)', () => {
    const row = ['', '', '', '3.937', '', '', '', '', ''];
    expect(getSummaryHeight(row, cols)).toBe('0');
  });
  it('returns 0 when neither is present', () => {
    const row = ['', '', '', '', '', '', '', '', ''];
    expect(getSummaryHeight(row, cols)).toBe('0');
  });
  it('returns 0 when Width column is -1 and W is empty', () => {
    expect(getSummaryHeight(['', '', '', '', '', '', '', '', ''], { w: 3, width: -1 })).toBe('0');
  });
});

describe('roundWidthUpToWhole', () => {
  it('rounds up to the next whole number', () => {
    expect(roundWidthUpToWhole('3.937')).toBe('4');
    expect(roundWidthUpToWhole('4.000001')).toBe('5');
    expect(roundWidthUpToWhole('4')).toBe('4');
  });
  it('returns 0 for non-positive or non-numeric input', () => {
    expect(roundWidthUpToWhole('0')).toBe('0');
    expect(roundWidthUpToWhole('-5')).toBe('0');
    expect(roundWidthUpToWhole('abc')).toBe('0');
    expect(roundWidthUpToWhole('')).toBe('0');
    expect(roundWidthUpToWhole(null)).toBe('0');
  });
});

describe('getStackMatrixWidth', () => {
  it('rounds the summary height up to a whole number', () => {
    const row = ['', '', '', '3.937', '', '', '', '4.500000', ''];
    expect(getStackMatrixWidth(row, cols)).toBe('5');
  });
});

describe('getNumericSortValue', () => {
  it('parses numbers', () => {
    expect(getNumericSortValue('4.5')).toBe(4.5);
    expect(getNumericSortValue('12')).toBe(12);
  });
  it('returns 0 for non-numeric', () => {
    expect(getNumericSortValue('abc')).toBe(0);
    expect(getNumericSortValue('')).toBe(0);
  });
});

describe('getFractionalSortValue', () => {
  it('parses plain decimals', () => {
    expect(getFractionalSortValue('4.5')).toBe(4.5);
  });
  it('parses "3 1/2" mixed fractions', () => {
    expect(getFractionalSortValue('3 1/2')).toBe(3.5);
  });
  it('parses "1/4" plain fractions', () => {
    expect(getFractionalSortValue('1/4')).toBe(0.25);
  });
  it('returns 0 for empty / non-numeric', () => {
    expect(getFractionalSortValue('')).toBe(0);
    expect(getFractionalSortValue('abc')).toBe(0);
  });
});

describe('formatWidthQtyNote', () => {
  it('formats widths with quantities, sorted highest width first', () => {
    expect(formatWidthQtyNote({ '4.000000': 8, '3.937': 40 })).toBe('4 x8, 3.937 x40');
  });
  it('returns empty string for empty map', () => {
    expect(formatWidthQtyNote({})).toBe('');
  });
});
