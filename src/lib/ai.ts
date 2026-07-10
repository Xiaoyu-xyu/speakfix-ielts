import {
  POLISH_PROMPT,
  PRE_HELP_PROMPT,
  RETRY_FEEDBACK_PROMPT,
} from "@/lib/prompts";
import type {
  AnswerStructureType,
  PracticeQuestion,
  Topic,
} from "@/types/practice";

export type PreHelpInput = {
  topic_title: string;
  question_id: string;
  question_text_en: string;
  question_translation_zh: string;
  question_index: number;
  answerStructureType: AnswerStructureType;
};

export type PreHelpOutput = {
  answer_structure_type: AnswerStructureType;
  answer_direction_zh: string;
  useful_keywords_en: string[];
  sentence_starter_en: string;
  caution_zh: string;
};

export type PolishInput = {
  topic_id: string;
  topic_title: string;
  question_text: string;
  answerStructureType: AnswerStructureType;
  user_answer: string;
  question_index: number;
  target_level: "IELTS 6.0-6.5";
};

export type MarkedTranscriptSegment = {
  text: string;
  type: "normal" | "error" | "improve";
};

export type ExpansionType =
  | "补充原因"
  | "补充例子"
  | "补充感受"
  | "补充频率"
  | "补充对比"
  | "无需扩展";

export type PolishResult = {
  markedTranscript: MarkedTranscriptSegment[];
  polishedAnswer: string;
  noPolishNeeded?: boolean;
  shouldExpand: boolean;
  expansionType: ExpansionType;
  expansionSentence: string;
  reason: string;
};

export type ApiPolishSegment = {
  text: string;
  markType: "none" | "red" | "orange";
  reason: string;
};

export type ApiPolishResponse = {
  originalSegments: ApiPolishSegment[];
  polishedAnswer: string;
  extensionSentence: string;
  hasMeaningfulPolish: boolean;
  source: "llm" | "mock_fallback";
  fallbackReason: string | null;
  llmLatencyMs: number | null;
};

export type RetryFeedbackInput = {
  topic_id?: string;
  question_id?: string;
  question_text: string;
  first_answer: string;
  polished_answer: string;
  expansion_sentence?: string;
  retry_answer: string;
};

export type RetryFeedbackType = "采纳建议" | "表达改善" | "仍需调整";

export type RetryFeedbackResult = {
  feedback_type: RetryFeedbackType;
  feedback_text: string;
};

export type ApiRetryFeedbackResponse = {
  feedbackType:
    | "adopted_suggestion"
    | "improved_expression"
    | "needs_adjustment";
  feedbackText: string;
  adoptedExpressions: string[];
  source: "llm" | "mock_fallback";
  fallbackReason: string | null;
  llmLatencyMs: number | null;
};

export type AiServiceResult<T> = {
  data: T;
  generation_mode: "mock" | "ai";
  ai_success: boolean;
  fallback_used: boolean;
  failure_reason?: string;
  ai_source: "llm" | "mock_fallback";
  fallback_reason?: string;
  llm_latency_ms?: number | null;
};

const preHelpByStructure: Record<
  AnswerStructureType,
  Omit<PreHelpOutput, "answer_structure_type">
