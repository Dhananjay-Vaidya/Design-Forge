/** Product copy from brief 24, with claims scoped to the features available today. */
export const brand = {
  signature: "Created by AI, Designed by Human.",
  principle: "AI advises. You decide.",
  positioning:
    "DecisionForge turns a hard decision into a clear, scoreable, reviewable process, with AI that advises, never decides.",
};

export const marketing = {
  nav: {
    label: "Sections",
    signIn: "Sign in",
    start: "Get started",
    why: "Why DecisionForge",
    sections: [
      { href: "/#how", label: "How it works" },
      { href: "/#demo", label: "Live demo" },
      { href: "/#features", label: "Benefits" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  hero: {
    eyebrow: "Decision intelligence laboratory",
    headline: "Hard choices.",
    emphasis: "Clear reasoning.",
    text: "Structure any decision, score your options, and see exactly why one wins, with AI that advises, never decides.",
    primary: "Start deciding",
    secondary: "Try the live demo",
    reassurance:
      "Free to start · Works without AI · Your saved decisions are private to your account.",
  },
  problem: {
    eyebrow: "A choice deserves a record",
    title: "Big decisions deserve better than a late-night gut call.",
    text: "Important choices end up scattered across notes, group chats and half-finished spreadsheets. An AI chat gives you a confident paragraph that can be hard to audit a week later. A one-time pros-and-cons list leaves no way to check whether you were right. The next hard choice starts from scratch.",
  },
  whyNow: {
    eyebrow: "Why now",
    title: "Answers got cheap. Judgment got valuable.",
    text: "Anyone can get an instant opinion now. What's rare is a decision you can stand behind, with your priorities explicit, the trade-offs visible, and a way to learn from how it turned out. DecisionForge gives you the method and keeps AI in an advisory seat.",
    quote:
      "AI can hand you an answer in seconds. It can't hand you a decision you're able to defend.",
    link: "Read why we built it",
  },
  drafter: {
    eyebrow: "Try it now, no account needed",
    title: "Turn a messy choice into a clear structure.",
    text: "Describe it in a sentence. AI drafts the options and criteria; you score them, and the engine ranks them.",
  },
  how: {
    eyebrow: "How it works",
    title: "Four steps to a choice you can explain.",
    stepLabel: "Step",
    steps: [
      {
        title: "Frame it.",
        text: "Capture the decision, your options, and the criteria that actually matter to you.",
      },
      {
        title: "Score it.",
        text: "Rate each option against each criterion. DecisionForge computes a transparent, weighted ranking.",
      },
      {
        title: "Pressure-test it.",
        text: "See why the leader wins, how close the race is, and, if you want, what AI thinks you've missed.",
      },
      {
        title: "Review it.",
        text: "Commit your choice, then look back later to see whether your confidence matched reality.",
      },
    ],
  },
  demo: {
    eyebrow: "Live demo",
    title: "Drag the weights. Watch the answer move.",
    text: "Same formula as the real engine. Notice how the stability check reacts when two offers get close.",
  },
  benefits: {
    eyebrow: "Benefits",
    title: "Built for decisions you'll want to explain later.",
    items: [
      {
        title: "Transparent by design.",
        text: "Every ranking shows its working. See the points each criterion contributes and why the leader leads.",
      },
      {
        title: "Works without AI.",
        text: "Scoring, rankings and sensitivity checks work without an AI key. The live demo runs in your browser; your saved workspace uses the backend.",
      },
      {
        title: "AI that stays in its lane.",
        text: "Risks, assumptions, blind spots and counter-arguments: advice you review, with no automatic changes to your scores or ranking.",
      },
      {
        title: "A memory for your decisions.",
        text: "Save snapshots, commit your choice, and review the outcome. Your calibration profile compares confidence with how things turned out.",
      },
      {
        title: "Fast to start.",
        text: "Use templates for common decisions, or start with a question and build your own options and criteria.",
      },
      {
        title: "Private to your account.",
        text: "Your saved decisions are accessible through your account. Optional AI requests use decision content, without adding your account email, ID or credentials.",
      },
    ],
  },
  outputs: {
    eyebrow: "The core idea",
    title: "Two kinds of output, never confused.",
    calculated: {
      label: "Calculated",
      title: "The ranking.",
      text: "Deterministic, reproducible, and yours to audit. Change an input and see exactly what moves. The same inputs produce the same ranking.",
    },
    advisory: {
      label: "Advisory",
      title: "The AI insight.",
      text: "Questions, risks and counter-arguments to sharpen your thinking. Clearly labelled and kept separate from the calculation. You review suggestions before applying them.",
    },
  },
  differentiator: {
    title: "Not a smarter guess. A clearer method.",
    text: "A confident answer can skip the trade-offs. DecisionForge makes them visible so you can explain your choice, defend your reasoning, and revisit it with a record of what mattered.",
  },
  privacy: {
    eyebrow: "Trust & privacy",
    title: "Your call. Your data.",
    text: "The scoring engine calculates your ranking without calling an AI provider. When you ask for AI, it receives the decision content needed for the request; the app does not add your account email, user ID or credentials. Personal information you write in decision content may still be included. You can export or delete your decisions from the workspace.",
  },
  faq: {
    eyebrow: "FAQ",
    title: "Questions, answered.",
    items: [
      {
        q: "How is the ranking calculated?",
        a: "Each score (1–10) is normalised to 0–1, flipped for lower-is-better criteria, multiplied by that criterion's share of the total weight, and summed. The same inputs always produce the same ranking.",
      },
      {
        q: "Do I need an AI key to use it?",
        a: "No. Scoring, rankings, snapshots, commitments and outcome reviews work without Gemini. AI assistance is optional and needs to be configured separately.",
      },
      {
        q: "Can the AI change my ranking?",
        a: "AI does not write your scores or calculate your ranking. Advice is labelled separately. Setup suggestions only become options or criteria when you choose to accept them; the engine recalculates from your inputs.",
      },
      {
        q: "Does it work offline?",
        a: "The live scoring demo runs in your browser. The saved decision workspace needs a connection to the backend, even when AI is disabled.",
      },
      {
        q: "What does Close call mean?",
        a: "The leader is less than 5 points ahead (out of 100), so a small change to your weights or scores could change the winner. It's a prompt to double-check your closest scores.",
      },
      {
        q: "Do weights have to add up to 100?",
        a: "No. Weights are relative. Give each criterion any positive number and they're normalised to 100% automatically.",
      },
    ],
  },
  cta: {
    title: "Make your next hard decision one you can explain.",
    text: "Start free. Bring a real decision. Leave with a choice you can stand behind.",
    button: "Create your account",
    secondary: "Sign in instead",
  },
  example: {
    label: "Example",
    calculated: "Calculated, not AI",
    question: "Which job offer should I accept?",
    stable: "Leader stable",
    advisory: "AI stays advisory",
    commute: "Commute · lower is better",
    weights: "Salary 40% · Growth 35% · Commute 25%",
  },
  useCases: [
    "Which job offer should I accept?",
    "Rent or buy?",
    "Which university fits best?",
    "Build it or buy it?",
    "Which laptop is worth it?",
    "Which city should we move to?",
    "Which candidate should we hire?",
    "Which cloud provider?",
    "Which supplier should we sign with?",
    "Which feature ships first?",
  ],
};

export const whyContent = {
  title: "Why DecisionForge",
  eyebrow: "Our point of view",
  lead: "We built DecisionForge because the hardest part of a decision was never the arithmetic. It was being honest about what matters, seeing the trade-offs clearly, and remembering why you chose.",
  introduction:
    "We're surrounded by confident answers, from chatbots, from search, from whoever posts loudest. The scarce skill is weighing the opinions you have, knowing why you chose, and learning whether you chose well.",
  sections: [
    {
      title: "The method, not the mood.",
      text: "A good decision needs more than a lucky outcome. It needs a process you could run again and explain to someone who disagrees. DecisionForge makes that process concrete: name your criteria, weight them honestly, score your options, and let the math be the math.",
      aside: "Make your priorities explicit.",
      tone: "primary",
    },
    {
      title: "AI, kept honest.",
      text: "AI can help you spot a blind spot, name an uncomfortable assumption, or argue the other side. The final call belongs to you. AI here can question, suggest, and summarise. It does not write your scores or produce your calculated ranking. Proposed setup changes only enter your workspace when you accept them.",
      aside: "AI advises. You decide.",
      tone: "ai",
    },
    {
      title: "Decisions worth remembering.",
      text: "Save a snapshot of your analysis and capture a commitment with the evidence you had when you chose. Schedule an outcome review and compare your confidence with what actually happened. Over time, your calibration profile shows where confidence runs ahead of reality and where your judgment is well calibrated.",
      aside: "Keep a record you can learn from.",
      tone: "primary",
    },
    {
      title: "Who it's for.",
      text: "The student comparing offers. The professional at a fork. The founder choosing which bet to make. The person about to spend real money. Anyone whose next choice deserves more than a coin flip.",
      aside: "Bring a real decision.",
      tone: "primary",
    },
  ],
};

// TODO: real testimonials — add verified customer quotes only after collecting permission.
