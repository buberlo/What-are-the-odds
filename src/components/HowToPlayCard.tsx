const HowToPlayCard = () => {
  return (
    <section className="panel howto">
      <header className="panel__header">
        <div>
          <p className="panel__eyebrow">New to the game?</p>
          <h2 className="panel__title">How to play</h2>
        </div>
      </header>
      <ol className="howto__steps">
        <li>
          <strong>Challenge:</strong> A player dares someone and proposes the odds (for example 1 in 8).
        </li>
        <li>
          <strong>Accept:</strong> The target agrees to the dare and both silently pick a number in the range.
        </li>
        <li>
          <strong>Reveal:</strong> Count down from three and show numbers. If they match, the target does the dare.
        </li>
        <li>
          <strong>Escalate:</strong> If it feels too easy, lower the odds or remix the dare. Keep it fun and safe!
        </li>
      </ol>
      <p className="howto__tip">
        Tip: The lower the odds, the more likely the dare triggers. Use the sweetener field to add rewards or twists.
      </p>
    </section>
  );
};

export default HowToPlayCard;
