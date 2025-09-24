import { useMemo } from "react";
import { ActiveRound, Player, RoundResolution } from "../types";

interface ActiveRoundStageProps {
  round: ActiveRound | null;
  players: Player[];
  onUpdatePick: (playerId: string, value: number) => void;
  onLock: () => void;
  onResolve: (resolution: RoundResolution) => void;
  onCancel: () => void;
  onArchive: () => void;
}

const resolutionLabels: Record<RoundResolution, string> = {
  completed: "Dare completed",
  declined: "Passed / declined",
  partial: "Remixed dare",
};

const ActiveRoundStage = ({
  round,
  players,
  onUpdatePick,
  onLock,
  onResolve,
  onCancel,
  onArchive,
}: ActiveRoundStageProps) => {
  const challenger = useMemo(
    () => players.find((player) => player.id === round?.dare.challengerId),
    [players, round?.dare.challengerId],
  );
  const target = useMemo(
    () => players.find((player) => player.id === round?.dare.targetId),
    [players, round?.dare.targetId],
  );

  if (!round || !challenger || !target) {
    return (
      <section className="panel">
        <header className="panel__header">
          <div>
            <p className="panel__eyebrow">No round active</p>
            <h2 className="panel__title">Run the countdown</h2>
          </div>
        </header>
        <p className="panel__empty">Set a dare to launch a round of What are the odds?!</p>
        <p className="panel__hint">
          Players secretly pick numbers between 1 and the odds. Hit lock to reveal and see who owes the dare.
        </p>
      </section>
    );
  }

  const challengerPick = round.challengerPick ?? 0;
  const targetPick = round.targetPick ?? 0;
  const picksReady = Boolean(round.challengerPick && round.targetPick);
  const picksLocked = round.stage !== "collecting";
  const revealVisible = round.stage === "reveal" || round.stage === "resolved";
  const isResolved = round.stage === "resolved";

  const matched = revealVisible ? round.challengerPick === round.targetPick : null;

  return (
    <section className="panel active-round">
      <header className="panel__header">
        <div>
          <p className="panel__eyebrow">Active dare</p>
          <h2 className="panel__title">Odds 1 in {round.dare.odds}</h2>
        </div>
        <span className="panel__badge">Round #{round.id.slice(-4)}</span>
      </header>

      <div className="active-round__dare">
        <p className="active-round__prompt">{round.dare.description}</p>
        {round.dare.stakes && <p className="active-round__stakes">Bonus: {round.dare.stakes}</p>}
      </div>

      <div className="active-round__matchup">
        <PlayerDial
          label="Challenger"
          player={challenger}
          value={challengerPick}
          odds={round.dare.odds}
          disabled={picksLocked}
          onChange={(value) => onUpdatePick(challenger.id, value)}
        />
        <div className="active-round__versus">
          {round.stage === "countdown" ? (
            <div className="active-round__countdown">
              <span>{round.countdown}</span>
              <p>Reveal in</p>
            </div>
          ) : (
            <span className="active-round__vs">vs</span>
          )}
        </div>
        <PlayerDial
          label="Target"
          player={target}
          value={targetPick}
          odds={round.dare.odds}
          disabled={picksLocked}
          onChange={(value) => onUpdatePick(target.id, value)}
        />
      </div>

      {round.stage === "collecting" && (
        <footer className="active-round__actions">
          <button className="text-button" type="button" onClick={onCancel}>
            Cancel round
          </button>
          <button className="button" type="button" disabled={!picksReady} onClick={onLock}>
            Lock numbers & start countdown
          </button>
        </footer>
      )}

      {round.stage === "countdown" && (
        <footer className="active-round__actions">
          <button className="text-button" type="button" onClick={onCancel}>
            Abort round
          </button>
          <div className="active-round__hint">Hold tight! Countdown is live.</div>
        </footer>
      )}

      {round.stage === "reveal" && (
        <div className="active-round__reveal">
          <p className={`active-round__result${matched ? " is-match" : ""}`}>
            {matched ? "Numbers match! The dare is on." : "They dodged it this time."}
          </p>
          <div className="active-round__resolution">
            {(Object.keys(resolutionLabels) as RoundResolution[]).map((resolution) => (
              <button
                key={resolution}
                className="button button--ghost"
                type="button"
                onClick={() => onResolve(resolution)}
              >
                {resolutionLabels[resolution]}
              </button>
            ))}
          </div>
        </div>
      )}

      {isResolved && (
        <div className="active-round__reveal">
          <p className={`active-round__result${round.matched ? " is-match" : ""}`}>
            {round.matched
              ? `Match! ${target.icon} ${target.name} owes the dare.`
              : `${target.icon} ${target.name} slips free.`}
          </p>
          <p className="active-round__resolved-note">Outcome: {round.resolution && resolutionLabels[round.resolution]}</p>
          <footer className="active-round__actions">
            <button className="button" type="button" onClick={onArchive}>
              Clear round
            </button>
          </footer>
        </div>
      )}
    </section>
  );
};

interface PlayerDialProps {
  label: string;
  player: Player;
  value: number;
  odds: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

const PlayerDial = ({ label, player, value, odds, disabled, onChange }: PlayerDialProps) => {
  return (
    <div className="player-dial" style={{ borderColor: player.color }}>
      <header>
        <span className="player-dial__label">{label}</span>
        <span className="player-dial__identity">
          <span className="player-dial__icon" style={{ background: player.color }}>
            {player.icon}
          </span>
          {player.name}
        </span>
      </header>
      <div className="player-dial__body">
        <input
          type="range"
          min={1}
          max={odds}
          value={value || 1}
          onChange={(event) => onChange(Number(event.target.value))}
          disabled={disabled}
        />
        <div className="player-dial__value">
          <span>{value || "?"}</span>
          <small>Pick 1-{odds}</small>
        </div>
      </div>
    </div>
  );
};

export default ActiveRoundStage;
