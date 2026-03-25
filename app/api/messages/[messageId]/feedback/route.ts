import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";

/**
 * PATCH /api/messages/:messageId/feedback
 * Body: { feedback: 1 | -1 | null, modelRunId?: string }
 *
 * Auth required. RLS enforces ownership of the message.
 * Updates messages.feedback and optionally model_runs.feedback.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;

  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { feedback: 1 | -1 | null; modelRunId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { feedback, modelRunId } = body;
  if (feedback !== null && feedback !== 1 && feedback !== -1) {
    return NextResponse.json(
      { error: "feedback must be 1, -1, or null" },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();

  // Update messages.feedback (RLS enforces ownership)
  const { error: msgError } = await supabase
    .from("messages")
    .update({ feedback })
    .eq("id", messageId);

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  // Optionally update model_runs.feedback as well
  if (modelRunId) {
    const { error: runError } = await supabase
      .from("model_runs")
      .update({ feedback })
      .eq("id", modelRunId);

    if (runError) {
      return NextResponse.json({ error: runError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ feedback });
}
