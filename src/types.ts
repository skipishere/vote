export type VoteValue = 'up' | 'down' | 'sideways';

/** Broadcast from host to all participants after every state change. */
export interface StateSnapshot {
  type: 'state';
  topic: string;
  roundId: string;
  participants: Record<string, string>; // clientId → name
  votes: Record<string, VoteValue>;     // clientId → vote (only cast votes)
  votingActive: boolean;
  resultsHidden: boolean;
  votingLocked: boolean;
  timerEndsAt: number | null;           // ms epoch when timer expires, null if no timer
}

/** Messages sent from participant to host. */
export type ParticipantMessage =
  | { type: 'join'; name: string; clientId: string }
  | { type: 'vote'; value: VoteValue | null };

/** Messages sent from host to participants (besides StateSnapshot). */
export type HostMessage =
  | StateSnapshot
  | { type: 'kicked' }
  | { type: 'rejected' };
