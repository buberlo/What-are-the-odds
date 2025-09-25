import { useEffect, useState } from "react";
import { useTranslation } from "../i18n";

const ADVANCE_DELAY_MS = 800;
const RESTART_DELAY_MS = 2200;

const HowToPlayCard = () => {
  const { t, dictionary } = useTranslation();
  const steps = dictionary.howTo.steps;
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
    ? t("howTo.progressComplete")
    : t("howTo.progress", { current: stepIndex + 1, total: steps.length });

  return (
    <section className="panel howto">
      <header className="panel__header">
        <div>
          <p className="panel__eyebrow">{t("howTo.eyebrow")}</p>
          <h2 className="panel__title">{t("howTo.title")}</h2>
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
            <h3 className="howto__complete-title">{t("howTo.readyTitle")}</h3>
            <p className="howto__complete-copy">{t("howTo.readyCopy")}</p>
          </div>
        ) : (
          <article className={`howto__slide${isAdvancing ? " howto__slide--advancing" : ""}`}>
            <p className="howto__slide-eyebrow">{t("howTo.stepLabel", { current: stepIndex + 1 })}</p>
            <h3 className="howto__slide-title">{activeStep.title}</h3>
            <p className="howto__slide-copy">{activeStep.description}</p>
            <div className="howto__actions">
              <button
                type="button"
                className="button"
                onClick={handleCompleteStep}
                disabled={isAdvancing}
              >
                {stepIndex === steps.length - 1 ? t("howTo.finish") : t("howTo.markComplete")}
              </button>
            </div>
          </article>
        )}
      </div>
      <p className="howto__tip">{t("howTo.tip")}</p>
    </section>
  );
};

export default HowToPlayCard;