> = {
  basic_fact: {
    answer_direction_zh: "先直接回答事实，再补一句简单说明。",
    useful_keywords_en: ["currently", "mainly", "for a while"],
    sentence_starter_en: "I would say ..., and at the moment ...",
    caution_zh: "按自己的真实情况说，不需要背答案。",
  },
  preference_reason: {
    answer_direction_zh: "先说偏好对象，再补一个原因。",
    useful_keywords_en: ["prefer", "because", "comfortable", "useful"],
    sentence_starter_en: "I personally prefer ..., mainly because ...",
    caution_zh: "不要展开成完整故事，补一个原因就够。",
  },
  yes_no_reason: {
    answer_direction_zh: "先直接表态，再补一个原因。",
    useful_keywords_en: ["yes, definitely", "not really", "because", "usually"],
    sentence_starter_en: "Yes, I do / No, not really, because ...",
    caution_zh: "先回答 yes/no，再解释，别绕太久。",
  },
  frequency_situation: {
    answer_direction_zh: "先说频率，再补发生场景。",
    useful_keywords_en: ["usually", "quite often", "once in a while", "when"],
    sentence_starter_en: "I usually ..., especially when ...",
    caution_zh: "频率不用精确，接近真实情况即可。",
  },
  type_reason: {
    answer_direction_zh: "先说类型或类别，再补原因或例子。",
    useful_keywords_en: ["kind of", "for example", "because", "daily"],
    sentence_starter_en: "I usually like ..., for example ..., because ...",
    caution_zh: "给一类或一个例子，不要列太多。",
  },
  past_present_compare: {
    answer_direction_zh: "先说过去情况，再说现在变化。",
    useful_keywords_en: ["when I was younger", "nowadays", "still", "changed"],
    sentence_starter_en: "When I was younger, I ..., but now ...",
    caution_zh: "对比保持简单，不需要讲完整经历。",
  },
  place_description: {
    answer_direction_zh: "先说明地点或部分，再描述特点。",
    useful_keywords_en: ["located", "quiet", "convenient", "comfortable"],
    sentence_starter_en: "It is ..., and the thing I like about it is ...",
    caution_zh: "描述真实感受，不要编造复杂细节。",
  },
  experience_example: {
    answer_direction_zh: "先说有没有经历，再给简短例子。",
    useful_keywords_en: ["once", "I remember", "for example", "a few times"],
    sentence_starter_en: "Yes, I have. For example, I once ...",
    caution_zh: "例子一句话即可，不要变成 Part 2。",
  },
  opinion_reason: {
    answer_direction_zh: "先表达观点，再给一个原因。",
    useful_keywords_en: ["I think", "useful", "important", "because"],
    sentence_starter_en: "I think ..., because ...",
    caution_zh: "观点可以简单，但要补一个原因。",
  },
  choice_compare: {
    answer_direction_zh: "先选 A 或 B，再简单对比原因。",
    useful_keywords_en: ["prefer", "rather than", "more convenient", "easier"],
    sentence_starter_en: "I prefer ... rather than ..., because ...",
    caution_zh: "只选一个更自然，不需要两边都详细说。",
  },
};

export function createPreHelpInput(
  topic: Topic,
  question: PracticeQuestion,
  questionIndex: number,
): PreHelpInput {
  return {
    topic_title: topic.title,
    question_id: question.id,
    question_text_en: question.text,
    question_translation_zh: question.translation,
    question_index: questionIndex + 1,
    answerStructureType: question.answerStructureType,
  };
}

export function generatePreHelp(input: PreHelpInput): AiServiceResult<PreHelpOutput> {
  void PRE_HELP_PROMPT;

  const template = preHelpByStructure[input.answerStructureType] ?? {
    answer_direction_zh: "先直接回答，再补一句原因或场景。",
    useful_keywords_en: ["usually", "because", "for example"],
    sentence_starter_en: "I would say ..., because ...",
    caution_zh: "按自己的真实情况说，不需要背答案。",
  };

  return {
    data: {
      answer_structure_type: input.answerStructureType,
      ...template,
    },
    generation_mode: "mock",
    ai_success: false,
    fallback_used: false,
    ai_source: "mock_fallback",
    fallback_reason: "mock_rule",
    llm_latency_ms: null,
  };
}

function countEnglishWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function createMarkedTranscript(userAnswer: string): MarkedTranscriptSegment[] {
  const lowerAnswer = userAnswer.toLowerCase();

  if (lowerAnswer.includes("they is")) {
    const [before, after = ""] = userAnswer.split(/they is/i);
    return [
      ...(before ? [{ text: before, type: "normal" as const }] : []),
      { text: "they is", type: "error" },
      ...(after ? [{ text: after, type: "normal" as const }] : []),
    ];
  }

  if (lowerAnswer.includes("very like")) {
    const [before, after = ""] = userAnswer.split(/very like/i);
    return [
      ...(before ? [{ text: before, type: "normal" as const }] : []),
      { text: "very like", type: "error" },
      ...(after ? [{ text: after, type: "normal" as const }] : []),
    ];
  }

  if (/\blike wear\b/i.test(userAnswer)) {
    const [before, after = ""] = userAnswer.split(/like wear/i);
    return [
      ...(before ? [{ text: before, type: "normal" as const }] : []),
      { text: "like wear", type: "improve" },
      ...(after ? [{ text: after, type: "normal" as const }] : []),
    ];
  }

  if (/\bvery comfortable\b/i.test(userAnswer)) {
    const [before, after = ""] = userAnswer.split(/very comfortable/i);
    return [
      ...(before ? [{ text: before, type: "normal" as const }] : []),
      { text: "very comfortable", type: "improve" },
      ...(after ? [{ text: after, type: "normal" as const }] : []),
    ];
  }

  if (/\bgood\b/i.test(userAnswer)) {
    const [before, after = ""] = userAnswer.split(/good/i);
    return [
      ...(before ? [{ text: before, type: "normal" as const }] : []),
      { text: "good", type: "improve" },
      ...(after ? [{ text: after, type: "normal" as const }] : []),
    ];
  }

  return [{ text: userAnswer, type: "normal" }];
}

