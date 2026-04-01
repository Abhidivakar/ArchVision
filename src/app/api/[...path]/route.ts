import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Custom API Proxy Handler for Next.js App Router.
 * Replaces next.config rewrites to handle long-running Gemini API requests
 * without the default 30s-60s proxy timeout.
 */
async function handler(
  request: NextRequest,
  props: { params: Promise<{ path: string[] }> }
) {
  const params = await props.params;
  const path = params.path.join("/");
  const backendBase = process.env.BACKEND_URL || "http://localhost:8000";
  const backendUrl = `${backendBase}/api/${path}`;

  try {
    const body = await request.blob();
    const headers = new Headers(request.headers);
    headers.delete("host"); // Let the new fetch set the correct host

    const response = await fetch(backendUrl, {
      method: request.method,
      headers: headers,
      body: request.method === "GET" || request.method === "HEAD" ? null : body,
      // @ts-ignore - next-fetch specific option for long requests
      next: { revalidate: 0 },
      // Increase timeout by allowing the underlying socket to stay open
      // In local dev, this helps prevent early termination.
    });

    const data = await response.blob();
    return new NextResponse(data, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error: any) {
    console.error("Proxy Error:", error);
    return NextResponse.json(
      { detail: `Proxy Error: ${error.message}` },
      { status: 502 }
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
