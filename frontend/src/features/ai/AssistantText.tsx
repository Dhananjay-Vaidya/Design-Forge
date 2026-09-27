import { Fragment, type ReactNode } from "react";

/** **bold** spans only. Everything else stays literal text (React escapes it), never HTML. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold text-text">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

/**
 * Renders model output as paragraphs and bullet lists. AI text is untrusted (docs/06 §10), so
 * there is deliberately no markdown/HTML renderer here.
 */
export function AssistantText({ text }: { text: string }) {
  // Group consecutive bullet lines into lists and everything else into paragraphs, so an intro
  // line directly followed by "- " items (common model output) still renders as a list.
  const groups: { list: boolean; lines: string[] }[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    if (!raw.trim()) {
      groups.push({ list: false, lines: [] });
      continue;
    }
    const list = BULLET.test(raw);
    const last = groups[groups.length - 1];
    if (last && last.list === list && last.lines.length) last.lines.push(raw);
    else groups.push({ list, lines: [raw] });
  }

  return (
    <div className="space-y-2.5">
      {groups
        .filter((g) => g.lines.length)
        .map((g, gi) =>
          g.list ? (
            <ul key={gi} className="space-y-1.5">
              {g.lines.map((l, li) => (
                <li key={li} className="flex gap-2">
                  <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ai" aria-hidden="true" />
                  <span>{inline(l.replace(BULLET, ""))}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p key={gi} className="whitespace-pre-line">
              {inline(g.lines.join("\n"))}
            </p>
          ),
        )}
    </div>
  );
}
