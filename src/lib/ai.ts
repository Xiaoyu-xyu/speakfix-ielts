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

export type PreAnswerInput = {
  topic_id: string;
  question_id: string;
  question_text: string;
  answerStructureType: AnswerStructureType;
};

export type ApiPreAnswerResponse = {
  directionZh: string;
  keywords: string[];
  sentenceStarters: string[];
  optionalReminder: string;
  source: "llm" | "mock_fallback";
  aiProvider: "openai" | "siliconflow";
  fallbackReason: string | null;
  llmLatencyMs: number | null;
};

export type PolishInput = {
  topic_id: string;
  question_id?: string;
  topic_title: string;
  question_text: string;
  answerStructureType: AnswerStructureType;
  user_answer: string;
  raw_transcript?: string;
  cleaned_transcript?: string;
  display_transcript?: string;
  question_index: number;
  target_level: "IELTS 6.0-6.5";
};

export type MarkedTranscriptSegment = {
  text: string;
  type: "normal" | "error" | "improve";
};

export type ExpansionType =
  | "\u8865\u5145\u539f\u56e0"
  | "\u8865\u5145\u4f8b\u5b50"
  | "\u8865\u5145\u611f\u53d7"
  | "\u8865\u5145\u9891\u7387"
  | "\u8865\u5145\u5bf9\u6bd4"
  | "\u65e0\u9700\u6269\u5c55"
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
  aiProvider: "openai" | "siliconflow";
  fallbackReason: string | null;
  llmLatencyMs: number | null;
};

export type RetryFeedbackInput = {
  topic_id?: string;
  question_id?: string;
  question_index?: number;
  answerStructureType?: AnswerStructureType;
  question_text: string;
  first_answer: string;
  first_cleaned_transcript?: string;
  polished_answer: string;
  expansion_sentence?: string;
  retry_answer: string;
  retry_cleaned_transcript?: string;
  retry_raw_transcript?: string;
  retry_display_transcript?: string;
};

export type RetryFeedbackType =
  | "\u91c7\u7eb3\u5efa\u8bae"
  | "\u8868\u8fbe\u6539\u5584"
  | "\u4ecd\u9700\u8c03\u6574"
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
  aiProvider: "openai" | "siliconflow";
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
  ai_provider?: "openai" | "siliconflow";
  fallback_reason?: string;
  llm_latency_ms?: number | null;
};

type Part1Intent =
  | "age"
  | "living_place"
  | "work_study"
  | "preference"
  | "frequency"
  | "experience"
  | "opinion"
  | "choice"
  | "place"
  | "type"
  | "basic";

export type PolishInputDiagnosis =
  | "natural_complete"
  | "correct_but_short"
  | "fixable_language_issue"
  | "meta_or_no_answer"
  | "low_confidence_transcript";

export type A04AdoptionState = "none" | "partial" | "full" | "synonym";

export type A04Judgement = {
  answeredCoreQuestion: boolean;
  preservedOriginalMeaning: boolean;
  adoptedSuggestion: A04AdoptionState;
  independentlyImproved: boolean;
  repeatedOriginal: boolean;
  introducedNewError: boolean;
  containsOffTopicPart: boolean;
  regressed: boolean;
};

export type ApiRetryFeedbackMapping = {
  feedbackType: ApiRetryFeedbackResponse["feedbackType"];
  feedbackText: string;
};

const preHelpByStructure: Record<
  AnswerStructureType,
  Omit<PreHelpOutput, "answer_structure_type">
