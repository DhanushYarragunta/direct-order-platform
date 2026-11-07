import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, request } from "../src/lib/client";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("JSON request error handling", () => {
  it("returns a valid successful payload and forwards the request signal", async () => {
    const controller = new AbortController();
    const payload = { prediction: { minutes: 25, fallback: false } };
    const fetcher = vi.fn().mockResolvedValue(Response.json(payload));
    vi.stubGlobal("fetch", fetcher);
    await expect(request("/api/staff/ai", "POST", { history: "full" }, controller.signal)).resolves.toEqual(payload);
    expect(fetcher).toHaveBeenCalledWith("/api/staff/ai", expect.objectContaining({ method: "POST", body: '{"history":"full"}', signal: controller.signal }));
  });

  it.each(["", "<html>Connection interrupted</html>", '{"prediction":'])
    ("rejects malformed HTTP-200 JSON instead of returning a fake success: %j", async (body) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
      const failure = request("/api/staff/ai");
      await expect(failure).rejects.toBeInstanceOf(ApiError);
      await expect(failure).rejects.toMatchObject({ status: 200, message: "The server returned an invalid response. Please try again." });
    });

  it("preserves a legitimate JSON API error's status and message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "This outlet is outside your access" }, { status: 403 })));
    await expect(request("/api/staff/ai")).rejects.toMatchObject({ status: 403, message: "This outlet is outside your access" });
  });

  it("keeps HTTP status for invalid JSON errors and handles an absent error message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }))
      .mockResolvedValueOnce(Response.json(null, { status: 500 })));
    await expect(request("/api/staff/ai")).rejects.toMatchObject({ status: 502, message: "The server returned an invalid response. Please try again." });
    await expect(request("/api/staff/ai")).rejects.toMatchObject({ status: 500, message: "Please try again" });
  });

  it("preserves cancellation when successful headers arrive before the body is interrupted", async () => {
    const controller = new AbortController();
    const cancellation = new DOMException("The request was aborted", "AbortError");
    const body = new ReadableStream({ start(stream) {
      stream.enqueue(new TextEncoder().encode('{"prediction":'));
      controller.signal.addEventListener("abort", () => stream.error(cancellation), { once: true });
    } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    const failure = request("/api/staff/ai", "GET", undefined, controller.signal);
    await Promise.resolve();
    controller.abort(cancellation);
    await expect(failure).rejects.toBe(cancellation);
  });

  it("preserves a fetch cancellation before response headers arrive", async () => {
    const controller = new AbortController();
    const cancellation = new DOMException("The request was aborted", "AbortError");
    controller.abort(cancellation);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cancellation));
    await expect(request("/api/staff/ai", "GET", undefined, controller.signal)).rejects.toBe(cancellation);
  });
});
