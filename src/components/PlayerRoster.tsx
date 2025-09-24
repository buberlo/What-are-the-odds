import { FormEvent, useMemo, useState } from "react";
import { Player } from "../types";
import { useTranslation } from "../i18n";

interface PlayerRosterProps {
  players: Player[];
  onAdd: (payload: { name: string; icon: string; color: string }) => void;
  onRemove: (id: string) => void;
}

const iconPool = [
  "🎲",
  "⚡️",
  "🔥",
  "🎉",
  "🎯",
  "🪩",
  "🌟",
  "💥",
  "🃏",
  "🧨",
  "🎵",
  "🧊",
];

const accentPalette = [
  "#7C3AED",
  "#2563EB",
  "#0EA5E9",
  "#F97316",
  "#EC4899",
  "#22C55E",
  "#14B8A6",
  "#F59E0B",
];

const PlayerRoster = ({ players, onAdd, onRemove }: PlayerRosterProps) => {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(iconPool[0]);
  const [color, setColor] = useState(accentPalette[0]);

  const limitReached = players.length >= 12;

  const scoreboard = useMemo(
    () =>
      [...players]
        .sort((a, b) => b.daresCompleted - a.daresCompleted || b.wins - a.wins)
        .slice(0, 3),
    [players],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || limitReached) return;
    onAdd({ name: name.trim(), icon, color });
    setName("");
    setIcon(iconPool[Math.floor(Math.random() * iconPool.length)]);
    setColor(accentPalette[Math.floor(Math.random() * accentPalette.length)]);
  };

  return (
    <section className="panel">
      <header className="panel__header">
        <div>
          <p className="panel__eyebrow">{t("roster.eyebrow")}</p>
          <h2 className="panel__title">{t("roster.title", { count: players.length })}</h2>
        </div>
        <span className="panel__badge">{t("roster.badge")}</span>
      </header>

      <p className="panel__description">{t("roster.description")}</p>

      <form className="roster-form" onSubmit={handleSubmit}>
        <label className="roster-form__input">
          <span>{t("roster.nameLabel")}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("roster.namePlaceholder")}
            maxLength={24}
          />
        </label>

        <label className="roster-form__input">
          <span>{t("roster.iconLabel")}</span>
          <select value={icon} onChange={(event) => setIcon(event.target.value)}>
            {iconPool.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="roster-form__input">
          <span>{t("roster.accentLabel")}</span>
          <div className="roster-form__colors">
            {accentPalette.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={`roster-form__color${color === swatch ? " is-active" : ""}`}
                style={{ background: swatch }}
                onClick={() => setColor(swatch)}
                aria-label={t("roster.accentAria", { color: swatch })}
              />
            ))}
          </div>
        </label>

        <button className="button" type="submit" disabled={limitReached || !name.trim()}>
          {t("roster.submit")}
        </button>
        {limitReached && <p className="roster-form__hint">{t("roster.limitHint")}</p>}
      </form>

      <ul className="roster-list">
        {players.map((player) => (
          <li key={player.id} style={{ borderColor: player.color }}>
            <div className="roster-list__identity">
              <span className="roster-list__icon" style={{ background: player.color }}>
                {player.icon}
              </span>
              <div>
                <p className="roster-list__name">{player.name}</p>
                <p className="roster-list__stats">
                  {t("roster.playerStats", {
                    wins: player.wins,
                    losses: player.losses,
                    dares: player.daresCompleted,
                  })}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="roster-list__remove"
              onClick={() => onRemove(player.id)}
              aria-label={t("roster.remove", { name: player.name })}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {players.length > 0 && (
        <aside className="roster-spotlight">
          <p className="panel__eyebrow">{t("roster.spotlightEyebrow")}</p>
          <div className="roster-spotlight__chips">
            {scoreboard.map((player) => (
              <span
                key={player.id}
                className="roster-spotlight__chip"
                style={{ borderColor: player.color }}
              >
                <span style={{ background: player.color }}>{player.icon}</span>
                {player.name}
              </span>
            ))}
            {scoreboard.length === 0 && (
              <span className="roster-spotlight__chip is-empty">{t("roster.spotlightEmpty")}</span>
            )}
          </div>
        </aside>
      )}
    </section>
  );
};

export default PlayerRoster;
