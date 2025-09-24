import { useMemo } from "react";
import { Player, RoundHistoryEntry, RoundResolution } from "../types";

interface HistoryPanelProps {
  history: RoundHistoryEntry[];
  players: Player[];
}

const formatTime = (timestamp: number) =>
  new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);

const resolutionLabels: Record<RoundResolution, string> = {
  completed: "completed",
  declined: "declined",
  partial: "remixed",
};

const HistoryPanel = ({ history, players }: HistoryPanelProps) => {
  const lookUp = useMemo(() => {
    const map = new Map<string, Player>();
    players.forEach((player) => map.set(player.id, player));
    return map;
  }, [players]);

  return (
    <section className="panel">
      <header className="panel__header">
        <div>
          <p className="panel__eyebrow">Session log</p>
          <h2 className="panel__title">History</h2>
        </div>
      </header>

      {history.length === 0 ? (
        <p className="panel__empty">Launch a round to start building the history timeline.</p>
      ) : (
        <ol className="history">
          {history.map((entry) => {
            const challenger = lookUp.get(entry.dare.challengerId);
            const target = lookUp.get(entry.dare.targetId);
            const matched = entry.matched;
            return (
              <li key={entry.id} className={`history__item${matched ? " is-match" : ""}`}>
                <div className="history__meta">
                  <span className="history__timestamp">{formatTime(entry.timestamp)}</span>
                  <span className="history__odds">1 in {entry.dare.odds}</span>
                </div>
                <p className="history__prompt">{entry.dare.description}</p>
                {entry.dare.stakes && <p className="history__stakes">Bonus: {entry.dare.stakes}</p>}
                <div className="history__players">
                  {challenger && (
                    <span className="history__player" style={{ borderColor: challenger.color }}>
                      <span style={{ background: challenger.color }}>{challenger.icon}</span>
                      {challenger.name}
                    </span>
                  )}
                  <span className="history__vs">vs</span>
                  {target && (
                    <span className="history__player" style={{ borderColor: target.color }}>
                      <span style={{ background: target.color }}>{target.icon}</span>
                      {target.name}
                    </span>
                  )}
                </div>
                <div className="history__result">
                  <span className="history__numbers">
                    {entry.challengerPick} &mdash; {entry.targetPick}
                  </span>
                  <span className="history__resolution">{resolutionLabels[entry.resolution]}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};

export default HistoryPanel;
