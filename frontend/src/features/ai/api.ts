import { API_BASE_URL, ApiError, apiClient, refreshAccessToken } from "@/api/client";
import { useAuthStore } from "@/stores/authStore";
import { isApiErrorEnvelope } from "@/types/api";

export interface AIStatus {
  enabled: boolean;
  model: string | null;
  daily_limit: number;
  remaining_today: number;
  disclaimer: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatDone {
  model: string;
  remaining_today: number;
  disclaimer: string;
}

export async function getAIStatus(): Promise<AIStatus> {
  const { data } = await apiClient.get<AIStatus>("/ai/status");
  return data;
}

async function post(url: string, body: unknown, signal: AbortSignal, token: string | null) {
  return fetch(url, {
    method: "POST",
    credentials: "include",
    signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

/**
 * Streams an answer over Server-Sent Events. axios can't stream response bodies in the browser,
 * so this uses fetch and mirrors the client's auth handling (one silent refresh on 401).
 * Errors before streaming arrive as the standard error envelope and are thrown as ApiError.
 */
export async function streamChat(
  decisionId: string,
  messages: ChatTurn[],
  { signal, onDelta }: { signal: AbortSignal; onDelta: (text: string) => void },
): Promise<ChatDone> {
  const url = `${API_BASE_URL}/decisions/${decisionId}/chat`;
  let res = await post(url, { messages }, signal, useAuthStore.getState().accessToken);
  if (res.status === 401) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      useAuthStore.getState().setAccessToken(fresh);
      res = await post(url, { messages }, signal, fresh);
    }
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    if (isApiErrorEnvelope(body)) throw new ApiError(body.error, res.status);
    throw new ApiError(
      { code: "network", message: "The assistant couldn't be reached." },
      res.status,
    );
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      const payload = data ? JSON.parse(data) : {};
      if (event === "delta") onDelta(payload.text ?? "");
      else if (event === "done") return payload as ChatDone;
      else if (event === "error")
        throw new ApiError({ code: "stream_error", message: payload.message }, 502);
    }
  }
  throw new ApiError(
    { code: "stream_error", message: "The answer was cut off. Please try again." },
    502,
  );
}
