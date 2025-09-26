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
      setStepIndex((current) => {
        const next = current + 1;
        if (next >= steps.length) {
          setIsComplete(true);
          return current;
        }
        return next;
      });

      setIsAdvancing(false);
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
  const progress =
    steps.length === 0 ? 0 : Math.min((completedSteps / steps.length) * 100, 100);
  const progressLabel = isComplete
    ? t("howTo.progressComplete")
    : t("howTo.progress", { current: stepIndex + 1, total: steps.length });

  if (steps.length === 0) {
    return null;
  }

  const currentStep = steps[stepIndex];
  const isActive = !isComplete;

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
        <div className="howto__card-stack" role="list">
          <article
            className={[
              "howto__card",
              "card-stack__card",
              "howto__card--current",
              "card-stack__card--current",
              ...(isActive
                ? ["howto__card--active", "card-stack__card--active"]
                : ["howto__card--completed", "card-stack__card--completed"]),
            ].join(" ")}
            role="listitem"
          >
            <div className="howto__card-content card-stack__card-content">
              <p className="howto__card-eyebrow">
                {t("howTo.stepLabel", { current: stepIndex + 1 })}
              </p>
              <h3 className="howto__card-title">{currentStep.title}</h3>
              <p className="howto__card-copy">{currentStep.description}</p>
            </div>
            {isActive && (
              <div className="howto__card-actions card-stack__card-actions">
                <button
                  type="button"
                  className="button"
                  onClick={handleCompleteStep}
                  disabled={isAdvancing}
                >
                  {stepIndex === steps.length - 1
                    ? t("howTo.finish")
                    : t("howTo.markComplete")}
                </button>
              </div>
            )}
            {!isActive && (
              <div className="howto__card-status card-stack__card-status" aria-hidden="true">
                {t("howTo.completedLabel")}
              </div>
            )}
          </article>
        </div>
        {isComplete && (
          <div className="howto__complete" role="status" aria-live="polite">
            <h3 className="howto__complete-title">{t("howTo.readyTitle")}</h3>
            <p className="howto__complete-copy">{t("howTo.readyCopy")}</p>
          </div>
        )}
      </div>
      <p className="howto__tip">{t("howTo.tip")}</p>
    </section>
  );
};

export default HowToPlayCard;
