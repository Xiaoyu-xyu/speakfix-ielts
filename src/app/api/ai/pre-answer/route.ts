import { NextResponse } from "next/server";
import {
  createPreAnswerFallbackResponse,
  generatePreAnswerWithLlm,
  parsePreAnswerRequestBody,
} from "../_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      createPreAnswerFallbackResponse(
        {
          topic_id: "",
          question_id: "",
          question_text: "IELTS Speaking Part 1 question",
          answerStructureType: "basic_fact",
        },
        "invalid_json",
        null,
      ),
    );
  }

  const input = parsePreAnswerRequestBody(body);

  if (!input) {
    return NextResponse.json(
      createPreAnswerFallbackResponse(
        {
          topic_id: "",
          question_id: "",
          question_text: "IELTS Speaking Part 1 question",
          answerStructureType: "basic_fact",
        },
        "schema_invalid",
        null,
      ),
    );
  }

  return NextResponse.json(await generatePreAnswerWithLlm(input));
}
