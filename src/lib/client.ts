"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(
  url: string,
  method = "GET",
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
    cache: "no-store",
    signal,
  });
  let json: unknown;
  try {
    json = await response.json();
  } catch (error) {
    // A cancelled body read must keep its original cancellation. Other invalid
    // replies are errors even when the server already sent successful headers.
    if (signal?.aborted) throw error;
    throw new ApiError("The server returned an invalid response. Please try again.", response.status);
  }
  if (!response.ok) {
    const message = json !== null && typeof json === "object" && "error" in json && typeof json.error === "string"
      ? json.error : "Please try again";
    throw new ApiError(message || "Please try again", response.status);
  }
  return json as T;
}
export type ConnectionState = "connecting" | "live" | "reconnecting" | "offline";
export function useResource<T>(url: string | null, stream?: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [connection, setConnection] = useState<ConnectionState>("connecting"),
    [lastSynced, setLastSynced] = useState<number | null>(null);
  const loader = useRef<(() => Promise<void>) | null>(null);
  const refresh = useCallback(async () => { await loader.current?.(); }, []);
  useEffect(() => {
    let alive = true, lastSignal = 0, lastAttempt = 0, lastConnect = 0, dataHealthy = false;
    let pending: Promise<void> | null = null, reloadAfter = false;
    let source: EventSource | undefined, currentRequest: AbortController | undefined;
    setData(null); setLoading(true); setError(""); setLastSynced(null);
    setConnection(navigator.onLine ? "connecting" : "offline");
    const updateConnection = () => {
      if (!alive) return;
      setConnection(!navigator.onLine ? "offline"
        : dataHealthy && (!stream || Date.now() - lastSignal < 10000) ? "live"
        : lastAttempt || lastSignal ? "reconnecting" : "connecting");
    };
    const load = async (): Promise<void> => {
      if (!alive) return;
      if (!url) { setLoading(false); return; }
      if (!navigator.onLine) { updateConnection(); setLoading(false); return; }
      if (pending) { reloadAfter = true; return pending; }
      lastAttempt = Date.now();
      const controller = new AbortController();
      currentRequest = controller;
      const timeout = setTimeout(() => controller.abort(), 10000);
      pending = (async () => {
        try {
          const value = await request<T>(url, "GET", undefined, controller.signal);
          if (alive) {
            dataHealthy = true; setData(value); setError(""); setLastSynced(Date.now());
          }
        } catch (e) {
          if (alive) {
            dataHealthy = false;
            setError(controller.signal.aborted ? "Sync interrupted. Reconnecting…" : (e as Error).message);
          }
        } finally {
          clearTimeout(timeout);
          if (currentRequest === controller) currentRequest = undefined;
          pending = null;
          if (alive) { setLoading(false); updateConnection(); }
          if (alive && reloadAfter) { reloadAfter = false; void load(); }
        }
      })();
      return pending;
    };
    const signal = () => { lastSignal = Date.now(); updateConnection(); };
    const connect = () => {
      source?.close();
      if (!stream || !navigator.onLine) return;
      lastConnect = Date.now();
      source = new EventSource(stream);
      source.onmessage = () => { signal(); void load(); };
      source.addEventListener("heartbeat", () => {
        signal();
        // An unchanged server revision confirms the current snapshot is fresh.
        if (alive && dataHealthy && !pending && !reloadAfter) setLastSynced(Date.now());
      });
      source.addEventListener("unavailable", () => { lastSignal = 0; updateConnection(); });
      source.onerror = () => { lastSignal = 0; updateConnection(); };
    };
    const offline = () => { source?.close(); currentRequest?.abort(); lastSignal = 0; updateConnection(); };
    const online = () => { connect(); void load(); };
    loader.current = load;
    void load(); connect();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    const interval = stream ? setInterval(() => {
      updateConnection();
      // A healthy stream invalidates on changes. Only disconnected/error states
      // need the old full-resource polling fallback.
      const stalled = Date.now() - lastSignal >= 10000;
      if (stalled && Date.now() - lastConnect >= 12000) connect();
      if ((!dataHealthy || stalled) && Date.now() - lastAttempt >= 12000) void load();
    }, 4000) : undefined;
    return () => {
      alive = false; loader.current = null; clearInterval(interval); source?.close(); currentRequest?.abort();
      window.removeEventListener("offline", offline); window.removeEventListener("online", online);
    };
  }, [url, stream]);
  return { data, error, loading, refresh, connection, lastSynced };
}
