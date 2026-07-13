import {
  createMockPreAnswerOutput,
  createMockPolishResult,
  createMockRetryFeedbackResult,
  createAiRetryJudgement,
  diagnoseAiPolishInput,
  hasAiSubstantiveDifference,
  hasAiTimeStateConflict,
  hasAiUnsafeExtension,
  mapAiRetryJudgementToFeedback,
  normalizeFormattingComparableText,
  type ApiPreAnswerResponse,
  type ApiPolishSegment,
  type ApiPolishResponse,
  type ApiRetryFeedbackResponse,
  type A04AdoptionState,
  type A04Judgement,
  type PolishInputDiagnosis,
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

type SchemaValidationIssue = {
  field: string;
  reason:
    | "missing"
    | "type_invalid"
    | "array_length_invalid"
    | "enum_invalid"
    | "string_too_long"
    | "forbidden_value";
  detail?: string;
};

type FinalizePolishInput = {
  input: PolishInput;
  response: ApiPolishResponse;
  source: ApiPolishResponse["source"];
  fallbackReason: FallbackReason | null;
  diagnosis?: PolishInputDiagnosis;
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

function describeValueForDiagnostics(value: unknown): unknown {
  if (typeof value === "string") {
    return { type: "string", length: value.length };
  }

  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      itemTypes: value.slice(0, 5).map((item) => typeof item),
    };
  }

  if (isRecord(value)) {
    return {
      type: "object",
      keys: Object.keys(value).slice(0, 20),
    };
  }

  return { type: value === null ? "null" : typeof value };
}

function summarizeModelJsonForDiagnostics(value: unknown) {
  if (!isRecord(value)) {
    return describeValueForDiagnostics(value);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => [
      key,
      describeValueForDiagnostics(fieldValue),
    ]),
  );
}

function logSchemaInvalidDiagnostics(
  node: "A02" | "A03" | "A04",
  value: unknown,
  errors: SchemaValidationIssue[],
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.warn(
    JSON.stringify({
      event: "ai_schema_invalid",
      node,
      provider: getAiProvider(),
      modelJsonSummary: summarizeModelJsonForDiagnostics(value),
      errors,
    }),
  );
}

function logSchemaRepairDiagnostics(
  node: "A02" | "A03" | "A04",
  firstErrors: SchemaValidationIssue[],
  repairSucceeded: boolean,
  repairSchemaErrors: SchemaValidationIssue[],
  firstLatencyMs: number,
  repairLatencyMs: number | null,
  totalLatencyMs: number,
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.warn(
    JSON.stringify({
      event: "ai_schema_repair",
      node,
      provider: getAiProvider(),
      firstErrors,
      repairAttempted: true,
      repairSucceeded,
      repairSchemaErrors,
      firstLatencyMs,
      repairLatencyMs,
      totalLatencyMs,
    }),
  );
}

function combineLatencyMs(
  firstLatencyMs: number | null,
  repairLatencyMs: number | null,
) {
  return (firstLatencyMs ?? 0) + (repairLatencyMs ?? 0);
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

function schemaRepairDescription(node: "A02" | "A03") {
  if (node === "A02") {
    return {
      directionZh: "non-empty Chinese string, length <= 30",
      keywords:
        "array of exactly 3 non-empty strings; no generic labels or unsafe personal facts",
      sentenceStarters:
        "array of 2-3 non-empty strings; no unclear templates such as I'm in my __s",
      optionalReminder: "string, may be empty",
    };
  }

  if (node === "A03") {
    return {
      originalSegments:
        "non-empty array of { text: non-empty string, markType: none|red|orange, reason: string }",
      polishedAnswer: "non-empty string",
      extensionSentence: "string, may be empty",
      hasMeaningfulPolish: "boolean",
    };
  }
}

async function repairSchemaJson(
  node: "A02" | "A03",
  parsedJson: unknown,
  errors: SchemaValidationIssue[],
) {
  return callLlmJson(SCHEMA_REPAIR_SYSTEM_PROMPT, {
    node,
    schema: schemaRepairDescription(node),
    errors,
    parsedJson,
  });
}

async function attemptSchemaRepair<T>(
  node: "A02" | "A03",
  llmResult: Extract<LlmResult, { ok: true }>,
  validate: (value: unknown) => T | null,
  diagnose: (value: unknown) => SchemaValidationIssue[],
) {
  const firstErrors = diagnose(llmResult.data);

  if (process.env.NODE_ENV !== "production") {
    logSchemaInvalidDiagnostics(node, llmResult.data, firstErrors);
  }

  const repairResult = await repairSchemaJson(node, llmResult.data, firstErrors);
  const totalLatencyMs = combineLatencyMs(
    llmResult.latencyMs,
    repairResult.latencyMs,
  );

  if (repairResult.ok) {
    const repaired = validate(repairResult.data);

    if (repaired) {
      if (process.env.NODE_ENV !== "production") {
        logSchemaRepairDiagnostics(
          node,
          firstErrors,
          true,
          [],
          llmResult.latencyMs,
          repairResult.latencyMs,
          totalLatencyMs,
        );
      }

      return {
        data: repaired,
        provider: repairResult.provider,
        totalLatencyMs,
      };
    }

    const repairErrors = diagnose(repairResult.data);

    if (process.env.NODE_ENV !== "production") {
      logSchemaRepairDiagnostics(
        node,
        firstErrors,
        false,
        repairErrors,
        llmResult.latencyMs,
        repairResult.latencyMs,
        totalLatencyMs,
      );
    }

    return { data: null, provider: llmResult.provider, totalLatencyMs };
  }

  if (process.env.NODE_ENV !== "production") {
    logSchemaRepairDiagnostics(
      node,
      firstErrors,
      false,
      [
        {
          field: "$",
          reason: "type_invalid",
          detail: `repair request failed: ${repairResult.reason}`,
        },
      ],
      llmResult.latencyMs,
      repairResult.latencyMs,
      totalLatencyMs,
    );
  }

  return { data: null, provider: llmResult.provider, totalLatencyMs };
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
  return finalizePolishResponse({
    input,
    response: createRawPolishFallbackResponse(input, fallbackReason, llmLatencyMs),
    source: "mock_fallback",
    fallbackReason,
  });
}

function createRawPolishFallbackResponse(
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
    value.keywords.length !== 3 ||
    !value.keywords.every(isNonEmptyString) ||
    value.keywords.some(isGenericPreAnswerKeyword) ||
    !Array.isArray(value.sentenceStarters) ||
    value.sentenceStarters.length < 2 ||
    value.sentenceStarters.length > 3 ||
    !value.sentenceStarters.every(isNonEmptyString) ||
    value.sentenceStarters.some(isUnclearPreAnswerStarter) ||
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

function diagnosePreAnswerSchema(value: unknown): SchemaValidationIssue[] {
  const errors: SchemaValidationIssue[] = [];

  if (!isRecord(value)) {
    return [{ field: "$", reason: "type_invalid", detail: "expected object" }];
  }

  if (!isNonEmptyString(value.directionZh)) {
    errors.push({
      field: "directionZh",
      reason: value.directionZh === undefined ? "missing" : "type_invalid",
      detail: "expected non-empty string",
    });
  } else if (value.directionZh.trim().length > 30) {
    errors.push({
      field: "directionZh",
      reason: "string_too_long",
      detail: "expected length <= 30",
    });
  }

  if (!Array.isArray(value.keywords)) {
    errors.push({
      field: "keywords",
      reason: value.keywords === undefined ? "missing" : "type_invalid",
      detail: "expected array length 3",
    });
  } else {
    if (value.keywords.length !== 3) {
      errors.push({
        field: "keywords",
        reason: "array_length_invalid",
        detail: `expected 3, got ${value.keywords.length}`,
      });
    }

    value.keywords.forEach((keyword, index) => {
      if (!isNonEmptyString(keyword)) {
        errors.push({
          field: `keywords.${index}`,
          reason: keyword === undefined ? "missing" : "type_invalid",
          detail: "expected non-empty string",
        });
      } else if (isGenericPreAnswerKeyword(keyword)) {
        errors.push({
          field: `keywords.${index}`,
          reason: "forbidden_value",
          detail: `keyword "${keyword.trim()}" is generic or unsafe`,
        });
      }
    });
  }

  if (!Array.isArray(value.sentenceStarters)) {
    errors.push({
      field: "sentenceStarters",
      reason: value.sentenceStarters === undefined ? "missing" : "type_invalid",
      detail: "expected array length 2-3",
    });
  } else {
    if (value.sentenceStarters.length < 2 || value.sentenceStarters.length > 3) {
      errors.push({
        field: "sentenceStarters",
        reason: "array_length_invalid",
        detail: `expected 2-3, got ${value.sentenceStarters.length}`,
      });
    }

    value.sentenceStarters.forEach((starter, index) => {
      if (!isNonEmptyString(starter)) {
        errors.push({
          field: `sentenceStarters.${index}`,
          reason: starter === undefined ? "missing" : "type_invalid",
          detail: "expected non-empty string",
        });
      } else if (isUnclearPreAnswerStarter(starter)) {
        errors.push({
          field: `sentenceStarters.${index}`,
          reason: "forbidden_value",
          detail: "starter matches unclear template pattern",
        });
      }
    });
  }

  if (typeof value.optionalReminder !== "string") {
    errors.push({
      field: "optionalReminder",
      reason: value.optionalReminder === undefined ? "missing" : "type_invalid",
      detail: "expected string",
    });
  }

  return errors;
}

function isGenericPreAnswerKeyword(keyword: unknown) {
  if (typeof keyword !== "string") {
    return true;
  }

  const normalized = keyword.trim().toLowerCase();
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
    "shanghai",
    "beijing",
    "twenty-three",
    "twenty two",
    "twenty-two",
    "twenty one",
    "twenty-one",
  ]);

  if (genericLabels.has(normalized)) {
    return true;
  }

  return /\b\d{1,2}\b/.test(normalized);
}

