/** A schematic, not a claim about live decision data. */
export function DecisionNetwork() {
  return (
    <figure className="mb-6 rounded-xl border border-border bg-surface/90 p-4">
      <figcaption className="mb-3 flex justify-between gap-3 font-mono text-[10px] tracking-wider text-muted">
        <span>DECISION SPACE</span>
        <span>ILLUSTRATIVE MODEL</span>
      </figcaption>
      <svg
        viewBox="0 0 440 130"
        className="w-full"
        role="img"
        aria-label="Your decision connects weighted criteria to alternatives. A separate AI advisory layer supports review, not scoring."
      >
        <g fill="none" stroke="rgb(var(--color-border-strong))" strokeWidth="1.5">
          <path d="M75 65H155M155 25V105M155 25H230M155 65H230M155 105H230M275 25H335V65H375M275 65H375M275 105H335V65" />
        </g>
        <path
          className="lab-path"
          d="M75 65H155V25H230M275 25H335V65H375"
          fill="none"
          stroke="rgb(var(--color-primary))"
          strokeWidth="2"
        />
        <g fill="rgb(var(--color-surface))" stroke="rgb(var(--color-primary))" strokeWidth="1.5">
          <circle cx="55" cy="65" r="20" />
          <rect x="230" y="13" width="45" height="24" rx="6" />
          <rect x="230" y="53" width="45" height="24" rx="6" />
          <rect x="230" y="93" width="45" height="24" rx="6" />
          <circle cx="390" cy="65" r="15" />
        </g>
        <g
          fill="rgb(var(--color-text))"
          fontSize="10"
          textAnchor="middle"
          fontFamily="Geist Mono Variable, monospace"
        >
          <text x="55" y="69">
            ?
          </text>
          <text x="252" y="29">
            A
          </text>
          <text x="252" y="69">
            B
          </text>
          <text x="252" y="109">
            C
          </text>
          <text x="390" y="69">
            01
          </text>
          <text x="55" y="107" fill="rgb(var(--color-muted))">
            Question
          </text>
          <text x="153" y="125" fill="rgb(var(--color-muted))">
            Weights
          </text>
        </g>
      </svg>
      <p className="mt-2 border-t border-border pt-3 text-xs text-ai">
        Gemini advisory layer · questions, risks, counterpoints
      </p>
    </figure>
  );
}
