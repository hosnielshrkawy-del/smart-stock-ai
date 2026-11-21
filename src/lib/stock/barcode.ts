const BARS = (
  "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 " +
  "221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 " +
  "221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 " +
  "212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 " +
  "231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 " +
  "231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 " +
  "314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 " +
  "112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
  "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 " +
  "214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 " +
  "114131 311141 411131 211412 211214 211232 2331112"
).split(" ");

/** Code 128 set B bar widths. Null if the text is not encodable. */
export function code128Bars(value: string): number[] | null {
  const text = value.trim();
  if (!text || text.length > 48) return null;
  const codes = [104];
  let sum = 104;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i) - 32;
    if (code < 0 || code > 95) return null;
    codes.push(code);
    sum += code * (i + 1);
  }
  codes.push(sum % 103);
  codes.push(106);
  const bars: number[] = [];
  for (const code of codes) {
    const pattern = BARS[code];
    if (!pattern) return null;
    for (const ch of pattern) bars.push(Number(ch));
  }
  return bars;
}
