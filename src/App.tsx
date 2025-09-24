import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
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

const STORAGE_KEY = "what-are-the-odds/state";

type PersistedState = {
  players: Player[];
  history: RoundHistoryEntry[];
  roundsLaunched: number;
};

const DEFAULT_PERSISTED_STATE: PersistedState = {
  players: [],
  history: [],
  roundsLaunched: 0,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isValidDareConfig = (value: unknown): value is DareConfig => {
  if (!isRecord(value)) return false;
  const { challengerId, targetId, description, odds, stakes } = value;
  if (
    typeof challengerId !== "string" ||
    typeof targetId !== "string" ||
    typeof description !== "string" ||
    typeof odds !== "number" ||
    !Number.isFinite(odds) ||
    odds < 1
  ) {
    return false;
  }
  if (stakes !== undefined && typeof stakes !== "string") {
    return false;
  }
  return true;
};

const isValidPlayer = (value: unknown): value is Player => {
  if (!isRecord(value)) return false;
  const { id, name, icon, color, wins, losses, daresCompleted } = value;
  return (
    typeof id === "string" &&
    typeof name === "string" &&
    typeof icon === "string" &&
    typeof color === "string" &&
    typeof wins === "number" &&
    Number.isFinite(wins) &&
    typeof losses === "number" &&
    Number.isFinite(losses) &&
    typeof daresCompleted === "number" &&
    Number.isFinite(daresCompleted)
  );
};

const isValidHistoryEntry = (value: unknown): value is RoundHistoryEntry => {
  if (!isRecord(value)) return false;
  const { id, dare, challengerPick, targetPick, matched, resolution, timestamp } = value;
  if (
    typeof id !== "string" ||
    !isValidDareConfig(dare) ||
    typeof challengerPick !== "number" ||
    !Number.isFinite(challengerPick) ||
    typeof targetPick !== "number" ||
    !Number.isFinite(targetPick) ||
    typeof matched !== "boolean" ||
    typeof resolution !== "string" ||
    typeof timestamp !== "number" ||
    !Number.isFinite(timestamp)
  ) {
    return false;
  }
  return ["completed", "declined", "partial"].includes(resolution);
};

let cachedPersistedState: PersistedState | null = null;

const loadPersistedState = (): PersistedState => {
  if (cachedPersistedState) {
    return cachedPersistedState;
  }

  if (typeof window === "undefined") {
    cachedPersistedState = { ...DEFAULT_PERSISTED_STATE };
    return cachedPersistedState;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cachedPersistedState = { ...DEFAULT_PERSISTED_STATE };
      return cachedPersistedState;
    }

    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      cachedPersistedState = { ...DEFAULT_PERSISTED_STATE };
      return cachedPersistedState;
    }

    const players = Array.isArray(parsed.players)
      ? parsed.players.filter(isValidPlayer)
      : DEFAULT_PERSISTED_STATE.players;
    const history = Array.isArray(parsed.history)
      ? parsed.history.filter(isValidHistoryEntry)
      : DEFAULT_PERSISTED_STATE.history;
    const roundsSource = parsed.roundsLaunched;
    const roundsLaunched =
      typeof roundsSource === "number" && Number.isFinite(roundsSource)
        ? Math.max(history.length, Math.max(0, Math.floor(roundsSource)))
        : Math.max(history.length, DEFAULT_PERSISTED_STATE.roundsLaunched);

    cachedPersistedState = {
      players,
      history,
      roundsLaunched,
    };
    return cachedPersistedState;
  } catch (error) {
    cachedPersistedState = { ...DEFAULT_PERSISTED_STATE };
    return cachedPersistedState;
  }
};

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

type ExperienceStage = "roster" | "dare" | "round" | "legacy";