> = {
  basic_fact: {
    answer_direction_zh: "\u5148\u76f4\u63a5\u56de\u7b54\uff0c\u518d\u8865\u4e00\u53e5\u8bf4\u660e",
    useful_keywords_en: ["current situation", "simple reason", "daily life"],
    sentence_starter_en: "I would say ___. / The simple reason is ___. / It is part of my daily life because ___.",
    caution_zh: "\u6309\u771f\u5b9e\u60c5\u51b5\u8bf4\uff0c\u4e0d\u8981\u80cc\u7b54\u6848\u3002",
  },
  preference_reason: {
    answer_direction_zh: "\u5148\u8868\u660e\u559c\u597d\uff0c\u518d\u8865\u4e00\u4e2a\u539f\u56e0",
    useful_keywords_en: ["relaxing", "interesting", "easy to start"],
    sentence_starter_en: "Yes, I do, mainly because ___. / Not really, because ___. / I usually prefer ___ when ___.",
    caution_zh: "\u53ea\u8865\u4e00\u4e2a\u539f\u56e0\u6216\u573a\u666f\u5c31\u591f\u3002",
  },
  yes_no_reason: {
    answer_direction_zh: "\u5148\u76f4\u63a5\u8868\u6001\uff0c\u518d\u8865\u4e00\u4e2a\u539f\u56e0",
    useful_keywords_en: ["yes, definitely", "not really", "usually"],
    sentence_starter_en: "Yes, I do, because ___. / No, not really, because ___. / I usually feel ___ about it.",
    caution_zh: "\u5148\u8bf4 yes/no\uff0c\u518d\u7b80\u5355\u89e3\u91ca\u3002",
  },
  frequency_situation: {
    answer_direction_zh: "\u5148\u8bf4\u9891\u7387\uff0c\u518d\u8865\u4e00\u4e2a\u573a\u666f",
    useful_keywords_en: ["every day", "on weekends", "when I have time"],
    sentence_starter_en: "I usually ___. / I do it when ___. / It happens about ___.",
    caution_zh: "\u9891\u7387\u4e0d\u7528\u7cbe\u786e\uff0c\u63a5\u8fd1\u771f\u5b9e\u60c5\u51b5\u5373\u53ef\u3002",
  },
  type_reason: {
    answer_direction_zh: "\u5148\u8bf4\u7c7b\u578b\uff0c\u518d\u8865\u539f\u56e0\u6216\u4f8b\u5b50",
    useful_keywords_en: ["simple style", "daily use", "easy to find"],
    sentence_starter_en: "I usually like ___. / It is ___ for me. / For example, I often choose ___.",
    caution_zh: "\u7ed9\u4e00\u7c7b\u6216\u4e00\u4e2a\u4f8b\u5b50\uff0c\u4e0d\u8981\u5217\u592a\u591a\u3002",
  },
  past_present_compare: {
    answer_direction_zh: "\u5148\u8bf4\u8fc7\u53bb\uff0c\u518d\u8bf4\u73b0\u5728\u53d8\u5316",
    useful_keywords_en: ["when I was younger", "nowadays", "still"],
    sentence_starter_en: "When I was younger, I ___. / But now I ___. / The main change is ___.",
    caution_zh: "\u5bf9\u6bd4\u4fdd\u6301\u7b80\u5355\uff0c\u4e0d\u9700\u8981\u8bb2\u5b8c\u6574\u7ecf\u5386\u3002",
  },
  place_description: {
    answer_direction_zh: "\u5148\u8bf4\u5730\u70b9\uff0c\u518d\u8865\u7279\u70b9\u6216\u611f\u53d7",
    useful_keywords_en: ["quiet area", "fresh air", "comfortable space"],
    sentence_starter_en: "It is ___. / I like it because ___. / It is a good place to ___.",
    caution_zh: "\u63cf\u8ff0\u771f\u5b9e\u611f\u53d7\uff0c\u4e0d\u8981\u7f16\u9020\u590d\u6742\u7ec6\u8282\u3002",
  },
  experience_example: {
    answer_direction_zh: "\u5148\u8bf4\u6709\u65e0\uff0c\u518d\u8865\u7b80\u5355\u4f8b\u5b50",
    useful_keywords_en: ["once or twice", "recently", "a simple example"],
    sentence_starter_en: "Yes, I have. / For example, I once ___. / Not really, but I would like to ___.",
    caution_zh: "\u4f8b\u5b50\u4e00\u53e5\u8bdd\u5373\u53ef\uff0c\u4e0d\u8981\u53d8\u6210 Part 2\u3002",
  },
  opinion_reason: {
    answer_direction_zh: "\u5148\u8bf4\u6001\u5ea6\uff0c\u518d\u8865\u539f\u56e0\u6216\u4f5c\u7528",
    useful_keywords_en: ["useful", "important", "convenient"],
    sentence_starter_en: "I think ___. / The main reason is ___. / In daily life, it can ___.",
    caution_zh: "\u89c2\u70b9\u53ef\u4ee5\u7b80\u5355\uff0c\u4f46\u8981\u8865\u4e00\u4e2a\u539f\u56e0\u3002",
  },
  choice_compare: {
    answer_direction_zh: "\u5148\u9009\u4e00\u8fb9\uff0c\u518d\u8865\u7406\u7531\u6216\u573a\u666f",
    useful_keywords_en: ["more convenient", "easier for me", "more relaxing"],
    sentence_starter_en: "I prefer ___. / It is more ___ for me. / I usually choose it when ___.",
    caution_zh: "\u53ea\u9009\u4e00\u4e2a\u66f4\u81ea\u7136\uff0c\u4e0d\u9700\u8981\u4e24\u8fb9\u90fd\u8be6\u7ec6\u8bf4\u3002",
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
    answer_direction_zh: "\u5148\u76f4\u63a5\u56de\u7b54\uff0c\u518d\u8865\u4e00\u53e5\u539f\u56e0\u6216\u573a\u666f",
    useful_keywords_en: ["usually", "because", "for example"],
    sentence_starter_en: "I would say ..., because ...",
    caution_zh: "\u6309\u81ea\u5df1\u7684\u771f\u5b9e\u60c5\u51b5\u8bf4\uff0c\u4e0d\u9700\u8981\u80cc\u7b54\u6848\u3002",
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
      ai_provider: "openai",
      fallback_reason: "mock_rule",
      llm_latency_ms: null,
  };
}

function createContentKeywordsForPreAnswer(input: PreAnswerInput) {
  const intent = getPart1Intent(input.question_text, input.answerStructureType);

  const keywordsByIntent: Record<Part1Intent, string[]> = {
    age: ["exact age", "feel mature", "still young"],
    living_place: [
      "city name",
      "hometown",
      "quiet area",
    ],
    work_study: ["current role", "daily routine", "practical skills"],
    preference: ["relaxing", "interesting", "easy to start"],
    frequency: ["every day", "on weekends", "when I have time"],
    experience: ["once or twice", "recently", "a simple example"],
    opinion: ["useful", "important", "convenient"],
    choice: ["more convenient", "easier for me", "more relaxing"],
    place: ["quiet area", "fresh air", "comfortable space"],
    type: ["simple style", "daily use", "easy to find"],
    basic: ["daily life", "simple reason", "current situation"],
  };

  return keywordsByIntent[intent];
}

function createSentenceStartersForPreAnswer(input: PreAnswerInput) {
  const intent = getPart1Intent(input.question_text, input.answerStructureType);

  const startersByIntent: Record<Part1Intent, string[]> = {
    age: [
      "I'm ___ years old.",
      "I'm ___ years old, and I feel ___.",
      "At this age, I usually feel ___.",
    ],
    living_place: [
      "I live in ___.",
      "It is ___, so I feel ___.",
      "The area is ___ for daily life.",
    ],
    work_study: [
      "I'm currently ___.",
      "My daily routine is ___.",
      "The main thing I like is ___.",
    ],
    preference: [
      "Yes, I do, mainly because ___.",
      "Not really, because ___.",
      "I usually prefer ___ when ___.",
    ],
    frequency: [
      "I usually ___.",
      "I do it when ___.",
      "It happens about ___.",
    ],
    experience: [
      "Yes, I have.",
      "For example, I once ___.",
      "Not really, but I would like to ___.",
    ],
    opinion: [
      "I think ___.",
      "The main reason is ___.",
      "In daily life, it can ___.",
    ],
    choice: [
      "I prefer ___.",
      "It is more ___ for me.",
      "I usually choose it when ___.",
    ],
    place: [
      "It is ___.",
      "I like it because ___.",
      "It is a good place to ___.",
    ],
    type: [
      "I usually like ___.",
      "It is ___ for me.",
      "For example, I often choose ___.",
    ],
    basic: [
      "I would say ___.",
      "The simple reason is ___.",
      "It is part of my daily life because ___.",
    ],
  };

  return startersByIntent[intent].join(" / ");
}

