import { useMemo } from "react";
import { Player } from "../types";
import { useTranslation } from "../i18n";

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

  const { totals, sortedPlayers } = useMemo(() => {
    const totals = players.reduce(
      (acc, player) => {
        acc.dares += player.daresCompleted;
        acc.wins += player.wins;
        return acc;
      },
      { dares: 0, wins: 0 },
    );

    return { totals, sortedPlayers: sortPlayersForShelf(players) };
  }, [players]);

  const [goldPlayer, silverPlayer, bronzePlayer] = sortedPlayers;
  const restPlayers = sortedPlayers.slice(3);
  const supportCount = restPlayers.length;

  const plainNote =
    supportCount === 0
      ? t("stats.trophies.plainNoteSolo")
      : supportCount === 1
        ? t("stats.trophies.plainNoteOne")
        : t("stats.trophies.plainNoteMany", { count: supportCount });

  const sessionStats = [
    { label: t("stats.sessionRoundsLabel"), value: roundsPlayed },
    { label: t("stats.sessionDaresLabel"), value: totals.dares },
    { label: t("stats.sessionWinsLabel"), value: totals.wins },
  ];

  return (
    <section className="panel therapy-room">
      <header className="panel__header therapy-room__header">
        <div>
          <p className="panel__eyebrow">{t("stats.eyebrow")}</p>
          <h2 className="panel__title">{t("stats.title")}</h2>
          <p className="therapy-room__subtitle">{t("stats.subtitle")}</p>
        </div>
      </header>

      <div className="therapy-room__scene">
        <div className="therapy-room__scene-visual" aria-hidden="true">
          <span className="therapy-room__icon therapy-room__icon--couch">🛋️</span>
          <span className="therapy-room__icon therapy-room__icon--plant">🪴</span>
          <span className="therapy-room__icon therapy-room__icon--candle">🕯️</span>
        </div>
        <div className="therapy-room__scene-body">
          <p className="therapy-room__mantra">{t("stats.sessionMantra")}</p>
          <ul className="therapy-room__stats">
            {sessionStats.map((item) => (
              <li key={item.label}>
                <span className="therapy-room__stat-value">{item.value}</span>
                <span className="therapy-room__stat-label">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="therapy-room__shelf" aria-label={t("stats.shelfLabel")}>
        <div className="therapy-room__trophy therapy-room__trophy--plain">
          <div className="therapy-room__trophy-head">
            <span className="therapy-room__trophy-icon" aria-hidden="true">
              🏵️
            </span>
            <div className="therapy-room__trophy-copy">
              <p className="therapy-room__trophy-label">{t("stats.trophies.plainLabel")}</p>
              <p className="therapy-room__trophy-note">{plainNote}</p>
            </div>
          </div>
          {supportCount > 0 ? (
            <ul className="therapy-room__supporters">
              {restPlayers.map((player) => (
                <li key={player.id}>
                  <span className="therapy-room__supporter-avatar" style={{ background: player.color }}>
                    {player.icon}
                  </span>
                  <span className="therapy-room__supporter-name">{player.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="therapy-room__trophy-empty">{t("stats.trophies.plainEmpty")}</p>
          )}
        </div>

        <div className="therapy-room__trophy therapy-room__trophy--gold">
          <div className="therapy-room__trophy-head">
            <span className="therapy-room__trophy-icon" aria-hidden="true">
              🏆
            </span>
            <div>
              <p className="therapy-room__trophy-label">{t("stats.trophies.goldLabel")}</p>
              <p className="therapy-room__trophy-note">{t("stats.trophies.goldNote")}</p>
            </div>
          </div>
          {goldPlayer ? (
            <div className="therapy-room__trophy-player" style={{ borderColor: goldPlayer.color }}>
              <span className="therapy-room__trophy-avatar" style={{ background: goldPlayer.color }}>
                {goldPlayer.icon}
              </span>
              <div className="therapy-room__trophy-details">
                <p className="therapy-room__trophy-name">{goldPlayer.name}</p>
                <p className="therapy-room__trophy-meta">
                  {t("stats.sharedWins", { wins: goldPlayer.wins })} · {t("stats.sharedDares", { dares: goldPlayer.daresCompleted })}
                </p>
              </div>
            </div>
          ) : (
            <p className="therapy-room__trophy-empty">{t("stats.trophies.goldEmpty")}</p>
          )}
        </div>

        <div className="therapy-room__trophy therapy-room__trophy--silver">
          <div className="therapy-room__trophy-head">
            <span className="therapy-room__trophy-icon" aria-hidden="true">
              🏆
            </span>
            <div className="therapy-room__trophy-copy">
              <p className="therapy-room__trophy-label">{t("stats.trophies.silverLabel")}</p>
              <p className="therapy-room__trophy-note">{t("stats.trophies.silverNote")}</p>
            </div>
          </div>
          {silverPlayer ? (
            <div className="therapy-room__trophy-player" style={{ borderColor: silverPlayer.color }}>
              <span className="therapy-room__trophy-avatar" style={{ background: silverPlayer.color }}>
                {silverPlayer.icon}
              </span>
              <div className="therapy-room__trophy-details">
                <p className="therapy-room__trophy-name">{silverPlayer.name}</p>
                <p className="therapy-room__trophy-meta">
                  {t("stats.sharedWins", { wins: silverPlayer.wins })} · {t("stats.sharedDares", { dares: silverPlayer.daresCompleted })}
                </p>
              </div>
            </div>
          ) : (
            <p className="therapy-room__trophy-empty">{t("stats.trophies.silverEmpty")}</p>
          )}
        </div>

        <div className="therapy-room__trophy therapy-room__trophy--bronze">
          <div className="therapy-room__trophy-head">
            <span className="therapy-room__trophy-icon" aria-hidden="true">
              🏆
            </span>
            <div className="therapy-room__trophy-copy">
              <p className="therapy-room__trophy-label">{t("stats.trophies.bronzeLabel")}</p>
              <p className="therapy-room__trophy-note">{t("stats.trophies.bronzeNote")}</p>
            </div>
          </div>
          {bronzePlayer ? (
            <div className="therapy-room__trophy-player" style={{ borderColor: bronzePlayer.color }}>
              <span className="therapy-room__trophy-avatar" style={{ background: bronzePlayer.color }}>
                {bronzePlayer.icon}
              </span>
              <div className="therapy-room__trophy-details">
                <p className="therapy-room__trophy-name">{bronzePlayer.name}</p>
                <p className="therapy-room__trophy-meta">
                  {t("stats.sharedWins", { wins: bronzePlayer.wins })} · {t("stats.sharedDares", { dares: bronzePlayer.daresCompleted })}
                </p>
              </div>
            </div>
          ) : (
            <p className="therapy-room__trophy-empty">{t("stats.trophies.bronzeEmpty")}</p>
          )}
        </div>
      </div>
    </section>
  );
};

export default StatsPanel;
