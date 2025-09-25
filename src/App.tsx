import { useMemo, useState } from "react";
import NeonArena from "./components/NeonArena";
import PromptRoulette from "./components/PromptRoulette";
import StepShow, { type Step } from "./components/StepShow";

const stepFlow: Step[] = [
  {
    id: "alias",
    title: "Claim your cocktail alias",
    description:
      "Everyone grabs a glow-band, names their drink persona, and calls out tonight's signature sip.",
    action:
      "Mix a mini signature shot for the table and toast the boldest alias. The loudest cheer gets to start the first challenge.",
    vibe: "Rally the crew",
  },
  {
    id: "odds",
    title: "Lock in the odds",
    description:
      "The challenger dares a target and pitches the odds. Keep it spicy but survivable—shots are waiting.",
    action:
      "Use the neon odds dial: 2 is savage confidence, 10 is for the cautious. Whoever hesitates has to add a glitter garnish to their drink.",
    vibe: "Set the stakes",
  },
  {
    id: "reveal",
    title: "Countdown & reveal",
    description:
      "Both players drop their numbers on beat three. Matching odds mean the dare is live and the room erupts.",
    action:
      "If the odds match, blast the hype track and film the dare in slo-mo. If they don't, the challenger sips and the crowd spins a new dare.",
    vibe: "Turn up the suspense",
  },
  {
    id: "celebrate",
    title: "Celebrate or pay up",
    description:
      "Dare completed? The crew showers them in confetti handshakes. Dare dodged? It's a penalty shot with a dramatic speech.",
    action:
      "Winners pass their neon band to a new challenger. Skippers must remix the dare prompt and serve the next round.",
    vibe: "Keep the energy rolling",
  },
];

const hypeBoosts = [
  {
    title: "Fire up the party loop",
    body: "After every completed dare, queue a fresh track and switch lighting to match the mood.",
  },
  {
    title: "House twist",
    body: "Once per night, a player can cash in a 'Switcheroo' to trade dares with anyone else.",
  },
  {
    title: "Hydration hero",
    body: "Spot someone who hasn't sipped water in a while? Award them a cool-down token and a bonus dare immunity.",
  },
];

const App = () => {
  const [activeStep, setActiveStep] = useState(0);
  const boostRows = useMemo(() => hypeBoosts, []);

  return (
    <div className="app-shell">
      <NeonArena />
      <div className="app-shell__overlay">
        <header className="app-header">
          <span className="app-header__tag">Odds &amp; Shots remix</span>
          <h1>
            What Are The Odds?
            <span className="app-header__gradient"> Neon Party Edition</span>
          </h1>
          <p>
            A glowing mash-up of dares, drinks, and friendly chaos. Keep the rounds tight, the vibes loud, and the camera rolling.
          </p>
        </header>
        <main className="app-main">
          <StepShow steps={stepFlow} onActiveStepChange={setActiveStep} />
          <div className="app-grid">
            <PromptRoulette activeStep={activeStep} seed={2} />
            <section className="boosts">
              <header className="boosts__header">
                <span className="boosts__label">Party upgrades</span>
                <h3>Boost the hype</h3>
              </header>
              <div className="boosts__list">
                {boostRows.map((boost) => (
                  <article className="boost" key={boost.title}>
                    <h4>{boost.title}</h4>
                    <p>{boost.body}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </main>
        <footer className="app-footer">
          <p>
            Pro tip: rotate the host every round. Whoever holds the neon mic controls the music drop and the countdown.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default App;