function isUnclearPreAnswerStarter(starter: unknown) {
  return (
    typeof starter !== "string" ||
    /\bi['’]?m in my _+s\b/i.test(starter) ||
    /\bi am in my _+s\b/i.test(starter)
  );
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
    const repairAttempt = await attemptSchemaRepair(
      "A02",
      llmResult,
      validatePreAnswerApiResponse,
      diagnosePreAnswerSchema,
    );

    if (repairAttempt.data) {
      return {
        ...repairAttempt.data,
        aiProvider: repairAttempt.provider,
        llmLatencyMs: repairAttempt.totalLatencyMs,
      };
    }

    return createPreAnswerFallbackResponse(
      input,
      "schema_invalid",
      repairAttempt.totalLatencyMs,
    );
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

function normalizeComparableAnswer(text: string) {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMetaOrNoAnswerExpression(answer: string) {
  return /\b(i\s+don'?t\s+know|no\s+idea|how\s+to\s+answer|this\s+question\s+is\s+difficult|hard\s+to\s+answer)\b/i.test(
    answer,
  );
}

function countComparableWords(text: string) {
  return normalizeComparableAnswer(text).split(/\s+/).filter(Boolean).length;
}

function hasFixableLanguageIssue(answer: string) {
  return [
    /\bvery like\b/i,
    /\blike wear\b/i,
    /\b(they|we|you)\s+is\b/i,
    /\bi\s+is\b/i,
    /\bit\s+make\s+me\b/i,
    /\bmake\s+me\s+relax\b/i,
    /\bfeel\s+relax\b/i,
    /\bmore better\b/i,
    /\bclothes very comfortable\b/i,
    /\b\w+\.\s+(?:a|an|very|beautiful|comfortable|convenient)\b/i,
  ].some((pattern) => pattern.test(answer));
}

function isLikelyLowConfidenceTranscript(answer: string) {
  const normalized = normalizeComparableAnswer(answer);
  const words = normalized.split(/\s+/).filter(Boolean);

  if (!normalized) {
    return true;
  }

  if (words.length <= 1 && !/^(yes|no|yeah|nope|\d{1,2})$/.test(normalized)) {
    return true;
  }

  return /\b(?:noise|music|inaudible|silence|cough|laugh)\b/i.test(answer);
}

function getPolishIntent(questionText: string, answerStructureType?: AnswerStructureType) {
  const question = questionText.toLowerCase();

  if (/\bhow old\b/.test(question)) {
    return "age";
  }

  if (/\bwhere do you live|where are you from|hometown|city|town|village|house or an apartment\b/.test(question)) {
    return "place";
  }

  if (/\bwhen did you|when do you\b/.test(question) || answerStructureType === "past_present_compare") {
    return "time";
  }

  if (/\bhow often|do you often|usually\b/.test(question) || answerStructureType === "frequency_situation") {
    return "frequency";
  }

  if (/^(do|did|have|are|is|was|were|can|would|will)\b/i.test(question)) {
    return "yes_no";
  }

  if (answerStructureType === "place_description") {
    return "description";
  }

  return "open";
}

function isCoreShortAnswer(input: PolishInput) {
  const answer = normalizeComparableAnswer(input.user_answer);
  const intent = getPolishIntent(input.question_text, input.answerStructureType);

  if (!answer || countComparableWords(answer) > 8) {
    return false;
  }

  if (intent === "age") {
    return /\b\d{1,2}\b|\byears?\s+old\b|\b(twenty|thirty|forty|fifty|sixty)\b/.test(answer);
  }

  if (intent === "place") {
    return /\b(i live|live in|from|hometown|city|town|village|here|there|now)\b/.test(answer) || countComparableWords(answer) <= 2;
  }

  if (intent === "time") {
    return /\b(ago|last|since|yesterday|today|year|month|week|day|before|past)\b/.test(answer);
  }

  if (intent === "frequency") {
    return /\b(always|usually|often|sometimes|rarely|never|every|once|twice|daily|weekly|monthly)\b/.test(answer);
  }

  if (intent === "yes_no") {
    return /^(yes|no|yeah|nope|not really|sometimes|usually|maybe|sure)\b/.test(answer);
  }

  return false;
}

function diagnosePolishInput(input: PolishInput): PolishInputDiagnosis {
  if (isMetaOrNoAnswerExpression(input.user_answer)) {
    return "meta_or_no_answer";
  }

  if (isLikelyLowConfidenceTranscript(input.user_answer)) {
    return "low_confidence_transcript";
  }

  if (hasFixableLanguageIssue(input.user_answer)) {
    return "fixable_language_issue";
  }

  if (isCoreShortAnswer(input) || countComparableWords(input.user_answer) < 8) {
    return "correct_but_short";
  }

  return "natural_complete";
}

function hasSubstantiveDifference(left: string, right: string) {
  return (
    normalizeFormattingComparableText(left) !==
    normalizeFormattingComparableText(right)
  );
}

function createSafePolishForFixableIssue(input: PolishInput) {
  let text = input.user_answer.trim();

  text = text
    .replace(/\bvery like\b/gi, "really like")
    .replace(/\blike wear\b/gi, "like wearing")
    .replace(/\bthey is\b/gi, "they are")
    .replace(/\bwe is\b/gi, "we are")
    .replace(/\byou is\b/gi, "you are")
    .replace(/\bi is\b/gi, "I am")
    .replace(/\bit make me\b/gi, "it makes me")
    .replace(/\bmake me relax\b/gi, "makes me relaxed")
    .replace(/\bfeel relax\b/gi, "feel relaxed")
    .replace(/\bmore better\b/gi, "better");

  if (!/[.!?]$/.test(text)) {
    text = `${text}.`;
  }

  return text;
}

function containsUnprovidedSpecificFact(outputText: string, userAnswer: string) {
  const normalizedOutput = normalizeComparableAnswer(outputText);
  const normalizedUserAnswer = normalizeComparableAnswer(userAnswer);
  const hasAgeFact = /\b(?:1[0-9]|[2-9][0-9])\s*(?:years?\s*old)?\b/.test(
    normalizedOutput,
  );
  const hasTimeFact =
    /\b(?:last|ago|since|when i was|years?|months?|weeks?|days?)\b/.test(
      normalizedOutput,
    );
  const hasPlatformFact = /\b(?:wechat|weibo|instagram|facebook|tiktok|twitter|x|snapchat|youtube)\b/.test(
    normalizedOutput,
  );

  return (
    (hasAgeFact || hasTimeFact || hasPlatformFact) &&
    !normalizedOutput
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .every((word) => normalizedUserAnswer.includes(word))
  );
}

function containsUnsafeShortAnswerExtension(
  extensionSentence: string,
  userAnswer: string,
) {
  const normalizedExtension = normalizeComparableAnswer(extensionSentence);
  const normalizedUserAnswer = normalizeComparableAnswer(userAnswer);

  if (!normalizedExtension) {
    return false;
  }

  const unsafePatterns = [
    /\b(?:jeans?|t\s*shirts?|shirts?|dress(?:es)?|suits?|hoodies?|skirts?|trousers?|sneakers?|shoes?)\b/,
    /\b(?:at home|at work|at school|when i(?:m| am)? not working|on weekends?|every day|usually|often|sometimes)\b/,
    /\b(?:stay in touch|friends?|family|work|working|study|school|university|travel|exercise|daily activities)\b/,
  ];

  return unsafePatterns.some((pattern) => {
    const match = normalizedExtension.match(pattern)?.[0];

    return Boolean(match && !normalizedUserAnswer.includes(match));
  });
}

function containsUnsafeExtension(extensionSentence: string, input: PolishInput) {
  const extension = normalizeComparableAnswer(extensionSentence);
  const answer = normalizeComparableAnswer(input.user_answer);
  const intent = getPolishIntent(input.question_text, input.answerStructureType);

  if (!extension) {
    return false;
  }

  if (containsUnsafeShortAnswerExtension(extensionSentence, input.user_answer)) {
    return true;
  }

  const sensitivePatterns = [
    /\b(?:for|since)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|many|several)\s+(?:years?|months?|weeks?|days?)\b/,
    /\b(?:used to|before|in the past|when i was|previously|moved|lived there|lived here)\b/,
    /\b(?:school|university|college|campus|class|teacher|student|major)\b/,
    /\b(?:work|working|job|company|office|colleague|career)\b/,
    /\b(?:wechat|weibo|instagram|facebook|tiktok|twitter|snapchat|youtube)\b/,
    /\b(?:because my|because i have|because i can|so i can|in order to)\b/,
    /\b(?:for example|once|i remember|experience|experienced)\b/,
    /\b(?:history|historical|culture|cultural|famous|tourist|ancient)\b/,
    /\b(?:family|parents|friends|background)\b/,
    /\b(?:ago|last year|yesterday|currently|at the moment|now|usually|often|every day)\b/,
  ];

  if (
    (intent === "age" || intent === "place" || intent === "time") &&
    sensitivePatterns.some((pattern) => {
      const match = extension.match(pattern)?.[0];
      return Boolean(match && !answer.includes(match));
    })
  ) {
    return true;
  }

  if (hasAiTimeStateConflict(extension, answer)) {
    return true;
  }

  if (containsDeniedSelfCorrectionFact(extension, input.user_answer)) {
    return true;
  }

  return false;
}

function hasUnsafePolishedFactChange(polishedAnswer: string, input: PolishInput) {
  const polished = normalizeComparableAnswer(polishedAnswer);
  const answer = normalizeComparableAnswer(input.user_answer);
  const intent = getPolishIntent(input.question_text, input.answerStructureType);

  if (!polished) {
    return true;
  }

  if (hasAiTimeStateConflict(polished, answer)) {
    return true;
  }

  if (
    intent === "age" &&
    /\b(?:1[0-9]|[2-9][0-9])\s*(?:years?\s*old)?\b/.test(polished) &&
    !/\b(?:1[0-9]|[2-9][0-9])\s*(?:years?\s*old)?\b/.test(answer)
  ) {
    return true;
  }

  if (containsDeniedSelfCorrectionFact(polished, input.user_answer)) {
    return true;
  }

  if (intent === "age" && /\b(?:born|birth|live|lived|from|city|hometown|school|university|college|work|job|experience|years? in|for \d+ years?|since)\b/.test(polished) && !/\b(?:born|birth|live|lived|from|city|hometown|school|university|college|work|job|experience|years? in|for \d+ years?|since)\b/.test(answer)) {
    return true;
  }

  if (intent === "place" && /\b(?:used to|before|in the past|history|culture|family|for \d+ years?|since)\b/.test(polished) && !/\b(?:used to|before|in the past|history|culture|family|for \d+ years?|since)\b/.test(answer)) {
    return true;
  }

  return false;
}

function hasTimeStateConflict(outputText: string, userAnswer: string) {
  const output = normalizeComparableAnswer(outputText);
  const answer = normalizeComparableAnswer(userAnswer);
  const userHasPresent = /\b(now|currently|at the moment)\b/.test(answer);
  const userHasPast = /\b(used to|before|in the past|ago|last year|yesterday)\b/.test(answer);
  const userHasDuration = /\b(since|for)\b/.test(answer);
  const outputHasPresent = /\b(now|currently|at the moment|usually|often|every day)\b/.test(output);
  const outputHasPast = /\b(used to|before|in the past|ago|last year|yesterday)\b/.test(output);
  const outputHasDuration = /\b(since|for)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|many|several)\s+(?:years?|months?|weeks?|days?)\b/.test(output);

  if (userHasPresent && outputHasPast && !userHasPast) {
    return true;
  }

  if (userHasPast && outputHasPresent && !userHasPresent) {
    return true;
  }

  if (outputHasDuration && !userHasDuration) {
    return true;
  }

  return false;
}

function containsDeniedSelfCorrectionFact(outputText: string, rawAnswer: string) {
  const correctionMatch = rawAnswer.match(
    /\b(.+?)\b(?:sorry|no|actually)\s*,?\s*(?:i mean|what i mean is|i meant)?\s+(.+)/i,
  );

  if (!correctionMatch) {
    return false;
  }

  const deniedWords = normalizeComparableAnswer(correctionMatch[1])
    .split(/\s+/)
    .filter((word) => word.length > 3 && !["live", "from", "mean"].includes(word));
  const output = normalizeComparableAnswer(outputText);

  return deniedWords.some((word) => output.includes(word));
}

function createSafeNoAnswerPolishResponse(input: PolishInput): ApiPolishResponse {
  return {
    originalSegments: [
      {
        text: input.user_answer,
        markType: "none",
        reason: "This does not answer the question yet.",
      },
    ],
    polishedAnswer: input.user_answer.trim(),
    extensionSentence: "",
    hasMeaningfulPolish: false,
    source: "llm",
    aiProvider: getAiProvider(),
    fallbackReason: null,
    llmLatencyMs: null,
  };
}

function getStartedActionFromQuestion(questionText: string) {
  const match = questionText.match(/\bwhen did you start\s+(.+?)\??$/i);
  const action = match?.[1]?.trim().replace(/[.!?]$/, "");

  return action && /\b[a-z][a-z\s]+/i.test(action) ? action : "";
}

function isTimeOnlyStartAnswer(input: PolishInput) {
  return (
    /\bwhen did you start\b/i.test(input.question_text) &&
    /\b(?:\w+\s+){0,3}ago\.?$/i.test(input.user_answer.trim()) &&
    !/\b(i|we|they|you)\b/i.test(input.user_answer)
  );
}

function isStartQuestionWithTimeInfo(input: PolishInput) {
  return (
    /\bwhen did you start\b/i.test(input.question_text) &&
    /\b(ago|last|since|year|month|week|day)\b/i.test(input.user_answer)
  );
}

function lowercaseInitial(text: string) {
  return text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;
}

function hasUnsafeAnswerFieldText(text: string) {
  const normalized = normalizeComparableAnswer(text);

  if (!normalized) {
    return false;
  }

  return (
    /[\u4e00-\u9fff]/.test(text) ||
    /\b(?:you haven't|you have not|haven't really answered|have not really answered|start with|try to|you should|please answer|repeat the question|record again|re-?record|answer the question|need to answer|does not answer|not answer the question)\b/i.test(
      text,
    ) ||
    /\b(?:this is not|this doesn't|this does not|the answer is|your answer|the transcript|no valid speech|low confidence|off topic)\b/i.test(
      text,
    ) ||
    /\b(?:give a direct answer|add one simple reason|add a simple detail|say it again)\b/i.test(
      text,
    ) ||
    /\b(?:answer directly|directly answer|add one short reason|add a short reason|add one short detail|add a short detail)\b/i.test(
      text,
    )
  );
}

function applyPolishFieldContract(
  result: ApiPolishResponse,
  input: PolishInput,
  diagnosis: ReturnType<typeof diagnoseAiPolishInput>,
) {
  result.originalSegments = result.originalSegments.map((segment) => {
    if (
      segment.markType === "red" &&
      !isHighConfidenceGrammarSegment(segment.text, input.user_answer)
    ) {
      return { ...segment, markType: "none", reason: "" };
    }

    return segment;
  });

  if (hasUnsafeAnswerFieldText(result.polishedAnswer)) {
    const safePolishedAnswer =
      diagnosis === "fixable_language_issue"
        ? createSafePolishForFixableIssue(input)
        : input.user_answer.trim();

    result.polishedAnswer = safePolishedAnswer;
    result.hasMeaningfulPolish =
      diagnosis === "fixable_language_issue" &&
      hasAiSubstantiveDifference(safePolishedAnswer, input.user_answer);
  }

  if (
    hasUnsafeAnswerFieldText(result.extensionSentence) ||
    hasAiUnsafeExtension(result.extensionSentence, input)
  ) {
    result.extensionSentence = "";
  }

  const extractedExpansion = extractExpansionOnlyPolish(
    result.polishedAnswer,
    input,
  );

  if (extractedExpansion) {
    result.polishedAnswer = input.user_answer.trim();
    result.hasMeaningfulPolish = false;
    result.originalSegments = result.originalSegments.map((segment) => ({
      ...segment,
      markType: "none",
      reason: "",
    }));

    if (!result.extensionSentence.trim()) {
      result.extensionSentence = extractedExpansion;
    }
  }

  if (!result.hasMeaningfulPolish) {
    result.polishedAnswer = input.user_answer.trim();
    result.originalSegments = result.originalSegments.map((segment) =>
      segment.markType === "orange"
        ? { ...segment, markType: "none", reason: "" }
        : segment,
    );
  }

  const hasMarkedPolish = result.originalSegments.some((segment) =>
    segment.markType === "red" || segment.markType === "orange",
  );

  if (hasMarkedPolish && !hasAiSubstantiveDifference(result.polishedAnswer, input.user_answer)) {
    const safePolishedAnswer = createSafePolishForFixableIssue(input);

    if (hasAiSubstantiveDifference(safePolishedAnswer, input.user_answer)) {
      result.polishedAnswer = safePolishedAnswer;
      result.hasMeaningfulPolish = true;
    } else {
      result.originalSegments = result.originalSegments.map((segment) => ({
        ...segment,
        markType: "none",
        reason: "",
      }));
      result.hasMeaningfulPolish = false;
    }
  }
}

function extractExpansionOnlyPolish(
  polishedAnswer: string,
  input: PolishInput,
) {
  const userAnswer = input.user_answer.trim();

  if (!polishedAnswer.trim() || hasFixableLanguageIssue(userAnswer)) {
    return "";
  }

  const expansionMatch = polishedAnswer.match(
    /^(.+?)\s+(because|and|so|for example)\s+(.+)$/i,
  );

  if (!expansionMatch) {
    return "";
  }

  const [, prefix, connector, tail] = expansionMatch;

  if (!isSameAnswerBodyForPolishDisplay(prefix, input)) {
    return "";
  }

  const extension = `${connector.toLowerCase()} ${tail.trim()}`.replace(
    /^[a-z]/,
    (char) => char.toUpperCase(),
  );

  return /[.!?]$/.test(extension) ? extension : `${extension}.`;
}

function isSameAnswerBodyForPolishDisplay(
  polishedPrefix: string,
  input: PolishInput,
) {
  const original = normalizeFormattingComparableText(input.user_answer);
  const prefix = normalizeFormattingComparableText(polishedPrefix);

  if (!original || !prefix) {
    return false;
  }

  if (original === prefix) {
    return true;
  }

  const question = normalizeComparableAnswer(input.question_text);
  const removableQuestionVerbs = question.includes("wearing")
    ? /\b(wearing|wear)\b/g
    : null;

  if (!removableQuestionVerbs) {
    return false;
  }

  const strippedOriginal = original.replace(removableQuestionVerbs, "").replace(/\s+/g, " ").trim();
  const strippedPrefix = prefix.replace(removableQuestionVerbs, "").replace(/\s+/g, " ").trim();

  return strippedOriginal === strippedPrefix;
}

function isHighConfidenceGrammarSegment(segmentText: string, userAnswer: string) {
  const segment = normalizeComparableAnswer(segmentText);
  const answer = normalizeComparableAnswer(userAnswer);

  if (!segment) {
    return false;
  }

  if (/\b(?:sorry|i mean|what i mean is|i meant|um|uh|er|ah|hmm)\b/.test(segment)) {
    return false;
  }

  if (
    /\b(?:they|we|you)\s+is\b/.test(segment) ||
    /\bi\s+is\b/.test(segment) ||
    /\bit\s+make\s+me\b/.test(segment) ||
    /\bmake\s+me\s+relax\b/.test(segment) ||
    /\bfeel\s+relax\b/.test(segment) ||
    /\blike\s+wear\b/.test(segment) ||
    /\bmore\s+better\b/.test(segment)
  ) {
    return true;
  }

  return (
    segment.split(/\s+/).length > 1 &&
    (/\b(?:they|we|you)\s+is\b/.test(answer) ||
      /\bi\s+is\b/.test(answer) ||
      /\bit\s+make\s+me\b/.test(answer) ||
      /\bmake\s+me\s+relax\b/.test(answer) ||
      /\bfeel\s+relax\b/.test(answer) ||
      /\blike\s+wear\b/.test(answer) ||
      /\bmore\s+better\b/.test(answer))
  );
}

export function finalizePolishResponse({
  input,
  response,
  source,
  fallbackReason,
  diagnosis = diagnoseAiPolishInput(input),
}: FinalizePolishInput): ApiPolishResponse {
  const result: ApiPolishResponse = {
    originalSegments: normalizePolishSegments(response.originalSegments, input),
    polishedAnswer: response.polishedAnswer.trim() || input.user_answer.trim(),
    extensionSentence: normalizeOptionalString(response.extensionSentence),
    hasMeaningfulPolish: Boolean(response.hasMeaningfulPolish),
    source,
    aiProvider: response.aiProvider ?? getAiProvider(),
    fallbackReason,
    llmLatencyMs: response.llmLatencyMs,
  };

  if (diagnosis === "low_confidence_transcript") {
    return {
      ...result,
      originalSegments: [
        {
          text: input.user_answer,
          markType: "none",
          reason: "The transcript is not reliable enough to polish safely.",
        },
      ],
      polishedAnswer: input.user_answer.trim(),
      extensionSentence: "",
      hasMeaningfulPolish: false,
    };
  }

  if (diagnosis === "meta_or_no_answer" || diagnosis === "off_topic") {
    return {
      ...createSafeNoAnswerPolishResponse(input),
      source,
      aiProvider: result.aiProvider,
      fallbackReason,
      llmLatencyMs: result.llmLatencyMs,
    };
  }

  if (isTimeOnlyStartAnswer(input)) {
    const startedAction = getStartedActionFromQuestion(input.question_text);

    if (startedAction) {
      const timePhrase = lowercaseInitial(input.user_answer.trim().replace(/[.!?]$/, ""));
      result.polishedAnswer = `I started ${startedAction} ${timePhrase}.`;
      result.hasMeaningfulPolish = true;
    }
  }

  if (isStartQuestionWithTimeInfo(input)) {
    result.extensionSentence = "";
  }

  const hasMeaningfulPolish = hasAiSubstantiveDifference(
    result.polishedAnswer,
    input.user_answer,
  );

  if (!hasMeaningfulPolish) {
    result.hasMeaningfulPolish = false;

    if (diagnosis === "fixable_language_issue") {
      result.polishedAnswer = createSafePolishForFixableIssue(input);
      result.hasMeaningfulPolish = hasAiSubstantiveDifference(
        result.polishedAnswer,
        input.user_answer,
      );
      result.originalSegments = [
        {
          text: input.user_answer,
          markType: isHighConfidenceGrammarSegment(
            input.user_answer,
            input.user_answer,
          )
            ? "red"
            : "orange",
          reason: isHighConfidenceGrammarSegment(
            input.user_answer,
            input.user_answer,
          )
            ? "Grammar issue."
            : "This can be made more natural.",
        },
      ];
    }

    if (diagnosis === "correct_but_short") {
      const safeShortCompletion = createMockPolishResult(input).polishedAnswer;

      if (safeShortCompletion.trim()) {
        result.polishedAnswer = safeShortCompletion.trim();
        result.hasMeaningfulPolish = hasAiSubstantiveDifference(
          result.polishedAnswer,
          input.user_answer,
        );
      }
    }
  } else if (diagnosis === "natural_complete") {
    result.polishedAnswer = input.user_answer.trim();
    result.hasMeaningfulPolish = false;
  }

  if (hasAiUnsafeExtension(result.extensionSentence, input)) {
    result.extensionSentence = "";
  }

  if (hasUnsafePolishedFactChange(result.polishedAnswer, input)) {
    const safePolishedAnswer =
      diagnosis === "fixable_language_issue"
        ? createSafePolishForFixableIssue(input)
        : input.user_answer.trim();

    result.polishedAnswer = safePolishedAnswer;
    result.hasMeaningfulPolish =
      diagnosis === "fixable_language_issue" &&
      hasAiSubstantiveDifference(safePolishedAnswer, input.user_answer);
  }

  if (
    isMetaOrNoAnswerExpression(input.user_answer) &&
    containsUnprovidedSpecificFact(
      `${result.polishedAnswer} ${result.extensionSentence}`,
      input.user_answer,
    )
  ) {
    return {
      ...createSafeNoAnswerPolishResponse(input),
      source,
      aiProvider: result.aiProvider,
      fallbackReason,
      llmLatencyMs: result.llmLatencyMs,
    };
  }

  applyPolishFieldContract(result, input, diagnosis);

  return result;
}

function normalizePolishSegments(
  segments: ApiPolishSegment[],
  input: PolishInput,
): ApiPolishSegment[] {
  if (!Array.isArray(segments) || segments.length === 0) {
    return [{ text: input.user_answer, markType: "none", reason: "" }];
  }

  const normalizedSegments = segments
    .filter((segment) => segment && segment.text.trim())
    .map((segment) => ({
      text: segment.text.trim(),
      markType: ["none", "red", "orange"].includes(segment.markType)
        ? segment.markType
        : "none",
      reason: segment.reason.trim(),
    }));

  return normalizedSegments.length > 0
    ? normalizedSegments
    : [{ text: input.user_answer, markType: "none", reason: "" }];
}

function diagnosePolishSchema(value: unknown): SchemaValidationIssue[] {
  const errors: SchemaValidationIssue[] = [];

  if (!isRecord(value)) {
    return [{ field: "$", reason: "type_invalid", detail: "expected object" }];
  }

  const originalSegments = value.originalSegments;

  if (!Array.isArray(originalSegments)) {
    errors.push({
      field: "originalSegments",
      reason: originalSegments === undefined ? "missing" : "type_invalid",
      detail: "expected non-empty array",
    });
  } else {
    if (originalSegments.length === 0) {
      errors.push({
        field: "originalSegments",
        reason: "array_length_invalid",
        detail: "expected at least 1 segment",
      });
    }

    originalSegments.forEach((segment, index) => {
      if (!isRecord(segment)) {
        errors.push({
          field: `originalSegments.${index}`,
          reason: "type_invalid",
          detail: "expected object",
        });
        return;
      }

      if (!isNonEmptyString(segment.text)) {
        errors.push({
          field: `originalSegments.${index}.text`,
          reason: segment.text === undefined ? "missing" : "type_invalid",
          detail: "expected non-empty string",
        });
      }

      if (!["none", "red", "orange"].includes(String(segment.markType))) {
        errors.push({
          field: `originalSegments.${index}.markType`,
          reason: segment.markType === undefined ? "missing" : "enum_invalid",
          detail: "expected one of none, red, orange",
        });
      }

      if (typeof segment.reason !== "string") {
        errors.push({
          field: `originalSegments.${index}.reason`,
          reason: segment.reason === undefined ? "missing" : "type_invalid",
          detail: "expected string",
        });
      }
    });
  }

  if (!isNonEmptyString(value.polishedAnswer)) {
    errors.push({
      field: "polishedAnswer",
      reason: value.polishedAnswer === undefined ? "missing" : "type_invalid",
      detail: "expected non-empty string",
    });
  }

  if (typeof value.extensionSentence !== "string") {
    errors.push({
      field: "extensionSentence",
      reason: value.extensionSentence === undefined ? "missing" : "type_invalid",
      detail: "expected string",
    });
  }

  if (typeof value.hasMeaningfulPolish !== "boolean") {
    errors.push({
      field: "hasMeaningfulPolish",
      reason: value.hasMeaningfulPolish === undefined ? "missing" : "type_invalid",
      detail: "expected boolean",
    });
  }

  return errors;
}

export async function generatePolishWithLlm(
  input: PolishInput,
): Promise<ApiPolishResponse> {
  const llmResult = await callLlmJson(POLISH_SYSTEM_PROMPT, {
    topicId: input.topic_id,
    questionId: input.question_id,
    questionIndex: input.question_index,
    questionText: input.question_text,
    userTranscript: input.cleaned_transcript ?? input.user_answer,
    answerStructureType: input.answerStructureType,
  });

  if (!llmResult.ok) {
    return createPolishFallbackResponse(input, llmResult.reason, llmResult.latencyMs);
  }

  const validated = validatePolishApiResponse(llmResult.data);

  if (!validated) {
    const repairAttempt = await attemptSchemaRepair(
      "A03",
      llmResult,
      validatePolishApiResponse,
      diagnosePolishSchema,
    );

    if (repairAttempt.data) {
      const processed = finalizePolishResponse({
        input,
        response: repairAttempt.data,
        source: "llm",
        fallbackReason: null,
      });

      return {
        ...processed,
        aiProvider: repairAttempt.provider,
        llmLatencyMs: repairAttempt.totalLatencyMs,
      };
    }

    return createPolishFallbackResponse(
      input,
      "schema_invalid",
      repairAttempt.totalLatencyMs,
    );
  }

  return {
    ...finalizePolishResponse({
      input,
      response: validated,
      source: "llm",
      fallbackReason: null,
    }),
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
  const rawResponse: ApiRetryFeedbackResponse = {
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

  return finalizeRetryFeedbackResponse(input, rawResponse, "mock_fallback", fallbackReason);
}

function finalizeRetryFeedbackResponse(
  input: RetryFeedbackInput,
  response: ApiRetryFeedbackResponse,
  source: ApiRetryFeedbackResponse["source"],
  fallbackReason: FallbackReason | null,
): ApiRetryFeedbackResponse {
  const judgement = createAiRetryJudgement(input);
  const mapped = mapAiRetryJudgementToFeedback(judgement);

  return {
    feedbackType: mapped.feedbackType,
    feedbackText: mapped.feedbackText || response.feedbackText,
    adoptedExpressions:
      mapped.feedbackType === "adopted_suggestion"
        ? response.adoptedExpressions
        : [],
    source,
    aiProvider: response.aiProvider ?? getAiProvider(),
    fallbackReason,
    llmLatencyMs: response.llmLatencyMs,
  };
}

function createA04Judgement(input: RetryFeedbackInput): A04Judgement {
  const first = input.first_cleaned_transcript ?? input.first_answer;
  const retry = input.retry_cleaned_transcript ?? input.retry_answer;
  const answeredCoreQuestion = isCoreAnswerForQuestion(
    input.question_text,
    input.answerStructureType,
    retry,
  );
  const repeatedOriginal = isComparableSame(first, retry);
  const adoptedSuggestion = getA04AdoptionState(input, retry);
  const introducedNewError = hasRetryGrammarIssue(retry) && !hasRetryGrammarIssue(first);
  const containsOffTopicPart =
    answeredCoreQuestion &&
    hasOffTopicTail(input.question_text, input.answerStructureType, retry);
  const firstAnsweredCore = isCoreAnswerForQuestion(
    input.question_text,
    input.answerStructureType,
    first,
  );

  return {
    answeredCoreQuestion,
    preservedOriginalMeaning: answeredCoreQuestion || !firstAnsweredCore,
    adoptedSuggestion,
    independentlyImproved:
      answeredCoreQuestion &&
      !repeatedOriginal &&
      adoptedSuggestion === "none" &&
      (countComparableWords(retry) > countComparableWords(first) ||
        sharedComparableWordCount(first, retry) >= 2),
    repeatedOriginal,
    introducedNewError,
    containsOffTopicPart,
    regressed: firstAnsweredCore && !answeredCoreQuestion,
    lowConfidenceTranscript: false,
  };
}

function mapA04JudgementToFeedback(judgement: A04Judgement): {
  feedbackType: ApiRetryFeedbackResponse["feedbackType"];
  feedbackText: string;
} {
  if (judgement.answeredCoreQuestion && judgement.containsOffTopicPart) {
    return {
      feedbackType: "needs_adjustment",
      feedbackText:
        "前半句已经回答了题目，后面的内容和问题关系不大，可以删掉或换成更相关的补充~",
    };
  }

  if (
    !judgement.answeredCoreQuestion ||
    judgement.repeatedOriginal ||
    judgement.regressed ||
    judgement.introducedNewError
  ) {
    return {
      feedbackType: "needs_adjustment",
      feedbackText: judgement.repeatedOriginal
        ? "这次和第一次回答基本一样，可以试着加入上次的一句润色或扩展内容~"
        : "这次还需要再调整一下，先直接回答题目，再补一个相关细节~",
    };
  }

  if (judgement.adoptedSuggestion !== "none") {
    return {
      feedbackType: "adopted_suggestion",
      feedbackText: "已经把建议用进回答了，很棒！",
    };
  }

  if (judgement.independentlyImproved) {
    return {
      feedbackType: "improved_expression",
      feedbackText: "这次回答更完整了，可以继续保持这个方向~",
    };
  }

  return {
    feedbackType: "improved_expression",
    feedbackText: "这次回答是有效的，可以再加入一个更具体的相关细节~",
  };
}

function isCoreAnswerForQuestion(
  questionText: string,
  answerStructureType: AnswerStructureType | undefined,
  answerText: string,
) {
  const answer = normalizeComparableAnswer(answerText);
  const intent = getPolishIntent(questionText, answerStructureType);

  if (!answer || isMetaOrNoAnswerExpression(answerText)) {
    return false;
  }

  if (intent === "age") {
    return /\b\d{1,2}\b|\byears?\s+old\b|\b(twenty|thirty|forty|fifty|sixty)\b/.test(answer);
  }

  if (intent === "place") {
    return /\b(i live|live in|from|hometown|city|town|village|here|there|now)\b/.test(answer) || countComparableWords(answer) <= 3;
  }

  if (intent === "time") {
    return /\b(ago|last|since|yesterday|today|year|month|week|day|started|before|past)\b/.test(answer);
  }

  if (intent === "frequency") {
    return /\b(always|usually|often|sometimes|rarely|never|every|once|twice|daily|weekly|monthly)\b/.test(answer);
  }

  if (intent === "yes_no") {
    return /^(yes|no|yeah|nope|not really|sometimes|usually|maybe|sure)\b/.test(answer);
  }

  return countComparableWords(answer) >= 3;
}

function hasOffTopicTail(
  questionText: string,
  answerStructureType: AnswerStructureType | undefined,
  retryAnswer: string,
) {
  const intent = getPolishIntent(questionText, answerStructureType);
  const answer = normalizeComparableAnswer(retryAnswer);

  if (intent === "age") {
    return /\b(live|lived|city|hometown|school|work|job|for \d+ years?|since)\b/.test(answer);
  }

  if (intent === "place") {
    return /\b(age|years old|work as|study major)\b/.test(answer);
  }

  return false;
}

function getA04AdoptionState(
  input: RetryFeedbackInput,
  retryAnswer: string,
): A04AdoptionState {
  const retry = normalizeComparableAnswer(retryAnswer);
  const polished = normalizeComparableAnswer(input.polished_answer);
  const extension = normalizeComparableAnswer(input.expansion_sentence ?? "");
  const suggestion = normalizeComparableAnswer(
    `${input.polished_answer} ${input.expansion_sentence ?? ""}`,
  );

  if (extension && extension.length >= 12 && retry.includes(extension)) {
    return "full";
  }

  if (polished && polished.length >= 12 && retry.includes(polished)) {
    return "full";
  }

  if (suggestion && sharedComparableWordCount(suggestion, retry) >= 4) {
    return "partial";
  }

  if (suggestion && sharedComparableWordCount(suggestion, retry) >= 3) {
    return "synonym";
  }

  return "none";
}

function isComparableSame(first: string, retry: string) {
  const normalizedFirst = normalizeComparableAnswer(first);
  const normalizedRetry = normalizeComparableAnswer(retry);

  return (
    Boolean(normalizedFirst && normalizedRetry) &&
    normalizedFirst === normalizedRetry
  );
}

function hasRetryGrammarIssue(answer: string) {
  return /\b(they|we|you)\s+is\b|\bi\s+is\b|\bit\s+make\s+me\b|\bfeel\s+relax\b/i.test(
    answer,
  );
}

function sharedComparableWordCount(left: string, right: string) {
  const stopWords = new Set([
    "i",
    "it",
    "is",
    "am",
    "are",
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "in",
    "of",
    "for",
    "with",
    "my",
    "me",
    "this",
    "that",
  ]);
  const leftWords = new Set(
    normalizeComparableAnswer(left)
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word)),
  );

  return normalizeComparableAnswer(right)
    .split(/\s+/)
    .filter((word) => leftWords.has(word) && !stopWords.has(word)).length;
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
    topicId: input.topic_id,
    questionId: input.question_id,
    questionIndex: input.question_index,
    questionText: input.question_text,
    firstTranscript: input.first_cleaned_transcript ?? input.first_answer,
    polishedAnswer: input.polished_answer,
    extensionSentence: input.expansion_sentence ?? "",
    retryTranscript: input.retry_cleaned_transcript ?? input.retry_answer,
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

  return finalizeRetryFeedbackResponse(
    input,
    {
      ...validated,
      aiProvider: llmResult.provider,
      llmLatencyMs: llmResult.latencyMs,
    },
    "llm",
    null,
  );
}

export function parsePolishRequestBody(body: unknown): PolishInput | null {
  if (!isRecord(body)) {
    return null;
  }

  const cleanedTranscript = normalizeOptionalString(
    body.cleanedTranscript ?? body.userTranscript,
  );
  const questionIndex =
    typeof body.questionIndex === "number"
      ? body.questionIndex
      : Number(body.questionIndex);

  if (
    !isNonEmptyString(body.topicId) ||
    !isNonEmptyString(body.questionId) ||
    !isNonEmptyString(body.questionText) ||
    !isNonEmptyString(cleanedTranscript) ||
    !isNonEmptyString(body.answerStructureType) ||
    !Number.isFinite(questionIndex)
  ) {
    return null;
  }

  return {
    topic_id: body.topicId,
    question_id: body.questionId,
    topic_title: "",
    question_text: body.questionText,
    answerStructureType: body.answerStructureType as AnswerStructureType,
    user_answer: cleanedTranscript,
    raw_transcript: normalizeOptionalString(body.rawTranscript),
    cleaned_transcript: cleanedTranscript,
    display_transcript: normalizeOptionalString(body.displayTranscript),
    question_index: questionIndex,
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

  const firstCleanedTranscript = normalizeOptionalString(
    body.firstCleanedTranscript ?? body.firstTranscript,
  );
  const retryCleanedTranscript = normalizeOptionalString(
    body.retryCleanedTranscript ?? body.retryTranscript,
  );
  const questionIndex =
    typeof body.questionIndex === "number"
      ? body.questionIndex
      : Number(body.questionIndex);

  if (
    !isNonEmptyString(body.topicId) ||
    !isNonEmptyString(body.questionId) ||
    !isNonEmptyString(body.questionText) ||
    !isNonEmptyString(firstCleanedTranscript) ||
    !isNonEmptyString(retryCleanedTranscript) ||
    !Number.isFinite(questionIndex)
  ) {
    return null;
  }

  return {
    topic_id: body.topicId,
    question_id: body.questionId,
    question_index: questionIndex,
    answerStructureType: isNonEmptyString(body.answerStructureType)
      ? (body.answerStructureType as AnswerStructureType)
      : undefined,
    question_text: body.questionText,
    first_answer: firstCleanedTranscript,
    first_cleaned_transcript: firstCleanedTranscript,
    polished_answer: normalizeOptionalString(body.polishedAnswer),
    expansion_sentence: normalizeOptionalString(body.extensionSentence),
    retry_answer: retryCleanedTranscript,
    retry_cleaned_transcript: retryCleanedTranscript,
    retry_raw_transcript: normalizeOptionalString(body.retryRawTranscript),
    retry_display_transcript: normalizeOptionalString(body.retryDisplayTranscript),
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
- Judge from the user's original answer first, not only from the question.
- Before writing feedback, classify the user answer into exactly one handling type:
  1. natural_complete: natural and complete.
  2. correct_but_short: grammatically correct but short.
  3. grammar_error: clear grammar error.
  4. chinglish: unnatural Chinese-influenced expression or collocation.
  5. relevant_incomplete: relevant but not a complete answer.
  6. off_topic_or_meta: off-topic, empty, or talking about answer strategy instead of answering.
- Use different handling:
  natural_complete: do not force a rewrite. Set hasMeaningfulPolish false, keep polishedAnswer close to the original, and usually leave extensionSentence empty.
  correct_but_short: keep the original sentence; add one light sentence related to both the question and the user's answer.
  For correct_but_short, extensionSentence must not add specific clothes, scenes, frequency, purpose, or experience that the user did not provide.
  grammar_error: fix only necessary errors and keep the user's exact facts and meaning.
  For grammar_error, if extensionSentence would require school, university, work, life stage, purpose, people, platform, or experience facts not provided by the user, leave extensionSentence empty.
  chinglish: replace only unnatural collocations while keeping facts, difficulty, and tone unchanged.
  relevant_incomplete: first make it one complete spoken sentence, then add one light extension if safe.
  For a time-phrase answer to "When did you start ...?", make the minimum complete polishedAnswer and leave extensionSentence empty if adding a sentence would require purpose, people, platform, age, or experience facts.
  off_topic_or_meta: do not do normal polish. Tell the user they have not really answered the question yet, and give a short concrete answer path.
- Do not change user facts. Never change preference, place, age, time, job, study status, clothes, frequency, or experience.
- Do not turn one meaning into another, for example do not change "casual" into "comfortable".
- Do not invent age changes, months, place experiences, work reasons, moving experiences, specific clothes, or other personal facts.
- ExtensionSentence must be one English sentence, related to the current question and the user's original answer, and match the question's expansion need.
- Before returning, self-check tense with time markers, subject-verb agreement, singular/plural references, obvious Chinglish, extension relevance, and whether any user fact was invented.
- Short core answers such as "I'm 23 years old.", "I live in Shanghai now.", "Yes, I do.", or "Not really." answer the core question but are still short. Do not say the structure is complete; provide one related extension sentence.

Marking rules:
- originalSegments must cover the user's transcript in order.
- markType "red" means grammar error only.
- markType "orange" means IELTS spoken naturalness optimization only.
- markType "none" means no color.
- originalSegments[].markType must be exactly one of "none", "red", or "orange". Do not output other English labels or Chinese labels.
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

Judge in this fixed order:
1. Does the retry answer respond to the current question?
2. Is it a complete and valid answer, not only a phrase or answer strategy?
3. Did it adopt the A03 polished answer or extension?
4. Is the language correct and natural?
5. Is it actually improved compared with the first answer?
6. Then choose feedback wording.

Allowed feedbackType values:
- adopted_suggestion: the retry clearly adopts concrete wording from the polished answer or extension sentence.
- improved_expression: the retry does not clearly adopt the suggestion, but it is more complete or more relevant than the first answer.
- needs_adjustment: the retry is still too short, unrelated, not improved, or uses strategy/meta wording instead of answering.

Adoption states to distinguish internally:
- full adoption.
- partial adoption.
- synonym adoption: the same idea or structure in the user's own words.
- valid answer without adoption.
- unchanged from first answer.
- off-topic or meta expression.

Rules:
- If retry is exactly or basically the same as first_answer, it is unchanged, not adopted, and not clearly improved. Do not say it is clearer or more complete.
- If retry uses only part of the suggestion, mark partial adoption. If it also creates a new grammar error, mention the key error and do not call it fully improved.
- If retry uses the same idea or structure in the user's own words, treat it as synonym adoption.
- If retry is off-topic, meta, or not a real answer, stop before adoption judgment and give a problem + concrete answer path.
- If retry is related but still only a phrase or incomplete sentence, do not call it complete improvement; tell the user what to add.

Important bad case:
If the retry says something like "I can also give a simple reason to make it clearer", "I can give a reason", "I will explain more", "For this question", or "My answer is", it is describing a strategy rather than answering the IELTS question. It must be needs_adjustment.
For this bad case, use a gentle Chinese feedbackText like: "这句更像是在说答题方法，还没有真正回答题目。下一次可以直接说你的答案，再补一句具体原因。"

User-facing rules:
- feedbackText must be short, low-pressure, and in Chinese.
- For full or partial adoption, use this core sentence: "已经把建议用进回答了，很棒！"
- For synonym adoption, use: "能用自己的话表达出来，进步很明显！"
- For valid answers without adoption, first affirm, then give one concrete next direction ending with "~".
- For off-topic or meta answers, use "point out the problem + concrete answer path"; do not only say "answer again".
- Encouraging feedback must end with "！". Suggestion feedback must end with "~".
- Do not show internal field names, type labels, Band scores, scoring language, or pronunciation feedback.
- Avoid harsh wording. Keep it brief, encouraging, and practical.
- adoptedExpressions should list concrete adopted phrases only. If none, use [].

Output shape:
{
  "feedbackType": "adopted_suggestion | improved_expression | needs_adjustment",
  "feedbackText": "short Chinese feedback",
  "adoptedExpressions": ["string"]
}`;

const SCHEMA_REPAIR_SYSTEM_PROMPT = `You repair JSON schema only.
Return strict JSON only. No Markdown, no explanations.

Rules:
- Use the provided parsedJson as the source of truth.
- Fix only fields listed in errors or required by schema.
- Do not change the user's meaning, answer content, feedback intent, or business judgment.
- Preserve valid fields as close as possible.
- Do not add new user facts, examples, preferences, places, ages, jobs, studies, or experiences.
- Do not rewrite content for style unless the field is invalid and must be normalized to satisfy schema.
- Output only the corrected JSON object for the same node.`;

const PRE_ANSWER_SYSTEM_PROMPT = `You are SpeakFix IELTS A02, a low-pressure pre-answer idea coach for IELTS Speaking Part 1.
Return strict JSON only. No Markdown, no explanations outside JSON.

Goal:
Help an IELTS 6.0-6.5 user know how to start speaking before answering.

Rules:
- Do not generate a full answer.
- Do not answer for the user.
- Do not write a model answer or long paragraph.
- Do not mention Band scores or scoring.
- Do not invent or imply unknown personal facts, such as a concrete age, city, job, school, name, identity, experience, or preference.
- Keep the tone light, practical, and encouraging.
- directionZh must be Chinese, at most 30 Chinese characters.
- directionZh must give a concrete speaking path in the form "first say X, then add Y". It must match sentenceStarters.
- First identify the question type, then generate the scaffold. Cover at least:
  factual: direct answer + one simple extra detail.
  place: place + feature or feeling.
  preference/comparison: clear choice + reason + optional situation.
  opinion: clear attitude + reason + practical effect or example.
- Use these common paths:
  age: first say age, then add one feeling.
  living place: first say city/place, then add one reason or feeling.
  preference: first say like/dislike, then add one reason.
  frequency: first say frequency, then add one situation.
  experience: first say yes/no experience, then add one example.
  opinion: first say opinion, then add one reason.
- keywords must contain exactly 3 replaceable content words or short phrases the user can directly use in an answer.
- keywords must not be category labels or answer dimensions. Do not output labels such as "age", "feel", "life", "reason", "example", "frequency", "place", "preference", "opinion", or "experience".
- Keywords should be replaceable content directions when the user's real information is unknown.
- For "How old are you?", good keywords are like "exact age", "early twenties", "feel mature", "still young"; bad keywords are "twenty-three", "age", "feel", "life".
- For "Where do you live?", good keywords are like "city name", "hometown", "quiet area"; bad keywords are "Shanghai", "Beijing", or any specific city, school, work, or life fact the user did not provide.
- Keywords should cover speakable content and should not completely repeat sentenceStarters.
- sentenceStarters must contain 2-3 short English sentence starters with different functions, such as direct answer, reason, example, feeling, frequency, or contrast.
- sentenceStarters must use blanks or replaceable parts. They should be half-open templates, not complete answers.
- For age questions, do not use age-range placeholders such as "I'm in my __s" or "I'm in my ___s". Use a direct numeric blank, for example "I'm ___ years old.".
- Do not output question-mark placeholders, mojibake, empty fields, repeated starter meanings, or internal abstract labels.
- Do not assume the user studies, works, lives near school, lives near work, or has a specific experience.
- Avoid expressions that are not intuitive for beginners, such as "I'm in my __s".
- For age questions, use simple templates like "I’m ___ years old." and "I’m ___ years old, and I feel ___."
- optionalReminder must be a short Chinese reminder.
- Stay close to the question and answerStructureType.

Output shape:
{
  "directionZh": "中文方向，不超过30字",
  "keywords": ["simple", "English", "phrases"],
  "sentenceStarters": ["I would say ..., because ..."],
  "optionalReminder": "中文轻提醒"
}`;
