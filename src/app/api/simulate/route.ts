import { NextRequest, NextResponse } from "next/server";

// To prevent Vercel/Next.js from timing out on long AI tasks
// Standard Vercel Hobby plan timeout is 10s. For Pro it's 60s.
// Max duration configuration for Next.js App Router (must be exported)
export const maxDuration = 300; 

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Forward the JSON body to the FastAPI backend
    const response = await fetch("http://localhost:8000/api/simulate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      // Prevent node fetch from timing out
      signal: AbortSignal.timeout(300000), 
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Simulation API error from backend:", response.status, errorText);
      return NextResponse.json(
        { detail: "Backend simulation error", backendDetails: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Next.js proxy error for /api/simulate:", error);
    return NextResponse.json(
      { detail: "Internal Server Error in Proxy", error: error.message || String(error) },
      { status: 500 }
    );
  }
}