function createDirectionForPreAnswer(input: PreAnswerInput) {
  const intent = getPart1Intent(input.question_text, input.answerStructureType);

  const directionsByIntent: Record<Part1Intent, string> = {
    age: "\u5148\u8bf4\u5e74\u9f84\uff0c\u518d\u8865\u4e00\u4e2a\u611f\u53d7",
    living_place: "\u5148\u8bf4\u5730\u70b9\uff0c\u518d\u8865\u7279\u70b9\u6216\u611f\u53d7",
    work_study: "\u5148\u8bf4\u5f53\u524d\u72b6\u6001\uff0c\u518d\u8865\u65e5\u5e38\u5185\u5bb9",
    preference: "\u5148\u8868\u660e\u559c\u597d\uff0c\u518d\u8865\u4e00\u4e2a\u539f\u56e0",
    frequency: "\u5148\u8bf4\u9891\u7387\uff0c\u518d\u8865\u4e00\u4e2a\u573a\u666f",
    experience: "\u5148\u8bf4\u6709\u65e0\uff0c\u518d\u8865\u7b80\u5355\u4f8b\u5b50",
    opinion: "\u5148\u8bf4\u6001\u5ea6\uff0c\u518d\u8865\u539f\u56e0\u6216\u4f5c\u7528",
    choice: "\u5148\u9009\u4e00\u8fb9\uff0c\u518d\u8865\u7406\u7531\u6216\u573a\u666f",
    place: "\u5148\u8bf4\u5730\u70b9\uff0c\u518d\u8865\u7279\u70b9\u6216\u611f\u53d7",
    type: "\u5148\u8bf4\u7c7b\u578b\uff0c\u518d\u8865\u539f\u56e0\u6216\u4f8b\u5b50",
    basic: "\u5148\u76f4\u63a5\u56de\u7b54\uff0c\u518d\u8865\u4e00\u53e5\u8bf4\u660e",
  };

  return directionsByIntent[intent];
}

export function createMockPreAnswerOutput(
  input: PreAnswerInput,
): PreHelpOutput {
  return {
    answer_structure_type: input.answerStructureType,
    answer_direction_zh: createDirectionForPreAnswer(input),
    useful_keywords_en: createContentKeywordsForPreAnswer(input),
    sentence_starter_en: createSentenceStartersForPreAnswer(input),
    caution_zh: "",
  };
}

function mapApiPreAnswerToPreHelpOutput(
  result: ApiPreAnswerResponse,
  answerStructureType: AnswerStructureType,
): PreHelpOutput {
  return {
    answer_structure_type: answerStructureType,
    answer_direction_zh: result.directionZh,
    useful_keywords_en: result.keywords,
    sentence_starter_en: result.sentenceStarters.join(" / "),
    caution_zh: result.optionalReminder,
  };
}

export function createPreAnswerInput(
  topic: Topic,
  question: PracticeQuestion,
): PreAnswerInput {
  return {
    topic_id: topic.id,
    question_id: question.id,
    question_text: question.text,
    answerStructureType: question.answerStructureType,
  };
}

export async function generatePreAnswerSuggestion(
  input: PreAnswerInput,
): Promise<AiServiceResult<PreHelpOutput>> {
  const fallback = createMockPreAnswerOutput(input);

  try {
    const result = await callAiRoute<ApiPreAnswerResponse>("/api/ai/pre-answer", {
      topicId: input.topic_id,
      questionId: input.question_id,
      questionText: input.question_text,
      answerStructureType: input.answerStructureType,
    });

    return {
      data: mapApiPreAnswerToPreHelpOutput(result, input.answerStructureType),
      generation_mode: result.source === "llm" ? "ai" : "mock",
      ai_success: result.source === "llm",
      fallback_used: result.source === "mock_fallback",
      failure_reason: result.fallbackReason ?? undefined,
      ai_source: result.source,
      ai_provider: result.aiProvider,
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
        error instanceof Error ? error.message : "pre_answer_failed",
      ai_source: "mock_fallback",
      ai_provider: "openai",
      fallback_reason:
        error instanceof Error ? error.message : "pre_answer_failed",
      llm_latency_ms: null,
    };
  }
}

function countEnglishWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function countAiComparableWords(text: string) {
  return normalizeComparableText(text).split(/\s+/).filter(Boolean).length;
}

function getPart1Intent(
  questionText: string,
  answerStructureType?: AnswerStructureType,
): Part1Intent {
  const text = questionText.toLowerCase();

  if (/\bhow old\b/.test(text)) {
    return "age";
  }

  if (/\bwhere do you live|hometown|city|house or an apartment\b/.test(text)) {
    return "living_place";
  }

  if (/\bworking or studying|what do you do|study|work\b/.test(text)) {
    return "work_study";
  }

  if (/\bhow often|do you often|usually|every day\b/.test(text)) {
    return "frequency";
  }

  if (/\bhave you ever|when did you last|did you\b/.test(text)) {
    return "experience";
  }

  if (/\bprefer|rather\b/.test(text) || answerStructureType === "choice_compare") {
    return "choice";
  }

  if (
    /\bdo you like|do you enjoy|what kind of|favourite|favorite\b/.test(text) ||
    answerStructureType === "preference_reason"
  ) {
    return "preference";
  }

  if (/\bdo you think|should|important|why\b/.test(text)) {
    return "opinion";
  }

  if (answerStructureType === "place_description") {
    return "place";
  }

  if (answerStructureType === "type_reason") {
    return "type";
  }

  return "basic";
}

function isLikelyYesNoQuestion(questionText: string, answerStructureType?: AnswerStructureType) {
  return (
    answerStructureType === "yes_no_reason" ||
    /^(do|did|have|are|is|was|were|can|would|will)\b/i.test(
      questionText.trim(),
    )
  );
}

export function hasAiMetaOrNoAnswerExpression(answer: string) {
  return (
    hasMetaAnswerExpression(answer) ||
    /\b(i\s+don'?t\s+know|no\s+idea|how\s+to\s+answer|this\s+question\s+is\s+difficult|hard\s+to\s+answer)\b/i.test(
      answer,
    )
  );
}

function hasValidLanguageToken(text: string) {
  return /[a-z0-9]/i.test(text) && !/^\s*(?:[.\-_,!?]|\[[^\]]+\])+\s*$/.test(text);
}

function isNoiseOrFillerAnswer(answer: string) {
  const normalized = normalizeComparableText(answer);

  return (
    !hasValidLanguageToken(answer) ||
    /^(um|uh|er|ah|hmm|maybe|ok|okay|well|so|like|noise|music|inaudible|silence|cough|laugh)$/.test(
      normalized,
    ) ||
    /\b(?:noise|music|inaudible|silence|cough|laugh)\b/.test(normalized)
  );
}

