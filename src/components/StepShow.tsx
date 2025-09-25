import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type Step = {
  id: string;
  title: string;
  description: string;
  action: string;
  vibe: string;
};

export type StepShowProps = {
  steps: Step[];
  onActiveStepChange?: (index: number) => void;
};

const EXIT_DURATION = 380;
const ENTER_DURATION = 420;

export const StepShow = ({ steps, onActiveStepChange }: StepShowProps) => {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"idle" | "leaving" | "entering">("idle");
  const [direction, setDirection] = useState<1 | -1>(1);
  const exitTimer = useRef<number | null>(null);
  const enterTimer = useRef<number | null>(null);

  useEffect(() => {
    if (steps.length === 0) {
      return;
    }
    if (index >= steps.length) {
      setIndex(0);
    }
  }, [index, steps.length]);

  const step = useMemo(() => steps[index] ?? null, [steps, index]);

  const clearTimers = useCallback(() => {
    if (exitTimer.current !== null) {
      window.clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
    if (enterTimer.current !== null) {
      window.clearTimeout(enterTimer.current);
      enterTimer.current = null;
    }
  }, []);

  const goToStep = useCallback(
    (delta: 1 | -1) => {
      if (phase !== "idle" || steps.length <= 1) {
        return;
      }

      const tentativeIndex = index + delta;
      const wrappedIndex = (tentativeIndex + steps.length) % steps.length;
      setDirection(delta);
      setPhase("leaving");

      exitTimer.current = window.setTimeout(() => {
        setIndex(wrappedIndex);
        onActiveStepChange?.(wrappedIndex);
        setPhase("entering");

        enterTimer.current = window.setTimeout(() => {
          setPhase("idle");
        }, ENTER_DURATION);
      }, EXIT_DURATION);
    },
    [index, onActiveStepChange, phase, steps.length],
  );

  const next = useCallback(() => {
    goToStep(1);
  }, [goToStep]);

  const prev = useCallback(() => {
    goToStep(-1);
  }, [goToStep]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const stateClass = useMemo(() => {
    if (phase === "idle") {
      return "step-card--idle";
    }
    const suffix = direction > 0 ? "forward" : "backward";
    return `step-card--${phase}-${suffix}`;
  }, [direction, phase]);

  if (!step) {
    return null;
  }

  return (
    <div className="step-show">
      <div className="step-show__header">
        <div className="step-show__counter">
          <span>Step</span>
          <strong>{index + 1}</strong>
          <span className="step-show__total">/ {steps.length}</span>
        </div>
        <div className="step-show__controls">
          <button
            type="button"
            className="control control--prev"
            onClick={prev}
            disabled={phase !== "idle" || steps.length <= 1}
            aria-label="Previous step"
          >
            ◀
          </button>
          <button
            type="button"
            className="control control--next"
            onClick={next}
            disabled={phase !== "idle" || steps.length <= 1}
            aria-label="Next step"
          >
            ▶
          </button>
        </div>
      </div>
      <div className="step-card-wrapper">
        <article className={`step-card ${stateClass}`} key={step.id}>
          <header className="step-card__header">
            <p className="step-card__vibe">{step.vibe}</p>
            <h2>{step.title}</h2>
          </header>
          <p className="step-card__description">{step.description}</p>
          <div className="step-card__action">
            <h3>How to make it wild</h3>
            <p>{step.action}</p>
          </div>
        </article>
      </div>
      <div className="step-progress">
        {steps.map((item, idx) => (
          <div
            key={item.id}
            className={`step-progress__dot ${idx === index ? "is-active" : ""}`}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
};

export default StepShow;