function getExpansionType(answerStructureType: AnswerStructureType): ExpansionType {
  if (
    answerStructureType === "frequency_situation" ||
    answerStructureType === "basic_fact"
  ) {
    return "补充频率";
  }

  if (
    answerStructureType === "experience_example" ||
    answerStructureType === "type_reason"
  ) {
    return "补充例子";
  }

  if (
    answerStructureType === "choice_compare" ||
    answerStructureType === "past_present_compare"
  ) {
    return "补充对比";
  }

  if (
    answerStructureType === "preference_reason" ||
    answerStructureType === "yes_no_reason" ||
    answerStructureType === "opinion_reason"
  ) {
    return "补充原因";
  }

  return "补充感受";
}

function createExpansionSentence(expansionType: ExpansionType) {
  if (expansionType === "补充频率") {
    return "I usually talk about this in everyday situations.";
  }

  if (expansionType === "补充例子") {
    return "For example, it is something I often notice in my daily life.";
  }

  if (expansionType === "补充对比") {
    return "Compared with the other option, it feels easier and more natural for me.";
  }

  if (expansionType === "补充原因") {
    return "The main reason is that it feels practical and easy for me.";
  }

  if (expansionType === "补充感受") {
    return "It also makes me feel more relaxed and comfortable.";
  }

  return "";
}

function getSafeExpansionType(input: PolishInput): ExpansionType {
  const questionText = input.question_text.toLowerCase();

  if (
    /\b(how often|often|usually|every day)\b/.test(questionText) ||
    /\bdo you often\b/.test(questionText)
  ) {
    return getExpansionType("frequency_situation");
  }

  if (
    /\b(how old|where do you live|what do you do|working or studying)\b/.test(
      questionText,
    )
  ) {
    return "\u8865\u5145\u5f53\u524d\u72b6\u6001" as ExpansionType;
  }

  if (/\b(do you like|what kind of|why)\b/.test(questionText)) {
    return getExpansionType("preference_reason");
  }

  if (/\b(have you ever|when did you last)\b/.test(questionText)) {
    return getExpansionType("experience_example");
  }

  if (/\b(prefer|difference between)\b/.test(questionText)) {
    return getExpansionType("choice_compare");
  }

  return getExpansionType(input.answerStructureType);
}

function createSafePolish(input: PolishInput): PolishResult {
  const polishedAnswer = createSafePolishedAnswer(input);
  const answerWordCount = countEnglishWords(polishedAnswer);
  const noPolishNeeded = isClearNaturalAnswer(input.user_answer, polishedAnswer);
  const shouldExpand =
    noPolishNeeded || input.answerStructureType === "basic_fact"
      ? answerWordCount < 20
      : answerWordCount < 12;
  const expansionType = shouldExpand
    ? getSafeExpansionType(input)
    : "无需扩展";

  return {
    markedTranscript: createMarkedTranscript(input.user_answer),
    polishedAnswer: noPolishNeeded ? "" : polishedAnswer,
    noPolishNeeded,
    shouldExpand,
    expansionType,
    expansionSentence: shouldExpand
      ? noPolishNeeded
        ? createNoPolishExpansionSentence(input)
        : createSafeExpansionSentence(input, expansionType)
      : "",
    reason: shouldExpand
      ? "The answer is short, so one light extension can make it easier to speak."
      : "The answer already has enough basic information for a short Part 1 response.",
  };
}

export function createMockPolishResult(input: PolishInput): PolishResult {
  return createSafePolish(input);
}

