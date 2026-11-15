export function mathEditorHref(locale: string, id: string, subtype: string, source = "", worksheet?: { topic?: string }): string {
  const path = subtype === "fractions"
    ? worksheet?.topic === "calculation" || source === "math-fraction-calculation-generator" ? "fraction-calculation" : "fractions"
    : subtype === "place_value" ? "place-value" : subtype === "word_problems" ? "word-problems" : subtype === "length" ? "measurement" : subtype === "number_line" ? "number-line" : subtype;
  return `/${locale}/producer/math/${path}?edit=${encodeURIComponent(id)}`;
}