function isLikelyPlaceAnswerText(answerText: string) {
  const answer = normalizeComparableText(answerText);
  const words = answer.split(/\s+/).filter(Boolean);

  if (!answer || isNoiseOrFillerAnswer(answerText) || hasAiMetaOrNoAnswerExpression(answerText)) {
    return false;
  }

  if (
    /^(beautiful|good|great|nice|bad|very good|so good|quite good|convenient|comfortable|because convenient)$/.test(
      answer,
    )
  ) {
    return false;
  }

  if (/\b(i live|live in|from|hometown|city|town|village|place|area|here|there)\b/.test(answer)) {
    return true;
  }

  if (/^in\s+[a-z][a-z\s-]{1,40}$/.test(answer)) {
    return true;
  }

  if (/^(my\s+)?(?:hometown|home town|city|town|village)$/.test(answer)) {
    return true;
  }

  if (/^(?:a|an|the|my)?\s*(?:small|big|large|modern|old)?\s*(?:city|town|village|place|area)$/.test(answer)) {
    return true;
  }

  return words.length === 1 && /^[a-z][a-z-]{2,}$/.test(words[0]);
}

export function isAiCoreShortAnswer(input: PolishInput) {
  const answer = normalizeComparableText(input.user_answer);
  const intent = getPart1Intent(input.question_text, input.answerStructureType);

  if (!answer || countAiComparableWords(input.user_answer) > 8 || isNoiseOrFillerAnswer(input.user_answer)) {
    return false;
  }

  if (intent === "age") {
    return /\b\d{1,2}\b|\byears?\s+old\b|\b(twenty|thirty|forty|fifty|sixty)\b/.test(answer);
  }

  if (intent === "living_place" || intent === "place") {
    return isLikelyPlaceAnswerText(input.user_answer);
  }

  if (
    input.answerStructureType === "past_present_compare" ||
    /\bwhen did you|when do you|when did you start\b/i.test(input.question_text)
  ) {
    return /\b(ago|last|since|yesterday|today|year|month|week|day|started|before|past)\b/.test(answer);
  }

  if (intent === "frequency") {
    return /\b(always|usually|often|sometimes|rarely|never|every|once|twice|daily|weekly|monthly)\b/.test(answer);
  }

  if (isLikelyYesNoQuestion(input.question_text, input.answerStructureType)) {
    return /^(yes|no|yeah|nope|not really|sometimes|usually|maybe|sure)\b/.test(answer);
  }

  return false;
}

export function isAiLikelyLowConfidenceTranscript(input: PolishInput) {
  const normalized = normalizeComparableText(input.user_answer);
  const words = normalized.split(/\s+/).filter(Boolean);

  if (!normalized || isNoiseOrFillerAnswer(input.user_answer)) {
    return true;
  }

  if (isAiCoreShortAnswer(input)) {
    return false;
  }

  return words.length <= 1;
}

export function hasAiFixableLanguageIssue(answer: string) {
  return (
    hasGrammarIssue(answer) ||
    hasChinglishExpression(answer) ||
    /\bit\s+make\s+me\b/i.test(answer) ||
    /\bmake\s+me\s+relax\b/i.test(answer) ||
    /\b\w+\.\s+(?:a|an|very|beautiful|comfortable|convenient)\b/i.test(answer)
  );
}

export function diagnoseAiPolishInput(input: PolishInput): PolishInputDiagnosis {
  if (hasAiMetaOrNoAnswerExpression(input.user_answer)) {
    return "meta_or_no_answer";
  }

  if (isAiCoreShortAnswer(input)) {
    return "correct_but_short";
  }

  if (isAiLikelyLowConfidenceTranscript(input)) {
    return "low_confidence_transcript";
  }

  if (hasAiFixableLanguageIssue(input.user_answer)) {
    return "fixable_language_issue";
  }

  if (countAiComparableWords(input.user_answer) < 8) {
    return "correct_but_short";
  }

  return "natural_complete";
}

export function hasAiSubstantiveDifference(left: string, right: string) {
  return normalizeComparableText(left) !== normalizeComparableText(right);
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
    return "\u8865\u5145\u9891\u7387";
  }

  if (
    answerStructureType === "experience_example" ||
    answerStructureType === "type_reason"
  ) {
    return "\u8865\u5145\u4f8b\u5b50";
  }

  if (
    answerStructureType === "choice_compare" ||
    answerStructureType === "past_present_compare"
  ) {
    return "\u8865\u5145\u5bf9\u6bd4";
  }

  if (
    answerStructureType === "preference_reason" ||
    answerStructureType === "yes_no_reason" ||
    answerStructureType === "opinion_reason"
  ) {
    return "\u8865\u5145\u539f\u56e0";
  }

  return "\u8865\u5145\u611f\u53d7";
}

