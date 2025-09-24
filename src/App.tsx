import { ChangeEvent, useEffect, useMemo, useState } from "react";
import ActiveRoundStage from "./components/ActiveRoundStage";
import DareComposer from "./components/DareComposer";
import HistoryPanel from "./components/HistoryPanel";
import HowToPlayCard from "./components/HowToPlayCard";
import PlayerRoster from "./components/PlayerRoster";
import StatsPanel from "./components/StatsPanel";
import { TranslationProvider, useTranslation, type Language } from "./i18n";
import {
  ActiveRound,
  DareConfig,
  Player,
  RoundHistoryEntry,
  RoundResolution,
} from "./types";

const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);

const createPlayer = (name: string, icon: string, color: string): Player => ({
  id: makeId(),
  name,
  icon,
  color,
  wins: 0,
  losses: 0,
  daresCompleted: 0,
});

const AppContent = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [activeRound, setActiveRound] = useState<ActiveRound | null>(null);
  const [history, setHistory] = useState<RoundHistoryEntry[]>([]);
  const [roundsLaunched, setRoundsLaunched] = useState<number>(0);

  const { t, language, setLanguage, languageLabel, languageOptions, availableLanguages } = useTranslation();

  const launchRound = (config: DareConfig) => {
    const nextRound: ActiveRound = {
      id: makeId(),
      dare: config,
      stage: "collecting",
      countdown: 3,
      startedAt: Date.now(),
    };
    setActiveRound(nextRound);
    setRoundsLaunched((value) => value + 1);
  };

  const addPlayer = ({ name, icon, color }: { name: string; icon: string; color: string }) => {
    setPlayers((current) => [...current, createPlayer(name, icon, color)]);
  };

  const removePlayer = (id: string) => {
    setPlayers((current) => current.filter((player) => player.id !== id));
  };

  const updatePick = (playerId: string, value: number) => {
    setActiveRound((current) => {
      if (!current || current.stage !== "collecting") return current;
      if (![current.dare.challengerId, current.dare.targetId].includes(playerId)) {
        return current;
      }
      if (value < 1 || value > current.dare.odds) return current;
      if (playerId === current.dare.challengerId) {
        return { ...current, challengerPick: value };
      }
      return { ...current, targetPick: value };
    });
  };

  const lockRound = () => {
    setActiveRound((current) => {
      if (!current) return current;
      if (!current.challengerPick || !current.targetPick) return current;
      return { ...current, stage: "countdown", countdown: 3 };
    });
  };

  const cancelRound = () => {
    setActiveRound(null);
  };

  const archiveRound = () => {
    setActiveRound(null);
  };

  const resolveRound = (resolution: RoundResolution) => {
    setActiveRound((current) => {
      if (!current) return current;
      const challengerPick = current.challengerPick ?? 0;
      const targetPick = current.targetPick ?? 0;
      if (!challengerPick || !targetPick) return current;

      const matched = challengerPick === targetPick;

      setHistory((entries) => [
        {
          id: current.id,
          dare: current.dare,
          challengerPick,
          targetPick,
          matched,
          resolution,
          timestamp: Date.now(),
        },
        ...entries,
      ]);

      setPlayers((roster) =>
        roster.map((player) => {
          if (player.id === current.dare.challengerId) {
            return {
              ...player,
              wins: player.wins + (matched ? 1 : 0),
              losses: player.losses + (matched ? 0 : 1),
            };
          }
          if (player.id === current.dare.targetId) {
            return {
              ...player,
              wins: player.wins + (matched ? 0 : 1),
              losses: player.losses + (matched ? 1 : 0),
              daresCompleted:
                player.daresCompleted + (matched && resolution !== "declined" ? 1 : 0),
            };
          }
          return player;
        }),
      );

      return {
        ...current,
        stage: "resolved",
        matched,
        resolution,
      };
    });
  };

  useEffect(() => {
    if (!activeRound) return;
    if (activeRound.stage !== "countdown") return;

    if (activeRound.countdown <= 0) {
      setActiveRound((current) => (current ? { ...current, stage: "reveal", countdown: 0 } : current));
      return;
    }

    const timer = window.setTimeout(() => {
      setActiveRound((current) => {
        if (!current || current.stage !== "countdown") return current;
        if (current.countdown <= 1) {
          return { ...current, stage: "reveal", countdown: 0 };
        }
        return { ...current, countdown: current.countdown - 1 };
      });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [activeRound]);

  useEffect(() => {
    if (!activeRound) return;
    const challengerExists = players.some((player) => player.id === activeRound.dare.challengerId);
    const targetExists = players.some((player) => player.id === activeRound.dare.targetId);
    if (!challengerExists || !targetExists) {
      setActiveRound(null);
    }
  }, [players, activeRound]);

  const heroPlayers = useMemo(() => players.slice(0, 3), [players]);
  const totalDaresCompleted = useMemo(
    () => players.reduce((total, player) => total + player.daresCompleted, 0),
    [players],
  );

  const handleLanguageChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setLanguage(event.target.value as Language);
  };

  return (
    <div className="app-frame">
      <header className="app-header">
        <div className="app-header__bar">
          <div className="app-logo">
            <span className="app-logo__mark">🎲</span>
            <div className="app-logo__text">
              <span className="app-logo__title">What are the odds?!</span>
              <span className="app-logo__tagline">{t("app.hero.eyebrow")}</span>
            </div>
          </div>
          <label className="app-header__language">
            <span>{languageLabel}</span>
            <select value={language} onChange={handleLanguageChange}>
              {availableLanguages.map((code) => (
                <option key={code} value={code}>
                  {languageOptions[code]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="app-header__body">
          <div className="app-header__copy">
            <p className="app-header__eyebrow">{t("app.hero.eyebrow")}</p>
            <h1 className="app-header__title">{t("app.hero.title")}</h1>
            <p className="app-header__subtitle">{t("app.hero.subtitle")}</p>
            {heroPlayers.length > 0 && (
              <div className="app-header__avatars" aria-label={t("app.hero.quickStats.players")}>
                {heroPlayers.map((player) => (
                  <span key={player.id} style={{ background: player.color }}>
                    {player.icon}
                  </span>
                ))}
              </div>
            )}
          </div>
          <dl className="app-header__stats">
            <div>
              <dt>{t("app.hero.quickStats.players")}</dt>
              <dd>{players.length}</dd>
            </div>
            <div>
              <dt>{t("app.hero.quickStats.rounds")}</dt>
              <dd>{roundsLaunched}</dd>
            </div>
            <div>
              <dt>{t("app.hero.quickStats.dares")}</dt>
              <dd>{totalDaresCompleted}</dd>
            </div>
          </dl>
        </div>
      </header>

      <main className="app-main">
        <div className="app-grid">
          <div className="app-grid__column app-grid__column--primary">
            <ActiveRoundStage
              round={activeRound}
              players={players}
              onUpdatePick={updatePick}
              onLock={lockRound}
              onResolve={resolveRound}
              onCancel={cancelRound}
              onArchive={archiveRound}
            />
            <DareComposer players={players} disabled={Boolean(activeRound)} onLaunch={launchRound} />
            <HistoryPanel history={history} players={players} />
          </div>
          <div className="app-grid__column app-grid__column--secondary">
            <PlayerRoster players={players} onAdd={addPlayer} onRemove={removePlayer} />
            <StatsPanel players={players} roundsPlayed={roundsLaunched} />
            <HowToPlayCard />
          </div>
        </div>
      </main>
    </div>
  );
};

const App = () => {
  const [language, setLanguage] = useState<Language>("en");

  return (
    <TranslationProvider language={language} setLanguage={setLanguage}>
      <AppContent />
    </TranslationProvider>
  );
};

export default App;
