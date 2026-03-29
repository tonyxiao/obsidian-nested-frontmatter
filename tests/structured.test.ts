import { describe, expect, it } from 'vitest';
import { classifyStructuredValue, parseWikilink, tryParseStructuredValue } from '../src/structured';

describe('structured parsing', () => {
  it('parses nested arrays and objects', () => {
    expect(tryParseStructuredValue('[{"listing":"[[room-a]]","dates":["2024-01-01"]}]')).toEqual([
      { listing: '[[room-a]]', dates: ['2024-01-01'] },
    ]);
  });

  it('keeps already-structured values', () => {
    const value = [{ listing: '[[room-a]]' }];
    expect(tryParseStructuredValue(value)).toBe(value);
  });

  it('ignores plain strings', () => {
    expect(tryParseStructuredValue('hello')).toBeNull();
  });

  it('extracts wikilinks with aliases', () => {
    expect(parseWikilink('[[room-a|Room A]]')).toEqual({
      linkPath: 'room-a',
      displayText: 'Room A',
    });
  });

  it('ignores wikilink headings when building display text', () => {
    expect(parseWikilink('[[room-a#Availability]]')).toEqual({
      linkPath: 'room-a',
      displayText: 'room-a',
    });
  });

  it('skips unchanged structured content', () => {
    expect(classifyStructuredValue('[{"listing":"[[room-a]]"}]', '[{"listing":"[[room-a]]"}]')).toEqual({
      structuredValue: [{ listing: '[[room-a]]' }],
      shouldRender: false,
    });
  });
});
