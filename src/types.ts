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
