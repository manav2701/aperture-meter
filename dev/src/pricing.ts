import { usd, type Micros } from './money';

/** µUSD per million tokens, for each kind of token. */
export interface ModelPrice {
  input: Micros;
  output: Micros;
  /** Reading a cached prompt back. */
  cacheRead: Micros;
  /** Writing a prompt into the cache (the five-minute kind). */
  cacheWrite: Micros;
}

const price = (input: number, output: number): ModelPrice => ({
  input: usd(input),
  output: usd(output),
  cacheRead: usd(input * 0.1),
  cacheWrite: usd(input * 1.25),
});

/**
 * List prices, first match wins. These are estimates for what the same usage would cost at API
 * prices: a subscription isn't billed this way, so a Pro or Max user reads the number as "what
 * this would cost", not a bill. Models not listed here are reported as unpriced rather than
 * guessed; add them in prices.json (see the README).
 */
const LIST: { match: RegExp; price: ModelPrice }[] = [
  { match: /opus-4-[5-9]|opus-[5-9]/, price: price(5, 25) },
  { match: /opus/, price: price(15, 75) },
  { match: /sonnet-[5-9]|sonnet-4-[6-9]/, price: price(3, 15) },
  { match: /sonnet/, price: price(3, 15) },
  { match: /haiku-4|haiku-[5-9]/, price: price(1, 5) },
  { match: /haiku/, price: price(0.8, 4) },
];

/** A user's own prices, in dollars per million tokens, keyed by a model-name fragment. */
export type PriceOverrides = Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }>;

export function priceFor(model: string, overrides: PriceOverrides = {}): ModelPrice | null {
  const name = model.toLowerCase();
  const own = Object.entries(overrides).find(([fragment]) => name.includes(fragment.toLowerCase()));
  if (own !== undefined) {
    const [, p] = own;
    return {
      input: usd(p.input),
      output: usd(p.output),
      cacheRead: usd(p.cacheRead ?? p.input * 0.1),
      cacheWrite: usd(p.cacheWrite ?? p.input * 1.25),
    };
  }
  return LIST.find((entry) => entry.match.test(name))?.price ?? null;
}

export interface TokenCounts {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** What these tokens cost at this model's price, exactly. */
export function costOf(tokens: TokenCounts, p: ModelPrice): Micros {
  const part = (count: number, perMillion: Micros) => (BigInt(count) * perMillion) / 1_000_000n;
  return (
    part(tokens.input, p.input) +
    part(tokens.output, p.output) +
    part(tokens.cacheRead, p.cacheRead) +
    part(tokens.cacheWrite, p.cacheWrite)
  );
}
