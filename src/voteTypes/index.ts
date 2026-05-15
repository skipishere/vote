import { leanCoffeeType } from './leanCoffee';
import { fistToFiveType } from './fistToFive';
import type { VoteTypeDefinition } from './definition';

export type { VoteTypeDefinition, VoteResult } from './definition';

export const VOTE_TYPES: readonly VoteTypeDefinition[] = [leanCoffeeType, fistToFiveType];

export function getVoteType(id: string): VoteTypeDefinition {
  return VOTE_TYPES.find(vt => vt.id === id) ?? leanCoffeeType;
}
