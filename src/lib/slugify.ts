/**
 * URL slugs from human titles, for SlugSchema: /^[a-z0-9][a-z0-9-]{1,80}$/.
 *
 * Stripping everything outside [a-z0-9] is not enough for this application:
 * it ships en, ru and uk (docs/05 §1), and a Cyrillic title reduces to an
 * empty string, which fails validation with nothing the author can act on.
 * Cyrillic is transliterated, accents are folded, and anything still
 * unmappable falls back to a generated slug rather than an invalid one.
 */

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ё: 'e',
  ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh',
  ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e',
  ю: 'iu', я: 'ia',
};

/** Ukrainian/Russian romanisation, close to the national transliteration tables. */
function transliterate(value: string): string {
  let out = '';
  for (const char of value.toLowerCase()) out += CYRILLIC[char] ?? char;
  return out;
}

/**
 * A slug for `value`, or an empty string if nothing usable survives. Callers
 * that need a guaranteed-valid slug should use `slugifyOrFallback`.
 */
export function slugify(value: string): string {
  return transliterate(value)
    .normalize('NFKD')
    // Combining marks left behind by NFKD: é becomes e, not e + accent.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/** True if the result would satisfy SlugSchema. */
export function isValidSlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,80}$/.test(value);
}

/**
 * Always returns something SlugSchema accepts. `seed` keeps the fallback
 * deterministic for tests; production passes nothing and gets a random tail.
 */
export function slugifyOrFallback(value: string, seed?: string): string {
  const base = slugify(value);
  if (isValidSlug(base)) return base;
  const tail = seed ?? Math.random().toString(36).slice(2, 8);
  // A one-character title is legal but slugs need two, so the prefix also
  // rescues "Q" — not only titles that vanish entirely.
  return base ? `${base}-${tail}` : `event-${tail}`;
}
