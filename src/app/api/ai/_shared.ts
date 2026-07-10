import {
  createMockPreAnswerOutput,
  createMockPolishResult,
  createMockRetryFeedbackResult,
  type ApiPreAnswerResponse,
  type ApiPolishResponse,
  type ApiRetryFeedbackResponse,
  type MarkedTranscriptSegment,
  type PreAnswerInput,
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

type AiProvider = "openai" | "siliconflow";

type LlmResult =
  | { ok: true; data: unknown; latencyMs: number; provider: AiProvider }
  | {
      ok: false;
      reason: FallbackReason;
      latencyMs: number | null;
      provider: AiProvider;
    };

const DEFAULT_OPENAI_CHAT_COMPLETIONS_URL =
  "https://api.openai.com/v1/chat/completions";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_SILICONFLOW_CHAT_COMPLETIONS_URL =
  "https://api.siliconflow.cn/v1/chat/completions";
const LLM_TIMEOUT_MS = 12_000;

function getAiProvider(): AiProvider {
  return process.env.AI_PROVIDER?.toLowerCase() === "siliconflow"
    ? "siliconflow"
    : "openai";
}

function getProviderConfig() {
  const provider = getAiProvider();

  if (provider === "siliconflow") {
    return {
      apiKey: process.env.SILICONFLOW_API_KEY,
      baseUrl:
        process.env.SILICONFLOW_BASE_URL ??
        DEFAULT_SILICONFLOW_CHAT_COMPLETIONS_URL,
      model: process.env.SILICONFLOW_MODEL ?? "",
      provider,
      supportsResponseFormat: false,
    };
  }

  return {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: DEFAULT_OPENAI_CHAT_COMPLETIONS_URL,
    model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
    provider,
    supportsResponseFormat: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function callLlmJson(
  systemPrompt: string,
  userPayload: unknown,
): Promise<LlmResult> {
  const config = getProviderConfig();

  if (!config.apiKey) {
    return {
      ok: false,
      reason: "missing_api_key",
      latencyMs: null,
      provider: config.provider,
    };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  const requestBody: Record<string, unknown> = {
    model: config.model,
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
  };

  if (config.supportsResponseFormat) {
    requestBody.response_format = { type: "json_object" };
  }

  try {
    const response = await fetch(config.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        ok: false,
        reason: "llm_request_failed",
        latencyMs,
        provider: config.provider,
      };
    }

    const responseJson = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = responseJson.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return {
        ok: false,
        reason: "empty_response",
        latencyMs,
        provider: config.provider,
      };
    }

    try {
      return {
        ok: true,
        data: JSON.parse(content),
        latencyMs,
        provider: config.provider,
      };
    } catch {
      return {
        ok: false,
        reason: "invalid_json",
        latencyMs,
        provider: config.provider,
      };
    }
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "llm_timeout"
        : "llm_request_failed";

    return { ok: false, reason, latencyMs, provider: config.provider };
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
    aiProvider: getAiProvider(),
    fallbackReason,
    llmLatencyMs,
  };
}

export function createPreAnswerFallbackResponse(
  input: PreAnswerInput,
  fallbackReason: FallbackReason,
  llmLatencyMs: number | null,
): ApiPreAnswerResponse {
  const mockResult = createMockPreAnswerOutput(input);

  return {
    directionZh: mockResult.answer_direction_zh,
    keywords: mockResult.useful_keywords_en.slice(0, 5),
    sentenceStarters: [mockResult.sentence_starter_en].filter(Boolean),
    optionalReminder: mockResult.caution_zh,
    source: "mock_fallback",
    aiProvider: getAiProvider(),
    fallbackReason,
    llmLatencyMs,
  };
}

export function validatePreAnswerApiResponse(
  value: unknown,
): ApiPreAnswerResponse | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isNonEmptyString(value.directionZh) ||
    value.directionZh.trim().length > 30 ||
    !Array.isArray(value.keywords) ||
    value.keywords.length < 3 ||
    value.keywords.length > 5 ||
    !value.keywords.every(isNonEmptyString) ||
    value.keywords.some(isGenericPreAnswerKeyword) ||
    !Array.isArray(value.sentenceStarters) ||
    value.sentenceStarters.length < 1 ||
    value.sentenceStarters.length > 2 ||
    !value.sentenceStarters.every(isNonEmptyString) ||
    typeof value.optionalReminder !== "string"
  ) {
    return null;
  }

  return {
    directionZh: String(value.directionZh).trim(),
    keywords: value.keywords.map((keyword) => keyword.trim()).slice(0, 5),
    sentenceStarters: value.sentenceStarters
      .map((starter) => starter.trim())
      .slice(0, 2),
    optionalReminder: String(value.optionalReminder).trim(),
    source: "llm",
    aiProvider: getAiProvider(),
    fallbackReason: null,
    llmLatencyMs: null,
  };
}

