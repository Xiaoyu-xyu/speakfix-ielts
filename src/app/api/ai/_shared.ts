import {
  createMockPolishResult,
  createMockRetryFeedbackResult,
  type ApiPolishResponse,
  type ApiRetryFeedbackResponse,
  type MarkedTranscriptSegment,
  type PolishInput,
  type RetryFeedbackInput,
  type RetryFeedbackResult,
} from "@/lib/ai";
import type { AnswerStructureType } from "@/types/practice";

export type FallbackReason =
  | "missing_api_key"
  | "llm_request_failed"
  | "llm_timeout"
  | "invalid_json"
  | "schema_invalid"
  | "empty_response";

type OpenAiResult =
  | { ok: true; data: unknown; latencyMs: number }
  | { ok: false; reason: FallbackReason; latencyMs: number | null };

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_TIMEOUT_MS = 12_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function callOpenAiJson(systemPrompt: string, userPayload: unknown): Promise<OpenAiResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return { ok: false, reason: "missing_api_key", latencyMs: null };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      return { ok: false, reason: "llm_request_failed", latencyMs };
    }

    const responseJson = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = responseJson.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return { ok: false, reason: "empty_response", latencyMs };
    }

    try {
      return { ok: true, data: JSON.parse(content), latencyMs };
    } catch {
      return { ok: false, reason: "invalid_json", latencyMs };
    }
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "llm_timeout"
        : "llm_request_failed";

    return { ok: false, reason, latencyMs };
  } finally {
    clearTimeout(timeoutId);
  }
}

function markTypeFromMock(type: MarkedTranscriptSegment["type"]) {
  if (type === "error") {
    return "red" as const;
  }

  if (type === "improve") {
    return "orange" as const;
  }

  return "none" as const;
}

export function createPolishFallbackResponse(
  input: PolishInput,
  fallbackReason: FallbackReason,
  llmLatencyMs: number | null,
): ApiPolishResponse {
  const mockResult = createMockPolishResult(input);

  return {
    originalSegments: mockResult.markedTranscript.map((segment) => ({
      text: segment.text,
      markType: markTypeFromMock(segment.type),
      reason:
        segment.type === "error"
          ? "Grammar issue."
          : segment.type === "improve"
            ? "More natural IELTS Speaking Part 1 expression."
            : "",
    })),
    polishedAnswer: mockResult.polishedAnswer || input.user_answer.trim(),
    extensionSentence: mockResult.expansionSentence,
    hasMeaningfulPolish: mockResult.noPolishNeeded !== true,
    source: "mock_fallback",
    fallbackReason,
    llmLatencyMs,
  };
}

export function validatePolishApiResponse(value: unknown): ApiPolishResponse | null {
  if (!isRecord(value)) {
    return null;
  }

  const originalSegments = value.originalSegments;

  if (
    !Array.isArray(originalSegments) ||
    originalSegments.length === 0 ||
    !originalSegments.every(
      (segment) =>
        isRecord(segment) &&
        isNonEmptyString(segment.text) &&
        ["none", "red", "orange"].includes(String(segment.markType)) &&
        typeof segment.reason === "string",
    )
  ) {
    return null;
  }

  if (
    !isNonEmptyString(value.polishedAnswer) ||
    typeof value.extensionSentence !== "string" ||
    typeof value.hasMeaningfulPolish !== "boolean"
  ) {
    return null;
  }

  return {
    originalSegments: originalSegments.map((segment) => {
      const record = segment as Record<string, unknown>;

      return {
        text: String(record.text).trim(),
        markType: record.markType as "none" | "red" | "orange",
        reason: String(record.reason).trim(),
      };
    }),
    polishedAnswer: String(value.polishedAnswer).trim(),
    extensionSentence: normalizeOptionalString(value.extensionSentence),
    hasMeaningfulPolish: value.hasMeaningfulPolish,
    source: "llm",
    fallbackReason: null,
    llmLatencyMs: null,
  };
}

