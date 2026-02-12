import { NextResponse } from "next/server";

function buildResponse() {
  return NextResponse.json(
    {
      error: "Legacy NextAuth route removed. Use /auth/login with Supabase Auth.",
    },
    { status: 410 },
  );
}

export async function GET() {
  return buildResponse();
}

export async function POST() {
  return buildResponse();
}
