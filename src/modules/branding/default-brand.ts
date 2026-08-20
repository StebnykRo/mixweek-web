import type { BrandTokens } from './schemas';

/**
 * docs/05-design-system.md §1 — the prototype's tokens become the platform's
 * default brand. No component ever references these values directly; they are
 * seeded into the database and served as CSS variables like any other brand.
 */
export const PLATFORM_DEFAULT_TOKENS: BrandTokens = {
  mode: 'light',
  colors: {
    primary: {
      50: '#f7f9fe',
      100: '#eef1fe',
      200: '#dbe2fd',
      300: '#b6c4fa',
      400: '#8098f7',
      500: '#2b4af0',
      600: '#3352ee',
      700: '#2440c9',
      800: '#192e93',
      900: '#101e5e',
    },
    secondary: {
      50: '#fdfef7',
      100: '#f7fce3',
      200: '#edf8c4',
      300: '#def291',
      400: '#cdea5b',
      500: '#c8f04b',
      600: '#b4d63c',
      700: '#93b22a',
      800: '#71891f',
      900: '#4f6015',
    },
    neutral: {
      50: '#ffffff',
      100: '#ffffff',
      200: '#eef0f5',
      300: '#dde1ea',
      400: '#bbc2d1',
      500: '#98a0b3',
      600: '#787f93',
      700: '#5a6075',
      800: '#3a3f55',
      900: '#12162e',
    },
    bg: '#f1f3f7',
    surface: '#ffffff',
    ink: '#0b0f2b',
    inkMuted: '#5a6075',
    divider: '#0b0f2b1f',
    success: '#2e9e5b',
    warning: '#d99100',
    // Nudged darker than the prototype's #d3453b, which measured 4.48:1 on
    // white — a hair under the 4.5:1 the contrast gate requires.
    danger: '#cf3f35',
  },
  radius: { sm: '8px', md: '16px', lg: '28px', pill: '999px' },
  font: { display: 'Caprasimo', body: 'Figtree', source: 'google', scale: 1 },
  shadow: {
    sm: '0 1px 3px rgb(11 15 43 / 0.10)',
    md: '0 3px 10px rgb(11 15 43 / 0.12)',
    lg: '0 12px 32px rgb(11 15 43 / 0.18)',
  },
};

/** A second, visibly different brand — proves white-label from day one. */
export const ACME_TOKENS: BrandTokens = {
  mode: 'light',
  colors: {
    primary: {
      50: '#fbf7f3',
      100: '#f7ede3',
      200: '#efd9c4',
      300: '#e0b78e',
      400: '#cf8f56',
      500: '#a85c1c',
      600: '#96500f',
      700: '#7a410c',
      800: '#5c3109',
      900: '#3d2106',
    },
    secondary: {
      50: '#f4faf6',
      100: '#e6f4ec',
      200: '#c9e6d5',
      300: '#9dd0b3',
      400: '#67b28a',
      // Light enough that the dark button label clears 4.5:1 (docs/04 §4.3).
      500: '#8fd3ac',
      600: '#2f8f5f',
      700: '#216645',
      800: '#194d34',
      900: '#113423',
    },
    neutral: {
      50: '#ffffff',
      100: '#faf8f5',
      200: '#f0ece5',
      300: '#e2dcd1',
      400: '#c3b9a8',
      500: '#9d9284',
      600: '#7c7264',
      700: '#5c5449',
      800: '#3d382f',
      900: '#201e1a',
    },
    bg: '#faf7f2',
    surface: '#ffffff',
    ink: '#201e1a',
    inkMuted: '#5c5449',
    divider: '#201e1a1f',
    success: '#2f8f5f',
    warning: '#b57d09',
    danger: '#b3352c',
  },
  radius: { sm: '4px', md: '8px', lg: '12px', pill: '999px' },
  font: { display: 'Playfair Display', body: 'Inter', source: 'google', scale: 1 },
  shadow: {
    sm: '0 1px 2px rgb(32 30 26 / 0.08)',
    md: '0 2px 8px rgb(32 30 26 / 0.10)',
    lg: '0 10px 28px rgb(32 30 26 / 0.14)',
  },
};

/** Neutral brand for the login screen before an email domain is known. */
export const NEUTRAL_BRAND = {
  id: 'platform-neutral',
  key: 'platform',
  appName: 'Mix Week',
  kicker: null as string | null,
  logoLightUrl: null as string | null,
  logoDarkUrl: null as string | null,
  logoMarkUrl: null as string | null,
  ogImageUrl: null as string | null,
  tokens: PLATFORM_DEFAULT_TOKENS,
  customCss: null as string | null,
};

export type PublicBrand = typeof NEUTRAL_BRAND;
