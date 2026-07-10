import { NextResponse } from "next/server";
import {
  createRetryFeedbackFallbackResponse,
  generateRetryFeedbackWithLlm,
  parseRetryFeedbackRequestBody,
} from "../_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      createRetryFeedbackFallbackResponse(
        {
          question_text: "IELTS Speaking Part 1 question",
          first_answer: "I like it.",
          polished_answer: "",
          expansion_sentence: "",
          retry_answer: "I like it.",
        },
        "invalid_json",
        null,
      ),
    );
  }

  const input = parseRetryFeedbackRequestBody(body);

  if (!input) {
    return NextResponse.json(
      createRetryFeedbackFallbackResponse(
        {
          question_text: "IELTS Speaking Part 1 question",
          first_answer: "I like it.",
          polished_answer: "",
          expansion_sentence: "",
          retry_answer: "I like it.",
        },
        "schema_invalid",
        null,
      ),
    );
  }

  return NextResponse.json(await generateRetryFeedbackWithLlm(input));
}
