import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function clearSession() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}

export async function POST() {
  await clearSession();
  return NextResponse.json({ success: true });
}

export async function GET(request: Request) {
  await clearSession();
  const url = new URL(request.url);
  return NextResponse.redirect(new URL("/auth/login", url.origin));
}
