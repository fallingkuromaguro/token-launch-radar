// A protocol's farm plan: concrete steps a reader can follow, sized from the protocol's own TVL, its
// category family, its chains and how long DefiLlama has tracked it. Every step names its cost and time.
// Nothing here names a protocol: the same function writes every plan.

import { familyOf, type Family } from './families.ts';

export interface FarmInput {
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
}

/** Chains where a transaction usually costs well under a dollar. */
const LOW_FEE = new Set([
  'Solana',
  'Base',
  'Arbitrum',
  'Optimism',
  'Polygon',
  'Sui',
  'Aptos',
  'Linea',
  'Scroll',
  'Mantle',
  'Unichain',
  'Starknet',
  'Sonic',
  'Ink',
]);

/** The gas a reader should expect on a chain, by its usual fee level. */
export function gasOn(chain: string): string {
  if (chain === 'Ethereum') return '$3 to $15';
  return LOW_FEE.has(chain) ? 'under $0.50' : 'about $0.50 to $3';
}

/** How much capital one position needs, from the protocol's TVL: a larger protocol earns a larger test. */
export function capitalFor(tvl: number): number {
  if (tvl >= 1_000_000_000) return 250;
  if (tvl >= 100_000_000) return 150;
  if (tvl >= 20_000_000) return 100;
  return 50;
}

/** How many days to hold: a younger record needs a longer run to appear in more than one snapshot. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The family's own actions: each one a step a reader does with their own wallet, on the protocol's own app. */
function actionsFor(p: FarmInput, family: Family, cap: number, primary: string, gas: string): string[] {
  const { name } = p;
  const half = Math.round(cap / 2);
  const quarter = Math.round(cap / 4);
  switch (family) {
    case 'lending':
      return [
        `Open ${name}'s own app from its official docs, connect the wallet and supply $${cap} of USDC to its main market on ${primary}. Cost: $${cap} plus ${gas} gas. Time: 15 minutes.`,
        `Borrow about $${quarter} against the supply, then repay it in full within a week to create a clean borrow history. Cost: a few cents of interest and gas. Time: 10 minutes, twice.`,
        `Check the supply rate and utilisation on the market page each week; above 90 percent utilisation, withdraw half and wait for liquidity to return. Cost: nothing. Time: 5 minutes a week.`,
      ];
    case 'trading':
      if (/deriv|option|perp|prediction/i.test(p.category ?? '')) {
        return [
          `Deposit $${cap} of USDC as margin on ${name} on ${primary} and open one small position of about $${half} at 2x or less. Cost: $${cap} plus ${gas} gas. Time: 20 minutes.`,
          `Close that position within seven days and log the fees and funding paid, which are shown before you confirm. Cost: roughly 0.05 to 0.1 percent of the position plus gas. Time: 15 minutes a week.`,
        ];
      }
      return [
        `Add $${cap} of liquidity to the deepest major pool of ${name} on ${primary}, in a wide price range so it stays in range. Cost: $${cap} plus ${gas} gas. Time: 15 minutes.`,
        `Make one swap of about $${quarter} each week through ${name} so the position earns fees on real volume. Cost: the pool fee, usually 0.05 to 0.3 percent, plus gas. Time: 5 minutes a week.`,
        `If the position stays out of range for three days, withdraw and re-add it, and log the impermanent loss on each exit. Cost: ${gas} gas per move. Time: 15 minutes a month.`,
      ];
    case 'yield':
      return [
        `Deposit $${cap} of USDC into the largest ${name} vault or strategy on ${primary} and keep the share token instead of swapping it out. Cost: $${cap} plus ${gas} gas. Time: 10 minutes.`,
        `Each week, compare the vault's net return after its fees with the protocol's own published figure and note the date. Cost: nothing. Time: 5 minutes a week.`,
      ];
    case 'staking':
      return [
        `Stake $${cap} worth of the chain's staking asset through ${name} on ${primary} and keep the receipt token in the same wallet. Cost: $${cap} plus ${gas} gas. Time: 15 minutes.`,
        `Read the unbonding period and the fee on the protocol page before any withdrawal, and do not wrap the receipt into a third product. Cost: nothing. Time: 10 minutes.`,
      ];
    case 'bridge':
      return [
        `Test a $20 bridge of USDC from your main chain into ${primary} through ${name}, then bridge it back. Cost: about $2 to $10 in fees each way. Time: 30 minutes including confirmations.`,
        `Once the test works, bridge $${cap} and use it in one app on ${primary}, such as a swap or a deposit. Cost: the bridge fee plus ${gas} gas. Time: 20 minutes.`,
      ];
    case 'rwa':
      return [
        `Buy or mint $${cap} of ${name}'s yield or stable asset on ${primary} from its official page, after reading its redemption terms. Cost: $${cap} plus ${gas} gas. Time: 20 minutes.`,
        `Redeem or spend a small part of it once to create a record of real use. Cost: the redemption fee shown before you confirm. Time: 15 minutes.`,
      ];
    case 'chain':
      return [
        `Bridge $${cap} of USDC to ${primary} through its official bridge and make one swap in a dApp there. Cost: the bridge fee plus ${gas} gas. Time: 20 minutes.`,
        `Use one new dApp on ${primary} each week and keep a list of what you tried. Cost: about ${gas} gas a week. Time: 15 minutes a week.`,
      ];
    case 'other':
      return [
        `Use the core feature of ${name} on ${primary} with $${cap}, the smallest amount that counts as real use. Cost: $${cap} plus ${gas} gas. Time: 15 minutes.`,
        `Complete the protocol's own onboarding actions, such as a quest, a referral or a governance vote, once a week, using links only from its official site. Cost: gas only. Time: 10 minutes a week.`,
      ];
  }
}

/** The farm plan for one protocol: 7 to 8 steps, every one with its cost and its time. */
export function farmPlan(p: FarmInput, age: number | null): string[] {
  const family = familyOf(p.category);
  const cap = capitalFor(p.tvl_usd);
  const primary = p.chains[0] ?? 'its main chain';
  const gas = gasOn(primary);
  const hold = holdDaysFor(age);
  return [
    `Set up a new wallet used only for ${p.name} and fund it with $${cap + 10} of USDC plus a little of ${primary}'s gas token. Keep the seed phrase offline. Cost: $${cap + 10}. Time: 20 minutes.`,
    ...actionsFor(p, family, cap, primary, gas),
    `Hold the position for at least ${hold} days so the activity appears across several snapshots, and reduce it in steps rather than in one exit. Cost: the $${cap} stays in the position. Time: ${hold} days.`,
    `Before you connect to any claim or airdrop page, type the address from the protocol's own docs, check the token contract there, and never sign a message that asks for a seed phrase or unlimited approvals. Cost: nothing. Time: 5 minutes.`,
    `Keep a farm log of wallet, dates, amounts, transaction hashes and each reward screenshot, so the record exists if ${p.name} later issues a token. Cost: nothing. Time: 5 minutes a week.`,
    `When you exit, revoke the token approvals you gave ${p.name} with the chain's approval-revoke tool, then leave the rest of the wallet alone. Cost: ${gas} gas. Time: 10 minutes.`,
  ];
}
