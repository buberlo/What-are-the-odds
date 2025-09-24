import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
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

type CollectingStep = "challenger" | "target" | "ready";

const ActiveRoundStage = ({
  round,
  players,
  onUpdatePick,
  onLock,
  onResolve,
  onCancel,
  onArchive,
}: ActiveRoundStageProps) => {
  const [entryValue, setEntryValue] = useState<string>("");
  const [entryError, setEntryError] = useState<string>("");

  const challenger = useMemo(
    () => players.find((player) => player.id === round?.dare.challengerId),
    [players, round?.dare.challengerId],
  );
  const target = useMemo(
    () => players.find((player) => player.id === round?.dare.targetId),
    [players, round?.dare.targetId],
  );

  const collectingStep = useMemo<CollectingStep | null>(() => {
    if (!round || round.stage !== "collecting") return null;
    if (!round.challengerPick) return "challenger";
    if (!round.targetPick) return "target";
    return "ready";
  }, [round]);

  useEffect(() => {
    setEntryValue("");
    setEntryError("");
  }, [round?.id, collectingStep]);

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

  const picksReady = Boolean(round.challengerPick && round.targetPick);
  const revealVisible = round.stage === "reveal" || round.stage === "resolved";
  const isResolved = round.stage === "resolved";
  const matched = revealVisible ? round.challengerPick === round.targetPick : null;

  const handleSubmit = (playerId: string) => (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!round) return;

    const trimmed = entryValue.trim();
    const numericValue = Number(trimmed);

    if (!trimmed || !Number.isInteger(numericValue) || Number.isNaN(numericValue)) {
      setEntryError(`Enter a whole number between 1 and ${round.dare.odds}.`);
      return;
    }

    if (numericValue < 1 || numericValue > round.dare.odds) {
      setEntryError(`Pick a number between 1 and ${round.dare.odds}.`);
      return;
    }

    setEntryError("");
    setEntryValue("");
    onUpdatePick(playerId, numericValue);
  };

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

      {round.stage === "collecting" && (
        <>
          <div className="active-round__steps">
            <StepCard
              number={1}
              title={`Pass to ${challenger.icon} ${challenger.name}`}
              subtitle={`Keep it secret. Pick 1-${round.dare.odds}.`}
              complete={Boolean(round.challengerPick)}
            >
              {collectingStep === "challenger" ? (
                <form className="active-round__form" onSubmit={handleSubmit(challenger.id)}>
                  <label className="active-round__form-label" htmlFor="challenger-pick">
                    Enter your number between 1 and {round.dare.odds}
                  </label>
                  <input
                    id="challenger-pick"
                    type="number"
                    min={1}
                    max={round.dare.odds}
                    inputMode="numeric"
                    placeholder={`1-${round.dare.odds}`}
                    value={entryValue}
                    onChange={(event) => setEntryValue(event.target.value)}
                    autoFocus
                  />
                  {entryError && <p className="active-round__error">{entryError}</p>}
                  <button className="button" type="submit">
                    Lock in challenger number
                  </button>
                </form>
              ) : (
                <p className="active-round__step-message">
                  Secret number locked in. Pass the device to {target.icon} {target.name}.
                </p>
              )}
            </StepCard>

            {round.challengerPick && (
              <StepCard
                number={2}
                title={`Pass to ${target.icon} ${target.name}`}
                subtitle={`No peeking. Pick 1-${round.dare.odds}.`}
                complete={Boolean(round.targetPick)}
              >
                {collectingStep === "target" ? (
                  <form className="active-round__form" onSubmit={handleSubmit(target.id)}>
                    <label className="active-round__form-label" htmlFor="target-pick">
                      Enter your number between 1 and {round.dare.odds}
                    </label>
                    <input
                      id="target-pick"
                      type="number"
                      min={1}
                      max={round.dare.odds}
                      inputMode="numeric"
                      placeholder={`1-${round.dare.odds}`}
                      value={entryValue}
                      onChange={(event) => setEntryValue(event.target.value)}
                      autoFocus
                    />
                    {entryError && <p className="active-round__error">{entryError}</p>}
                    <button className="button" type="submit">
                      Lock in target number
                    </button>
                  </form>
                ) : (
                  <p className="active-round__step-message">
                    Secret number locked in. Gather everyone for the reveal.
                  </p>
                )}
              </StepCard>
            )}

            {picksReady && (
              <StepCard
                number={3}
                title="Get ready to reveal"
                subtitle="No numbers shown until the countdown ends."
                className="active-round__step--highlight"
              >
                <p className="active-round__step-message">
                  When everyone&apos;s watching, launch the countdown to show the picks.
                </p>
                <button className="button" type="button" onClick={onLock}>
                  Start countdown
                </button>
              </StepCard>
            )}
          </div>

          <footer className="active-round__actions">
            <button className="text-button" type="button" onClick={onCancel}>
              Cancel round
            </button>
          </footer>
        </>
      )}

      {round.stage === "countdown" && (
        <div className="active-round__step active-round__step--highlight">
          <header className="active-round__step-header">
            <span className="active-round__step-number">⏱</span>
            <div>
              <p className="active-round__step-title">Countdown in progress</p>
              <p className="active-round__step-subtitle">Numbers reveal when the timer hits zero.</p>
            </div>
          </header>
          <div className="active-round__countdown">
            <span>{round.countdown}</span>
            <p>Reveal in</p>
          </div>
          <footer className="active-round__actions">
            <button className="text-button" type="button" onClick={onCancel}>
              Abort round
            </button>
            <div className="active-round__hint">Hold tight! Countdown is live.</div>
          </footer>
        </div>
      )}

      {round.stage === "reveal" && (
        <div className="active-round__reveal">
          <p className={`active-round__result${matched ? " is-match" : ""}`}>
            {matched ? "Numbers match! The dare is on." : "They dodged it this time."}
          </p>
          <div className="active-round__summary">
            <SummaryItem label={`${challenger.icon} ${challenger.name}`} value={round.challengerPick ?? "?"} />
            <SummaryItem label={`${target.icon} ${target.name}`} value={round.targetPick ?? "?"} />
          </div>
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
          <div className="active-round__summary">
            <SummaryItem label={`${challenger.icon} ${challenger.name}`} value={round.challengerPick ?? "?"} />
            <SummaryItem label={`${target.icon} ${target.name}`} value={round.targetPick ?? "?"} />
          </div>
          <p className="active-round__resolved-note">
            Outcome: {round.resolution && resolutionLabels[round.resolution]}
          </p>
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

interface StepCardProps {
  number: number;
  title: string;
  subtitle?: string;
  complete?: boolean;
  className?: string;
  children: ReactNode;
}

const StepCard = ({ number, title, subtitle, complete, className, children }: StepCardProps) => {
  return (
    <div className={`active-round__step${complete ? " is-complete" : ""}${className ? ` ${className}` : ""}`}>
      <header className="active-round__step-header">
        <span className="active-round__step-number">{number}</span>
        <div>
          <p className="active-round__step-title">{title}</p>
          {subtitle && <p className="active-round__step-subtitle">{subtitle}</p>}
        </div>
      </header>
      <div className="active-round__step-body">{children}</div>
    </div>
  );
};

interface SummaryItemProps {
  label: string;
  value: number | string;
}

const SummaryItem = ({ label, value }: SummaryItemProps) => (
  <div className="active-round__summary-item">
    <span className="active-round__summary-label">{label}</span>
    <span className="active-round__summary-value">{value}</span>
  </div>
);

export default ActiveRoundStage;
