// Category families: DefiLlama's categories, grouped so that a family has enough tokened comparables to
// estimate from. The grouping reads only the snapshot's category field, never a protocol's name.

export const FAMILIES = ['lending', 'trading', 'yield', 'staking', 'bridge', 'chain', 'rwa', 'other'] as const;
export type Family = (typeof FAMILIES)[number];

export const FAMILY_LABEL: Record<Family, string> = {
  lending: 'Lending and credit',
  trading: 'Trading and derivatives',
  yield: 'Yield, vaults and allocators',
  staking: 'Staking and restaking',
  bridge: 'Bridges',
  chain: 'Chains',
  rwa: 'RWA, stablecoin and payments',
  other: 'Other',
};

const TABLE: Record<string, Family> = {
  Lending: 'lending',
  CDP: 'lending',
  'CDP Manager': 'lending',
  'Uncollateralized Lending': 'lending',
  'Collateral Management': 'lending',
  'Risk Curators': 'lending',
  'Onchain Capital Allocator': 'lending',
  Dexs: 'trading',
  Derivatives: 'trading',
  Options: 'trading',
  'Options Vault': 'trading',
  'Interest Rate Derivatives': 'trading',
  'Prediction Market': 'trading',
  'Basis Trading': 'trading',
  'OTC Marketplace': 'trading',
  Yield: 'yield',
  'Yield Aggregator': 'yield',
  Farm: 'yield',
  'Leveraged Farming': 'yield',
  'Liquidity Manager': 'yield',
  Indexes: 'yield',
  Launchpad: 'yield',
  'Governance Incentives': 'yield',
  'Liquid Staking': 'staking',
  'Liquid Restaking': 'staking',
  Restaking: 'staking',
  'Staking Pool': 'staking',
  'Restaked BTC': 'staking',
  'Anchor BTC': 'staking',
  'Decentralized BTC': 'staking',
  Bridge: 'bridge',
  'Canonical Bridge': 'bridge',
  'Cross Chain Bridge': 'bridge',
  Chain: 'chain',
  RWA: 'rwa',
  'Dual-Token Stablecoin': 'rwa',
  'Stablecoin Wrapper': 'rwa',
  Payments: 'rwa',
  'Crypto Card Issuer': 'rwa',
};

/** The family of a DefiLlama category; a null or unlisted category is Other. */
export function familyOf(category: string | null): Family {
  if (category === null) return 'other';
  return TABLE[category] ?? 'other';
}

/**
 * Hard exclusions, the same ones the house's watchlist rule makes: a bridge, a liquid (re)staking or
 * wrapped product, a CEX, a name that says wrapped, staked or staking, or an exchange's name. Such a
 * protocol is most likely a product of a token that already trades, so the radar does not rank it.
 */
const HARD_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_START = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

export function isHardProduct(category: string | null, name: string): boolean {
  return (category !== null && HARD_CATEGORIES.has(category)) || /\b(wrapped|staked|staking)\b/i.test(name) || EXCHANGE_START.test(name);
}

/** Soft products: categories that are often a token's wrapped or staked form, ranked at half weight. */
const SOFT_CATEGORIES = new Set(['Restaking', 'Staking Pool', 'Anchor BTC', 'Decentralized BTC', 'Stablecoin Wrapper']);

export function isSoftProduct(category: string | null): boolean {
  return category !== null && SOFT_CATEGORIES.has(category);
}
