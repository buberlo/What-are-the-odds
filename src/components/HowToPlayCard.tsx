import { CSSProperties, useEffect, useRef, useState } from "react";
import { useTranslation } from "../i18n";

const ADVANCE_DELAY_MS = 800;
const RESTART_DELAY_MS = 2200;

const HowToPlayCard = () => {
  const { t, dictionary } = useTranslation();
  const steps = dictionary.howTo.steps;
  const [advancingIndex, setAdvancingIndex] = useState<number | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const resetAdvancingTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetAdvancingTimer.current) {
        window.clearTimeout(resetAdvancingTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isAdvancing) return;

    const timer = window.setTimeout(() => {
      let reachedEnd = false;

      setStepIndex((current) => {
        const next = current + 1;
        if (next >= steps.length) {
          setIsComplete(true);
          reachedEnd = true;
          return current;
        }
        return next;
      });

      setIsAdvancing(false);

      if (resetAdvancingTimer.current) {
        window.clearTimeout(resetAdvancingTimer.current);
      }
      resetAdvancingTimer.current = window.setTimeout(() => {
        setAdvancingIndex(null);
        resetAdvancingTimer.current = null;
      }, reachedEnd ? 360 : 240);
    }, ADVANCE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [isAdvancing, steps.length]);

  useEffect(() => {
    if (!isComplete) return;

    if (resetAdvancingTimer.current) {
      window.clearTimeout(resetAdvancingTimer.current);
      resetAdvancingTimer.current = null;
    }

    const timer = window.setTimeout(() => {
      setIsComplete(false);
      setStepIndex(0);
      setAdvancingIndex(null);
    }, RESTART_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [isComplete]);

  const handleCompleteStep = () => {
    if (isAdvancing || isComplete) return;
    setAdvancingIndex(stepIndex);
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

  type CardStyle = CSSProperties & {
    "--stack-position"?: string;
    "--completed-offset"?: string;
  };

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
          {steps.map((step, index) => {
            const position = index - stepIndex;
            const isCurrent = index === stepIndex;
            const isActive = isCurrent && !isComplete;
            const isCompleted = index < stepIndex || (isCurrent && isComplete);
            const isUpcoming = position > 0;
            const isHidden = position > 3;
            const isLeaving = advancingIndex === index;

            const classNames = ["howto__card"];

            if (isActive) classNames.push("howto__card--active");
            if (isCurrent) classNames.push("howto__card--current");
            if (isCompleted) classNames.push("howto__card--completed");
            if (isUpcoming) classNames.push("howto__card--upcoming");
            if (isHidden) classNames.push("howto__card--hidden");
            if (isLeaving) classNames.push("howto__card--advancing");
            if (isAdvancing && index === stepIndex + 1) {
              classNames.push("howto__card--promoting");
            }

            const style: CardStyle = {
              zIndex: steps.length - index,
            };

            if (isUpcoming) {
              const clamped = Math.min(Math.max(position, 0), 3);
              style["--stack-position"] = clamped.toString();
            }

            if (index < stepIndex) {
              const depth = Math.min(stepIndex - index, 3);
              style["--completed-offset"] = depth.toString();
            }

            return (
              <article
                key={`${step.title}-${index}`}
                className={classNames.join(" ")}
                style={style}
                role="listitem"
              >
                <div className="howto__card-content">
                  <p className="howto__card-eyebrow">
                    {t("howTo.stepLabel", { current: index + 1 })}
                  </p>
                  <h3 className="howto__card-title">{step.title}</h3>
                  <p className="howto__card-copy">{step.description}</p>
                </div>
                {isActive && (
                  <div className="howto__card-actions">
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
                {isCompleted && (
                  <div className="howto__card-status" aria-hidden="true">
                    {t("howTo.completedLabel")}
                  </div>
                )}
              </article>
            );
          })}
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
