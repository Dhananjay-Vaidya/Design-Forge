import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, CircleAlert, Info, RotateCcw, Sparkles, Square, Trash2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";

import { ApiError } from "@/api/client";
import { trapDialogTab } from "@/lib/dialogKeyboard";

import { type ChatTurn, getAIStatus, streamChat } from "./api";
import { AssistantText } from "./AssistantText";
import { useChatStore } from "./chatStore";

const SUGGESTIONS = [
  "What are the biggest risks of the leading option?",
  "Which of my scores should I double-check?",
  "Play devil's advocate against my top choice.",
  "What criteria might I be missing?",
];

const EMPTY: ChatTurn[] = [];
const MAX_HISTORY = 12;

function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if ((error.status ?? 0) >= 500)
      return "The assistant is temporarily unavailable. Your calculated ranking is unaffected. Please try again.";
    if (error.code === "quota_exhausted") return error.message;
    if (error.code === "rate_limited")
      return "The AI provider is busy right now. Wait a minute and try again.";
    return error.message;
  }
  return "Something went wrong reaching the assistant. Check your connection and try again.";
}

interface AskAiPanelProps {
  decisionId: string;
  decisionTitle: string;
  open: boolean;
  onClose: () => void;
}

export function AskAiPanel({ decisionId, decisionTitle, open, onClose }: AskAiPanelProps) {
  const reduced = useReducedMotion();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["ai", "status"],
    queryFn: getAIStatus,
    enabled: open,
    staleTime: 30_000,
  });
  const turns = useChatStore((s) => s.threads[decisionId] ?? EMPTY);
  const setTurns = useChatStore((s) => s.set);
  const clearThread = useChatStore((s) => s.clear);

  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const enabled = status.data?.enabled ?? false;
  const remaining = status.data?.remaining_today;
  const exhausted = remaining === 0;
  const busy = streaming !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: reduced || streaming !== null ? "auto" : "smooth",
    });
  }, [turns, streaming, error, reduced]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy || !enabled || exhausted) return;
    const history: ChatTurn[] = [...turns, { role: "user", content: text }];
    setTurns(decisionId, history);
    setDraft("");
    setError(null);
    setStreaming("");

    const controller = new AbortController();
    abortRef.current = controller;
    let answer = "";
    try {
      const done = await streamChat(decisionId, history.slice(-MAX_HISTORY), {
        signal: controller.signal,
        onDelta: (delta) => {
          answer += delta;
          setStreaming(answer);
        },
      });
      setTurns(decisionId, [...history, { role: "assistant", content: answer }]);
      qc.setQueryData(["ai", "status"], (prev: typeof status.data) =>
        prev ? { ...prev, remaining_today: done.remaining_today } : prev,
      );
    } catch (err) {
      if (controller.signal.aborted) {
        if (answer)
          setTurns(decisionId, [
            ...history,
            { role: "assistant", content: `${answer} …(stopped)` },
          ]);
      } else {
        if (answer) setTurns(decisionId, [...history, { role: "assistant", content: answer }]);
        setError(friendlyError(err));
        void qc.invalidateQueries({ queryKey: ["ai", "status"] });
      }
    } finally {
      setStreaming(null);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  };

  const retry = () => {
    const lastUser = [...turns].reverse().find((t) => t.role === "user");
    if (!lastUser) return;
    // Drop the unanswered question so it isn't sent twice.
    const idx = turns.lastIndexOf(lastUser);
    setTurns(decisionId, turns.slice(0, idx));
    void ask(lastUser.content);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(draft);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void ask(draft);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-[rgb(5_8_12/0.35)] backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !busy && onClose()}
            aria-hidden="true"
          />
          <motion.dialog
            ref={dialogRef}
            onKeyDown={trapDialogTab}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ask-ai-title"
            onCancel={(event) => {
              event.preventDefault();
              onClose();
            }}
            className="glass-strong fixed inset-y-0 left-auto right-0 z-50 m-0 flex h-dvh max-h-none w-full max-w-md flex-col border-l border-ai/20 p-0 text-text sm:inset-y-3 sm:right-3 sm:h-[calc(100dvh-1.5rem)] sm:rounded-2xl"
            initial={{ x: reduced ? 0 : "105%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: reduced ? 0 : "105%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
          >
            <header className="flex items-start gap-3 border-b border-border/70 px-5 py-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-ai to-primary text-white shadow-[0_6px_18px_-6px_rgb(var(--color-ai)/0.8)]">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="ask-ai-title" className="flex items-center gap-2 font-semibold">
                  Ask AI
                  <span className="rounded-full bg-ai/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ai">
                    Advisory
                  </span>
                </h2>
                <p className="truncate text-xs text-muted">About “{decisionTitle}”</p>
              </div>
              {turns.length > 0 && !busy && (
                <button
                  type="button"
                  onClick={() => {
                    clearThread(decisionId);
                    setError(null);
                  }}
                  aria-label="Clear conversation"
                  title="Clear conversation"
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Ask AI"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex items-start gap-2 border-b border-border/70 bg-ai/5 px-5 py-2.5 text-[11px] leading-relaxed text-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ai" aria-hidden="true" />
              <p>
                {status.data?.disclaimer ??
                  "Advisory analysis only. AI answers may be incomplete or inaccurate and never change your calculated scores."}
              </p>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 space-y-4 overflow-y-auto px-5 py-5"
              aria-live="polite"
            >
              {status.isLoading ? (
                <div
                  className="space-y-2"
                  role="status"
                  aria-label="Connecting to the advisory assistant"
                >
                  <div className="skeleton h-4 w-2/3" aria-hidden="true" />
                  <div className="skeleton h-4 w-1/2" aria-hidden="true" />
                </div>
              ) : status.isError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm"
                >
                  <p className="font-medium">Assistant status unavailable</p>
                  <p className="mt-1 text-muted">
                    Your scoring and ranking still work. Try connecting again.
                  </p>
                  <button
                    type="button"
                    onClick={() => void status.refetch()}
                    className="mt-3 rounded text-primary underline"
                  >
                    Retry connection
                  </button>
                </div>
              ) : !enabled ? (
                <div className="rounded-xl border border-border bg-surface/70 p-4 text-sm">
                  <p className="font-medium">The AI assistant is turned off</p>
                  <p className="mt-1 text-muted">
                    AI advice is unavailable in this workspace. You can keep comparing options and
                    calculating your ranking without it.
                  </p>
                </div>
              ) : exhausted ? (
                <div
                  role="status"
                  className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm"
                >
                  <p className="font-medium">Daily advisory limit reached</p>
                  <p className="mt-1 text-muted">
                    Try again after your quota resets. Your calculated ranking and scoring remain
                    available.
                  </p>
                </div>
              ) : turns.length === 0 && !busy ? (
                <div>
                  <p className="text-sm text-muted">
                    Ask anything about this decision. The assistant sees your options, criteria,
                    scores and the calculated ranking, but not your email or account.
                  </p>
                  <ul className="mt-4 space-y-2">
                    {SUGGESTIONS.map((s, i) => (
                      <motion.li
                        key={s}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + i * 0.05 }}
                      >
                        <button
                          type="button"
                          onClick={() => void ask(s)}
                          className="w-full cursor-pointer rounded-xl border border-border bg-surface/70 px-3.5 py-2.5 text-left text-sm transition-all hover:-translate-y-0.5 hover:border-ai/40 hover:bg-ai/5 hover:shadow-soft"
                        >
                          {s}
                        </button>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {turns.map((turn, i) =>
                turn.role === "user" ? (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-end"
                  >
                    <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm text-on-primary">
                      {turn.content}
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-2.5"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-ai/10 text-ai">
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1 text-sm leading-relaxed text-text/90">
                      <AssistantText text={turn.content} />
                    </div>
                  </motion.div>
                ),
              )}

              {busy && (
                <div className="flex gap-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-ai/10 text-ai">
                    <Sparkles className="h-3 w-3 animate-pulse" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1 text-sm leading-relaxed text-text/90">
                    {streaming ? (
                      <>
                        <AssistantText text={streaming} />
                        <span
                          className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-ai"
                          aria-hidden="true"
                        />
                      </>
                    ) : (
                      <span className="inline-flex gap-1 py-2" aria-label="Thinking">
                        {[0, 1, 2].map((d) => (
                          <motion.span
                            key={d}
                            className="h-1.5 w-1.5 rounded-full bg-ai"
                            animate={reduced ? { opacity: 1 } : { opacity: [0.3, 1, 0.3] }}
                            transition={{
                              duration: 0.9,
                              repeat: reduced ? 0 : Infinity,
                              delay: d * 0.15,
                            }}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/5 p-3 text-sm"
                >
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                  <div className="flex-1">
                    <p>{error}</p>
                    <button
                      type="button"
                      onClick={retry}
                      className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-danger hover:underline"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={onSubmit} className="border-t border-border/70 p-3">
              <div className="flex items-end gap-2 rounded-xl border border-border-strong bg-surface/80 p-1.5 transition-colors focus-within:border-ai/60 focus-within:ring-4 focus-within:ring-ai/10">
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
                  onKeyDown={onKeyDown}
                  rows={1}
                  disabled={!enabled || exhausted}
                  placeholder={
                    enabled ? "Ask about this decision…" : "AI is turned off on this server"
                  }
                  aria-label="Your question"
                  className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted/80 disabled:cursor-not-allowed [field-sizing:content]"
                />
                {busy ? (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    aria-label="Stop generating"
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-surface-2 text-text transition-colors hover:bg-border"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!enabled || exhausted || !draft.trim()}
                    aria-label="Send question"
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-gradient-to-br from-ai to-primary text-white transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="mt-2 flex justify-between px-1 text-[11px] text-muted">
                <span>Enter to send · Shift+Enter for a new line</span>
                {remaining !== undefined && enabled && (
                  <span className="font-mono tabular-nums">{remaining} left today</span>
                )}
              </p>
            </form>
          </motion.dialog>
        </>
      )}
    </AnimatePresence>
  );
}
