export interface VoteResult {
  counts: Record<string, number>;
  winner: string | null;
}

export interface VoteTypeDefinition {
  readonly id: string;
  readonly label: string;
  readonly headerLabel: string;
  readonly ballotHtml: string;
  readonly values: readonly string[];
  computeResult(votes: string[]): VoteResult;
  renderCounts(container: HTMLElement, counts: Record<string, number>, hidden: boolean): void;
  applyWinner(container: HTMLElement, winner: string | null, show: boolean): void;
  renderVoters?(container: HTMLElement, votes: Record<string, string>, participants: Record<string, string>, show: boolean): void;
}
