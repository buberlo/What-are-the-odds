import { CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ActiveRound, Player, RoundResolution } from "../types";
import { useTranslation } from "../i18n";

interface ActiveRoundStageProps {
  round: ActiveRound | null;
  players: Player[];
  onUpdatePick: (playerId: string, value: number) => void;
  onResolve: (resolution: RoundResolution) => void;
  onCancel: () => void;
  onArchive: () => void;
}

type CollectingStep = "challenger" | "target";

type GameStepId = "challenger" | "target" | "countdown" | "reveal" | "resolved";

const ActiveRoundStage = ({
  round,
  players,
  onUpdatePick,
  onResolve,
  onCancel,
  onArchive,
}: ActiveRoundStageProps) => {
  const [entryValue, setEntryValue] = useState<string>("");
  const [entryError, setEntryError] = useState<string>("");
  const { t, dictionary } = useTranslation();
  const resolutionLabels = dictionary.activeRound.resolutionLabels;

  const transitionTimer = useRef<number | null>(null);

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
    return null;
  }, [round]);

  useEffect(() => {
    setEntryValue("");
    setEntryError("");
  }, [round?.id, collectingStep]);

  const stepOrder: GameStepId[] = ["challenger", "target", "countdown", "reveal", "resolved"];

  const currentStepId: GameStepId = useMemo(() => {
    if (!round) return "challenger";
    if (round.stage === "collecting") {
      if (collectingStep === "target") return "target";
      return "challenger";
    }
    if (round.stage === "countdown") return "countdown";
    if (round.stage === "reveal") return "reveal";
    if (round.stage === "resolved") return "resolved";
    return "challenger";
  }, [round, collectingStep]);

  const currentStepIndex = stepOrder.indexOf(currentStepId);

  const [activeStepIndex, setActiveStepIndex] = useState(currentStepIndex);
  const [leavingStepIndex, setLeavingStepIndex] = useState<number | null>(null);
  const lastRoundIdRef = useRef<string | null>(round?.id ?? null);

  useEffect(() => {
    const currentId = round?.id ?? null;
    if (lastRoundIdRef.current !== currentId) {
      setActiveStepIndex(currentStepIndex);
      setLeavingStepIndex(null);
      lastRoundIdRef.current = currentId;
    }
  }, [round?.id, currentStepIndex]);

  useEffect(() => {
    if (currentStepIndex === activeStepIndex) return;

    if (transitionTimer.current) {
      window.clearTimeout(transitionTimer.current);
    }

    setLeavingStepIndex(activeStepIndex);
    setActiveStepIndex(currentStepIndex);

    transitionTimer.current = window.setTimeout(() => {
      setLeavingStepIndex(null);
      transitionTimer.current = null;
    }, 420);

    return () => {
      if (transitionTimer.current) {
        window.clearTimeout(transitionTimer.current);
        transitionTimer.current = null;
      }
    };
  }, [currentStepIndex, activeStepIndex]);

  const completedSteps = useMemo(() => {
    const completed = new Set<GameStepId>();
    if (round?.challengerPick) completed.add("challenger");
    if (round?.targetPick) completed.add("target");
    if (round && ["reveal", "resolved"].includes(round.stage)) {
      completed.add("countdown");
    }
    if (round?.stage === "resolved") {
      completed.add("reveal");
    }
    return completed;
  }, [round]);

  useEffect(() => {
    return () => {
      if (transitionTimer.current) {
        window.clearTimeout(transitionTimer.current);
        transitionTimer.current = null;
      }
    };
  }, []);

  if (!round || !challenger || !target) {
    return (
      <section className="panel">
        <header className="panel__header">
          <div>
            <p className="panel__eyebrow">{t("activeRound.emptyEyebrow")}</p>
            <h2 className="panel__title">{t("activeRound.emptyTitle")}</h2>
          </div>
        </header>
        <p className="panel__empty">{t("activeRound.emptyBody")}</p>
        <p className="panel__hint">{t("activeRound.emptyHint")}</p>
      </section>
    );
  }

  const revealVisible = round.stage === "reveal" || round.stage === "resolved";
  const isResolved = round.stage === "resolved";
  const matched = revealVisible ? round.challengerPick === round.targetPick : null;

  type CardStyle = CSSProperties & {
    "--stack-position"?: string;
    "--completed-offset"?: string;
  };

  const handleSubmit = (playerId: string) => (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!round) return;

    const trimmed = entryValue.trim();
    const numericValue = Number(trimmed);

    if (!trimmed || !Number.isInteger(numericValue) || Number.isNaN(numericValue)) {
      setEntryError(t("activeRound.errors.wholeNumber", { min: 1, max: round.dare.odds }));
      return;
    }

    if (numericValue < 1 || numericValue > round.dare.odds) {
      setEntryError(t("activeRound.errors.range", { min: 1, max: round.dare.odds }));
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
          <p className="panel__eyebrow">{t("activeRound.eyebrow")}</p>
          <h2 className="panel__title">{t("activeRound.title", { value: round.dare.odds })}</h2>
        </div>
        <span className="panel__badge">{t("activeRound.badge", { id: round.id.slice(-4) })}</span>
      </header>

      <div className="active-round__dare">
        <p className="active-round__prompt">{round.dare.description}</p>
        {round.dare.stakes && (
          <p className="active-round__stakes">
            {t("activeRound.bonusLabel")}: {round.dare.stakes}
          </p>
        )}
      </div>

      <div className="active-round__stack card-stack" role="list">
        {stepOrder.map((stepId, index) => {
          const isCurrent = index === activeStepIndex;
          const isCompleted = completedSteps.has(stepId) && index < activeStepIndex;
          const isUpcoming = index > activeStepIndex;
          const isHidden = index - activeStepIndex > 3;
          const isLeaving = leavingStepIndex === index;
          const isPromoting = leavingStepIndex !== null && index === activeStepIndex;

          const classNames = ["card-stack__card", "active-round__card"];

          if (isCurrent) {
            classNames.push("card-stack__card--current", "card-stack__card--active");
          }
          if (isPromoting) {
            classNames.push("card-stack__card--promoting");
          }
          if (isLeaving) {
            classNames.push("card-stack__card--advancing");
          }
          if (isUpcoming) {
            classNames.push("card-stack__card--upcoming");
          }
          if (isHidden) {
            classNames.push("card-stack__card--hidden");
          }
          if (isCompleted) {
            classNames.push("card-stack__card--completed");
          }

          const style: CardStyle = {
            zIndex: stepOrder.length - index,
          };

          if (isUpcoming) {
            const clamped = Math.min(Math.max(index - activeStepIndex, 0), 3);
            style["--stack-position"] = clamped.toString();
          }

          if (index < activeStepIndex) {
            const depth = Math.min(activeStepIndex - index, 3);
            style["--completed-offset"] = depth.toString();
          }

          const stepNumber = index + 1;

          let title = "";
          let subtitle: string | undefined;
          let body: JSX.Element | null = null;
          let actions: JSX.Element | null = null;
          let numberDisplay: string | number = stepNumber;

          switch (stepId) {
            case "challenger": {
              title = t("activeRound.collecting.passTo", {
                player: `${challenger.icon} ${challenger.name}`,
              });
              subtitle = t("activeRound.collecting.keepSecret", {
                min: 1,
                max: round.dare.odds,
              });

              if (isCurrent && round.stage === "collecting" && collectingStep !== "target") {
                body = (
                  <form className="active-round__form" onSubmit={handleSubmit(challenger.id)}>
                    <label className="active-round__form-label" htmlFor="challenger-pick">
                      {t("activeRound.collecting.formLabel", { min: 1, max: round.dare.odds })}
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
                      {t("activeRound.collecting.lockChallenger")}
                    </button>
                  </form>
                );
              } else if (round.challengerPick) {
                body = (
                  <p className="active-round__step-message">
                    {t("activeRound.collecting.passDevice", {
                      player: `${target.icon} ${target.name}`,
                    })}
                  </p>
                );
              }

              if (round.stage === "collecting" && isCurrent) {
                actions = (
                  <div className="card-stack__card-actions active-round__actions">
                    <button className="text-button" type="button" onClick={onCancel}>
                      {t("activeRound.collecting.cancel")}
                    </button>
                  </div>
                );
              }
              break;
            }
            case "target": {
              title = t("activeRound.collecting.passTo", {
                player: `${target.icon} ${target.name}`,
              });
              subtitle = t("activeRound.collecting.noPeek", {
                min: 1,
                max: round.dare.odds,
              });

              if (isCurrent && round.stage === "collecting" && collectingStep === "target") {
                body = (
                  <>
                    <p className="active-round__step-message">
                      {t("activeRound.collecting.passDevice", {
                        player: `${target.icon} ${target.name}`,
                      })}
                    </p>
                    <form className="active-round__form" onSubmit={handleSubmit(target.id)}>
                      <label className="active-round__form-label" htmlFor="target-pick">
                        {t("activeRound.collecting.formLabel", { min: 1, max: round.dare.odds })}
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
                        {t("activeRound.collecting.lockTarget")}
                      </button>
                    </form>
                  </>
                );
              } else if (round.targetPick) {
                body = (
                  <p className="active-round__step-message">
                    {t("activeRound.collecting.readyMessage")}
                  </p>
                );
              }

              if (round.stage === "collecting" && isCurrent) {
                actions = (
                  <div className="card-stack__card-actions active-round__actions">
                    <button className="text-button" type="button" onClick={onCancel}>
                      {t("activeRound.collecting.cancel")}
                    </button>
                  </div>
                );
              }
              break;
            }
            case "countdown": {
              numberDisplay = "⏱";
              title = t("activeRound.countdown.title");
              subtitle = t("activeRound.countdown.subtitle");
              if (round.stage === "countdown" && isCurrent) {
                body = (
                  <div className="active-round__countdown">
                    <span>{round.countdown}</span>
                    <p>{t("activeRound.countdown.revealIn")}</p>
                  </div>
                );
                actions = (
                  <div className="card-stack__card-actions active-round__actions">
                    <button className="text-button" type="button" onClick={onCancel}>
                      {t("activeRound.countdown.abort")}
                    </button>
                    <div className="active-round__hint">{t("activeRound.countdown.hint")}</div>
                  </div>
                );
              } else if (round.stage !== "collecting") {
                body = (
                  <p className="active-round__step-message">
                    {t("activeRound.collecting.readyBody")}
                  </p>
                );
              }
              break;
            }
            case "reveal": {
              title = t("activeRound.collecting.readyTitle");
              subtitle = t("activeRound.collecting.readySubtitle");
              if (round.stage === "reveal" && isCurrent && matched !== null) {
                body = (
                  <div className="active-round__reveal">
                    <p className={`active-round__result${matched ? " is-match" : ""}`}>
                      {matched ? t("activeRound.reveal.match") : t("activeRound.reveal.miss")}
                    </p>
                    <div className="active-round__summary">
                      <SummaryItem
                        label={`${challenger.icon} ${challenger.name}`}
                        value={round.challengerPick ?? "?"}
                      />
                      <SummaryItem
                        label={`${target.icon} ${target.name}`}
                        value={round.targetPick ?? "?"}
                      />
                    </div>
                  </div>
                );
                actions = (
                  <div className="card-stack__card-actions active-round__resolution">
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
                );
              } else if (round.stage !== "collecting") {
                body = (
                  <p className="active-round__step-message">
                    {t("activeRound.collecting.readyBody")}
                  </p>
                );
              }
              break;
            }
            case "resolved": {
              if (isResolved) {
                numberDisplay = "✔";
                title = round.matched
                  ? t("activeRound.resolved.match", { target: `${target.icon} ${target.name}` })
                  : t("activeRound.resolved.miss", { target: `${target.icon} ${target.name}` });
                body = (
                  <div className="active-round__reveal">
                    <div className="active-round__summary">
                      <SummaryItem
                        label={`${challenger.icon} ${challenger.name}`}
                        value={round.challengerPick ?? "?"}
                      />
                      <SummaryItem
                        label={`${target.icon} ${target.name}`}
                        value={round.targetPick ?? "?"}
                      />
                    </div>
                    <p className="active-round__resolved-note">
                      {t("activeRound.resolved.outcome")} {round.resolution && resolutionLabels[round.resolution]}
                    </p>
                  </div>
                );
                actions = (
                  <div className="card-stack__card-actions active-round__actions">
                    <button className="button" type="button" onClick={onArchive}>
                      {t("activeRound.resolved.clear")}
                    </button>
                  </div>
                );
              } else {
                title = t("activeRound.collecting.readyTitle");
                subtitle = t("activeRound.collecting.readySubtitle");
              }
              break;
            }
            default:
              break;
          }

          return (
            <article
              key={stepId}
              className={classNames.join(" ")}
              style={style}
              role="listitem"
            >
              <div className="card-stack__card-content active-round__card-content">
                <header className="active-round__step-header">
                  <span className="active-round__step-number">{numberDisplay}</span>
                  <div>
                    <p className="active-round__step-title">{title}</p>
                    {subtitle && <p className="active-round__step-subtitle">{subtitle}</p>}
                  </div>
                </header>
                {body && <div className="active-round__step-body">{body}</div>}
                {actions}
              </div>
            </article>
          );
        })}
      </div>
    </section>
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
