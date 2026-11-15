/** A bounded integer-polynomial grammar. No evaluation of JavaScript or numerical sampling. */
export type AlgebraTerm = { coefficient: number; a: number; b: number };
export type AlgebraPolynomial = Record<string, number>;
type Node = { terms: AlgebraTerm[]; productWork: boolean };
export type ParsedAlgebra = { polynomial: AlgebraPolynomial; terms: AlgebraTerm[]; isSimplified: boolean; hasLikeTerms: boolean; hasProductsToSimplify: boolean; degree: number; numbers: number[] };
const MAX_TERMS = 64, MAX_COEFFICIENT = 1_000_000, MAX_DEGREE = 6;
const key = (term: AlgebraTerm) => `${term.a},${term.b}`;
function checked(terms: AlgebraTerm[]): AlgebraTerm[] {
  if (terms.length > MAX_TERMS || terms.some(t => !Number.isSafeInteger(t.coefficient) || Math.abs(t.coefficient) > MAX_COEFFICIENT || t.a + t.b > MAX_DEGREE)) throw new Error("EXPRESSION_LIMIT");
  return terms;
}
export function collectAlgebraTerms(terms: AlgebraTerm[]): AlgebraPolynomial {
  const result: AlgebraPolynomial = {};
  for (const term of terms) { const k = key(term); result[k] = (result[k] ?? 0) + term.coefficient; if (Math.abs(result[k]) > MAX_COEFFICIENT) throw new Error("EXPRESSION_LIMIT"); }
  for (const k of Object.keys(result)) if (result[k] === 0) delete result[k];
  return result;
}
export function sameAlgebraPolynomial(left: AlgebraPolynomial, right: AlgebraPolynomial): boolean {
  const keys = Object.keys(left); return keys.length === Object.keys(right).length && keys.every(k => left[k] === right[k]);
}
export function parseAlgebraExpression(value: string): ParsedAlgebra | null {
  if (!value.trim() || value.length > 240) return null;
  const text = value.replace(/[−–]/g, "-").replace(/[×·]/g, "*").replace(/([ab])([⁰¹²³⁴⁵⁶])/g, (_, base: string, exponent: string) => `${base}^${"⁰¹²³⁴⁵⁶".indexOf(exponent)}`);
  const tokens = text.match(/\d+|[ab+*^()-]|\s+|./g)?.filter(t => !/^\s+$/.test(t)) ?? [];
  if (tokens.length > 120 || tokens.some(t => !/^(?:\d+|[ab+*^()-])$/.test(t))) return null;
  let position = 0, depth = 0;
  const numbers: number[] = [];
  const peek = () => tokens[position];
  function primary(): Node {
    if (++depth > 10) throw new Error("EXPRESSION_LIMIT");
    const token = tokens[position++]; let node: Node;
    if (token === "(") { node = sum(); if (tokens[position++] !== ")") throw new Error("INVALID_GROUP"); }
    else if (token === "a" || token === "b") node = { terms: [{ coefficient: 1, a: Number(token === "a"), b: Number(token === "b") }], productWork: false };
    else if (token && /^\d{1,7}$/.test(token) && Number(token) <= MAX_COEFFICIENT) { const n = Number(token); numbers.push(n); node = { terms: [{ coefficient: n, a: 0, b: 0 }], productWork: false }; }
    else throw new Error("INVALID_FACTOR");
    if (peek() === "^") {
      position++; const raw = tokens[position++]; if (!raw || !/^[1-6]$/.test(raw)) throw new Error("INVALID_EXPONENT");
      const exponent = Number(raw), original = node;
      node = { terms: [{ coefficient: 1, a: 0, b: 0 }], productWork: original.productWork || exponent <= 1 || original.terms.length !== 1 || original.terms[0].a + original.terms[0].b !== 1 || original.terms[0].coefficient !== 1 };
      for (let i = 0; i < exponent; i++) node.terms = checked(node.terms.flatMap(left => original.terms.map(right => ({ coefficient: left.coefficient * right.coefficient, a: left.a + right.a, b: left.b + right.b }))));
    }
    depth--; return node;
  }
  function unary(): Node {
    let sign = 1, signs = 0;
    while (peek() === "+" || peek() === "-") { if (++signs > 2) throw new Error("INVALID_SIGN"); if (tokens[position++] === "-") sign *= -1; }
    const node = primary(); return { terms: node.terms.map(t => ({ ...t, coefficient: sign * t.coefficient })), productWork: node.productWork || sign < 0 && node.terms.length > 1 };
  }
  function product(): Node {
    let node = unary();
    // Track numerical factors and variable occurrences before collection to identify unfinished products.
    let numericFactors = node.terms.length === 1 && (node.terms[0].a + node.terms[0].b === 0 || Math.abs(node.terms[0].coefficient) !== 1) ? 1 : 0;
    let identityFactor = node.terms.length === 1 && node.terms[0].a + node.terms[0].b === 0 && Math.abs(node.terms[0].coefficient) <= 1;
    while (peek() === "*" || peek() === "a" || peek() === "b" || peek() === "(") {
      if (peek() === "*") position++;
      const right = unary(), leftTerms = node.terms;
      const rightNumeric = right.terms.length === 1 && (right.terms[0].a + right.terms[0].b === 0 || Math.abs(right.terms[0].coefficient) !== 1);
      if (rightNumeric) { numericFactors++; identityFactor ||= right.terms[0].a + right.terms[0].b === 0 && Math.abs(right.terms[0].coefficient) <= 1; }
      const repeatedVariable = leftTerms.some(l => right.terms.some(r => l.a > 0 && r.a > 0 || l.b > 0 && r.b > 0));
      const terms = checked(leftTerms.flatMap(left => right.terms.map(r => ({ coefficient: left.coefficient * r.coefficient, a: left.a + r.a, b: left.b + r.b }))));
      node = { terms, productWork: node.productWork || right.productWork || leftTerms.length !== 1 || right.terms.length !== 1 || numericFactors > 1 || identityFactor || repeatedVariable || right.terms.some(t => t.coefficient < 0) };
    }
    return node;
  }
  function sum(): Node {
    let node = product();
    while (peek() === "+" || peek() === "-") {
      const sign = tokens[position++] === "-" ? -1 : 1, right = product();
      node = { terms: checked([...node.terms, ...right.terms.map(t => ({ ...t, coefficient: sign * t.coefficient }))]), productWork: node.productWork || right.productWork || sign < 0 && right.terms.length > 1 };
    }
    return node;
  }
  try {
    const node = sum(); if (position !== tokens.length) return null;
    const polynomial = collectAlgebraTerms(node.terms), hasLikeTerms = new Set(node.terms.map(key)).size !== node.terms.length;
    const redundantZero = node.terms.some(t => t.coefficient === 0) && (node.terms.length > 1 || node.terms[0].a + node.terms[0].b > 0);
    return { polynomial, terms: node.terms, isSimplified: !hasLikeTerms && !node.productWork && !redundantZero, hasLikeTerms, hasProductsToSimplify: node.productWork || redundantZero, degree: Math.max(...node.terms.map(t => t.a + t.b)), numbers };
  } catch { return null; }
}
export function formatAlgebraPolynomial(polynomial: AlgebraPolynomial): string {
  const terms = Object.entries(polynomial).map(([k, coefficient]) => { const [a, b] = k.split(",").map(Number); return { coefficient, a, b }; }).filter(t => t.coefficient !== 0).sort((l, r) => r.a + r.b - l.a - l.b || r.a - l.a);
  if (!terms.length) return "0";
  return terms.map((term, index) => {
    const power = (letter: string, exponent: number) => exponent ? letter + (exponent > 1 ? String(exponent).split("").map(n => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(n)]).join("") : "") : "";
    const variable = power("a", term.a) + power("b", term.b), magnitude = Math.abs(term.coefficient);
    const body = `${variable && magnitude === 1 ? "" : magnitude}${variable}`;
    return `${index ? term.coefficient < 0 ? " − " : " + " : term.coefficient < 0 ? "−" : ""}${body}`;
  }).join("");
}
/** Display formatting only: this never combines terms or computes an answer. */
export function formatAlgebraInput(value: string): string { return value.replace(/\*/g, "·").replace(/([ab])\s*\^\s*([2-6])(?!\d)/g, (_, letter: string, exponent: string) => letter + "⁰¹²³⁴⁵⁶"[Number(exponent)]); }