function isGenericPreAnswerKeyword(keyword: unknown) {
  if (typeof keyword !== "string") {
    return true;
  }

  const genericLabels = new Set([
    "age",
    "feel",
    "feeling",
    "life",
    "reason",
    "example",
    "frequency",
    "place",
    "preference",
    "opinion",
    "experience",
    "comparison",
    "background",
    "detail",
  ]);

  return genericLabels.has(keyword.trim().toLowerCase());
}

export async function generatePreAnswerWithLlm(
  input: PreAnswerInput,
): Promise<ApiPreAnswerResponse> {
  const llmResult = await callLlmJson(PRE_ANSWER_SYSTEM_PROMPT, {
    topicId: input.topic_id,
    questionId: input.question_id,
    questionText: input.question_text,
    answerStructureType: input.answerStructureType,
  });

  if (!llmResult.ok) {
    return createPreAnswerFallbackResponse(
      input,
      llmResult.reason,
      llmResult.latencyMs,
    );
  }

  const validated = validatePreAnswerApiResponse(llmResult.data);

  if (!validated) {
    return createPreAnswerFallbackResponse(input, "schema_invalid", llmResult.latencyMs);
  }

  return {
    ...validated,
    aiProvider: llmResult.provider,
    llmLatencyMs: llmResult.latencyMs,
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
    aiProvider: getAiProvider(),
    fallbackReason: null,
    llmLatencyMs: null,
  };
}

export async function generatePolishWithLlm(
  input: PolishInput,
): Promise<ApiPolishResponse> {
  const llmResult = await callLlmJson(POLISH_SYSTEM_PROMPT, {
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
    aiProvider: llmResult.provider,
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
    aiProvider: getAiProvider(),
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
    aiProvider: getAiProvider(),
    fallbackReason: null,
    llmLatencyMs: null,
  };
}

export async function generateRetryFeedbackWithLlm(
  input: RetryFeedbackInput,
): Promise<ApiRetryFeedbackResponse> {
  const llmResult = await callLlmJson(RETRY_FEEDBACK_SYSTEM_PROMPT, {
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
    aiProvider: llmResult.provider,
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

export function parsePreAnswerRequestBody(body: unknown): PreAnswerInput | null {
  if (!isRecord(body)) {
    return null;
  }

  if (
    !isNonEmptyString(body.topicId) ||
    !isNonEmptyString(body.questionId) ||
    !isNonEmptyString(body.questionText) ||
    !isNonEmptyString(body.answerStructureType)
  ) {
    return null;
  }

  return {
    topic_id: body.topicId,
    question_id: body.questionId,
    question_text: body.questionText,
    answerStructureType: body.answerStructureType as AnswerStructureType,
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
- Keep the tone low-pressure and coach-like. Avoid harsh wording such as "serious error", "must change", "wrong answer", or "do not say this".
- If something can be improved, think in terms of "This can sound a little more natural" or "If the user wants a fuller answer, add one simple reason".

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
For this bad case, use a gentle Chinese feedbackText like: "这句更像是在说答题方法，还没有真正回答题目。下一次可以直接说你的答案，再补一句具体原因。"

User-facing rules:
- feedbackText must be short, low-pressure, and in Chinese.
- Do not show internal field names, type labels, Band scores, scoring language, or pronunciation feedback.
- Avoid harsh wording. Keep it brief, encouraging, and practical.
- adoptedExpressions should list concrete adopted phrases only. If none, use [].

Output shape:
{
  "feedbackType": "adopted_suggestion | improved_expression | needs_adjustment",
  "feedbackText": "short Chinese feedback",
  "adoptedExpressions": ["string"]
}`;

const PRE_ANSWER_SYSTEM_PROMPT = `You are SpeakFix IELTS A02, a low-pressure pre-answer idea coach for IELTS Speaking Part 1.
Return strict JSON only. No Markdown, no explanations outside JSON.

Goal:
Help an IELTS 6.0-6.5 user know how to start speaking before answering.

Rules:
- Do not generate a full answer.
- Do not answer for the user.
- Do not write a model answer or long paragraph.
- Do not mention Band scores or scoring.
- Keep the tone light, practical, and encouraging.
- directionZh must be Chinese, at most 30 Chinese characters.
- keywords must contain 3-5 content words or short phrases the user can directly use in an answer.
- keywords must not be category labels or answer dimensions. Do not output labels such as "age", "feel", "life", "reason", "example", "frequency", "place", "preference", "opinion", or "experience".
- For "How old are you?", good keywords are like "twenty-three", "university student", "busy but meaningful"; bad keywords are "age", "feel", "life".
- Keywords should cover speakable content and should not completely repeat sentenceStarters.
- sentenceStarters must contain 1-2 short English sentence starters, with blanks or replaceable parts. They should be half-open templates, not complete answers.
- For example: "I am ___ years old, and I feel ___ about my age."
- optionalReminder must be a short Chinese reminder.
- Stay close to the question and answerStructureType.

Output shape:
{
  "directionZh": "中文方向，不超过30字",
  "keywords": ["simple", "English", "phrases"],
  "sentenceStarters": ["I would say ..., because ..."],
  "optionalReminder": "中文轻提醒"
}`;