const AppContent = () => {
  const [persistedState] = useState<PersistedState>(loadPersistedState);
  const [players, setPlayers] = useState<Player[]>(persistedState.players);
  const [activeRound, setActiveRound] = useState<ActiveRound | null>(null);
  const [history, setHistory] = useState<RoundHistoryEntry[]>(persistedState.history);
  const [roundsLaunched, setRoundsLaunched] = useState<number>(persistedState.roundsLaunched);
  const [activeStage, setActiveStage] = useState<ExperienceStage>(
    persistedState.history.length > 0 ? "legacy" : "roster",
  );
  const [insightOverlay, setInsightOverlay] = useState<"stats" | "guide" | null>(null);

  const { t, language, setLanguage, languageLabel, languageOptions, availableLanguages } = useTranslation();

  const stageOrder: ExperienceStage[] = ["roster", "dare", "round", "legacy"];

  const stageMeta = useMemo(
    () => [
      {
        id: "roster" as const,
        label: t("app.flow.roster.label"),
        title: t("app.flow.roster.title"),
        description: t("app.flow.roster.description"),
      },
      {
        id: "dare" as const,
        label: t("app.flow.dare.label"),
        title: t("app.flow.dare.title"),
        description: t("app.flow.dare.description"),
      },
      {
        id: "round" as const,
        label: t("app.flow.round.label"),
        title: t("app.flow.round.title"),
        description: t("app.flow.round.description"),
      },
      {
        id: "legacy" as const,
        label: t("app.flow.legacy.label"),
        title: t("app.flow.legacy.title"),
        description: t("app.flow.legacy.description"),
      },
    ],
    [t],
  );

  const stageCompletion = useMemo<Record<ExperienceStage, boolean>>(
    () => ({
      roster: players.length >= 2,
      dare: Boolean(activeRound),
      round: Boolean(activeRound && activeRound.stage === "resolved") || history.length > 0,
      legacy: history.length > 0,
    }),
    [players.length, activeRound, history.length],
  );

  const activeStageIndex = stageOrder.indexOf(activeStage);
  const activeStageMeta = stageMeta[activeStageIndex] ?? stageMeta[0];
  const stageProgress = ((activeStageIndex + 1) / stageOrder.length) * 100;
  const isLastStage = activeStageIndex === stageOrder.length - 1;
  const canAdvance = isLastStage || stageCompletion[activeStage];

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
    setActiveStage("round");
  };

  const addPlayer = ({ name, icon, color }: { name: string; icon: string; color: string }) => {
    setPlayers((current) => [...current, createPlayer(name, icon, color)]);
  };

  const removePlayer = (id: string) => {
    setPlayers((current) => current.filter((player) => player.id !== id));
  };

  const updatePick = useCallback((playerId: string, value: number) => {
    setActiveRound((current) => {
      if (!current || current.stage !== "collecting") return current;
      if (![current.dare.challengerId, current.dare.targetId].includes(playerId)) {
        return current;
      }
      if (value < 1 || value > current.dare.odds) return current;

      const challengerPick =
        playerId === current.dare.challengerId ? value : current.challengerPick;
      const targetPick =
        playerId === current.dare.targetId ? value : current.targetPick;
      const picksReady = Boolean(challengerPick && targetPick);

      return {
        ...current,
        challengerPick,
        targetPick,
        ...(picksReady ? { stage: "countdown", countdown: 3 } : {}),
      };
    });
  }, []);

  const cancelRound = () => {
    setActiveRound(null);
    setActiveStage("dare");
  };

  const archiveRound = () => {
    setActiveRound(null);
    setActiveStage("legacy");
  };

  const resolveRound = (resolution: RoundResolution) => {
    let resolved = false;
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

      resolved = true;
      return {
        ...current,
        stage: "resolved",
        matched,
        resolution,
      };
    });
    if (resolved) {
      setActiveStage("legacy");
    }
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

  useEffect(() => {
    if (activeStage !== "legacy" && insightOverlay === "stats") {
      setInsightOverlay(null);
    }
  }, [activeStage, insightOverlay]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stateToPersist: PersistedState = {
      players,
      history,
      roundsLaunched,
    };

    cachedPersistedState = stateToPersist;

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToPersist));
    } catch {
      // Ignore write errors (e.g. private browsing, quota exceeded)
    }
  }, [players, history, roundsLaunched]);

  const heroPlayers = useMemo(() => players.slice(0, 3), [players]);
  const totalDaresCompleted = useMemo(
    () => players.reduce((total, player) => total + player.daresCompleted, 0),
    [players],
  );

  const handleLanguageChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setLanguage(event.target.value as Language);
  };

  const goToStage = (stage: ExperienceStage) => {
    const targetIndex = stageOrder.indexOf(stage);
    if (targetIndex === -1 || targetIndex === activeStageIndex) return;
    if (targetIndex > 0) {
      const previousStage = stageOrder[targetIndex - 1];
      if (!stageCompletion[previousStage]) {
        return;
      }
    }
    setActiveStage(stage);
  };

  const handlePreviousStage = () => {
    if (activeStageIndex <= 0) return;
    setActiveStage(stageOrder[activeStageIndex - 1]);
  };

  const handleNextStage = () => {
    if (!canAdvance) return;
    if (isLastStage) {
      setActiveStage(stageOrder[0]);
      return;
    }
    setActiveStage(stageOrder[activeStageIndex + 1]);
  };

  const overlayLabel =
    insightOverlay === "stats"
      ? t("app.flow.overlays.statsLabel")
      : insightOverlay === "guide"
        ? t("app.flow.overlays.guideLabel")
        : "";

  const openTrophyRoom = useCallback(() => {
    setActiveStage((current) => (current === "legacy" ? current : "legacy"));
    setInsightOverlay("stats");
  }, [setActiveStage, setInsightOverlay]);

  const renderStage = () => {
    switch (activeStage) {
      case "roster":
        return <PlayerRoster players={players} onAdd={addPlayer} onRemove={removePlayer} />;
      case "dare":
        return <DareComposer players={players} disabled={Boolean(activeRound)} onLaunch={launchRound} />;
      case "round":
        return (
          <ActiveRoundStage
            round={activeRound}
            players={players}
            onUpdatePick={updatePick}
            onResolve={resolveRound}
            onCancel={cancelRound}
            onArchive={archiveRound}
          />
        );
      case "legacy":
      default:
        return (
          <div className="app-legacy">
            <HistoryPanel history={history} players={players} />
            <div className="app-legacy__portals">
              <button
                type="button"
                className="app-legacy__portal"
                onClick={openTrophyRoom}
                disabled={insightOverlay === "stats"}
              >
                <span>{t("app.flow.overlays.statsTrigger")}</span>
              </button>
            </div>
          </div>
        );
    }
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
          <div className="app-header__actions">
            <div className="app-header__insights">
              <button
                type="button"
                className="text-button app-header__howto"
                onClick={() => setInsightOverlay("guide")}
                disabled={insightOverlay === "guide"}
              >
                {t("app.flow.overlays.guideLink")}
              </button>
              <button
                type="button"
                className="text-button app-header__howto app-header__trophy-link"
                onClick={openTrophyRoom}
                disabled={insightOverlay === "stats"}
              >
                {t("app.flow.overlays.statsLink")}
              </button>
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
        <section className="app-experience">
          <header className="app-experience__header">
            <div>
              <p className="app-experience__eyebrow">{t("app.flow.headline")}</p>
              <h2 className="app-experience__title">{activeStageMeta.title}</h2>
            </div>
            <p className="app-experience__subtitle">{activeStageMeta.description}</p>
          </header>

          <div className="app-experience__progress" role="presentation">
            <span style={{ width: `${stageProgress}%` }} />
          </div>

          <nav className="app-experience__steps" aria-label={t("app.flow.headline")}>
            {stageMeta.map((meta, index) => {
              const isActive = meta.id === activeStage;
              const isComplete = stageCompletion[meta.id] && index < activeStageIndex;
              const previousStage = stageOrder[index - 1];
              const isLocked = index > 0 && !stageCompletion[previousStage];
              const stepClass = [
                "app-experience__step",
                isActive ? "is-active" : "",
                isComplete ? "is-complete" : "",
                isLocked ? "is-locked" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <button
                  key={meta.id}
                  type="button"
                  className={stepClass}
                  onClick={() => {
                    if (!isLocked) {
                      goToStage(meta.id);
                    }
                  }}
                  aria-current={isActive ? "step" : undefined}
                  aria-disabled={isLocked ? true : undefined}
                  aria-label={t("app.flow.controls.jump", { label: meta.label })}
                  disabled={isLocked}
                >
                  <span className="app-experience__step-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="app-experience__step-label">{meta.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="app-experience__viewport">
            <div className={`app-stage app-stage--${activeStage}`}>
              <span className="app-stage__beam app-stage__beam--one" aria-hidden="true" />
              <span className="app-stage__beam app-stage__beam--two" aria-hidden="true" />
              <span className="app-stage__beam app-stage__beam--three" aria-hidden="true" />
              <div className="app-stage__content">{renderStage()}</div>
            </div>
          </div>

          <div className="app-stage__actions">
            <button
              type="button"
              className="button button--ghost"
              onClick={handlePreviousStage}
              disabled={activeStageIndex === 0}
            >
              {t("app.flow.controls.prev")}
            </button>
            <button
              type="button"
              className="button"
              onClick={handleNextStage}
              disabled={!canAdvance}
            >
              {isLastStage ? t("app.flow.controls.restart") : t("app.flow.controls.next")}
            </button>
          </div>
        </section>
      </main>

      {insightOverlay && (
        <div className="app-overlay" role="dialog" aria-modal="true" aria-label={overlayLabel}>
          <div className="app-overlay__backdrop" aria-hidden="true" />
          <div className="app-overlay__panel">
            <button
              type="button"
              className="app-overlay__close text-button"
              onClick={() => setInsightOverlay(null)}
            >
              {t("app.flow.controls.closeOverlay")}
            </button>
            <div className="app-overlay__content">
              {insightOverlay === "stats" ? (
                <StatsPanel players={players} roundsPlayed={roundsLaunched} />
              ) : (
                <HowToPlayCard />
              )}
            </div>
          </div>
        </div>
      )}
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
