import { NextResponse } from "next/server";
import {
  createPolishFallbackResponse,
  generatePolishWithLlm,
  parsePolishRequestBody,
} from "../_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      createPolishFallbackResponse(
        {
          topic_id: "",
          topic_title: "",
          question_text: "",
          answerStructureType: "basic_fact",
          user_answer: "I need a simple answer.",
          question_index: 1,
          target_level: "IELTS 6.0-6.5",
        },
        "invalid_json",
        null,
      ),
    );
  }

  const input = parsePolishRequestBody(body);

  if (!input) {
    return NextResponse.json(
      createPolishFallbackResponse(
        {
          topic_id: "",
          topic_title: "",
          question_text: "",
          answerStructureType: "basic_fact",
          user_answer: "I need a simple answer.",
          question_index: 1,
          target_level: "IELTS 6.0-6.5",
        },
        "schema_invalid",
        null,
      ),
    );
  }

  return NextResponse.json(await generatePolishWithLlm(input));
}