function createSafePolishedAnswer(input: PolishInput) {
  const trimmedAnswer = input.user_answer.trim();
  const lowerAnswer = trimmedAnswer.toLowerCase();

  if (/^t-?shirts\.?$/i.test(trimmedAnswer)) {
    return "I usually wear T-shirts because they are comfortable and easy to match.";
  }

  if (/^\d{1,2}$/.test(trimmedAnswer) && /how old/i.test(input.question_text)) {
    return `I'm ${trimmedAnswer} years old.`;
  }

  if (lowerAnswer.includes("they is")) {
    return trimmedAnswer.replace(/\bthey is\b/gi, "they are");
  }

  if (/\blike wear\b/i.test(trimmedAnswer)) {
    return "I like wearing comfortable clothes, such as T-shirts and jeans.";
  }

  if (/\bthey are good\b/i.test(trimmedAnswer)) {
    return trimmedAnswer.replace(
      /\bThey are good\b/i,
      "They are comfortable and easy to wear",
    );
  }

  const naturalAnswer = trimmedAnswer.replace(/\bvery like\b/gi, "really like");

  if (/[.!?]$/.test(naturalAnswer)) {
    return naturalAnswer;
  }

  return `${naturalAnswer}.`;
}

function isClearNaturalAnswer(userAnswer: string, polishedAnswer: string) {
  const normalizedUserAnswer = normalizeComparableText(userAnswer);
  const normalizedPolishedAnswer = normalizeComparableText(polishedAnswer);

  if (!normalizedUserAnswer || normalizedUserAnswer !== normalizedPolishedAnswer) {
    return false;
  }

  if (
    /\b(very like|they is|like wear|very comfortable|good)\b/i.test(userAnswer)
  ) {
    return false;
  }

  return countEnglishWords(userAnswer) >= 8;
}

function normalizeComparableText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function createSafeExpansionSentence(
  input: PolishInput,
  expansionType: ExpansionType,
) {
  if (input.answerStructureType === "basic_fact") {
    if (/how old/i.test(input.question_text)) {
      return "I'm at an age where I'm still learning and trying new things.";
    }

    if (/\b(where do you live|house or an apartment|hometown)\b/i.test(input.question_text)) {
      return "It's a busy city, but it is quite convenient for daily life.";
    }

    return "It's part of my current situation, and it affects my daily routine.";
  }

  return createExpansionSentence(expansionType);
}

function createNoPolishExpansionSentence(input: PolishInput) {
  const questionText = input.question_text.toLowerCase();

  if (/\b(study|library|school)\b/.test(questionText)) {
    return "It helps me focus better and avoid distractions.";
  }

  if (/\b(clothes|wear)\b/.test(questionText)) {
    return "They are easy to wear and make me feel relaxed.";
  }

  return createSafeExpansionSentence(input, getSafeExpansionType(input));
}

function createLegacySafePolish(input: PolishInput) {
  return {
    polished_answer: `${input.user_answer} It is a simple and natural answer for this topic.`,
    suggestion_cn:
      "保留你的原意，把回答稍微补完整：先直接回答，再加一个简单原因。",
    extensions: [
      {
        type_cn: "补充原因",
        sentence_en: "because it makes me feel more comfortable.",
      },
      {
        type_cn: "补充频率",
        sentence_en: "I usually mention this in daily conversations.",
      },
    ],
    quality_flags: {
      kept_original_meaning: true,
      too_difficult: false,
      invented_experience: false,
    },
  };
}

function normalizeFeedbackType(value: unknown): RetryFeedbackType {
  const normalizedFeedbackTypeMap: Record<string, RetryFeedbackType> = {
    "\u91c7\u7eb3\u5efa\u8bae": "\u91c7\u7eb3\u5efa\u8bae" as RetryFeedbackType,
    "\u8868\u8fbe\u6539\u5584": "\u8868\u8fbe\u6539\u5584" as RetryFeedbackType,
    "\u4ecd\u9700\u8c03\u6574": "\u4ecd\u9700\u8c03\u6574" as RetryFeedbackType,
  };

  if (typeof value === "string" && normalizedFeedbackTypeMap[value]) {
    return normalizedFeedbackTypeMap[value];
  }

  if (
    value === "采纳建议" ||
    value === "表达改善" ||
    value === "仍需调整"
  ) {
    return value;
  }

  return "表达改善";
}

function createSafeRetryFeedback(): RetryFeedbackResult {
  return {
    feedback_type: "表达改善",
    feedback_text: "这次表达更清楚了，回答比上一轮更完整。",
  };
}

export function createMockRetryFeedbackResult(
  input: RetryFeedbackInput,
): RetryFeedbackResult {
  if (hasAdoptedExpansionSentence(input)) {
    return createAdoptedRetryFeedback();
  }

  if (hasMetaAnswerExpression(input.retry_answer)) {
    return createMetaExpressionRetryFeedback(input);
  }

  return createSafeRetryFeedback();
}

