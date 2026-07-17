import { describe, expect, it } from 'vitest';
import { parseCSV, csvEscape, convertToCSV, escapeHTML, escapeAttr } from '../src/logic/csv.js';

describe('parseCSV', () => {
  it('parses a simple CSV with headers', () => {
    const { headers, rows } = parseCSV('a,b,c\n1,2,3\n4,5,6');
    expect(headers).toEqual(['a', 'b', 'c']);
    expect(rows).toEqual([
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  it('handles quoted fields with commas inside', () => {
    const { rows } = parseCSV('a,b\n"hello, world",2');
    expect(rows).toEqual([['hello, world', '2']]);
  });

  it('handles escaped double quotes inside quoted fields', () => {
    const { rows } = parseCSV('a\n"He said ""hi"""');
    expect(rows).toEqual([['He said "hi"']]);
  });

  it('handles embedded newlines inside quoted fields', () => {
    const { rows } = parseCSV('a\n"line1\nline2"');
    expect(rows).toEqual([['line1\nline2']]);
  });

  it('handles CRLF and CR line endings', () => {
    const { rows } = parseCSV('a,b\r\n1,2\r3,4');
    expect(rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('handles tab-delimited input', () => {
    const { rows } = parseCSV('a\tb\n1\t2');
    expect(rows).toEqual([['1', '2']]);
  });

  it('trims cell whitespace', () => {
    const { rows } = parseCSV('a\n  hello  ');
    expect(rows).toEqual([['hello']]);
  });

  it('skips blank rows', () => {
    const { rows } = parseCSV('a\n1\n\n\n2');
    expect(rows).toEqual([['1'], ['2']]);
  });

  it('returns empty headers/rows for empty input', () => {
    expect(parseCSV('')).toEqual({ headers: [], rows: [] });
  });

  it('returns empty headers/rows for header-only input', () => {
    expect(parseCSV('a,b,c')).toEqual({ headers: [], rows: [] });
  });

  it('strips residual double quotes from cells', () => {
    const { headers, rows } = parseCSV('"a","b"\n"1","2"');
    expect(headers).toEqual(['a', 'b']);
    expect(rows).toEqual([['1', '2']]);
  });
});

describe('csvEscape / convertToCSV', () => {
  it('quotes a plain value', () => {
    expect(csvEscape('hello')).toBe('"hello"');
  });

  it('doubles embedded double quotes', () => {
    expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""');
  });

  it('handles null/undefined as empty', () => {
    expect(csvEscape(null)).toBe('""');
    expect(csvEscape(undefined)).toBe('""');
  });

  it('converts headers + rows to CSV', () => {
    expect(convertToCSV(['a', 'b'], [['1', '2'], ['3', '4']])).toBe('"a","b"\n"1","2"\n"3","4"');
  });

  it('escapes commas in cells during conversion', () => {
    expect(convertToCSV(['a'], [['1,2']])).toBe('"a"\n"1,2"');
  });
});

describe('escapeHTML / escapeAttr', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHTML('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    );
  });

  it('escapes ampersands', () => {
    expect(escapeHTML('a & b')).toBe('a &amp; b');
  });

  it('handles null/undefined as empty string', () => {
    expect(escapeHTML(null)).toBe('');
    expect(escapeHTML(undefined)).toBe('');
  });

  it('escapeAttr also escapes backticks', () => {
    expect(escapeAttr('`code`')).toBe('&#96;code&#96;');
  });
});
