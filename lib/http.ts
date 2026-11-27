import { NextResponse } from "next/server";
export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export const bad = (msg: string, status = 400) => json({ error: msg }, status);
export async function body<T = Record<string, unknown>>(req: Request): Promise<T> { try { return (await req.json()) as T; } catch { return {} as T; } }