function validatePolishResult(result: PolishResult) {
  return (
    Array.isArray(result.markedTranscript) &&
    result.markedTranscript.length > 0 &&
    result.markedTranscript.every(
      (segment) =>
        Boolean(segment.text) &&
        ["normal", "error", "improve"].includes(segment.type),
    ) &&
    (Boolean(result.polishedAnswer) || result.noPolishNeeded === true) &&
    result.polishedAnswer.length < 520 &&
    typeof result.shouldExpand === "boolean" &&
    Boolean(result.expansionType) &&
    typeof result.expansionSentence === "string" &&
    typeof result.reason === "string"
  );
}

function validateLegacyPolishResult(result: any) {
  return (
    Boolean(result.polished_answer) &&
    Boolean(result.suggestion_cn) &&
    Array.isArray(result.extensions) &&
    result.extensions.length > 0 &&
    result.polished_answer.length < 420 &&
    result.quality_flags?.kept_original_meaning === true &&
    result.quality_flags?.invented_experience !== true &&
    result.quality_flags?.too_difficult !== true
  );
}

function createAdoptedRetryFeedback(): RetryFeedbackResult {
  return {
    feedback_type: "\u91c7\u7eb3\u5efa\u8bae" as RetryFeedbackType,
    feedback_text:
      "\u8fd9\u6b21\u91cd\u8bf4\u91c7\u7eb3\u4e86\u4e0a\u4e00\u8f6e\u7684\u6269\u5c55\u8868\u8fbe\uff0c\u56de\u7b54\u66f4\u5177\u4f53\u4e86\u3002",
  };
}

function createMetaExpressionRetryFeedback(
  input: RetryFeedbackInput,
): RetryFeedbackResult {
  const exampleSentence = input.expansion_sentence?.trim();
  const feedbackText = exampleSentence
    ? `\u8fd9\u6b21\u6709\u8865\u5145\u610f\u8bc6\uff0c\u4f46\u7b2c\u4e8c\u53e5\u8fd8\u6ca1\u6709\u771f\u6b63\u8bf4\u660e\u539f\u56e0\u3002\u53ef\u4ee5\u76f4\u63a5\u8bf4\uff1a${exampleSentence}`
    : "\u8fd9\u6b21\u6709\u8865\u5145\u610f\u8bc6\uff0c\u4f46\u7b2c\u4e8c\u53e5\u8fd8\u6ca1\u6709\u771f\u6b63\u8bf4\u660e\u539f\u56e0\u3002\u53ef\u4ee5\u76f4\u63a5\u8bf4\u51fa\u4e00\u4e2a\u771f\u5b9e\u539f\u56e0\u6216\u72b6\u6001\u3002";

  return {
    feedback_type: "\u4ecd\u9700\u8c03\u6574" as RetryFeedbackType,
    feedback_text: feedbackText,
  };
}

function hasMetaAnswerExpression(answer: string) {
  return [
    /\bi can (also )?give (a )?(simple )?reason\b/i,
    /\bthis answer is clearer\b/i,
    /\bi will explain more\b/i,
    /\bi can make it clearer\b/i,
    /\bfor this question\b/i,
    /\bmy answer is\b/i,
  ].some((pattern) => pattern.test(answer));
}

function hasAdoptedExpansionSentence(input: RetryFeedbackInput) {
  const expansionSentence = input.expansion_sentence?.trim().toLowerCase();

  return Boolean(
    expansionSentence &&
      expansionSentence.length >= 18 &&
      input.retry_answer.toLowerCase().includes(expansionSentence),
  );
}

async function callAiRoute<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error("ai_request_failed");
  }

  return (await response.json()) as T;
}

function mapApiPolishToPolishResult(
  result: ApiPolishResponse,
  fallback: PolishResult,
): PolishResult {
  return {
    markedTranscript: result.originalSegments.map((segment) => ({
      text: segment.text,
      type:
        segment.markType === "red"
          ? "error"
          : segment.markType === "orange"
            ? "improve"
            : "normal",
    })),
    polishedAnswer: result.polishedAnswer,
    noPolishNeeded: !result.hasMeaningfulPolish,
    shouldExpand: Boolean(result.extensionSentence.trim()),
    expansionType: result.extensionSentence.trim()
      ? fallback.expansionType
      : ("鏃犻渶鎵╁睍" as ExpansionType),
    expansionSentence: result.extensionSentence,
    reason: result.extensionSentence.trim()
      ? "The answer is short, so one light extension can make it easier to speak."
      : "The answer already has enough basic information for a short Part 1 response.",
  };
}

