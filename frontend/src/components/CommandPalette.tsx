import { CornerDownLeft, FileText, LayoutDashboard, type LucideIcon, Moon, Plus, Search, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useDecisions } from "@/features/decisions/hooks";
import { statusMeta } from "@/features/decisions/status";
import { useThemeStore } from "@/stores/themeStore";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  group: "Actions" | "Decisions";
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

/** Ctrl/⌘+K launcher: jump to any decision or run an action without leaving the keyboard. */
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const { data } = useDecisions();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const listId = useId();

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      onClose();
      navigate(to);
    };
    const actions: Command[] = [
      { id: "new", label: "New decision", icon: Plus, group: "Actions", run: go("/app/decisions/new") },
      { id: "dash", label: "Go to dashboard", icon: LayoutDashboard, group: "Actions", run: go("/app") },
      {
        id: "theme",
        label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        icon: theme === "dark" ? Sun : Moon,
        group: "Actions",
        run: () => {
          toggleTheme();
          onClose();
        },
      },
    ];
    const decisions: Command[] = (data?.results ?? []).map((d) => ({
      id: d.id,
      label: d.title,
      hint: statusMeta[d.status].label,
      icon: FileText,
      group: "Decisions",
      run: go(`/app/decisions/${d.id}`),
    }));
    return [...actions, ...decisions];
  }, [data, navigate, onClose, theme, toggleTheme]);

  const q = query.trim().toLowerCase();
  const results = q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands.slice(0, 9);

  useEffect(() => {
    if (open) {
      restoreFocus.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      restoreFocus.current?.focus?.();
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[active]?.run();
    } else if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup: string | null = null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[rgb(5_8_12/0.45)] px-4 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="glass-strong w-full max-w-xl overflow-hidden rounded-2xl"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-3 border-b border-border/70 px-4">
              <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search decisions or type a command…"
                role="combobox"
                aria-label="Search decisions and commands"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
                className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/80"
              />
              <kbd className="rounded-md border border-border-strong px-1.5 py-0.5 font-mono text-[11px] text-muted">Esc</kbd>
            </div>
            <ul id={listId} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-2">
              {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">No matches for “{query}”.</li>}
              {results.map((cmd, i) => {
                const header = cmd.group !== lastGroup ? cmd.group : null;
                lastGroup = cmd.group;
                const selected = i === active;
                return (
                  <li key={cmd.id} role="presentation">
                    {header && <p className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted">{header}</p>}
                    <div
                      id={`${listId}-${cmd.id}`}
                      role="option"
                      aria-selected={selected}
                      onMouseMove={() => setActive(i)}
                      onClick={cmd.run}
                      className={`relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                        selected ? "text-text" : "text-muted"
                      }`}
                    >
                      {selected && (
                        <motion.span
                          layoutId="palette-active"
                          className="absolute inset-0 rounded-lg bg-primary-soft"
                          transition={{ type: "spring", stiffness: 500, damping: 38 }}
                        />
                      )}
                      <cmd.icon className={`relative h-4 w-4 shrink-0 ${selected ? "text-primary" : ""}`} aria-hidden="true" />
                      <span className="relative flex-1 truncate">{cmd.label}</span>
                      {cmd.hint && <span className="relative text-xs text-muted">{cmd.hint}</span>}
                      {selected && <CornerDownLeft className="relative h-3.5 w-3.5 text-muted" aria-hidden="true" />}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center gap-4 border-t border-border/70 px-4 py-2.5 text-[11px] text-muted">
              <span>
                <kbd className="font-mono">↑↓</kbd> navigate
              </span>
              <span>
                <kbd className="font-mono">Enter</kbd> open
              </span>
              <span>
                <kbd className="font-mono">Esc</kbd> close
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
