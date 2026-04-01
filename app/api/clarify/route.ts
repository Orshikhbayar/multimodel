import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const CLARIFY_SYSTEM_PROMPT = `You are a helpful assistant that identifies ambiguities in user requests.

Given a user's prompt, generate 2-3 SHORT clarifying questions that, if answered, would help produce a much better response. Each question should have 3-4 concise answer options.

Rules:
- Only ask if the prompt is genuinely ambiguous (skip if it's already specific)
- Questions should be practical, not philosophical
- Options should be mutually exclusive and cover the most common cases
- Keep questions under 10 words each
- Keep options under 5 words each

Respond ONLY with valid JSON in this exact format:
{
  "questions": [
    {
      "question": "What is this for?",
      "options": ["Personal use", "Work / business", "School / academic", "Other"]
    },
    {
      "question": "Preferred tone?",
      "options": ["Casual & friendly", "Professional", "Technical", "Creative"]
    }
  ]
}

If the prompt is already specific enough, return: { "questions": [] }`;

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 5) {
      return NextResponse.json({ questions: [] });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ questions: [] });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: CLARIFY_SYSTEM_PROMPT },
          {
            role: "user",
            content: `User's prompt: "${prompt.slice(0, 500)}"`,
          },
        ],
        temperature: 0.3,
        max_tokens: 400,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ questions: [] });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";

    let parsed: { questions?: unknown } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ questions: [] });
    }

    // Validate structure
    const questions = Array.isArray(parsed.questions)
      ? parsed.questions
          .filter(
            (q): q is { question: string; options: string[] } =>
              q &&
              typeof q.question === "string" &&
              Array.isArray(q.options) &&
              q.options.length >= 2,
          )
          .slice(0, 3)
      : [];

    return NextResponse.json({ questions });
  } catch {
    return NextResponse.json({ questions: [] });
  }
}
