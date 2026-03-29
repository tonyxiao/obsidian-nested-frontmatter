export interface ParsedWikilink {
  displayText: string;
  linkPath: string;
}

export interface StructuredClassification {
  shouldRender: boolean;
  structuredValue: StructuredValue | null;
}

export type StructuredScalar = string | number | boolean | null;
export interface StructuredObject {
  [key: string]: StructuredValue;
}
export type StructuredValue = StructuredScalar | StructuredObject | StructuredValue[];

export function isPlainObject(value: unknown): value is StructuredObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function tryParseStructuredValue(value: unknown): StructuredValue | null {
  if (Array.isArray(value) || isPlainObject(value)) {
    return value as StructuredValue;
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) || isPlainObject(parsed) ? (parsed as StructuredValue) : null;
  } catch {
    return null;
  }
}

export function parseWikilink(value: unknown): ParsedWikilink | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]$/);
  if (!match) return null;

  const linkPath = match[1]?.trim() ?? '';
  if (!linkPath) return null;

  return {
    linkPath,
    displayText: match[2] ? match[2].trim() : linkPath,
  };
}

export function classifyStructuredValue(rawValue: string, previousRawValue: string): StructuredClassification {
  const structuredValue = tryParseStructuredValue(rawValue);
  return {
    structuredValue,
    shouldRender: Boolean(structuredValue) && rawValue !== previousRawValue,
  };
}
