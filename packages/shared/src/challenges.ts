export interface DailyChallengeDefinition {
  id: string;
  /** English source text, translated by the client. */
  title: string;
  /** English source text, translated by the client. */
  description: string;
  target: number;
  reward: number;
}

export interface DailyChallengeView extends DailyChallengeDefinition {
  progress: number;
  claimed: boolean;
}

/** Three fixed objectives, reset every UTC day. */
export const DAILY_CHALLENGES: DailyChallengeDefinition[] = [
  {
    id: "play-3",
    title: "Play three rounds",
    description: "Finish three games today.",
    target: 3,
    reward: 50,
  },
  {
    id: "win-1",
    title: "Win a round",
    description: "Take first place in any game today.",
    target: 1,
    reward: 75,
  },
  {
    id: "top2-2",
    title: "Reach the top two",
    description: "Finish in the top two twice today.",
    target: 2,
    reward: 60,
  },
];
