import QRCode from 'qrcode';

/**
 * QR rendering happens on the server and returns inline SVG, so the page needs
 * no canvas, no client library and no CSP exception for a data: image.
 */
export function qrSvg(value: string, options?: { size?: number }): string {
  // The synchronous form keeps this usable inside a route handler's return.
  let svg = '';
  QRCode.toString(
    value,
    {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: options?.size ?? 240,
      color: { dark: '#000000', light: '#ffffff' },
    },
    (error, result) => {
      if (error) throw error;
      svg = result;
    },
  );
  return svg;
}