function mapFeedbackTypeToLegacy(
  feedbackType: ApiRetryFeedbackResponse["feedbackType"],
): RetryFeedbackType {
  if (feedbackType === "adopted_suggestion") {
    return "\u91c7\u7eb3\u5efa\u8bae" as RetryFeedbackType;
  }

  if (feedbackType === "needs_adjustment") {
    return "\u4ecd\u9700\u8c03\u6574" as RetryFeedbackType;
  }

  return "\u8868\u8fbe\u6539\u5584" as RetryFeedbackType;
}

function mapApiRetryFeedbackToRetryFeedbackResult(
  result: ApiRetryFeedbackResponse,
): RetryFeedbackResult {
  return {
    feedback_type: mapFeedbackTypeToLegacy(result.feedbackType),
    feedback_text: result.feedbackText,
  };
}

export async function generatePolishSuggestion(
  input: PolishInput,
): Promise<AiServiceResult<PolishResult>> {
  const fallback = createMockPolishResult(input);

  try {
    const result = await callAiRoute<ApiPolishResponse>("/api/ai/polish", {
      topicId: input.topic_id,
      questionId: `${input.topic_id}-${input.question_index}`,
      questionText: input.question_text,
      userTranscript: input.user_answer,
      answerStructureType: input.answerStructureType,
    });
    const mappedResult = mapApiPolishToPolishResult(result, fallback);

    if (!validatePolishResult(mappedResult)) {
      throw new Error("invalid_ai_output");
    }

    return {
      data: mappedResult,
      generation_mode: result.source === "llm" ? "ai" : "mock",
      ai_success: result.source === "llm",
      fallback_used: result.source === "mock_fallback",
      failure_reason: result.fallbackReason ?? undefined,
      ai_source: result.source,
      fallback_reason: result.fallbackReason ?? undefined,
      llm_latency_ms: result.llmLatencyMs,
    };
  } catch (error) {
    return {
      data: fallback,
      generation_mode: "mock",
      ai_success: false,
      fallback_used: true,
      failure_reason:
        error instanceof Error ? error.message : "ai_generation_failed",
      ai_source: "mock_fallback",
      fallback_reason:
        error instanceof Error ? error.message : "ai_generation_failed",
      llm_latency_ms: null,
    };
  }
}

export async function generateRetryFeedback(
  input: RetryFeedbackInput,
): Promise<AiServiceResult<RetryFeedbackResult>> {
  const fallback = createMockRetryFeedbackResult(input);

  try {
    const result = await callAiRoute<ApiRetryFeedbackResponse>(
      "/api/ai/retry-feedback",
      {
        topicId: input.topic_id ?? "",
        questionId: input.question_id ?? "",
        questionText: input.question_text,
        firstTranscript: input.first_answer,
        polishedAnswer: input.polished_answer,
        extensionSentence: input.expansion_sentence ?? "",
        retryTranscript: input.retry_answer,
      },
    );
    const mappedResult = mapApiRetryFeedbackToRetryFeedbackResult(result);

    if (!mappedResult.feedback_text) {
      throw new Error("invalid_retry_feedback");
    }

    return {
      data: mappedResult,
      generation_mode: result.source === "llm" ? "ai" : "mock",
      ai_success: result.source === "llm",
      fallback_used: result.source === "mock_fallback",
      failure_reason: result.fallbackReason ?? undefined,
      ai_source: result.source,
      fallback_reason: result.fallbackReason ?? undefined,
      llm_latency_ms: result.llmLatencyMs,
    };
  } catch (error) {
    return {
      data: fallback,
      generation_mode: "mock",
      ai_success: false,
      fallback_used: true,
      failure_reason:
        error instanceof Error ? error.message : "retry_feedback_failed",
      ai_source: "mock_fallback",
      fallback_reason:
        error instanceof Error ? error.message : "retry_feedback_failed",
      llm_latency_ms: null,
    };
  }
}

export function createPolishInput(
  topic: Topic,
  question: PracticeQuestion,
  questionIndex: number,
  userAnswer: string,
): PolishInput {
  return {
    topic_id: topic.id,
    topic_title: topic.title,
    question_text: question.text,
    answerStructureType: question.answerStructureType,
    user_answer: userAnswer,
    question_index: questionIndex + 1,
    target_level: "IELTS 6.0-6.5",
  };
}
