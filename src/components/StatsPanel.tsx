import { useMemo } from "react";
import { Player } from "../types";
import { useTranslation } from "../i18n";
import { FEATURE_LEADERBOARDS } from "../flags";

interface StatsPanelProps {
  players: Player[];
  roundsPlayed: number;
}

const sortPlayersForShelf = (players: Player[]) =>
  [...players].sort((a, b) => {
    const winDiff = b.wins - a.wins;
    if (winDiff !== 0) return winDiff;
    const dareDiff = b.daresCompleted - a.daresCompleted;
    if (dareDiff !== 0) return dareDiff;
    return a.losses - b.losses;
  });

const StatsPanel = ({ players, roundsPlayed }: StatsPanelProps) => {
  const { t } = useTranslation();

  const { totals, sortedPlayers, daringPlayer } = useMemo(() => {
    const totals = players.reduce(
      (acc, player) => {
        acc.dares += player.daresCompleted;
        acc.wins += player.wins;
        return acc;
      },
      { dares: 0, wins: 0 },
    );

    const daringPlayer = players.reduce<Player | null>((current, contender) => {
      if (!current) return contender;
      const dareDiff = contender.daresCompleted - current.daresCompleted;
      if (dareDiff > 0) return contender;
      if (dareDiff < 0) return current;

      const winDiff = contender.wins - current.wins;
      if (winDiff > 0) return contender;
      if (winDiff < 0) return current;

      return contender.losses < current.losses ? contender : current;
    }, null);

    return { totals, sortedPlayers: sortPlayersForShelf(players), daringPlayer };
  }, [players]);

  const champion = sortedPlayers[0];
  const supporters = sortedPlayers.slice(1);
  const supportCount = supporters.length;

  const numberFormatter = useMemo(() => new Intl.NumberFormat(undefined), []);

  const summaryMetrics = [
    { label: t("stats.summary.metrics.rounds"), value: numberFormatter.format(roundsPlayed) },
    { label: t("stats.summary.metrics.dares"), value: numberFormatter.format(totals.dares) },
    { label: t("stats.summary.metrics.wins"), value: numberFormatter.format(totals.wins) },
    { label: t("stats.summary.metrics.players"), value: numberFormatter.format(players.length) },
  ];

  const highlightItems = [
    {
      icon: "🏆",
      message: champion
        ? t("stats.summary.champion", { name: champion.name })
        : t("stats.summary.championEmpty"),
    },
    {
      icon: "🔥",
      message:
        daringPlayer && daringPlayer.daresCompleted > 0
          ? t("stats.summary.daring", {
              name: daringPlayer.name,
              dares: daringPlayer.daresCompleted,
            })
          : t("stats.summary.daringEmpty"),
    },
    {
      icon: "🤝",
      message:
        supportCount === 0
          ? t("stats.summary.supportersEmpty")
          : supportCount === 1
            ? t("stats.summary.supportersOne")
            : t("stats.summary.supportersMany", { count: supportCount }),
    },
  ];

  return (
    <section className="panel trophy-room">
      <header className="panel__header trophy-room__header">
        <div>
          <p className="panel__eyebrow">{t("stats.eyebrow")}</p>
          <h2 className="panel__title">{t("stats.title")}</h2>
          <p className="trophy-room__subtitle">{t("stats.subtitle")}</p>
        </div>
      </header>

      <div className="trophy-room__summary">
        <div className="trophy-room__section-header">
          <h3 className="trophy-room__section-title">{t("stats.summary.heading")}</h3>
          <p className="trophy-room__section-note">{t("stats.sessionMantra")}</p>
        </div>

        <ul className="trophy-room__highlights">
          {highlightItems.map((item, index) => (
            <li key={`${item.icon}-${index}`} className="trophy-room__highlight">
              <span className="trophy-room__highlight-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.message}</span>
            </li>
          ))}
        </ul>

        <div className="trophy-room__summary-grid">
          {summaryMetrics.map((metric) => (
            <div key={metric.label} className="trophy-room__summary-card">
              <span className="trophy-room__summary-value">{metric.value}</span>
              <span className="trophy-room__summary-label">{metric.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="trophy-room__leaderboard" aria-label={t("stats.leaderboard.heading")}>
        <div className="trophy-room__section-header">
          <h3 className="trophy-room__section-title">{t("stats.leaderboard.heading")}</h3>
          <p className="trophy-room__section-note">{t("stats.leaderboard.caption")}</p>
        </div>

        {sortedPlayers.length > 0 ? (
          <ol className="trophy-room__leaderboard-list">
            {sortedPlayers.map((player, index) => {
              const rank = index + 1;
              const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
              const metrics = [
                { label: t("stats.leaderboard.winsLabel"), value: numberFormatter.format(player.wins) },
                {
                  label: t("stats.leaderboard.daresLabel"),
                  value: numberFormatter.format(player.daresCompleted),
                },
                { label: t("stats.leaderboard.lossesLabel"), value: numberFormatter.format(player.losses) },
              ];

              return (
                <li key={player.id} className="trophy-room__leaderboard-item">
                  <div className="trophy-room__rank" aria-label={t("stats.leaderboard.rankLabel", { rank })}>
                    <span className="trophy-room__rank-number">{rank}</span>
                    {medal && (
                      <span className="trophy-room__rank-medal" aria-hidden="true">
                        {medal}
                      </span>
                    )}
                  </div>

                  <div className="trophy-room__leaderboard-player">
                    <span
                      className="trophy-room__leaderboard-avatar"
                      style={{ background: player.color }}
                      aria-hidden="true"
                    >
                      {player.icon}
                    </span>
                    <div>
                      <p className="trophy-room__leaderboard-name">{player.name}</p>
                      <p className="trophy-room__leaderboard-summary">
                        {t("stats.leaderboard.summary", {
                          wins: numberFormatter.format(player.wins),
                          losses: numberFormatter.format(player.losses),
                          dares: numberFormatter.format(player.daresCompleted),
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="trophy-room__leaderboard-metrics">
                    {metrics.map((metric) => (
                      <div key={metric.label} className="trophy-room__leaderboard-metric">
                        <span className="trophy-room__score-label">{metric.label}</span>
                        <span className="trophy-room__score-value">{metric.value}</span>
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="trophy-room__empty">{t("stats.leaderboard.empty")}</p>
        )}
      </div>
      {FEATURE_LEADERBOARDS && (
        <div className="trophy-room__cta">
          <a href="/leaderboard">Explore global leaderboards</a>
        </div>
      )}
    </section>
  );
};

export default StatsPanel;