function createExpansionSentence(expansionType: ExpansionType) {
  if (expansionType === "\u8865\u5145\u9891\u7387") {
    return "I usually talk about this in everyday situations.";
  }

  if (expansionType === "\u8865\u5145\u4f8b\u5b50") {
    return "For example, it is something I often notice in my daily life.";
  }

  if (expansionType === "\u8865\u5145\u5bf9\u6bd4") {
    return "Compared with the other option, it feels easier and more natural for me.";
  }

  if (expansionType === "\u8865\u5145\u539f\u56e0") {
    return "The main reason is that it feels practical and easy for me.";
  }

  if (expansionType === "\u8865\u5145\u611f\u53d7") {
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
  const answerType = classifyPolishAnswer(input);

  if (answerType === "off_topic_or_meta") {
    return {
      markedTranscript: [{ text: input.user_answer, type: "improve" }],
      polishedAnswer:
        "You haven't really answered the question yet. Start with a direct answer, then add one simple reason or detail.",
      noPolishNeeded: false,
      shouldExpand: true,
      expansionType: "\u8865\u5145\u539f\u56e0" as ExpansionType,
      expansionSentence: createAnswerPathSentence(input),
      reason:
        "This has not really answered the question yet, so give a direct answer and one concrete detail.",
    };
  }

  const polishedAnswer = createSafePolishedAnswer(input);
  const answerWordCount = countEnglishWords(polishedAnswer);
  const noPolishNeeded =
    answerType === "natural_complete" &&
    isClearNaturalAnswer(input.user_answer, polishedAnswer);
  const answeredCoreButShort = isCoreAnswerButShort(input, polishedAnswer);
  const shouldExpand =
    noPolishNeeded ||
    answeredCoreButShort ||
    answerType === "correct_but_short" ||
    answerType === "relevant_incomplete"
      ? answerWordCount < 20
      : answerWordCount < 12;
  const expansionType = shouldExpand
    ? getSafeExpansionType(input)
    : "\u65e0\u9700\u6269\u5c55";

  return {
    markedTranscript: createMarkedTranscript(input.user_answer),
    polishedAnswer:
      noPolishNeeded || answerType === "correct_but_short"
        ? ""
        : polishedAnswer,
    noPolishNeeded: noPolishNeeded || answerType === "correct_but_short",
    shouldExpand,
    expansionType,
    expansionSentence: shouldExpand
      ? noPolishNeeded
        ? createNoPolishExpansionSentence(input)
        : createSafeExpansionSentence(input, expansionType)
      : "",
    reason: shouldExpand
      ? "This already answers the core question, and one simple detail can make it more like a Part 1 short answer."
      : "The answer already has enough basic information for a short Part 1 response.",
  };
}

type PolishAnswerType =
  | "natural_complete"
  | "correct_but_short"
  | "grammar_error"
  | "chinglish"
  | "relevant_incomplete"
  | "off_topic_or_meta";

function classifyPolishAnswer(input: PolishInput): PolishAnswerType {
  const normalizedAnswer = normalizeComparableText(input.user_answer);
  const wordCountValue = countEnglishWords(input.user_answer);

  if (!normalizedAnswer || hasMetaAnswerExpression(input.user_answer)) {
    return "off_topic_or_meta";
  }

  if (!isLikelyAnsweringQuestion(input)) {
    return "off_topic_or_meta";
  }

  if (hasGrammarIssue(input.user_answer)) {
    return "grammar_error";
  }

  if (hasChinglishExpression(input.user_answer)) {
    return "chinglish";
  }

  if (isTimeOnlyAnswerForStartQuestion(input)) {
    return "relevant_incomplete";
  }

  if (wordCountValue <= 3 && !isCoreAnswerButShort(input, input.user_answer)) {
    return "relevant_incomplete";
  }

  if (wordCountValue < 8 || isCoreAnswerButShort(input, input.user_answer)) {
    return "correct_but_short";
  }

  return "natural_complete";
}

function hasGrammarIssue(answer: string) {
  return (
    /\b(they|we|you)\s+is\b/i.test(answer) ||
    /\bi\s+is\b/i.test(answer) ||
    /\b(i|we|they|you)\s+start\s+\w+(?:\s+\w+){0,4}\s+ago\b/i.test(answer) ||
    /\bfeel\s+relax\b/i.test(answer)
  );
}

function hasChinglishExpression(answer: string) {
  return /\b(very like|like wear|more better|clothes very comfortable|make(?:s)? me very convenient)\b/i.test(answer);
}

function isTimeOnlyAnswerForStartQuestion(input: PolishInput) {
  return (
    /\bwhen did you start\b/i.test(input.question_text) &&
    /\b(?:\w+\s+){0,3}ago\.?$/i.test(input.user_answer.trim()) &&
    !/\b(i|we|they|you)\b/i.test(input.user_answer)
  );
}

function isLikelyAnsweringQuestion(input: PolishInput) {
  const answer = normalizeComparableText(input.user_answer);
  const intent = getPart1Intent(input.question_text, input.answerStructureType);

  if (!answer) {
    return false;
  }

  if (/\b(i dont know|i don't know|no idea|this question is difficult|hard to answer|how to answer this question)\b/.test(answer)) {
    return false;
  }

  if (intent === "age") {
    return /\b(\d{1,2}|years? old|young|old)\b/.test(answer);
  }

  if (intent === "living_place") {
    return /\b(live|hometown|city|town|village|place|area|there|here)\b/.test(answer);
  }

  if (intent === "frequency") {
    return /\b(always|usually|often|sometimes|rarely|never|every|once|twice|week|month|day)\b/.test(answer);
  }

  if (
    input.answerStructureType === "past_present_compare" ||
    /\bwhen did you start\b/i.test(input.question_text)
  ) {
    return /\b(ago|last|started|start|since|year|month|week|day)\b/.test(answer);
  }

  if (intent === "choice") {
    return /\b(prefer|rather|like|choose|better|more)\b/.test(answer);
  }

  if (["preference", "opinion", "experience"].includes(intent)) {
    return /\b(yes|no|like|enjoy|think|feel|have|had|did|do|don't|not|because|maybe|sometimes)\b/.test(answer);
  }

  return countEnglishWords(answer) >= 2;
}

export function createMockPolishResult(input: PolishInput): PolishResult {
  const diagnosis = diagnoseAiPolishInput(input);

  if (diagnosis === "meta_or_no_answer" || diagnosis === "low_confidence_transcript") {
    return {
      markedTranscript: [{ text: input.user_answer, type: "improve" }],
      polishedAnswer: "",
      noPolishNeeded: true,
      shouldExpand: true,
      expansionType: "\u8865\u5145\u539f\u56e0" as ExpansionType,
      expansionSentence:
        diagnosis === "low_confidence_transcript"
          ? "Please record it again so I can polish it safely."
          : createAnswerPathSentence(input),
      reason:
        diagnosis === "low_confidence_transcript"
          ? "The transcript is not reliable enough to polish safely."
          : "This has not really answered the question yet, so give a direct answer and one concrete detail.",
    };
  }

  const result = createSafePolish(input);
  const normalizedAnswer = normalizeComparableText(input.user_answer);
  const normalizedPolish = normalizeComparableText(result.polishedAnswer);

  if (
    normalizedAnswer === normalizedPolish &&
    result.markedTranscript.every((segment) => segment.type === "normal")
  ) {
    result.noPolishNeeded = true;
    result.polishedAnswer = "";
  }

  if (hasAiUnsafeExtension(result.expansionSentence, input)) {
    result.shouldExpand = false;
    result.expansionSentence = "";
    result.expansionType = "\u65e0\u9700\u6269\u5c55" as ExpansionType;
  }

  return result;
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
    return trimmedAnswer.replace(/\blike wear\b/gi, "like wearing");
  }

  if (/\bmake(?:s)? me very convenient\b/i.test(trimmedAnswer)) {
    return trimmedAnswer.replace(
      /\bmake(?:s)? me very convenient\b/gi,
      "are very convenient for me",
    );
  }

  if (/\b(i|we|they|you)\s+start\s+(.+?)\s+(\w+\s+)?ago\b/i.test(trimmedAnswer)) {
    return trimmedAnswer.replace(/\b(i|we|they|you)\s+start\b/i, (match) =>
      match.replace(/\bstart\b/i, "started"),
    );
  }

  if (
    /\b(?:\w+\s+){0,3}ago\.?$/i.test(trimmedAnswer) &&
    /\bwhen did you start\b/i.test(input.question_text)
  ) {
    return `I started ${getStartedActionFromQuestion(input.question_text)} ${lowercaseInitial(trimmedAnswer.replace(/[.!?]$/, ""))}.`;
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

function isCoreAnswerButShort(input: PolishInput, polishedAnswer: string) {
  const normalizedAnswer = normalizeComparableText(input.user_answer);
  const wordCountValue = countEnglishWords(input.user_answer);

  if (!normalizedAnswer || wordCountValue > 8) {
    return false;
  }

  const intent = getPart1Intent(input.question_text, input.answerStructureType);

  if (
    intent === "age" &&
    (/\b\d{1,2}\b/.test(normalizedAnswer) ||
      /\bi'?m \d{1,2} years old\b/.test(normalizedAnswer))
  ) {
    return true;
  }

  if (
    intent === "living_place" &&
    isLikelyPlaceAnswerText(input.user_answer)
  ) {
    return true;
  }

  if (
    ["preference", "opinion", "frequency", "experience", "choice"].includes(intent) &&
    /^(yes|no|not really|yeah|sometimes|usually|i do|i dont|i don't)\b/.test(
      normalizedAnswer,
    )
  ) {
    return true;
  }

  if (
    input.answerStructureType === "past_present_compare" &&
    /\b(ago|last|since|year|month|week|day)\b/.test(normalizedAnswer)
  ) {
    return true;
  }

  return normalizeComparableText(polishedAnswer) === normalizedAnswer;
}

function normalizeComparableText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getStartedActionFromQuestion(questionText: string) {
  const match = questionText.match(/\bwhen did you start\s+(.+?)\??$/i);
  const action = match?.[1]?.trim().replace(/[.!?]$/, "");

  return action || "doing it";
}

function lowercaseInitial(text: string) {
  return text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;
}

function createSafeExpansionSentence(
  input: PolishInput,
  expansionType: ExpansionType,
) {
  const intent = getPart1Intent(input.question_text, input.answerStructureType);

  if (intent === "age") {
    return "I feel I am still young, but I am becoming more independent.";
  }

  if (intent === "living_place") {
    return "It is convenient for my daily life, and I feel comfortable living there.";
  }

  if (intent === "work_study") {
    return "It is part of my daily routine, and I am learning useful things from it.";
  }

  if (intent === "preference") {
    if (/\bclothes?\b/i.test(input.user_answer)) {
      return "They feel relaxing and easy to wear.";
    }

    return "The main reason is that it feels relaxing and easy for me.";
  }

  if (intent === "frequency") {
    return "I usually do this when I have free time or after a busy day.";
  }

  if (intent === "experience") {
    return "For example, I remember doing it once in a simple everyday situation.";
  }

  if (intent === "opinion") {
    return "I think it is useful because it can make daily life a little easier.";
  }

  if (intent === "choice") {
    return "Compared with the other option, it feels more convenient for me.";
  }

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

export function hasAiUnsafeExtension(extensionSentence: string, input: PolishInput) {
  const extension = normalizeComparableText(extensionSentence);
  const answer = normalizeComparableText(input.user_answer);
  const intent = getPart1Intent(input.question_text, input.answerStructureType);

  if (!extension) {
    return false;
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
  ];

  if (
    ["age", "living_place", "place", "experience"].includes(intent) &&
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

  if (containsAiDeniedSelfCorrectionFact(extension, input.user_answer)) {
    return true;
  }

  return false;
}

export function hasAiTimeStateConflict(outputText: string, userAnswer: string) {
  const output = normalizeComparableText(outputText);
  const answer = normalizeComparableText(userAnswer);
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

function containsAiDeniedSelfCorrectionFact(outputText: string, rawAnswer: string) {
  const correctionMatch = rawAnswer.match(
    /\b(.+?)\b(?:sorry|no|actually)\s*,?\s*(?:i mean|what i mean is|i meant)?\s+(.+)/i,
  );

  if (!correctionMatch) {
    return false;
  }

  const deniedWords = normalizeComparableText(correctionMatch[1])
    .split(/\s+/)
    .filter((word) => word.length > 3 && !["live", "from", "mean"].includes(word));
  const output = normalizeComparableText(outputText);

  return deniedWords.some((word) => output.includes(word));
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

function createAnswerPathSentence(input: PolishInput) {
  const intent = getPart1Intent(input.question_text, input.answerStructureType);

  if (intent === "frequency") {
    return "Say how often you do it, then add one simple situation.";
  }

  if (intent === "choice") {
    return "Choose one option first, then give one simple reason.";
  }

  if (intent === "living_place") {
    return "Say the place first, then add one feature or feeling about it.";
  }

  if (intent === "opinion") {
    return "Give your opinion first, then add one practical reason.";
  }

  return "Answer directly first, then add one short reason or detail.";
}

function createLegacySafePolish(input: PolishInput) {
  return {
    polished_answer: `${input.user_answer} It is a simple and natural answer for this topic.`,
    suggestion_cn:
      "\u4fdd\u7559\u4f60\u7684\u539f\u610f\uff0c\u628a\u56de\u7b54\u7a0d\u5fae\u8865\u5b8c\u6574\uff1a\u5148\u76f4\u63a5\u56de\u7b54\uff0c\u518d\u52a0\u4e00\u4e2a\u7b80\u5355\u539f\u56e0\u3002",
    extensions: [
      {
        type_cn: "\u8865\u5145\u539f\u56e0",
        sentence_en: "because it makes me feel more comfortable.",
      },
      {
        type_cn: "\u8865\u5145\u9891\u7387",
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
    value === "\u91c7\u7eb3\u5efa\u8bae" ||
    value === "\u8868\u8fbe\u6539\u5584" ||
    value === "\u4ecd\u9700\u8c03\u6574"
  ) {
    return value;
  }

  return "\u8868\u8fbe\u6539\u5584";
}

export function createMockRetryFeedbackResult(
  input: RetryFeedbackInput,
): RetryFeedbackResult {
  const judgement = createAiRetryJudgement(input);
  const mapped = mapAiRetryJudgementToFeedback(judgement);

  return {
    feedback_type: mapApiRetryFeedbackTypeToLocal(mapped.feedbackType),
    feedback_text: mapped.feedbackText,
  };
}
export function createAiRetryJudgement(input: RetryFeedbackInput): A04Judgement {
  const first = input.first_cleaned_transcript ?? input.first_answer;
  const retry = input.retry_cleaned_transcript ?? input.retry_answer;
  const answeredCoreQuestion = isAiCoreRetryAnswer(input, retry);
  const repeatedOriginal = isAiComparableSame(first, retry);
  const adoptedSuggestion = getAiA04AdoptionState(input, retry);
  const introducedNewError = !hasGrammarIssue(first) && hasGrammarIssue(retry);
  const firstAnsweredCore = isAiCoreRetryAnswer(input, first);

  return {
    answeredCoreQuestion,
    preservedOriginalMeaning: answeredCoreQuestion || !firstAnsweredCore,
    adoptedSuggestion,
    independentlyImproved:
      answeredCoreQuestion &&
      !repeatedOriginal &&
      adoptedSuggestion === "none" &&
      (countAiComparableWords(retry) > countAiComparableWords(first) ||
        sharedContentWordCount(
          normalizeComparableText(first),
          normalizeComparableText(retry),
        ) >= 2),
    repeatedOriginal,
    introducedNewError,
    containsOffTopicPart:
      answeredCoreQuestion &&
      hasAiOffTopicTail(input.question_text, input.answerStructureType, retry),
    regressed: firstAnsweredCore && !answeredCoreQuestion,
  };
}

export function isAiCoreRetryAnswer(
  input: RetryFeedbackInput,
  answerText: string,
) {
  const answer = normalizeComparableText(answerText);
  const intent = getPart1Intent(input.question_text, input.answerStructureType);

  if (!answer || hasAiMetaOrNoAnswerExpression(answerText) || isNoiseOrFillerAnswer(answerText)) {
    return false;
  }

  if (intent === "age") {
    return /\b\d{1,2}\b|\byears? old\b|\b(twenty|thirty|forty|fifty|sixty)\b/.test(answer);
  }

  if (intent === "living_place" || intent === "place") {
    return isLikelyPlaceAnswerText(answerText);
  }

  if (intent === "frequency") {
    return /\b(always|usually|often|sometimes|rarely|never|every|once|twice|daily|weekly|monthly)\b/.test(answer);
  }

  if (
    input.answerStructureType === "past_present_compare" ||
    /\bwhen did you start\b/i.test(input.question_text)
  ) {
    return /\b(ago|last|since|yesterday|today|year|month|week|day|started|before|past)\b/.test(answer);
  }

  if (isLikelyYesNoQuestion(input.question_text, input.answerStructureType)) {
    return /^(yes|no|yeah|nope|not really|sometimes|usually|maybe|sure)\b/.test(answer);
  }

  return countEnglishWords(answer) >= 3;
}

export function hasAiOffTopicTail(
  questionText: string,
  answerStructureType: AnswerStructureType | undefined,
  retryAnswer: string,
) {
  const intent = getPart1Intent(questionText, answerStructureType);
  const answer = normalizeComparableText(retryAnswer);

  if (intent === "age") {
    return /\b(live|lived|city|hometown|school|work|job|for \d+ years?|since)\b/.test(answer);
  }

  if (intent === "living_place" || intent === "place") {
    return /\b(age|years old|work as|study major)\b/.test(answer);
  }

  return false;
}

function getAiA04AdoptionState(
  input: RetryFeedbackInput,
  retryAnswer: string,
): A04AdoptionState {
  const retry = normalizeComparableText(retryAnswer);
  const polished = normalizeComparableText(input.polished_answer);
  const extension = normalizeComparableText(input.expansion_sentence ?? "");
  const suggestion = normalizeComparableText(
    `${input.polished_answer} ${input.expansion_sentence ?? ""}`,
  );

  if (extension && extension.length >= 12 && retry.includes(extension)) {
    return "full";
  }

  if (polished && polished.length >= 12 && retry.includes(polished)) {
    return "full";
  }

  if (suggestion && sharedContentWordCount(suggestion, retry) >= 4) {
    return "partial";
  }

  if (suggestion && sharedContentWordCount(suggestion, retry) >= 3) {
    return "synonym";
  }

  return "none";
}

function isAiComparableSame(first: string, retry: string) {
  const normalizedFirst = normalizeComparableText(first);
  const normalizedRetry = normalizeComparableText(retry);

  return (
    Boolean(normalizedFirst && normalizedRetry) &&
    normalizedFirst === normalizedRetry
  );
}

export function mapAiRetryJudgementToFeedback(
  judgement: A04Judgement,
): ApiRetryFeedbackMapping {
  if (judgement.answeredCoreQuestion && judgement.containsOffTopicPart) {
    return {
      feedbackType: "needs_adjustment",
      feedbackText:
        "\u524d\u534a\u53e5\u5df2\u7ecf\u56de\u7b54\u4e86\u9898\u76ee\uff0c\u540e\u9762\u7684\u5185\u5bb9\u548c\u95ee\u9898\u5173\u7cfb\u4e0d\u5927\uff0c\u53ef\u4ee5\u5220\u6389\u6216\u6362\u6210\u66f4\u76f8\u5173\u7684\u8865\u5145~",
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
        ? "\u8fd9\u6b21\u548c\u7b2c\u4e00\u6b21\u56de\u7b54\u57fa\u672c\u4e00\u6837\uff0c\u53ef\u4ee5\u8bd5\u7740\u52a0\u5165\u4e0a\u6b21\u7684\u4e00\u53e5\u6da6\u8272\u6216\u6269\u5c55\u5185\u5bb9~"
        : "\u8fd9\u6b21\u8fd8\u9700\u8981\u518d\u8c03\u6574\u4e00\u4e0b\uff0c\u5148\u76f4\u63a5\u56de\u7b54\u9898\u76ee\uff0c\u518d\u8865\u4e00\u4e2a\u76f8\u5173\u7ec6\u8282~",
    };
  }

  if (judgement.adoptedSuggestion !== "none") {
    return {
      feedbackType: "adopted_suggestion",
      feedbackText: "\u5df2\u7ecf\u628a\u5efa\u8bae\u7528\u8fdb\u56de\u7b54\u4e86\uff0c\u5f88\u68d2\uff01",
    };
  }

  if (judgement.independentlyImproved) {
    return {
      feedbackType: "improved_expression",
      feedbackText: "\u8fd9\u6b21\u56de\u7b54\u66f4\u5b8c\u6574\u4e86\uff0c\u53ef\u4ee5\u7ee7\u7eed\u4fdd\u6301\u8fd9\u4e2a\u65b9\u5411~",
    };
  }

  return {
    feedbackType: "improved_expression",
    feedbackText: "\u8fd9\u6b21\u56de\u7b54\u662f\u6709\u6548\u7684\uff0c\u53ef\u4ee5\u518d\u52a0\u5165\u4e00\u4e2a\u66f4\u5177\u4f53\u7684\u76f8\u5173\u7ec6\u8282~",
  };
}

function mapApiRetryFeedbackTypeToLocal(
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
      "\u5df2\u7ecf\u628a\u5efa\u8bae\u7528\u8fdb\u56de\u7b54\u4e86\uff0c\u5f88\u68d2\uff01",
  };
}

function createMetaExpressionRetryFeedback(
  input: RetryFeedbackInput,
): RetryFeedbackResult {
  void input;
  const feedbackText =
    "\u8fd9\u53e5\u66f4\u50cf\u662f\u5728\u8bf4\u7b54\u9898\u65b9\u6cd5\uff0c\u8fd8\u6ca1\u6709\u771f\u6b63\u56de\u7b54\u9898\u76ee\u3002\u4e0b\u4e00\u6b21\u53ef\u4ee5\u76f4\u63a5\u8bf4\u4f60\u7684\u7b54\u6848\uff0c\u518d\u8865\u4e00\u53e5\u5177\u4f53\u539f\u56e0\u3002";

  return {
    feedback_type: "\u4ecd\u9700\u8c03\u6574" as RetryFeedbackType,
    feedback_text: feedbackText.endsWith("~") ? feedbackText : `${feedbackText}~`,
  };
}

function isBasicallySameAnswer(firstAnswer: string, retryAnswer: string) {
  const first = normalizeComparableText(firstAnswer);
  const retry = normalizeComparableText(retryAnswer);

  if (!first || !retry) {
    return false;
  }

  return first === retry || first.includes(retry) || retry.includes(first);
}

function isCompleteRetryAnswer(retryAnswer: string) {
  const normalized = normalizeComparableText(retryAnswer);
  const words = normalized.split(/\s+/).filter(Boolean);

  return (
    words.length >= 4 &&
    /\b(i|my|it|they|there|this|that|yes|no)\b/.test(normalized)
  );
}

function hasNewGrammarIssue(firstAnswer: string, retryAnswer: string) {
  return !hasGrammarIssue(firstAnswer) && hasGrammarIssue(retryAnswer);
}

function isRetryAnswerRelevant(input: RetryFeedbackInput) {
  const retry = normalizeComparableText(input.retry_answer);
  const question = input.question_text.toLowerCase();

  if (!retry || hasMetaAnswerExpression(input.retry_answer)) {
    return false;
  }

  if (/\b(this question is difficult|hard to answer|i dont know|i don't know|no idea)\b/.test(retry)) {
    return false;
  }

  if (/\bwhat kind of clothes\b/i.test(question)) {
    return /\b(clothes|outfit|outfits|wear|casual|formal|comfortable|relaxed|relaxing)\b/.test(retry);
  }

  if (/\bwhen did you start\b/i.test(question)) {
    return /\b(started|start|ago|since|last|year|month|week|day)\b/.test(retry);
  }

  return true;
}

function hasAdoptedPolishedAnswer(input: RetryFeedbackInput) {
  const polished = normalizeComparableText(input.polished_answer);
  const retry = normalizeComparableText(input.retry_answer);

  if (!polished || polished.length < 12) {
    return false;
  }

  return retry.includes(polished) || sharedContentWordCount(polished, retry) >= 4;
}

function hasSynonymAdoption(input: RetryFeedbackInput) {
  const suggestion = normalizeComparableText(
    `${input.polished_answer} ${input.expansion_sentence ?? ""}`,
  );
  const retry = normalizeComparableText(input.retry_answer);

  if (!retry) {
    return false;
  }

  if (
    /\bwhat kind of clothes\b/i.test(input.question_text) &&
    /\b(outfits?|clothes|wear|casual|comfortable|formal)\b/.test(retry) &&
    /\bbecause\b/.test(retry)
  ) {
    return true;
  }

  if (!suggestion) {
    return false;
  }

  return (
    sharedContentWordCount(suggestion, retry) >= 3 &&
    !isBasicallySameAnswer(input.first_answer, input.retry_answer)
  );
}

function sharedContentWordCount(left: string, right: string) {
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
    left.split(/\s+/).filter((word) => word.length > 2 && !stopWords.has(word)),
  );

  return right
    .split(/\s+/)
    .filter((word) => leftWords.has(word) && !stopWords.has(word)).length;
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
      : ("\u65e0\u9700\u6269\u5c55" as ExpansionType),
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
      questionId: input.question_id ?? `${input.topic_id}-${input.question_index}`,
      questionIndex: input.question_index,
      questionText: input.question_text,
      userTranscript: input.cleaned_transcript ?? input.user_answer,
      cleanedTranscript: input.cleaned_transcript ?? input.user_answer,
      rawTranscript: input.raw_transcript ?? "",
      displayTranscript: input.display_transcript ?? input.cleaned_transcript ?? input.user_answer,
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
      ai_provider: result.aiProvider,
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
      ai_provider: "openai",
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
        questionIndex: input.question_index,
        questionText: input.question_text,
        answerStructureType: input.answerStructureType ?? "",
        firstTranscript: input.first_cleaned_transcript ?? input.first_answer,
        firstCleanedTranscript: input.first_cleaned_transcript ?? input.first_answer,
        polishedAnswer: input.polished_answer,
        extensionSentence: input.expansion_sentence ?? "",
        retryTranscript: input.retry_cleaned_transcript ?? input.retry_answer,
        retryCleanedTranscript: input.retry_cleaned_transcript ?? input.retry_answer,
        retryRawTranscript: input.retry_raw_transcript ?? "",
        retryDisplayTranscript: input.retry_display_transcript ?? input.retry_cleaned_transcript ?? input.retry_answer,
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
      ai_provider: result.aiProvider,
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
      ai_provider: "openai",
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
  transcripts?: {
    rawTranscript?: string;
    cleanedTranscript?: string;
    displayTranscript?: string;
  },
): PolishInput {
  return {
    topic_id: topic.id,
    question_id: question.id,
    topic_title: topic.title,
    question_text: question.text,
    answerStructureType: question.answerStructureType,
    user_answer: userAnswer,
    raw_transcript: transcripts?.rawTranscript ?? userAnswer,
    cleaned_transcript: transcripts?.cleanedTranscript ?? userAnswer,
    display_transcript: transcripts?.displayTranscript ?? userAnswer,
    question_index: questionIndex + 1,
    target_level: "IELTS 6.0-6.5",
  };
}
