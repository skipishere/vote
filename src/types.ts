export type VoteValue = 'up' | 'down' | 'sideways';

/** Broadcast from host to all participants after every state change. */
export interface StateSnapshot {
  type: 'state';
  topic: string;
  roundId: string;
  participants: Record<string, string>; // peerId → name
  votes: Record<string, VoteValue>;     // peerId → vote (only cast votes)
}

/** Messages sent from participant to host. */
export type ParticipantMessage =
  | { type: 'join'; name: string }
  | { type: 'vote'; value: VoteValue | null };
