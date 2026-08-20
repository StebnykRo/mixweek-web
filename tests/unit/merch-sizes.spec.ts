import { describe, expect, it } from 'vitest';
import { compareSizes } from '@/modules/merch/service';

describe('variant size ordering', () => {
  it('orders clothing sizes the way a person would', () => {
    // Alphabetically this is L, M, S, XL, XS, XXL — which is what the page
    // used to show.
    const sizes = ['L', 'M', 'S', 'XL', 'XS', 'XXL'];
    expect([...sizes].sort(compareSizes)).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
  });

  it('puts a single-size option first', () => {
    expect(['M', 'ONE'].sort(compareSizes)).toEqual(['ONE', 'M']);
  });

  it('is case and space insensitive', () => {
    expect(['xl', ' s '].sort(compareSizes)).toEqual([' s ', 'xl']);
  });

  it('falls back to a natural sort for sizes it does not know', () => {
    expect(['500 ml', '250 ml'].sort(compareSizes)).toEqual(['250 ml', '500 ml']);
  });

  it('keeps known sizes ahead of unknown ones', () => {
    expect(['custom', 'M'].sort(compareSizes)).toEqual(['M', 'custom']);
  });
});
