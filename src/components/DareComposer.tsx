import { FormEvent, useEffect, useMemo, useState } from "react";
import { DareConfig, Player } from "../types";
import { useTranslation } from "../i18n";

interface DareComposerProps {
  players: Player[];
  disabled: boolean;
  onLaunch: (config: DareConfig) => void;
}

const shufflePrompts = (items: readonly string[]) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

const DareComposer = ({ players, disabled, onLaunch }: DareComposerProps) => {
  const { t, dictionary } = useTranslation();
  const [challengerId, setChallengerId] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [stakes, setStakes] = useState<string>("");
  const [odds, setOdds] = useState<number>(6);
  const [promptQueue, setPromptQueue] = useState<string[]>([]);

  const canPlay = players.length >= 2;
  const prompts = dictionary.composer.prompts;
  const heatLevels = dictionary.composer.heat;

  useEffect(() => {
    if (!canPlay) {
      setChallengerId("");
      setTargetId("");
      return;
    }

    if (challengerId && !players.some((player) => player.id === challengerId)) {
      setChallengerId("");
    }

    if (targetId && !players.some((player) => player.id === targetId)) {
      setTargetId("");
    }

    if (challengerId && targetId && challengerId === targetId) {
      setTargetId("");
    }
  }, [canPlay, players, challengerId, targetId]);

  const oddsLabel = useMemo(() => {
    if (odds <= 4) return heatLevels.spicy;
    if (odds <= 8) return heatLevels.bold;
    if (odds <= 12) return heatLevels.classic;
    if (odds <= 16) return heatLevels.stretch;
    return heatLevels.longShot;
  }, [heatLevels, odds]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canPlay || disabled) return;
    if (!challengerId || !targetId || challengerId === targetId) return;
    if (!description.trim()) return;

    onLaunch({
      challengerId,
      targetId,
      description: description.trim(),
      odds,
      stakes: stakes.trim() || undefined,
    });

    setDescription("");
    setStakes("");
    setOdds(6);
  };

  useEffect(() => {
    setPromptQueue([]);
  }, [prompts]);

  const randomizePrompt = () => {
    setPromptQueue((currentQueue) => {
      let nextQueue = currentQueue;
      if (nextQueue.length === 0) {
        const trimmed = description.trim();
        const available = trimmed
          ? prompts.filter((prompt) => prompt !== trimmed)
          : prompts;
        nextQueue = shufflePrompts(available);
      }

      const [nextPrompt, ...rest] = nextQueue;
      setDescription(nextPrompt ?? "");
      return rest;
    });
  };

  const swapPlayers = () => {
    if (!challengerId || !targetId) return;
    setChallengerId(targetId);
    setTargetId(challengerId);
  };

  return (
    <section className="panel">
      <header className="panel__header">
        <div>
          <p className="panel__eyebrow">{t("composer.eyebrow")}</p>
          <h2 className="panel__title">{t("composer.title")}</h2>
        </div>
        <button
          type="button"
          className="text-button"
          onClick={randomizePrompt}
          disabled={!canPlay || disabled}
        >
          {t("composer.inspire")}
        </button>
      </header>

      {!canPlay ? (
        <p className="panel__empty">{t("composer.empty")}</p>
      ) : (
        <form className="composer" onSubmit={handleSubmit}>
          <div className="composer__row">
            <label>
              <span>{t("composer.challengerLabel")}</span>
              <select value={challengerId} onChange={(event) => setChallengerId(event.target.value)}>
                <option value="" disabled>
                  {t("composer.challengerPlaceholder")}
                </option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.icon} {player.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="composer__swap"
              onClick={swapPlayers}
              disabled={disabled || !challengerId || !targetId}
              aria-label={t("composer.swapAria")}
            >
              ⇄
            </button>
            <label>
              <span>{t("composer.targetLabel")}</span>
              <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                <option value="" disabled>
                  {t("composer.targetPlaceholder")}
                </option>
                {players
                  .filter((player) => player.id !== challengerId)
                  .map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.icon} {player.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <label className="composer__field">
            <span>{t("composer.promptLabel")}</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("composer.promptPlaceholder")}
              rows={3}
              maxLength={140}
            />
          </label>

          <label className="composer__field">
            <span>{t("composer.sweetenerLabel")}</span>
            <input
              value={stakes}
              onChange={(event) => setStakes(event.target.value)}
              placeholder={t("composer.sweetenerPlaceholder")}
              maxLength={80}
            />
          </label>

          <div className="composer__odds">
            <div>
              <p>{t("composer.oddsRangeLabel")}</p>
              <p className="composer__odds-value">
                {t("composer.oddsValue", { value: odds })} <span>{oddsLabel}</span>
              </p>
            </div>
            <input
              type="range"
              min={2}
              max={20}
              value={odds}
              onChange={(event) => setOdds(Number(event.target.value))}
            />
          </div>

          <footer className="composer__footer">
            <p className="composer__hint">{t("composer.hint")}</p>
            <button className="button" type="submit" disabled={disabled || !canPlay}>
              {t("composer.launch")}
            </button>
          </footer>
        </form>
      )}
    </section>
  );
};

export default DareComposer;
