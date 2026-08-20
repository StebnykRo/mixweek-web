import type { BrandTokens } from './schemas';
import { PLATFORM_DEFAULT_TOKENS } from './default-brand';

/**
 * The palette from the supplied prototype (design/ds.css): a cream page, a
 * terracotta accent and an olive secondary, rather than the blue the platform
 * default ships with.
 *
 * One deliberate departure. The prototype's accent is #c67139, which measures
 * 3.61:1 against white — below the 4.5:1 the contrast gate requires of a
 * button label, so publishing a brand built on it would be blocked. 500 and
 * 600 are one step darker in the same hue; everything else is verbatim.
 */
export const DESIGN_TOKENS: BrandTokens = {
  ...PLATFORM_DEFAULT_TOKENS,
  colors: {
    primary: {
      50: '#fff8f4',
      100: '#fff2eb',
      200: '#ffe1d0',
      300: '#ffc6a5',
      400: '#f6a06b',
      500: '#a85a28',
      600: '#8c491a',
      700: '#8c491a',
      800: '#643312',
      900: '#402310',
    },
    secondary: {
      50: '#f8fdf0',
      100: '#f0fae1',
      200: '#e1eecc',
      300: '#ccdbb2',
      400: '#aebf92',
      500: '#aebf92',
      600: '#728157',
      700: '#56633f',
      800: '#3d472b',
      900: '#272e1b',
    },
    neutral: {
      50: '#ffffff',
      100: '#f9f4ed',
      200: '#eee7db',
      300: '#dcd3c4',
      400: '#c0b6a5',
      500: '#a19786',
      600: '#82796a',
      700: '#645c50',
      800: '#474238',
      900: '#2e2b25',
    },
    bg: '#f5ead8',
    surface: '#f9f4ed',
    ink: '#201e1d',
    inkMuted: '#645c50',
    divider: '#201e1d1f',
    success: '#2e9e5b',
    warning: '#b2622d',
    danger: '#b3261e',
  },
};
