import { create } from "zustand";

import type { ChatTurn } from "./api";

/**
 * Conversations live in memory per decision for this browser session only: they are not stored
 * on the server, and closing the panel keeps the thread until the page is reloaded.
 */
interface ChatState {
  threads: Record<string, ChatTurn[]>;
  set: (decisionId: string, turns: ChatTurn[]) => void;
  clear: (decisionId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  threads: {},
  set: (decisionId, turns) => set((s) => ({ threads: { ...s.threads, [decisionId]: turns } })),
  clear: (decisionId) =>
    set((s) => {
      const next = { ...s.threads };
      delete next[decisionId];
      return { threads: next };
    }),
}));
