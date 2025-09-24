import { FormEvent, useEffect, useMemo, useState } from "react";
import { DareConfig, Player } from "../types";

interface DareComposerProps {
  players: Player[];
  disabled: boolean;
  onLaunch: (config: DareConfig) => void;
}

const darePrompts = [
  "Sing the chorus of your favorite guilty-pleasure song",
  "Do a dramatic reading of the last text you sent",
  "Balance a cup on your head for ten seconds",
  "Let the challenger redesign your avatar",
  "Speak in rhyme for the next round",
  "Share a surprising fun fact about yourself",
];

const DareComposer = ({ players, disabled, onLaunch }: DareComposerProps) => {
  const [challengerId, setChallengerId] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [stakes, setStakes] = useState<string>("");
  const [odds, setOdds] = useState<number>(6);

  const canPlay = players.length >= 2;

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
    if (odds <= 4) return "Spicy";
    if (odds <= 8) return "Bold";
    if (odds <= 12) return "Classic";
    if (odds <= 16) return "Stretch";
    return "Long shot";
  }, [odds]);

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

  const randomizePrompt = () => {
    const candidates = darePrompts.filter((prompt) => prompt !== description.trim());
    const choice = candidates[Math.floor(Math.random() * candidates.length)];
    setDescription(choice ?? "");
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
          <p className="panel__eyebrow">Set the dare</p>
          <h2 className="panel__title">Odds builder</h2>
        </div>
        <button
          type="button"
          className="text-button"
          onClick={randomizePrompt}
          disabled={!canPlay || disabled}
        >
          Inspire me
        </button>
      </header>

      {!canPlay ? (
        <p className="panel__empty">Add at least two players to open the odds board.</p>
      ) : (
        <form className="composer" onSubmit={handleSubmit}>
          <div className="composer__row">
            <label>
              <span>Challenger</span>
              <select value={challengerId} onChange={(event) => setChallengerId(event.target.value)}>
                <option value="" disabled>
                  Select a challenger
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
              aria-label="Swap challenger and target"
            >
              ⇄
            </button>
            <label>
              <span>Target</span>
              <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                <option value="" disabled>
                  Select a target
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
            <span>Dare prompt</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the dare everyone is playing for"
              rows={3}
              maxLength={140}
            />
          </label>

          <label className="composer__field">
            <span>Sweetener</span>
            <input
              value={stakes}
              onChange={(event) => setStakes(event.target.value)}
              placeholder="Add a reward or twist (optional)"
              maxLength={80}
            />
          </label>

          <div className="composer__odds">
            <div>
              <p>Odds range</p>
              <p className="composer__odds-value">
                1 in {odds} <span>{oddsLabel}</span>
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
            <p className="composer__hint">Lock in once both players accept the challenge.</p>
            <button className="button" type="submit" disabled={disabled}>
              Launch round
            </button>
          </footer>
        </form>
      )}
    </section>
  );
};

export default DareComposer;
