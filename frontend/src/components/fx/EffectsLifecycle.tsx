import { useEffect } from "react";

/** CSS ambient effects do no work while the document is hidden. */
export function EffectsLifecycle() {
  useEffect(() => {
    const sync = () =>
      document.documentElement.toggleAttribute("data-effects-paused", document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      document.documentElement.removeAttribute("data-effects-paused");
    };
  }, []);
  return null;
}
