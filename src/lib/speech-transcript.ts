import type { AnswerStructureType } from "@/types/practice";

export type TranscriptLanguageIntent =
  | "no_valid_speech"
  | "chinese_answer"
  | "mixed_unclear"
  | "english_answer";

export function normalizeAsrTranscript(rawTranscript: string) {
  let text = rawTranscript
    .normalize("NFKC")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\[[^\]]*(?:noise|music|laugh|applause|silence|inaudible|cough)[^\]]*\]/gi, " ")
    .replace(/\([^)]*(?:noise|music|laugh|applause|silence|inaudible|cough)[^)]*\)/gi, " ")
    .replace(/<[^>]*(?:noise|music|laugh|applause|silence|inaudible|cough)[^>]*>/gi, " ")
    .replace(/[♪♫♬♩★☆◆◇■□●○]/g, " ")
    .replace(/[^\p{L}\p{N}\s'.,!?-]/gu, " ")
    .replace(/([.!?]){2,}/g, "$1")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/([.,!?])(?=\S)/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();

  text = normalizeEnglishPracticeLanguage(text);
  text = normalizeMisheardCorrectionMarkers(text);
  text = applySelfCorrectionCleanup(text);
  text = cleanupSpeechDisfluencies(text);
  text = normalizeAsrFragmentation(text);

  if (text && !/[.!?]$/.test(text)) {
    text = `${text}.`;
  }

  return text;
}

export function classifyTranscriptLanguageIntent(
  rawTranscript: string,
): TranscriptLanguageIntent {
  const normalized = rawTranscript.normalize("NFKC").trim();
  const withoutChineseFillers = normalized.replace(/[嗯呃啊哦唔\s，。！？、,.!?-]+/g, "");
  const chineseChars = normalized.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const englishChars = normalized.match(/[a-z]/gi)?.length ?? 0;
  const digitChars = normalized.match(/\d/g)?.length ?? 0;

  if (!normalized || (!chineseChars && !englishChars && !digitChars)) {
    return "no_valid_speech";
  }

  if (!withoutChineseFillers) {
    return "no_valid_speech";
  }

  const safeChineseEntityPattern =
    /^(?:北京|武汉|上海|广州|深圳|成都|杭州|南京|西安|重庆|天津)$/;

  if (chineseChars > 0 && englishChars === 0) {
    return safeChineseEntityPattern.test(withoutChineseFillers)
      ? "english_answer"
      : "chinese_answer";
  }

  if (chineseChars > 0 && englishChars > 0) {
    const chineseAfterSafeEntities = withoutChineseFillers.replace(
      /北京|武汉|上海|广州|深圳|成都|杭州|南京|西安|重庆|天津/g,
      "",
    );

    if (/[\u4e00-\u9fff]/.test(chineseAfterSafeEntities)) {
      return englishChars > 0 ? "mixed_unclear" : "chinese_answer";
    }
  }

  return "english_answer";
}

export function normalizeEnglishPracticeLanguage(text: string) {
  const normalizedCityNames: Record<string, string> = {
    北京: "Beijing",
    武汉: "Wuhan",
    上海: "Shanghai",
    广州: "Guangzhou",
    深圳: "Shenzhen",
    成都: "Chengdu",
    杭州: "Hangzhou",
    南京: "Nanjing",
    西安: "Xi'an",
    重庆: "Chongqing",
    天津: "Tianjin",
  };

  let normalizedText = text
    .replace(/[嗯呃啊哦唔]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  Object.entries(normalizedCityNames).forEach(([zh, en]) => {
    normalizedText = normalizedText.replace(new RegExp(zh, "g"), ` ${en} `);
  });

  normalizedText = normalizedText
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/([.,!?])(?=\S)/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();

  if (/[\u4e00-\u9fff]/.test(normalizedText)) {
    return "";
  }

  return normalizedText;
}

export function normalizeDisplayTranscript(rawTranscript: string) {
  const text = normalizeAsrFragmentation(
    normalizeDisplayPracticeLanguage(rawTranscript)
      .replace(/\p{Extended_Pictographic}/gu, "")
      .replace(
        /\[[^\]]*(?:noise|music|laugh|applause|silence|inaudible|cough)[^\]]*\]/gi,
        " ",
      )
      .replace(
        /\([^)]*(?:noise|music|laugh|applause|silence|inaudible|cough)[^)]*\)/gi,
        " ",
      )
      .replace(
        /<[^>]*(?:noise|music|laugh|applause|silence|inaudible|cough)[^>]*>/gi,
        " ",
      )
      .replace(/[♪♫♬♩★☆◆◇■□●○]/g, " ")
      .replace(/[^\p{L}\p{N}\s'.,!?-]/gu, " "),
  )
    .replace(/([.!?]){2,}/g, "$1")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/([.,!?])(?=\S)/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return "";
  }

  const sentenceMatches = Array.from(text.matchAll(/[^.!?]+[.!?]?/g))
    .map((match) => match[0].trim())
    .filter(Boolean);

  if (sentenceMatches.length <= 1) {
    return capitalizeDisplaySentence(fixStandaloneDisplayPronoun(text));
  }

  const mergedSentences: string[] = [];

  sentenceMatches.forEach((sentence) => {
    const normalizedSentence = sentence.replace(/[.!?]$/, "").trim();
    const previous = mergedSentences.at(-1);

    if (previous && shouldMergeDisplayFragment(previous, normalizedSentence)) {
      mergedSentences[mergedSentences.length - 1] = `${previous.replace(
        /[.!?]$/,
        "",
      )} ${lowercaseInitialForDisplay(normalizedSentence)}`;
      return;
    }

    mergedSentences.push(normalizedSentence);
  });

  return mergedSentences
    .map((sentence) => capitalizeDisplaySentence(fixStandaloneDisplayPronoun(sentence)))
    .map((sentence) => (/[.!?]$/.test(sentence) ? sentence : `${sentence}.`))
    .join(" ");
}

