export type ExperienceStage = "roster" | "dare" | "round" | "legacy";

export type RoundStage = "collecting" | "countdown" | "reveal" | "resolved";

export interface Player {
  id: string;
  name: string;
  icon: string;
  color: string;
  wins: number;
  losses: number;
  daresCompleted: number;
}

export interface DareConfig {
  challengerId: string;
  targetId: string;
  description: string;
  odds: number;
  stakes?: string;
}

export interface ActiveRound {
  id: string;
  dare: DareConfig;
  challengerPick?: number;
  targetPick?: number;
  countdown: number;
  stage: RoundStage;
  startedAt: number;
  matched?: boolean;
  resolution?: RoundResolution;
}

export type RoundResolution = "completed" | "declined" | "partial";

export interface RoundHistoryEntry {
  id: string;
  dare: DareConfig;
  challengerPick: number;
  targetPick: number;
  matched: boolean;
  resolution: RoundResolution;
  timestamp: number;
}

export interface LeaderboardEntry {
  userId: string;
  handle: string | null;
  played: number;
  wins: number;
  triggered: number;
  streak: number;
  median_completion_ms: number | null;
  latest_proof_thumb: string | null;
  latest_proof_url?: string | null;
}

export interface LeaderboardResponse {
  id?: string;
  period: "daily" | "weekly" | "alltime";
  category: string | null;
  withProofs: boolean;
  fromTs: string | null;
  toTs: string | null;
  generatedAt: string | null;
  version: number;
  entries: LeaderboardEntry[];
  categories?: string[];
}

export interface SharePayload {
  type: "result" | "proof";
  dareId?: string;
  proofId?: string;
  proofSlug?: string;
  visibility: string | null;
  title: string;
  description: string;
  image: string;
  resolvedAt: string;
  loser: string;
  winner: string;
  range: number;
  caption: string;
  hashtags: string[];
  url: string;
  category?: string | null;
}