export async function generatePolishWithLlm(
  input: PolishInput,
): Promise<ApiPolishResponse> {
  const llmResult = await callOpenAiJson(POLISH_SYSTEM_PROMPT, {
    topicId: input.topic_id,
    questionText: input.question_text,
    userTranscript: input.user_answer,
    answerStructureType: input.answerStructureType,
  });

  if (!llmResult.ok) {
    return createPolishFallbackResponse(input, llmResult.reason, llmResult.latencyMs);
  }

  const validated = validatePolishApiResponse(llmResult.data);

  if (!validated) {
    return createPolishFallbackResponse(input, "schema_invalid", llmResult.latencyMs);
  }

  return {
    ...validated,
    llmLatencyMs: llmResult.latencyMs,
  };
}

function mapRetryFeedbackToApi(
  result: RetryFeedbackResult,
): ApiRetryFeedbackResponse["feedbackType"] {
  const feedbackType = String(result.feedback_type);

  if (
    feedbackType === "\u91c7\u7eb3\u5efa\u8bae" ||
    feedbackType === "閲囩撼寤鸿"
  ) {
    return "adopted_suggestion";
  }

  if (
    feedbackType === "\u4ecd\u9700\u8c03\u6574" ||
    feedbackType === "浠嶉渶璋冩暣"
  ) {
    return "needs_adjustment";
  }

  return "improved_expression";
}

export function createRetryFeedbackFallbackResponse(
  input: RetryFeedbackInput,
  fallbackReason: FallbackReason,
  llmLatencyMs: number | null,
): ApiRetryFeedbackResponse {
  const mockResult = createMockRetryFeedbackResult(input);

  return {
    feedbackType: mapRetryFeedbackToApi(mockResult),
    feedbackText: mockResult.feedback_text,
    adoptedExpressions:
      mapRetryFeedbackToApi(mockResult) === "adopted_suggestion" &&
      input.expansion_sentence
        ? [input.expansion_sentence]
        : [],
    source: "mock_fallback",
    fallbackReason,
    llmLatencyMs,
  };
}

export function validateRetryFeedbackApiResponse(
  value: unknown,
): ApiRetryFeedbackResponse | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !["adopted_suggestion", "improved_expression", "needs_adjustment"].includes(
      String(value.feedbackType),
    ) ||
    !isNonEmptyString(value.feedbackText) ||
    !Array.isArray(value.adoptedExpressions) ||
    !value.adoptedExpressions.every((expression) => typeof expression === "string")
  ) {
    return null;
  }

  return {
    feedbackType: value.feedbackType as ApiRetryFeedbackResponse["feedbackType"],
    feedbackText: String(value.feedbackText).trim(),
    adoptedExpressions: value.adoptedExpressions
      .map((expression) => expression.trim())
      .filter(Boolean),
    source: "llm",
    fallbackReason: null,
    llmLatencyMs: null,
  };
}

export async function generateRetryFeedbackWithLlm(
  input: RetryFeedbackInput,
): Promise<ApiRetryFeedbackResponse> {
  const llmResult = await callOpenAiJson(RETRY_FEEDBACK_SYSTEM_PROMPT, {
    questionText: input.question_text,
    firstTranscript: input.first_answer,
    polishedAnswer: input.polished_answer,
    extensionSentence: input.expansion_sentence ?? "",
    retryTranscript: input.retry_answer,
  });

  if (!llmResult.ok) {
    return createRetryFeedbackFallbackResponse(
      input,
      llmResult.reason,
      llmResult.latencyMs,
    );
  }

  const validated = validateRetryFeedbackApiResponse(llmResult.data);

  if (!validated) {
    return createRetryFeedbackFallbackResponse(input, "schema_invalid", llmResult.latencyMs);
  }

  return {
    ...validated,
    llmLatencyMs: llmResult.latencyMs,
  };
}

