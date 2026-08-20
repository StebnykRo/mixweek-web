import { describe, expect, it } from 'vitest';
import { isValidSlug, slugify, slugifyOrFallback } from '@/lib/slugify';

/**
 * The event slug has to satisfy SlugSchema — /^[a-z0-9][a-z0-9-]{1,80}$/ —
 * and the admin form derives it from a title the author types in any of the
 * three supported languages.
 */
describe('slug generation', () => {
  it('handles a plain latin title', () => {
    expect(slugify('Mix Week 2026')).toBe('mix-week-2026');
  });

  it('transliterates Ukrainian rather than deleting it', () => {
    // Previously this produced "" and the API answered 422 "invalid slug",
    // which made a Ukrainian-titled event impossible to create at all.
    const slug = slugify('Мікс Тиждень');
    expect(slug).not.toBe('');
    expect(isValidSlug(slug)).toBe(true);
  });

  it('transliterates Russian', () => {
    expect(isValidSlug(slugify('Летняя встреча'))).toBe(true);
  });

  it('folds accents to their base letters', () => {
    expect(slugify('Café Zürich')).toBe('cafe-zurich');
  });

  it('never returns a trailing or leading hyphen', () => {
    expect(slugify('  --Hello--  ')).toBe('hello');
  });

  it('always yields something valid, even from an unusable title', () => {
    expect(isValidSlug(slugifyOrFallback('🎉', 'abc123'))).toBe(true);
    expect(isValidSlug(slugifyOrFallback('', 'abc123'))).toBe(true);
    // One character is a legal title but too short for a slug on its own.
    expect(isValidSlug(slugifyOrFallback('Q', 'abc123'))).toBe(true);
  });

  it('keeps a usable slug untouched rather than adding a suffix', () => {
    expect(slugifyOrFallback('Mix Week', 'abc123')).toBe('mix-week');
  });

  it('rejects what the schema rejects', () => {
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('q')).toBe(false);
    expect(isValidSlug('-leading')).toBe(false);
    expect(isValidSlug('UPPER')).toBe(false);
    expect(isValidSlug('ok-slug')).toBe(true);
  });
});
