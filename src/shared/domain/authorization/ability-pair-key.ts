import type { AbilityPair } from './ability-pair.type';

export function abilityPairKey(pair: AbilityPair): string {
  return `${pair.action}:${pair.subject}`;
}
