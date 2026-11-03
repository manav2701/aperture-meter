/*
 * Money here is whole µUSD (1 µUSD = $0.000001) in a bigint, like everywhere else in Aperture.
 * Prices are "µUSD per million tokens", so a price of $15 per million tokens is 15_000_000 and
 * cost in µUSD is tokens × price ÷ 1,000,000: exact integers, no floats.
 */

export type Micros = bigint;

export const usd = (dollars: number): Micros => BigInt(Math.round(dollars * 1_000_000));

/** "$1.23" (cents), "$0.0042" for tiny amounts so a cheap session doesn't read as free. */
export function formatMoney(amount: Micros): string {
  const negative = amount < 0n;
  const value = negative ? -amount : amount;
  const cents = (value + 5_000n) / 10_000n;
  if (cents === 0n && value > 0n) {
    const fraction = value.toString().padStart(6, '0').replace(/0+$/, '');
    return `${negative ? '-' : ''}$0.${fraction.slice(0, 4)}`;
  }
  const whole = (cents / 100n).toLocaleString('en-US');
  return `${negative ? '-' : ''}$${whole}.${(cents % 100n).toString().padStart(2, '0')}`;
}
