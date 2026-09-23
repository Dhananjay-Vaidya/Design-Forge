/** Mirrors the standard error envelope — docs/05-api-specification.md §6. */
export interface ApiErrorBody {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
  retry_after_seconds?: number;
  request_id?: string;
}

export interface ApiErrorEnvelope {
  error: ApiErrorBody;
}

export function isApiErrorEnvelope(data: unknown): data is ApiErrorEnvelope {
  return (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as { error?: unknown }).error === "object"
  );
}

export interface Paginated<T> {
  count: number;
  page: number;
  page_size: number;
  results: T[];
}
