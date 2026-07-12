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

function createSafeNoAnswerPolishResponse(input: PolishInput): ApiPolishResponse {
  return {
    originalSegments: [
      {
        text: input.user_answer,
        markType: "orange",
        reason: "This does not answer the question yet.",
      },
    ],
    polishedAnswer:
      "You haven't really answered the question yet. Start with a direct answer, then add one simple reason or detail.",
    extensionSentence: "Answer directly first, then add one short reason or detail.",
    hasMeaningfulPolish: true,
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

function postprocessPolishResponse(
  input: PolishInput,
  result: ApiPolishResponse,
): ApiPolishResponse {
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

  if (
    normalizeComparableAnswer(result.polishedAnswer) ===
      normalizeComparableAnswer(input.user_answer) &&
    result.originalSegments.every((segment) => segment.markType === "none")
  ) {
    result.hasMeaningfulPolish = false;

    if (
      containsUnsafeShortAnswerExtension(
        result.extensionSentence,
        input.user_answer,
      )
    ) {
      result.extensionSentence = "";
    }
  }

  if (
    isMetaOrNoAnswerExpression(input.user_answer) &&
    containsUnprovidedSpecificFact(
      `${result.polishedAnswer} ${result.extensionSentence}`,
      input.user_answer,
    )
  ) {
    return createSafeNoAnswerPolishResponse(input);
  }

  return result;
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
    questionText: input.question_text,
    userTranscript: input.user_answer,
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
      const processed = postprocessPolishResponse(input, repairAttempt.data);

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
    ...postprocessPolishResponse(input, validated),
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
