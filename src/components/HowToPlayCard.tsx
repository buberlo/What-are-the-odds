import { useEffect, useState } from "react";

const ADVANCE_DELAY_MS = 800;
const RESTART_DELAY_MS = 2200;

const HOW_TO_STEPS = [
  {
    title: "Challenge",
    description:
      "A player dares someone and proposes the odds (for example 1 in 8). Make the dare tempting enough to accept!",
  },
  {
    title: "Accept",
    description:
      "The target agrees to the dare and both silently pick a number in the range. No peeking while the countdown is on!",
  },
  {
    title: "Reveal",
    description:
      "Count down from three and show numbers. If they match, the target carries out the dare with pride and style.",
  },
  {
    title: "Escalate",
    description:
      "If it feels too easy, lower the odds or remix the dare. Keep it fun, consensual, and safe for everyone involved.",
  },
];

const HowToPlayCard = () => {
  const steps = HOW_TO_STEPS;
  const [stepIndex, setStepIndex] = useState(0);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!isAdvancing) return;

    const timer = window.setTimeout(() => {
      setIsAdvancing(false);
      setStepIndex((current) => {
        const next = current + 1;
        if (next >= steps.length) {
          setIsComplete(true);
          return current;
        }
        return next;
      });
    }, ADVANCE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [isAdvancing, steps.length]);

  useEffect(() => {
    if (!isComplete) return;

    const timer = window.setTimeout(() => {
      setIsComplete(false);
      setStepIndex(0);
    }, RESTART_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [isComplete]);

  const handleCompleteStep = () => {
    if (isAdvancing || isComplete) return;
    setIsAdvancing(true);
  };

  const completedSteps = isComplete
    ? steps.length
    : stepIndex + (isAdvancing ? 1 : 0);
  const progress = Math.min((completedSteps / steps.length) * 100, 100);
  const activeStep = steps[stepIndex];
  const progressLabel = isComplete
    ? "Guide complete! Restarting…"
    : `Step ${stepIndex + 1} of ${steps.length}`;

  return (
    <section className="panel howto">
      <header className="panel__header">
        <div>
          <p className="panel__eyebrow">New to the game?</p>
          <h2 className="panel__title">How to play</h2>
        </div>
      </header>
      <div className="howto__carousel">
        <div className="howto__progress">
          <div className="howto__progress-track" aria-hidden="true">
            <span className="howto__progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <span className="howto__progress-label" aria-live="polite">
            {progressLabel}
          </span>
        </div>
        {isComplete ? (
          <div className="howto__complete" role="status" aria-live="polite">
            <h3 className="howto__complete-title">You're ready to play!</h3>
            <p className="howto__complete-copy">
              Nice work finishing the walkthrough. We'll start it again automatically so the next player can follow
              along.
            </p>
          </div>
        ) : (
          <article className={`howto__slide${isAdvancing ? " howto__slide--advancing" : ""}`}>
            <p className="howto__slide-eyebrow">Step {stepIndex + 1}</p>
            <h3 className="howto__slide-title">{activeStep.title}</h3>
            <p className="howto__slide-copy">{activeStep.description}</p>
            <div className="howto__actions">
              <button
                type="button"
                className="button"
                onClick={handleCompleteStep}
                disabled={isAdvancing}
              >
                {stepIndex === steps.length - 1 ? "Finish guide" : "Mark step complete"}
              </button>
            </div>
          </article>
        )}
      </div>
      <p className="howto__tip">
        Tip: The lower the odds, the more likely the dare triggers. Use the sweetener field to add rewards or twists.
      </p>
    </section>
  );
};

export default HowToPlayCard;
