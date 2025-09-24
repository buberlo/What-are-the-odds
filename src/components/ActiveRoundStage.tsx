import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { ActiveRound, Player, RoundResolution } from "../types";
import { useTranslation } from "../i18n";

interface ActiveRoundStageProps {
  round: ActiveRound | null;
  players: Player[];
  onUpdatePick: (playerId: string, value: number) => void;
  onLock: () => void;
  onResolve: (resolution: RoundResolution) => void;
  onCancel: () => void;
  onArchive: () => void;
}

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
  const { t, dictionary } = useTranslation();
  const resolutionLabels = dictionary.activeRound.resolutionLabels;

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
            <p className="panel__eyebrow">{t("activeRound.emptyEyebrow")}</p>
            <h2 className="panel__title">{t("activeRound.emptyTitle")}</h2>
          </div>
        </header>
        <p className="panel__empty">{t("activeRound.emptyBody")}</p>
        <p className="panel__hint">{t("activeRound.emptyHint")}</p>
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

      {round.stage === "collecting" && (
        <>
          <div className="active-round__steps">
            <StepCard
              number={1}
              title={t("activeRound.collecting.passTo", {
                player: `${challenger.icon} ${challenger.name}`,
              })}
              subtitle={t("activeRound.collecting.keepSecret", { min: 1, max: round.dare.odds })}
              complete={Boolean(round.challengerPick)}
            >
              {collectingStep === "challenger" ? (
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
                  <button className="button" type="submit">{t("activeRound.collecting.lockChallenger")}</button>
                </form>
              ) : (
                <p className="active-round__step-message">
                  {t("activeRound.collecting.passDevice", {
                    player: `${target.icon} ${target.name}`,
                  })}
                </p>
              )}
            </StepCard>

            {round.challengerPick && (
              <StepCard
                number={2}
                title={t("activeRound.collecting.passTo", {
                  player: `${target.icon} ${target.name}`,
                })}
                subtitle={t("activeRound.collecting.noPeek", { min: 1, max: round.dare.odds })}
                complete={Boolean(round.targetPick)}
              >
                {collectingStep === "target" ? (
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
                    <button className="button" type="submit">{t("activeRound.collecting.lockTarget")}</button>
                  </form>
                ) : (
                  <p className="active-round__step-message">{t("activeRound.collecting.readyMessage")}</p>
                )}
              </StepCard>
            )}

            {picksReady && (
              <StepCard
                number={3}
                title={t("activeRound.collecting.readyTitle")}
                subtitle={t("activeRound.collecting.readySubtitle")}
                className="active-round__step--highlight"
              >
                <p className="active-round__step-message">{t("activeRound.collecting.readyBody")}</p>
                <button className="button" type="button" onClick={onLock}>
                  {t("activeRound.collecting.start")}
                </button>
              </StepCard>
            )}
          </div>

          <footer className="active-round__actions">
            <button className="text-button" type="button" onClick={onCancel}>
              {t("activeRound.collecting.cancel")}
            </button>
          </footer>
        </>
      )}

      {round.stage === "countdown" && (
        <div className="active-round__step active-round__step--highlight">
          <header className="active-round__step-header">
            <span className="active-round__step-number">⏱</span>
            <div>
              <p className="active-round__step-title">{t("activeRound.countdown.title")}</p>
              <p className="active-round__step-subtitle">{t("activeRound.countdown.subtitle")}</p>
            </div>
          </header>
          <div className="active-round__countdown">
            <span>{round.countdown}</span>
            <p>{t("activeRound.countdown.revealIn")}</p>
          </div>
          <footer className="active-round__actions">
            <button className="text-button" type="button" onClick={onCancel}>
              {t("activeRound.countdown.abort")}
            </button>
            <div className="active-round__hint">{t("activeRound.countdown.hint")}</div>
          </footer>
        </div>
      )}

      {round.stage === "reveal" && (
        <div className="active-round__reveal">
          <p className={`active-round__result${matched ? " is-match" : ""}`}>
            {matched ? t("activeRound.reveal.match") : t("activeRound.reveal.miss")}
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
              ? t("activeRound.resolved.match", { target: `${target.icon} ${target.name}` })
              : t("activeRound.resolved.miss", { target: `${target.icon} ${target.name}` })}
          </p>
          <div className="active-round__summary">
            <SummaryItem label={`${challenger.icon} ${challenger.name}`} value={round.challengerPick ?? "?"} />
            <SummaryItem label={`${target.icon} ${target.name}`} value={round.targetPick ?? "?"} />
          </div>
          <p className="active-round__resolved-note">
            {t("activeRound.resolved.outcome")} {round.resolution && resolutionLabels[round.resolution]}
          </p>
          <footer className="active-round__actions">
            <button className="button" type="button" onClick={onArchive}>
              {t("activeRound.resolved.clear")}
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