function normalizeDisplayPracticeLanguage(text: string) {
  return text
    .normalize("NFKC")
    .replace(/[嗯呃啊哦唔]+/g, " um ")
    .replace(/\b(sorry|no|actually)\s*,?\s+i['’]?m\s+in\b/gi, "$1, I mean in")
    .replace(/\s+/g, " ")
    .trim();
}

function fixStandaloneDisplayPronoun(text: string) {
  return text.replace(/\bi\b/gi, "I");
}

export function normalizeAsrFragmentation(text: string) {
  const normalizedText = text
    .replace(/([.!?]){2,}/g, "$1")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/([.,!?])(?=\S)/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();

  const sentenceMatches = Array.from(normalizedText.matchAll(/[^.!?]+[.!?]?/g))
    .map((match) => match[0].trim())
    .filter(Boolean);

  if (sentenceMatches.length <= 1) {
    return normalizedText;
  }

  const mergedSentences: string[] = [];

  sentenceMatches.forEach((sentence) => {
    const normalizedSentence = sentence.replace(/[.!?]$/, "").trim();
    const previous = mergedSentences.at(-1);

    if (previous && shouldMergeDisplayFragment(previous, normalizedSentence)) {
      mergedSentences[mergedSentences.length - 1] = `${previous.replace(
        /[.!?]$/,
        "",
      )} ${lowercaseInitialForDisplay(normalizedSentence)}`;
      return;
    }

    mergedSentences.push(normalizedSentence);
  });

  return mergedSentences
    .map((sentence) => (/[.!?]$/.test(sentence) ? sentence : `${sentence}.`))
    .join(" ");
}

function shouldMergeDisplayFragment(previous: string, next: string) {
  const previousWords = countDisplayWords(previous);
  const nextWords = countDisplayWords(next);
  const combinedWords = previousWords + nextWords;

  if (!previous || !next || combinedWords > 14) {
    return false;
  }

  if (endsWithConnectorFragment(previous) || startsWithDependentFragment(next)) {
    return true;
  }

  if (startsWithDependentFragment(previous) && startsIndependentSentence(next)) {
    return true;
  }

  if (
    previousWords <= 5 &&
    startsIndependentSentence(next) &&
    isIncompleteClause(previous)
  ) {
    return true;
  }

  if (previousWords <= 2 && nextWords <= 6 && !startsIndependentSentence(next)) {
    return true;
  }

  if (
    previousWords <= 5 &&
    nextWords <= 4 &&
    !containsFiniteVerb(next) &&
    !startsIndependentSentence(next)
  ) {
    return true;
  }

  return false;
}

function endsWithConnectorFragment(text: string) {
  return /\b(?:because|and|but|so|when|if|although|though|while)\s*$/i.test(
    text.trim(),
  );
}

function startsWithDependentFragment(text: string) {
  return /^(?:because|and|but|so|when|if|although|though|while|very|quite|really|at|because of)\b/i.test(
    text.trim(),
  );
}

function isIncompleteClause(text: string) {
  return /\b(?:i|we|you|they|he|she|it)\s+(?:will|would|can|could|should|may|might|am|is|are|was|were|feel|feels|felt|prefer|like|enjoy|try)\s*$/i.test(
    text.trim(),
  );
}

function countDisplayWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function startsIndependentSentence(text: string) {
  return /^(i|we|you|they|he|she|there|this|that|yes|no|but|and)\b/i.test(
    text.trim(),
  );
}

function containsFiniteVerb(text: string) {
  return /\b(am|is|are|was|were|do|does|did|have|has|had|live|like|prefer|think|feel|study|work|go|use|started?)\b/i.test(
    text,
  );
}

function lowercaseInitialForDisplay(text: string) {
  return text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;
}

function capitalizeDisplaySentence(text: string) {
  const trimmedText = text.trim();

  return trimmedText
    ? `${trimmedText.charAt(0).toUpperCase()}${trimmedText.slice(1)}`
    : trimmedText;
}

export function applySelfCorrectionCleanup(text: string) {
  const correctionPatterns = [
    /\b(?:sorry|no|actually)\s*,?\s*(?:i mean|what i mean is|i meant)\s+/gi,
    /\b(?:sorry|no|actually)\s*,?\s+/gi,
    /\b(?:i mean|what i mean is|i meant)\s*,?\s+/gi,
  ];
  let cleanedText = text;

  correctionPatterns.forEach((pattern) => {
    const matches = Array.from(cleanedText.matchAll(pattern));
    const lastMatch = matches.at(-1);

    if (!lastMatch || lastMatch.index === undefined) {
      return;
    }

    const prefix = cleanedText.slice(0, lastMatch.index).trim();
    const correction = cleanedText
      .slice(lastMatch.index + lastMatch[0].length)
      .trim();
    const subjectPrefix = startsWithAnswerSubject(correction)
      ? ""
      : inferCorrectionPrefix(prefix);

    cleanedText = `${subjectPrefix}${correction}`.trim();
  });

  return cleanedText
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}

function normalizeMisheardCorrectionMarkers(text: string) {
  return text.replace(
    /\b(sorry|no|actually)\s*,?\s+i['’]?m\s+in\b/gi,
    "$1, I mean in",
  );
}

function startsWithAnswerSubject(text: string) {
  return /^(i|i'm|i am|my|it|it's|it is|yes|no)\b/i.test(text.trim());
}

function inferCorrectionPrefix(prefix: string) {
  const normalizedPrefix = prefix.trim();

  if (/\bi live in\s+[^,.!?]+[,.!?]?$/i.test(normalizedPrefix)) {
    return "I live in ";
  }

  if (/\bi am from\s+[^,.!?]+[,.!?]?$/i.test(normalizedPrefix)) {
    return "I am from ";
  }

  if (/\bi'?m from\s+[^,.!?]+[,.!?]?$/i.test(normalizedPrefix)) {
    return "I'm from ";
  }

  if (/\bi work (?:as|in|at)\s+[^,.!?]+[,.!?]?$/i.test(normalizedPrefix)) {
    const match = normalizedPrefix.match(/\b(i work (?:as|in|at)\s+)/i);
    return match?.[1] ?? "";
  }

  if (/\bi study\s+[^,.!?]+[,.!?]?$/i.test(normalizedPrefix)) {
    return "I study ";
  }

  return "";
}

export function cleanupSpeechDisfluencies(text: string) {
  return text
    .replace(/\b(?:um|uh|er|ah|hmm)\b[,\s]*/gi, "")
    .replace(/\b(i'm|i am)\s*,\s*\1\b/gi, "$1")
    .replace(/\b(i|we|you|they)\s*,\s*\1\b/gi, "$1")
    .replace(/\b(i'm|i am)\s*,\s+(?=\d|twenty|thirty|forty|fifty|sixty)\b/gi, "$1 ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}

export function hasValidAnswerText({
  cleanedTranscript,
  questionText,
  answerStructureType,
}: {
  cleanedTranscript: string;
  questionText: string;
  answerStructureType: AnswerStructureType;
}) {
  const normalizedText = cleanedTranscript
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedText) {
    return false;
  }

  const words = normalizedText.split(" ").filter(Boolean);
  const fillerWords = new Set([
    "um",
    "uh",
    "er",
    "ah",
    "hmm",
    "mmm",
    "la",
    "ha",
    "oh",
    "wow",
  ]);
  const meaningfulWords = words.filter((word) => !fillerWords.has(word));

  if (meaningfulWords.length === 0) {
    return false;
  }

  const answerText = meaningfulWords.join(" ");
  const allowsShortAnswer = allowsShortAnswerForQuestion(
    questionText,
    answerStructureType,
    answerText,
  );

  if (allowsShortAnswer && meaningfulWords.length <= 2) {
    return hasShortAnswerSignal(answerText, questionText, answerStructureType);
  }

  return (
    meaningfulWords.length >= 3 ||
    /^(yes|no|yeah|nope|sometimes|usually|maybe|sure)$/.test(answerText)
  );
}

function allowsShortAnswerForQuestion(
  questionText: string,
  answerStructureType: AnswerStructureType,
  answerText: string,
) {
  const question = questionText.toLowerCase();

  return (
    /\bhow old\b/.test(question) ||
    /\b(where do you live|where are you from|hometown|city|town|village)\b/.test(
      question,
    ) ||
    /\bwhen did you|when do you|how often|do you often|usually\b/.test(
      question,
    ) ||
    /^(yes|no|yeah|nope|not really|sometimes|usually|maybe|sure)$/.test(
      answerText,
    ) ||
    answerStructureType === "basic_fact" ||
    answerStructureType === "frequency_situation" ||
    answerStructureType === "yes_no_reason" ||
    answerStructureType === "past_present_compare" ||
    answerStructureType === "choice_compare"
  );
}

function hasShortAnswerSignal(
  answerText: string,
  questionText: string,
  answerStructureType: AnswerStructureType,
) {
  const question = questionText.toLowerCase();

  if (/^(yes|no|yeah|nope|not really|sometimes|usually|maybe|sure)$/.test(answerText)) {
    return true;
  }

  if (/\bhow old\b/.test(question)) {
    return (
      /\b\d{1,2}\b/.test(answerText) ||
      /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty)(?:[-\s](?:one|two|three|four|five|six|seven|eight|nine))?\b/.test(
        answerText,
      ) ||
      /\byears?\s+old\b/.test(answerText)
    );
  }

  if (
    /\b(where do you live|where are you from|hometown|city|town|village)\b/.test(
      question,
    )
  ) {
    return /^[a-z][a-z'-]*(?:\s+[a-z][a-z'-]*)?$/.test(answerText);
  }

  if (
    /\bwhen did you|when do you\b/.test(question) ||
    answerStructureType === "past_present_compare"
  ) {
    return /\b(ago|last|since|yesterday|today|year|month|week|day|morning|evening|night)\b/.test(
      answerText,
    );
  }

  if (
    /\bhow often|do you often|usually\b/.test(question) ||
    answerStructureType === "frequency_situation"
  ) {
    return /\b(always|usually|often|sometimes|rarely|never|every|once|twice|daily|weekly|monthly)\b/.test(
      answerText,
    );
  }

  if (answerStructureType === "choice_compare" || /\bprefer\b|\brather\b/.test(question)) {
    return hasChoiceAnswerSignal(answerText, questionText);
  }

  return false;
}

function hasChoiceAnswerSignal(answerText: string, questionText: string) {
  const answerWords = answerText.split(/\s+/).filter(Boolean);

  if (answerWords.length === 0 || answerWords.length > 4) {
    return false;
  }

  if (/\b(?:prefer|rather|choose)\b/.test(answerText)) {
    return true;
  }

  const stopWords = new Set([
    "do",
    "you",
    "prefer",
    "to",
    "wear",
    "or",
    "and",
    "the",
    "a",
    "an",
    "kind",
    "of",
    "clothes",
    "study",
    "at",
    "in",
    "like",
    "what",
    "which",
    "would",
    "rather",
  ]);
  const questionOptionWords = new Set(
    questionText
      .toLowerCase()
      .replace(/[^a-z0-9'\s-]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word)),
  );

  return answerWords.some((word) => questionOptionWords.has(word));
}
