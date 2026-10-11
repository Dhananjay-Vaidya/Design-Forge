/** Brief 25, with claims scoped to the product and details confirmed by its owner. */
export const about = {
  pageTitle: "About | DecisionForge AI",
  nav: "About",
  guideLink: "About DecisionForge & contact",
  hero: {
    eyebrow: "About DecisionForge",
    title: "The method behind better decisions.",
    text: "A tool for the choices that actually matter — where the math is transparent, AI stays advisory, and your reasoning is something you can revisit and learn from.",
    contact: "Let's talk",
  },
  story: {
    label: "The idea",
    title: "Why build another decision tool?",
    paragraphs: [
      "A pros-and-cons list captures a moment. An AI answer can sound confident without leaving you a process you can audit a week later. Neither gives you much to learn from when the outcome arrives.",
      "DecisionForge starts from a simple belief: the hard part was never the arithmetic. It was being honest about what matters, seeing the trade-offs clearly, and remembering why you chose. The product gives that work a place to live.",
    ],
  },
  principle: {
    label: "The principle · Advisory",
    title: "AI advises. You decide.",
    text: "AI can help you ask a sharper question, surface a risk, or argue the other side. It does not write your scores or calculate your ranking. Suggested options and criteria only enter your workspace when you accept them. Your inputs drive the calculation; the judgment stays yours.",
    aside: "Calculated rankings. Clearly labelled advice. Your final call.",
  },
  builder: {
    label: "Behind the product",
    soloTitle: "One person. A considered product.",
    soloText:
      "DecisionForge is a solo project. The focus is on the details that make structured decisions useful: clear inputs, visible calculations, and a record you can return to. Feedback goes directly to the person building it.",
  },
  direction: {
    label: "The direction",
    title: "Depth before more features.",
    text: "The focus is helping an individual make a structured, reviewable decision. Sensitivity checks and calibration are already part of that method. Future work can deepen those tools and make a trusted second opinion easier to bring in. Features should earn their place; this is a direction, not a release promise.",
  },
  values: {
    label: "What matters here",
    title: "A few principles, made practical.",
    items: [
      {
        title: "Transparency over magic.",
        text: "Show how a ranking follows from your scores and priorities.",
      },
      {
        title: "Advice, not autopilot.",
        text: "Sharpen your judgment without making the choice for you.",
      },
      {
        title: "Deliberate data handling.",
        text: "Keep saved decisions within your account. Export or delete them from your workspace; use AI only when you choose.",
      },
      {
        title: "Earned trust.",
        text: "Describe what the product does today. No invented team, testimonials, or promises about your outcome.",
      },
    ],
  },
  contact: {
    formLabel: "Contact DecisionForge",
    legend: "Send a message",
    honeypotLabel: "Website",
    characterCount: (count: number) => `${count} of 2000 characters`,
    label: "Connect",
    title: "Let's talk.",
    text: "Feedback, a feature you wish existed, a partnership, or a question about the product — send a message to the person building DecisionForge.",
    emailLabel: "Direct email",
    copy: "Copy email",
    copied: "Email copied",
    copyFallback: "Email selected. Use your device's copy command.",
    privacyNote:
      "Your message is stored for handling your enquiry. It is not sent to an AI provider or added to a mailing list.",
    fields: { name: "Name", email: "Email", reason: "Reason", message: "Message" },
    reasons: [
      { value: "general", label: "General" },
      { value: "feedback", label: "Feedback" },
      { value: "partnership", label: "Partnership" },
      { value: "support", label: "Support" },
      { value: "press", label: "Press" },
    ],
    consent: "I agree to be contacted about this message.",
    privacyLink: "How this data is used",
    submit: "Send message",
    successTitle: "Thanks — your message is in.",
    successText: (email: string) =>
      `Your message has been saved. If a reply is needed, it will go to ${email}.`,
    another: "Send another message",
    error: "That didn't send. Check your connection and try again, or use the direct email above.",
    invalid: "Check the highlighted fields and try again.",
    rateLimited: (seconds: number) =>
      `Please wait ${seconds} seconds before trying again. Your message is still here.`,
    messageHint: "Up to 2,000 characters. Please leave out passwords and other sensitive details.",
    validation: {
      nameRequired: "Enter your name.",
      nameLength: "Use 80 characters or fewer.",
      email: "Enter a valid email address.",
      emailLength: "Use an email address of 254 characters or fewer.",
      messageRequired: "Write a message.",
      messageLength: "Use 2,000 characters or fewer.",
      consent: "Please agree to being contacted about this message.",
    },
  },
  onboarding: {
    label: "Your next step",
    title: "Ready when you are.",
    start: {
      title: "Start free",
      text: "Bring a real decision. Set your priorities and build a ranking you can explain.",
      action: "Create account",
    },
    tour: {
      title: "See it first",
      text: "Explore the guided tour and live scoring demo. No sign-up needed.",
      action: "Take the tour",
    },
    talk: {
      title: "Talk to us",
      text: "Not sure if it fits? Ask a question or share what you need.",
      action: "Go to the form",
    },
  },
};

export const privacy = {
  pageTitle: "Privacy | DecisionForge AI",
  nav: "Privacy",
  title: "How your data is used.",
  lead: "A plain-language account of what this version of DecisionForge collects and how its features use it.",
  sections: [
    {
      title: "Messages you send",
      text: "The contact form stores your name, email address, reason, message, consent, submission time, and whether the message has been handled. A keyed hash of your IP address is stored for abuse prevention; the contact record does not store the raw IP address. The form does not send its content to an AI provider or subscribe you to product updates.",
    },
    {
      title: "Handling and deletion",
      text: "Contact messages stay in the product database until the owner removes them. There is no automatic expiry in this version. The owner can read, mark as handled, and delete messages using a private local administration tool. To request deletion of a contact message, write to the contact email shown below from the address you used to submit it.",
    },
    {
      title: "Your decision workspace",
      text: "Saved decisions are associated with your account. The workspace lets you export or delete your decisions. Rankings are calculated from your inputs without asking an AI provider. Account sessions use cookies to keep you signed in.",
    },
    {
      title: "Optional AI assistance",
      text: "When you ask for AI assistance, relevant decision content is sent to the configured AI provider. The request does not add your account email, ID, or credentials. Personal information you write into decision content can still be included. Avoid putting sensitive details into those fields. AI suggestions stay separate from the calculated ranking.",
    },
  ],
  contact: "Questions or a deletion request?",
  back: "Back to About & contact",
};

// TODO: real testimonials — publish only verified quotes with permission.
