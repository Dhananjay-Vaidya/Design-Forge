import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";

/** Answers describe the product as built (see docs/ and backend/app/domain/scoring/engine.py). */
const FAQ = [
  {
    q: "How is the ranking calculated?",
    a: "Each score (1–10) is normalised to 0–1, flipped for “lower is better” criteria, multiplied by that criterion's share of the total weight, and summed. The same inputs always produce the same ranking.",
  },
  {
    q: "Do I need an AI key to use it?",
    a: "No. Everything except the optional advisory insights works without Gemini, and AI is off unless it's configured.",
  },
  {
    q: "Can the AI change my ranking?",
    a: "No. The scoring engine has no access to the AI layer. AI output is labelled as advisory and shown separately.",
  },
  {
    q: "What does “Close call” mean?",
    a: "The leader is less than 5 points ahead (out of 100), so a small change to your weights or scores could change the winner. It's a prompt to double-check your closest scores.",
  },
  {
    q: "Do weights have to add up to 100?",
    a: "No. Weights are relative. Give each criterion any positive number and they're normalised to 100% automatically.",
  },
];

function Item({
  q,
  a,
  open,
  onToggle,
}: {
  q: string;
  a: string;
  open: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  return (
    <li className="border-b border-border last:border-0">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="flex w-full cursor-pointer items-center justify-between gap-6 py-5 text-left font-medium transition-colors hover:text-primary"
        >
          {q}
          <motion.span
            animate={{ rotate: open ? 45 : 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 text-muted"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </motion.span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            role="region"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="pb-5 pr-10 text-sm leading-relaxed text-muted">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ul className="glass rounded-2xl px-6">
      {FAQ.map((item, i) => (
        <Item
          key={item.q}
          {...item}
          open={open === i}
          onToggle={() => setOpen(open === i ? null : i)}
        />
      ))}
    </ul>
  );
}
