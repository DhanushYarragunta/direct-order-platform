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
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
    cache: "no-store",
  });
  const json = await response
    .json()
    .catch(() => ({ error: "The server could not complete the request" }));
  if (!response.ok)
    throw new ApiError(json.error || "Please try again", response.status);
  return json as T;
}
export function useResource<T>(url: string | null, stream?: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const loader = useRef<(() => Promise<void>) | null>(null);
  const refresh = useCallback(async () => { await loader.current?.(); }, []);
  useEffect(() => {
    let alive = true, sequence = 0;
    setData(null);
    setLoading(true);
    setError("");
    const load = async () => {
      const requestSequence = ++sequence;
      if (!url) {
        setLoading(false);
        return;
      }
      try {
        const value = await request<T>(url);
        if (alive && requestSequence === sequence) {
          setData(value);
          setError("");
        }
      } catch (e) {
        if (alive && requestSequence === sequence) setError((e as Error).message);
      } finally {
        if (alive && requestSequence === sequence) setLoading(false);
      }
    };
    loader.current = load;
    void load();
    const interval = stream ? setInterval(() => void load(), 12000) : undefined;
    const source = stream ? new EventSource(stream) : undefined;
    if (source) source.onmessage = () => void load();
    return () => {
      alive = false;
      loader.current = null;
      clearInterval(interval);
      source?.close();
    };
  }, [url, stream]);
  return { data, error, loading, refresh };
}
