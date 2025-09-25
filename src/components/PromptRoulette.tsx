import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { inspirationPrompts } from "../data/prompts";

const getRandomPrompt = () =>
  inspirationPrompts[Math.floor(Math.random() * inspirationPrompts.length)] ??
  "Drop a beat and invent a dare!";

type PromptRouletteProps = {
  seed?: number;
  activeStep: number;
};

export const PromptRoulette = ({ seed = 0, activeStep }: PromptRouletteProps) => {
  const [prompt, setPrompt] = useState(() => getRandomPrompt());
  const [isSpinning, setIsSpinning] = useState(false);
  const spinTimer = useRef<number | null>(null);
  const [pulseKey, setPulseKey] = useState(0);

  const clearSpinTimer = useCallback(() => {
    if (spinTimer.current !== null) {
      window.clearTimeout(spinTimer.current);
      spinTimer.current = null;
    }
  }, []);

  useEffect(() => () => clearSpinTimer(), [clearSpinTimer]);

  useEffect(() => {
    setPulseKey(activeStep);
    setPrompt(getRandomPrompt());
  }, [activeStep]);

  const spin = useCallback(() => {
    if (isSpinning) {
      return;
    }

    setIsSpinning(true);
    let iterations = 0;
    const maxIterations = 16 + Math.floor(Math.random() * 8);
    let delay = 70;

    clearSpinTimer();

    const run = () => {
      iterations += 1;
      setPrompt(getRandomPrompt());
      if (iterations >= maxIterations) {
        spinTimer.current = null;
        setIsSpinning(false);
        return;
      }
      delay = Math.min(delay + 18, 260);
      spinTimer.current = window.setTimeout(run, delay);
    };

    spinTimer.current = window.setTimeout(run, delay);
  }, [clearSpinTimer, isSpinning]);

  const pulseClass = useMemo(
    () => `prompt-card--pulse-${(pulseKey + seed) % 3}`,
    [pulseKey, seed],
  );

  return (
    <section className={`prompt-card ${isSpinning ? "prompt-card--spinning" : ""} ${pulseClass}`}>
      <header className="prompt-card__header">
        <span className="prompt-card__label">Neon dare idea</span>
        <h3>Spin the dare bottle</h3>
      </header>
      <p className="prompt-card__body">{prompt}</p>
      <button
        type="button"
        className="prompt-card__button"
        onClick={spin}
        disabled={isSpinning}
      >
        {isSpinning ? "Mixing..." : "Shake up another dare"}
      </button>
    </section>
  );
};

export default PromptRoulette;
