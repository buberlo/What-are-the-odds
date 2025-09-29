import {
  createContext,
  useContext,
  useMemo,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { inspirationPrompts } from "./data/prompts";

export type Language = "en" | "de" | "au";

const translations = {
  en: {
    language: {
      label: "Language",
      options: {
        en: "English",
        de: "German",
        au: "Australian",
      },
    },
    app: {
      hero: {
        eyebrow: "Party odds tracker",
        title: "What are the odds?!",
        subtitle:
          "Launch dares, collect the secret picks, and reveal the outcome without slowing down the night.",
        quickStats: {
          players: "Players",
          rounds: "Rounds",
          dares: "Dares",
        },
      },
      flow: {
        headline: "Immersive play flow",
        roster: {
          label: "Crew setup",
          title: "Assemble the crew",
          description: "Add players and choose their look.",
        },
        dare: {
          label: "Dare forge",
          title: "Build the dare",
          description: "Select challenger, target, and odds.",
        },
        round: {
          label: "Countdown arena",
          title: "Run the showdown",
          description: "Collect picks and run the countdown.",
        },
        legacy: {
          label: "Afterglow",
          title: "Relive the highlights",
          description: "Review results and visit the trophy room.",
        },
        controls: {
          prev: "Previous",
          next: "Next stage",
          restart: "Restart flow",
          jump: "Jump to {{label}}",
          closeOverlay: "Close portal",
        },
        overlays: {
          statsLabel: "Trophy room",
          guideLabel: "How to play walkthrough",
          guideLink: "How to play",
          statsLink: "Trophy room",
          statsTrigger: "Open trophy room",
          guideTrigger: "Open how-to guide",
        },
      },
    },
    howTo: {
      eyebrow: "New to the game?",
      title: "How to play",
      steps: [
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
      ],
      progressComplete: "Guide complete! Restarting…",
      progress: "Step {{current}} of {{total}}",
      stepLabel: "Step {{current}}",
      readyTitle: "You're ready to play!",
      readyCopy:
        "Nice work finishing the walkthrough. We'll start it again automatically so the next player can follow along.",
      finish: "Finish guide",
      markComplete: "Mark step complete",
      completedLabel: "Completed",
      tip: "Tip: The lower the odds, the more likely the dare triggers. Use the sweetener field to add rewards or twists.",
    },
    roster: {
      eyebrow: "Crew Roster",
      title: "Players ({{count}})",
      badge: "Live",
      description:
        "Add everyone who wants in. Each player gets a badge color and emoji to make the reveal moment pop.",
      nameLabel: "Name",
      namePlaceholder: "Player nickname",
      iconLabel: "Icon",
      accentLabel: "Accent",
      accentAria: "Use {{color}} as accent",
      submit: "Add player",
      limitHint: "Max 12 players for now.",
      playerStats: "{{wins}} wins · {{losses}} losses · {{dares}} dares",
      remove: "Remove {{name}}",
      spotlightEyebrow: "Tonight's spotlight",
      spotlightEmpty: "Add a player to begin",
    },
    composer: {
      eyebrow: "Set the dare",
      title: "Odds builder",
      inspire: "Inspire me",
      inspireLoading: "Spinning up an idea…",
      inspireError: "Generator is taking a breather. Pulled a classic prompt instead.",
      inspireSource: {
        llm: "🔥 AI dare",
        curated: "🎲 Curated dare",
        static: "📚 Classic dare",
      },
      empty: "Add at least two players to open the odds board.",
      challengerLabel: "Challenger",
      challengerPlaceholder: "Select a challenger",
      targetLabel: "Target",
      targetPlaceholder: "Select a target",
      promptLabel: "Dare prompt",
      promptPlaceholder: "Describe the dare everyone is playing for",
      sweetenerLabel: "Sweetener",
      sweetenerPlaceholder: "Add a reward or twist (optional)",
      oddsRangeLabel: "Odds range",
      oddsValue: "1 in {{value}}",
      hint: "Lock in once both players accept the challenge.",
      launch: "Launch round",
      swapAria: "Swap challenger and target",
      heat: {
        spicy: "Spicy",
        bold: "Bold",
        classic: "Classic",
        stretch: "Stretch",
        longShot: "Long shot",
      },
      prompts: [...inspirationPrompts],
    },
    activeRound: {
      emptyEyebrow: "No round active",
      emptyTitle: "Run the countdown",
      emptyBody: "Set a dare to launch a round of What are the odds?!",
      emptyHint:
        "Players secretly pick numbers between 1 and the odds. Hit lock to reveal and see who owes the dare.",
      eyebrow: "Active dare",
      title: "Odds 1 in {{value}}",
      badge: "Round #{{id}}",
      bonusLabel: "Bonus",
      collecting: {
        passTo: "Pass to {{player}}",
        keepSecret: "Keep it secret. Pick {{min}}-{{max}}.",
        formLabel: "Enter your number between {{min}} and {{max}}",
        lockChallenger: "Lock in challenger number",
        passDevice: "Secret number locked in. Pass the device to {{player}}.",
        noPeek: "No peeking. Pick {{min}}-{{max}}.",
        lockTarget: "Lock in target number",
        readyMessage: "Secret number locked in. Gather everyone for the reveal.",
        readyTitle: "Get ready to reveal",
        readySubtitle: "No numbers shown until the countdown ends.",
        readyBody: "When everyone's watching, launch the countdown to show the picks.",
        start: "Start countdown",
        cancel: "Cancel round",
      },
      countdown: {
        title: "Countdown in progress",
        subtitle: "Numbers reveal when the timer hits zero.",
        revealIn: "Reveal in",
        abort: "Abort round",
        hint: "Hold tight! Countdown is live.",
      },
      reveal: {
        match: "Numbers match! The dare is on.",
        miss: "They dodged it this time.",
      },
      resolved: {
        match: "Match! {{target}} owes the dare.",
        miss: "{{target}} slips free.",
        outcome: "Outcome:",
        clear: "Clear round",
      },
      resolutionLabels: {
        completed: "Dare completed",
        declined: "Passed / declined",
        partial: "Remixed dare",
      },
      errors: {
        wholeNumber: "Enter a whole number between {{min}} and {{max}}.",
        range: "Pick a number between {{min}} and {{max}}.",
      },
    },
    history: {
      eyebrow: "Session log",
      title: "History",
      empty: "Launch a round to start building the history timeline.",
      bonusLabel: "Bonus",
      versus: "vs",
      odds: "1 in {{value}}",
      resolutionLabels: {
        completed: "completed",
        declined: "declined",
        partial: "remixed",
      },
    },
    stats: {
      eyebrow: "Therapy check-in",
      title: "Trophy room",
      subtitle: "A compact snapshot of who's leading the dare circuit.",
      sessionMantra: "Keep breathing, celebrate the progress, and stay ready for the next round.",
      summary: {
        heading: "Session snapshot",
        champion: "{{name}} is holding the top spot.",
        championEmpty: "No champion yet—kick off a round to claim it.",
        daring: "{{name}} has taken on {{dares}} dares.",
        daringEmpty: "No dares completed yet—time to spark one.",
        supportersEmpty: "No supporting crew yet—invite more players.",
        supportersOne: "Backed by 1 teammate keeping the vibes alive.",
        supportersMany: "Backed by {{count}} teammates keeping the vibes alive.",
        metrics: {
          rounds: "Rounds played",
          dares: "Dares completed",
          wins: "Wins recorded",
          players: "Active players",
        },
      },
      leaderboard: {
        heading: "Leaderboard",
        caption: "Ranked by wins, then dares completed, then lowest losses.",
        empty: "Add players to build the leaderboard.",
        rankLabel: "Rank {{rank}}",
        winsLabel: "Wins",
        daresLabel: "Dares",
        lossesLabel: "Losses",
        summary: "{{wins}} wins · {{dares}} dares · {{losses}} losses",
      },
    },
  },
  au: {
    language: {
      label: "Lingo",
      options: {
        en: "English",
        de: "German",
        au: "Aussie Banter",
      },
    },
    app: {
      hero: {
        eyebrow: "Party odds wrangler",
        title: "What are the odds?!",
        subtitle:
          "Line up the dares, sneak the secret picks, and crack the reveal like a proper cheeky legend.",
        quickStats: {
          players: "Mates",
          rounds: "Rounds",
          dares: "Dares",
        },
      },
      flow: {
        headline: "Party flow control",
        roster: {
          label: "Crew muster",
          title: "Rally the crew",
          description: "Add the crew and pick their vibe.",
        },
        dare: {
          label: "Dare forge",
          title: "Spin the dare",
          description: "Choose who dares who and set the odds.",
        },
        round: {
          label: "Countdown pit",
          title: "Run the showdown",
          description: "Lock the picks and fire the countdown.",
        },
        legacy: {
          label: "Afterglow",
          title: "Relive the highlights",
          description: "Check the history and pop into the trophy room.",
        },
        controls: {
          prev: "Back",
          next: "Next stop",
          restart: "Loop back to start",
          jump: "Skip to {{label}}",
          closeOverlay: "Shut the portal",
        },
        overlays: {
          statsLabel: "Trophy room",
          guideLabel: "How-to walkthrough",
          guideLink: "How-to guide",
          statsLink: "Trophy room",
          statsTrigger: "Open trophy room",
          guideTrigger: "Open how-to guide",
        },
      },
    },
    howTo: {
      eyebrow: "First rodeo?",
      title: "How the shindig works",
      steps: [
        {
          title: "Throw down",
          description:
            "One mate slings a dare and tosses out the odds (say 1 in 8). Make it spicy enough that no one chickens out, ya drongo!",
        },
        {
          title: "Shake on it",
          description:
            "The target nods, then both quietly snag a number in range. No stickybeaking while the countdown's ticking, alright?",
        },
        {
          title: "Show and tell",
          description:
            "Hit three, two, one and flash those picks. If they match, the target's on the hook—best bring the razzle-dazzle.",
        },
        {
          title: "Crank it up",
          description:
            "If it's too much of a Sunday stroll, drop the odds or remix the dare. Keep it hilarious, consensual, and safe as houses.",
        },
      ],
      progressComplete: "Guide done and dusted! Looping back…",
      progress: "Step {{current}} of {{total}}",
      stepLabel: "Step {{current}}",
      readyTitle: "You're good as gold!",
      readyCopy:
        "Nice hustle finishing the walkthrough. It'll auto-reset so the next mate can have a squiz.",
      finish: "Wrap it up",
      markComplete: "Tick this step",
      completedLabel: "Done and dusted",
      tip: "Tip: Lower odds mean the dare's more likely to pop. Chuck a sweetener in for extra laughs or bragging rights.",
    },
    roster: {
      eyebrow: "Squad roll call",
      title: "Mates ({{count}})",
      badge: "Live",
      description:
        "Add every legend keen for chaos. Each mate scores a colour and emoji so the reveal hits like fireworks on New Year's.",
      nameLabel: "Name",
      namePlaceholder: "Mate nickname",
      iconLabel: "Icon",
      accentLabel: "Accent",
      accentAria: "Paint it {{color}}",
      submit: "Add mate",
      limitHint: "Max 12 mates for now, keep it tidy.",
      playerStats: "{{wins}} wins · {{losses}} losses · {{dares}} dares",
      remove: "Boot {{name}}",
      spotlightEyebrow: "Legend of the night",
      spotlightEmpty: "Add a mate to kick things off",
    },
    composer: {
      eyebrow: "Spin a dare",
      title: "Odds cobbler",
      inspire: "Hit me with inspo",
      inspireLoading: "Cooking up an idea…",
      inspireError: "AI's gone walkabout, grabbed an old faithful instead.",
      inspireSource: {
        llm: "🔥 AI dare",
        curated: "🎲 Curated dare",
        static: "📚 Classic dare",
      },
      empty: "Stack at least two mates to unlock the odds board.",
      challengerLabel: "Challenger",
      challengerPlaceholder: "Pick the stirrer",
      targetLabel: "Target",
      targetPlaceholder: "Pick the poor sod",
      promptLabel: "Dare prompt",
      promptPlaceholder: "What's the shenanigan everyone's playing for?",
      sweetenerLabel: "Sweetener",
      sweetenerPlaceholder: "Chuck in a reward or twist (optional)",
      oddsRangeLabel: "Odds range",
      oddsValue: "1 in {{value}}",
      hint: "Lock it once both players give the nod.",
      launch: "Kick off round",
      swapAria: "Swap challenger and target",
      heat: {
        spicy: "Scorching",
        bold: "Ballsy",
        classic: "Classic",
        stretch: "Bit of a stretch",
        longShot: "Total long shot",
      },
      prompts: [...inspirationPrompts],
    },
    activeRound: {
      emptyEyebrow: "No round on the boil",
      emptyTitle: "Spin up the countdown",
      emptyBody: "Set a dare to launch a round of What are the odds?!",
      emptyHint:
        "Mates secretly pick numbers between 1 and the odds. Smash lock to reveal who owes the dare.",
      eyebrow: "Dare in play",
      title: "Odds 1 in {{value}}",
      badge: "Round #{{id}}",
      bonusLabel: "Bonus",
      collecting: {
        passTo: "Hand it to {{player}}",
        keepSecret: "Keep shtum. Pick {{min}}-{{max}}.",
        formLabel: "Pop in a number between {{min}} and {{max}}",
        lockChallenger: "Lock the challenger pick",
        passDevice: "Secret number stashed. Pass the device to {{player}}.",
        noPeek: "No peeking. Pick {{min}}-{{max}}.",
        lockTarget: "Lock the target pick",
        readyMessage: "Number tucked away. Rally the crew for the reveal.",
        readyTitle: "Time for the reveal",
        readySubtitle: "Numbers stay hidden till the countdown hits zero.",
        readyBody: "When the whole mob's watching, fire the countdown to spill the beans.",
        start: "Start the countdown",
        cancel: "Bin this round",
      },
      countdown: {
        title: "Countdown's ripping",
        subtitle: "Numbers pop when the timer smacks zero.",
        revealIn: "Reveal in",
        abort: "Pull the plug",
        hint: "Hang tight! Countdown's live.",
      },
      reveal: {
        match: "Match! Dare's on, cobber.",
        miss: "Dodged it this time.",
      },
      resolved: {
        match: "Bullseye! {{target}} owes the dare.",
        miss: "{{target}} wriggled out.",
        outcome: "Outcome:",
        clear: "Clear the round",
      },
      resolutionLabels: {
        completed: "Dare nailed",
        declined: "Gave it a miss",
        partial: "Remixed dare",
      },
      errors: {
        wholeNumber: "Chuck in a whole number between {{min}} and {{max}}.",
        range: "Pick a number between {{min}} and {{max}}.",
      },
    },
    history: {
      eyebrow: "Nightly recap",
      title: "History",
      empty: "Kick off a round to fill the yarn log.",
      bonusLabel: "Bonus",
      versus: "vs",
      odds: "1 in {{value}}",
      resolutionLabels: {
        completed: "nailed",
        declined: "bailed",
        partial: "remixed",
      },
    },
    stats: {
      eyebrow: "Feel-good check-in",
      title: "Trophy room",
      subtitle: "A tight little scoreboard to spot who's smashing it.",
      sessionMantra: "Deep breath, soak up the vibes, give the crew a pat on the back.",
      summary: {
        heading: "Session snapshot",
        champion: "{{name}} is sitting on top of the pile.",
        championEmpty: "No top dog yet—spin up a round to crown one.",
        daring: "{{name}} has tackled {{dares}} dares.",
        daringEmpty: "No dares wrapped yet—line one up.",
        supportersEmpty: "No support crew yet—rope more mates in.",
        supportersOne: "Backed by 1 mate keeping spirits high.",
        supportersMany: "Backed by {{count}} mates keeping spirits high.",
        metrics: {
          rounds: "Rounds played",
          dares: "Dares smashed",
          wins: "Wins banked",
          players: "Mates in play",
        },
      },
      leaderboard: {
        heading: "Leaderboard",
        caption: "Sorted by wins, then dares smashed, then whoever has the fewest losses.",
        empty: "Add a few mates to make the leaderboard light up.",
        rankLabel: "Rank {{rank}}",
        winsLabel: "Wins",
        daresLabel: "Dares",
        lossesLabel: "Losses",
        summary: "{{wins}} wins · {{dares}} dares · {{losses}} losses",
      },
    },
  },
  de: {
    language: {
      label: "Sprache",
      options: {
        en: "Englisch",
        de: "Deutsch",
        au: "Australisch",
      },
    },
    app: {
      hero: {
        eyebrow: "Party-Odds-Tracker",
        title: "What are the odds?!",
        subtitle:
          "Starte Mutproben, sammle geheime Zahlen und enthülle das Ergebnis, ohne den Abend auszubremsen.",
        quickStats: {
          players: "Spieler:innen",
          rounds: "Runden",
          dares: "Mutproben",
        },
      },
      flow: {
        headline: "Geführter Spielablauf",
        roster: {
          label: "Crew vorbereiten",
          title: "Team zusammenstellen",
          description: "Spieler:innen hinzufügen und Style wählen.",
        },
        dare: {
          label: "Mutprobe schmieden",
          title: "Mutprobe planen",
          description: "Herausfordernde, Zielperson und Odds festlegen.",
        },
        round: {
          label: "Countdown-Arena",
          title: "Showdown starten",
          description: "Zahlen einsammeln und Countdown starten.",
        },
        legacy: {
          label: "Nachglühen",
          title: "Highlights erneut erleben",
          description: "Verlauf prüfen und den Trophäenraum öffnen.",
        },
        controls: {
          prev: "Zurück",
          next: "Weiter",
          restart: "Flow neu starten",
          jump: "Springe zu {{label}}",
          closeOverlay: "Portal schließen",
        },
        overlays: {
          statsLabel: "Trophäenraum",
          guideLabel: "Spielanleitung",
          guideLink: "Anleitung",
          statsLink: "Trophäenraum",
          statsTrigger: "Trophäenraum öffnen",
          guideTrigger: "Anleitung öffnen",
        },
      },
    },
    howTo: {
      eyebrow: "Neu im Spiel?",
      title: "So wird gespielt",
      steps: [
        {
          title: "Herausfordern",
          description:
            "Eine Person fordert jemanden heraus und schlägt die Odds vor (zum Beispiel 1 zu 8). Mach die Mutprobe so verlockend, dass niemand ablehnen will!",
        },
        {
          title: "Annehmen",
          description:
            "Die Zielperson nimmt an und beide wählen still eine Zahl im Bereich. Nicht schummeln, solange der Countdown läuft!",
        },
        {
          title: "Aufdecken",
          description:
            "Zählt von drei herunter und zeigt eure Zahlen. Stimmen sie überein, erfüllt die Zielperson die Mutprobe mit Stolz und Stil.",
        },
        {
          title: "Steigern",
          description:
            "Wirkt es zu leicht, senkt die Odds oder mischt die Mutprobe neu. Haltet alles spaßig, einvernehmlich und sicher.",
        },
      ],
      progressComplete: "Guide abgeschlossen! Neustart läuft…",
      progress: "Schritt {{current}} von {{total}}",
      stepLabel: "Schritt {{current}}",
      readyTitle: "Du bist startklar!",
      readyCopy:
        "Starke Leistung beim Walkthrough. Wir starten ihn gleich neu, damit die nächste Person folgen kann.",
      finish: "Guide beenden",
      markComplete: "Schritt abhaken",
      completedLabel: "Erledigt",
      tip: "Tipp: Je niedriger die Odds, desto eher wird die Mutprobe fällig. Nutze das Bonus-Feld für Belohnungen oder Twists.",
    },
    roster: {
      eyebrow: "Crew-Liste",
      title: "Spieler:innen ({{count}})",
      badge: "Live",
      description:
        "Füge alle hinzu, die mitspielen möchten. Jede Person bekommt eine Farbe und ein Emoji für den großen Reveal.",
      nameLabel: "Name",
      namePlaceholder: "Spielername",
      iconLabel: "Icon",
      accentLabel: "Akzent",
      accentAria: "{{color}} als Akzent verwenden",
      submit: "Spieler:in hinzufügen",
      limitHint: "Maximal 12 Spieler:innen vorerst.",
      playerStats: "{{wins}} Siege · {{losses}} Niederlagen · {{dares}} Mutproben",
      remove: "{{name}} entfernen",
      spotlightEyebrow: "Spotlight des Abends",
      spotlightEmpty: "Füge jemanden hinzu, um zu starten",
    },
    composer: {
      eyebrow: "Mutprobe festlegen",
      title: "Odds-Planer",
      inspire: "Inspiriere mich",
      inspireLoading: "Idee wird generiert…",
      inspireError: "Generator nicht erreichbar. Greife auf Klassiker zurück.",
      inspireSource: {
        llm: "🔥 KI-Wagnis",
        curated: "🎲 Kuratierte Mutprobe",
        static: "📚 Klassiker",
      },
      empty: "Füge mindestens zwei Spieler:innen hinzu, um das Odds-Board zu öffnen.",
      challengerLabel: "Herausforder:in",
      challengerPlaceholder: "Wähle eine herausfordernde Person",
      targetLabel: "Zielperson",
      targetPlaceholder: "Wähle eine Zielperson",
      promptLabel: "Mutprobe",
      promptPlaceholder: "Beschreibe die Mutprobe, um die gespielt wird",
      sweetenerLabel: "Bonus",
      sweetenerPlaceholder: "Füge eine Belohnung oder einen Twist hinzu (optional)",
      oddsRangeLabel: "Odds-Bereich",
      oddsValue: "1 zu {{value}}",
      hint: "Sperrt, sobald beide Personen die Herausforderung angenommen haben.",
      launch: "Runde starten",
      swapAria: "Herausfordernde Person und Zielperson tauschen",
      heat: {
        spicy: "Waghalsig",
        bold: "Mutig",
        classic: "Klassisch",
        stretch: "Grenzwertig",
        longShot: "Glückstreffer",
      },
      prompts: [...inspirationPrompts],
    },
    activeRound: {
      emptyEyebrow: "Keine Runde aktiv",
      emptyTitle: "Countdown starten",
      emptyBody: "Erstelle eine Mutprobe, um eine Runde von „What are the odds?!“ zu starten.",
      emptyHint:
        "Die Spielenden wählen heimlich Zahlen zwischen 1 und den Odds. Sperrt und deckt auf, wer die Mutprobe erfüllen muss.",
      eyebrow: "Aktive Mutprobe",
      title: "Odds 1 zu {{value}}",
      badge: "Runde #{{id}}",
      bonusLabel: "Bonus",
      collecting: {
        passTo: "Gib weiter an {{player}}",
        keepSecret: "Geheim halten. Wählt {{min}}-{{max}}.",
        formLabel: "Gib deine Zahl zwischen {{min}} und {{max}} ein",
        lockChallenger: "Zahl der Herausfordernden sperren",
        passDevice: "Geheime Zahl gesichert. Übergib das Gerät an {{player}}.",
        noPeek: "Nicht schummeln. Wähle {{min}}-{{max}}.",
        lockTarget: "Zahl der Zielperson sperren",
        readyMessage: "Geheime Zahl gesichert. Holt alle zur Enthüllung zusammen.",
        readyTitle: "Bereit zum Aufdecken",
        readySubtitle: "Keine Zahlen anzeigen, bevor der Countdown endet.",
        readyBody: "Wenn alle hinschauen, startet den Countdown, um die Zahlen zu zeigen.",
        start: "Countdown starten",
        cancel: "Runde abbrechen",
      },
      countdown: {
        title: "Countdown läuft",
        subtitle: "Die Zahlen erscheinen, sobald der Timer auf null ist.",
        revealIn: "Aufdecken in",
        abort: "Runde abbrechen",
        hint: "Festhalten! Der Countdown läuft.",
      },
      reveal: {
        match: "Zahlen stimmen überein! Die Mutprobe zählt.",
        miss: "Diesmal entkommen sie.",
      },
      resolved: {
        match: "Treffer! {{target}} schuldet die Mutprobe.",
        miss: "{{target}} kommt davon.",
        outcome: "Ergebnis:",
        clear: "Runde zurücksetzen",
      },
      resolutionLabels: {
        completed: "Mutprobe erfüllt",
        declined: "Abgelehnt",
        partial: "Mutprobe angepasst",
      },
      errors: {
        wholeNumber: "Gib eine ganze Zahl zwischen {{min}} und {{max}} ein.",
        range: "Wähle eine Zahl zwischen {{min}} und {{max}}.",
      },
    },
    history: {
      eyebrow: "Sitzungslog",
      title: "Verlauf",
      empty: "Starte eine Runde, um die Verlaufsliste zu füllen.",
      bonusLabel: "Bonus",
      versus: "gegen",
      odds: "1 zu {{value}}",
      resolutionLabels: {
        completed: "erfüllt",
        declined: "abgelehnt",
        partial: "angepasst",
      },
    },
    stats: {
      eyebrow: "Therapie-Check-in",
      title: "Trophäenraum",
      subtitle: "Eine kompakte Übersicht, wer gerade die Runde dominiert.",
      sessionMantra: "Tief durchatmen, Fortschritt anerkennen und jede Runde feiern.",
      summary: {
        heading: "Session auf einen Blick",
        champion: "{{name}} führt aktuell die Tabelle an.",
        championEmpty: "Noch kein Champion – starte eine Runde und hol dir den Platz.",
        daring: "{{name}} hat {{dares}} Mutproben gewagt.",
        daringEmpty: "Noch keine Mutproben erfüllt – Zeit für die nächste Herausforderung.",
        supportersEmpty: "Noch keine Unterstützung – lade mehr Mitspieler:innen ein.",
        supportersOne: "Unterstützt von 1 Mitspieler:in, die die Stimmung trägt.",
        supportersMany: "Unterstützt von {{count}} Mitspieler:innen, die die Stimmung tragen.",
        metrics: {
          rounds: "Gespielte Runden",
          dares: "Erfüllte Mutproben",
          wins: "Eingesammelte Siege",
          players: "Aktive Spieler:innen",
        },
      },
      leaderboard: {
        heading: "Bestenliste",
        caption: "Sortiert nach Siegen, dann erfüllten Mutproben und den wenigsten Niederlagen.",
        empty: "Füge Spieler:innen hinzu, um die Bestenliste zu füllen.",
        rankLabel: "Platz {{rank}}",
        winsLabel: "Siege",
        daresLabel: "Mutproben",
        lossesLabel: "Niederlagen",
        summary: "{{wins}} Siege · {{dares}} Mutproben · {{losses}} Niederlagen",
      },
    },
  },
} as const;

type TranslationShape = (typeof translations)["en"];

const fallbackLanguage: Language = "en";

const supportedLanguages: Language[] = ["en", "de", "au"];

type PlaceholderValues = Record<string, string | number>;

const getNestedValue = (language: Language, key: string): unknown => {
  const segments = key.split(".");
  let current: unknown = translations[language] ?? translations[fallbackLanguage];
  for (const segment of segments) {
    if (typeof current !== "object" || current === null || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

const replacePlaceholders = (value: string, vars?: PlaceholderValues) => {
  if (!vars) return value;
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, token: string) => {
    const replacement = vars[token];
    return replacement === undefined ? "" : String(replacement);
  });
};

interface TranslationContextValue {
  language: Language;
  setLanguage: Dispatch<SetStateAction<Language>>;
  t: (key: string, vars?: PlaceholderValues) => string;
  formatTime: (timestamp: number) => string;
  languageLabel: string;
  languageOptions: Record<Language, string>;
  dictionary: TranslationShape;
  availableLanguages: Language[];
}

const TranslationContext = createContext<TranslationContextValue | undefined>(undefined);

interface TranslationProviderProps {
  language: Language;
  setLanguage: Dispatch<SetStateAction<Language>>;
  children: ReactNode;
}

export const TranslationProvider = ({ language, setLanguage, children }: TranslationProviderProps) => {
  const value = useMemo(() => {
    const dictionary = translations[language] ?? translations[fallbackLanguage];
    const translate = (key: string, vars?: PlaceholderValues) => {
      const raw =
        (getNestedValue(language, key) as string | undefined) ??
        (getNestedValue(fallbackLanguage, key) as string | undefined);
      if (typeof raw !== "string") {
        return key;
      }
      return replacePlaceholders(raw, vars);
    };
    const formatTime = (timestamp: number) =>
      new Intl.DateTimeFormat(
        language === "de" ? "de-DE" : language === "au" ? "en-AU" : "en-US",
        {
          hour: "numeric",
          minute: "2-digit",
        },
      ).format(timestamp);
    return {
      language,
      setLanguage,
      t: translate,
      formatTime,
      languageLabel: dictionary.language.label,
      languageOptions: dictionary.language.options,
      dictionary,
      availableLanguages: supportedLanguages,
    };
  }, [language, setLanguage]);

  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error("useTranslation must be used within TranslationProvider");
  }
  return context;
};
