import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/Button";
import { about } from "@/content/about";
import { site } from "@/content/site";

export function ContactEmail() {
  const emailRef = useRef<HTMLSpanElement>(null);
  const [status, setStatus] = useState("");

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(site.contactEmail);
      setStatus(about.contact.copied);
    } catch {
      if (emailRef.current) {
        const range = document.createRange();
        range.selectNodeContents(emailRef.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setStatus(about.contact.copyFallback);
    }
  }

  return (
    <div>
      <p className="text-xs font-medium text-muted">{about.contact.emailLabel}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          ref={emailRef}
          className="min-w-0 select-text break-all text-sm font-medium text-primary"
        >
          {site.contactEmail}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11 shrink-0"
          onClick={() => void copyEmail()}
        >
          {status === about.contact.copied ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <Copy size={14} aria-hidden="true" />
          )}
          {about.contact.copy}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-xs text-muted">
        {status}
      </p>
    </div>
  );
}