export function parsePolishRequestBody(body: unknown): PolishInput | null {
  if (!isRecord(body)) {
    return null;
  }

  if (
    !isNonEmptyString(body.topicId) ||
    !isNonEmptyString(body.questionText) ||
    !isNonEmptyString(body.userTranscript) ||
    !isNonEmptyString(body.answerStructureType)
  ) {
    return null;
  }

  return {
    topic_id: body.topicId,
    topic_title: "",
    question_text: body.questionText,
    answerStructureType: body.answerStructureType as AnswerStructureType,
    user_answer: body.userTranscript,
    question_index: 1,
    target_level: "IELTS 6.0-6.5",
  };
}

export function parseRetryFeedbackRequestBody(
  body: unknown,
): RetryFeedbackInput | null {
  if (!isRecord(body)) {
    return null;
  }

  if (
    !isNonEmptyString(body.questionText) ||
    !isNonEmptyString(body.firstTranscript) ||
    !isNonEmptyString(body.retryTranscript)
  ) {
    return null;
  }

  return {
    question_text: body.questionText,
    first_answer: body.firstTranscript,
    polished_answer: normalizeOptionalString(body.polishedAnswer),
    expansion_sentence: normalizeOptionalString(body.extensionSentence),
    retry_answer: body.retryTranscript,
  };
}

const POLISH_SYSTEM_PROMPT = `You are SpeakFix IELTS A03, an answer polishing assistant for IELTS Speaking Part 1.
Return strict JSON only. No Markdown, no explanations outside JSON.

Product boundary:
- Polish only the user's original answer.
- Do not invent identity, school, job, place, experience, preference, age, or background.
- Do not score, grade, mention Band, or evaluate pronunciation.
- Do not change the question.
- Keep the answer natural, short, spoken, and suitable for IELTS 6.0-6.5.
- Avoid overly written or model-answer language.
- Do not mark natural spoken phrases as errors. Phrases like "in Shanghai" and "usually like" are normally fine.

Marking rules:
- originalSegments must cover the user's transcript in order.
- markType "red" means grammar error only.
- markType "orange" means IELTS spoken naturalness optimization only.
- markType "none" means no color.
- Be conservative. Do not add color just to create feedback.

Output shape:
{
  "originalSegments": [
    { "text": "string", "markType": "none | red | orange", "reason": "string" }
  ],
  "polishedAnswer": "A directly repeatable first-person IELTS Part 1 short answer.",
  "extensionSentence": "One optional sentence, or empty string.",
  "hasMeaningfulPolish": true
}`;

const RETRY_FEEDBACK_SYSTEM_PROMPT = `You are SpeakFix IELTS A04, a lightweight retry feedback assistant for IELTS Speaking Part 1.
Compare the first answer, A03 polish/extension, and retry answer.
Return strict JSON only. No Markdown, no explanations outside JSON.

Allowed feedbackType values:
- adopted_suggestion: the retry clearly adopts concrete wording from the polished answer or extension sentence.
- improved_expression: the retry does not clearly adopt the suggestion, but it is more complete or more relevant than the first answer.
- needs_adjustment: the retry is still too short, unrelated, not improved, or uses strategy/meta wording instead of answering.

Important bad case:
If the retry says something like "I can also give a simple reason to make it clearer", "I can give a reason", "I will explain more", "For this question", or "My answer is", it is describing a strategy rather than answering the IELTS question. It must be needs_adjustment.

User-facing rules:
- feedbackText must be short, low-pressure, and in Chinese.
- Do not show internal field names, type labels, Band scores, scoring language, or pronunciation feedback.
- adoptedExpressions should list concrete adopted phrases only. If none, use [].

Output shape:
{
  "feedbackType": "adopted_suggestion | improved_expression | needs_adjustment",
  "feedbackText": "short Chinese feedback",
  "adoptedExpressions": ["string"]
}`;
