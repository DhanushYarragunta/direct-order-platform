import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "./auth";
import { Prisma } from "@prisma/client";

export function checkOrigin(request: Request) {
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (request.headers.get("origin") !== expected)
    throw new AppError(403, "Request origin is not allowed");
}
export async function body<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  checkOrigin(request);
  const reader = request.body?.getReader();
  let text = "",
    bytes = 0;
  if (reader) {
    const decoder = new TextDecoder();
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 32768) {
          await reader.cancel();
          throw new AppError(413, "Request is too large");
        }
        text += decoder.decode(part.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock();
    }
  }
  try {
    return schema.parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof z.ZodError) throw error;
    throw new AppError(400, "Invalid JSON request");
  }
}
export async function api(work: () => Promise<unknown>, success = 200) {
  try {
    return NextResponse.json(await work(), {
      status: success,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AppError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message || "Check the submitted values" },
        { status: 400 },
      );
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return NextResponse.json(
        { error: "This record already exists. Refresh and try again." },
        { status: 409 },
      );
    console.error(
      "Request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return NextResponse.json(
      { error: "The service is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
}
