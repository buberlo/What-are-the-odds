import { useMemo } from "react";
import { Player } from "../types";
import { useTranslation } from "../i18n";

interface StatsPanelProps {
  players: Player[];
  roundsPlayed: number;
}

const StatsPanel = ({ players, roundsPlayed }: StatsPanelProps) => {
  const { t } = useTranslation();
  const totals = useMemo(() => {
    const dares = players.reduce((sum, player) => sum + player.daresCompleted, 0);
    const wins = players.reduce((sum, player) => sum + player.wins, 0);
    const losses = players.reduce((sum, player) => sum + player.losses, 0);
    const mvp = [...players].sort((a, b) => b.daresCompleted - a.daresCompleted || b.wins - a.wins)[0];
    return { dares, wins, losses, mvp };
  }, [players]);

  return (
    <section className="panel stats">
      <header className="panel__header">
        <div>
          <p className="panel__eyebrow">{t("stats.eyebrow")}</p>
          <h2 className="panel__title">{t("stats.title")}</h2>
        </div>
      </header>

      <div className="stats__grid">
        <div className="stats__card">
          <p className="stats__label">{t("stats.roundsLabel")}</p>
          <p className="stats__value">{roundsPlayed}</p>
          <span className="stats__note">{t("stats.roundsNote")}</span>
        </div>
        <div className="stats__card">
          <p className="stats__label">{t("stats.daresLabel")}</p>
          <p className="stats__value">{totals.dares}</p>
          <span className="stats__note">
            {totals.dares > 0 ? t("stats.daresNoteSome") : t("stats.daresNoteNone")}
          </span>
        </div>
        <div className="stats__card">
          <p className="stats__label">{t("stats.recordLabel")}</p>
          <p className="stats__value">
            {totals.wins} / {totals.losses}
          </p>
          <span className="stats__note">{t("stats.recordNote")}</span>
        </div>
      </div>

      {totals.mvp && (
        <div className="stats__mvp">
          <p className="panel__eyebrow">{t("stats.mvpEyebrow")}</p>
          <div className="stats__mvp-card" style={{ borderColor: totals.mvp.color }}>
            <div className="stats__mvp-burst" style={{ background: totals.mvp.color }} />
            <div>
              <p className="stats__mvp-name">
                {totals.mvp.icon} {totals.mvp.name}
              </p>
              <p className="stats__mvp-note">
                {t("stats.mvpNote", { dares: totals.mvp.daresCompleted, wins: totals.mvp.wins })}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default StatsPanel;
