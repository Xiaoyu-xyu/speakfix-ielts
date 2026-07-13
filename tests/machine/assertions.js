const ENGLISH_TEACHING_OR_STATUS_PATTERNS = [
  /\byou haven'?t\b/i,
  /\bstart with\b/i,
  /\btry again\b/i,
  /\brecord again\b/i,
  /\bre-?record\b/i,
  /\bplease answer\b/i,
  /\byou should\b/i,
  /\byou need to\b/i,
  /\bnot answered\b/i,
  /\banswer the question\b/i,
];

const CHINESE_PATTERN = /[\u4e00-\u9fff]/;
const A04_FEEDBACK_TYPES = new Set([
  "adopted_suggestion",
  "improved_expression",
  "needs_adjustment",
]);
const VALID_SOURCES = new Set(["llm", "mock_fallback", "asr", "none", "dry_run"]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getByPath(value, pathExpression) {
  return String(pathExpression)
    .split(".")
    .filter(Boolean)
    .reduce((current, segment) => {
      if (current === undefined || current === null) {
        return undefined;
      }

      return current[segment];
    }, value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function containsForbiddenAnswerFieldText(text) {
  return (
    typeof text === "string" &&
    (CHINESE_PATTERN.test(text) ||
      ENGLISH_TEACHING_OR_STATUS_PATTERNS.some((pattern) => pattern.test(text)))
  );
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function includesAny(text, values) {
  const normalized = normalizeText(text);

  return (values || []).some((value) => normalized.includes(normalizeText(value)));
}

function answerFieldText(evidence) {
  return {
    polishedAnswer: evidence.A03Response?.polishedAnswer || "",
    extensionSentence: evidence.A03Response?.extensionSentence || "",
  };
}

function directlyRepeatableEnglish(text) {
  return (
    typeof text === "string" &&
    text.trim().length > 0 &&
    /[a-z]/i.test(text) &&
    !containsForbiddenAnswerFieldText(text)
  );
}

function assertExpectedStatus(testCase, evidence) {
  const expected = testCase.expectedStatus;

  if (!expected) {
    return result(true, "expectedStatus", "No expectedStatus configured.", {});
  }

  let actual = evidence.status;

  if (evidence.A04Response?.feedbackType) {
    actual = evidence.A04Response.feedbackType;
  } else if (evidence.coverageStatus) {
    actual = evidence.coverageStatus;
  }

  const equivalentStatuses = {
    meta_or_no_answer: ["meta_or_no_answer", "no_valid_speech"],
    chinese_answer: ["chinese_answer"],
    normal: ["normal"],
    adopted_suggestion: ["adopted_suggestion"],
    improved_expression: ["improved_expression"],
    needs_feedback_not_normal_polish: [
      "off_topic_or_meta",
      "meta_or_no_answer",
      "no_valid_speech",
      "needs_feedback_not_normal_polish",
    ],
    partially_covered_without_client_fallback: [
      "partially_covered_without_client_fallback",
    ],
    second_phase_required: ["second_phase_required"],
  };
  const allowed = equivalentStatuses[expected] || [expected];

  return result(
    allowed.includes(actual),
    "expectedStatus",
    allowed.includes(actual)
      ? "Actual status matches expectedStatus."
      : `Expected status ${expected}, got ${actual}.`,
    { expected, actual, allowed },
  );
}

function assertForbiddenContent(testCase, evidence) {
  const fields = answerFieldText(evidence);
  const configuredForbidden = testCase.forbiddenContent || [];
  const invalid = [];

  for (const [field, value] of Object.entries(fields)) {
    const matchedConfigured = configuredForbidden.filter((item) =>
      normalizeText(value).includes(normalizeText(item)),
    );
    const matchedGeneric = ENGLISH_TEACHING_OR_STATUS_PATTERNS
      .filter((pattern) => pattern.test(value))
      .map((pattern) => pattern.toString());
    const hasChinese = CHINESE_PATTERN.test(value);

    if (matchedConfigured.length || matchedGeneric.length || hasChinese) {
      invalid.push({
        field,
        value,
        matchedConfigured,
        matchedGeneric,
        hasChinese,
      });
    }
  }

  return result(
    invalid.length === 0,
    "forbiddenContent",
    "A03 answer fields must not contain configured forbidden content, teaching/status text, or Chinese.",
    { invalid, checkedFields: Object.keys(fields) },
  );
}

function result(passed, assertion, message, evidence) {
  return {
    assertion,
    passed,
    message,
    evidence,
  };
}

function assertFixtureRequiredFields(testCase) {
  const required = [
    "caseId",
    "caseType",
    "nodeOrChain",
    "topicId",
    "topicTitle",
    "questionId",
    "questionIndex",
    "questionText",
    "answerStructureType",
    "input",
    "expectedPath",
    "expectedStatus",
    "requiredFields",
    "forbiddenContent",
    "machineAssertions",
    "manualReviewPoints",
  ];
  const missing = required.filter((field) => !(field in testCase));

  return result(
    missing.length === 0,
    "fixtureRequiredFields",
    missing.length ? `Missing fixture fields: ${missing.join(", ")}` : "Fixture fields are present.",
    { missing },
  );
}

function assertEvidenceRequiredFields(testCase, evidence) {
  const missing = (testCase.requiredFields || []).filter((field) => {
    const value = getByPath(evidence, field);
    return value === undefined || value === "";
  });

  return result(
    missing.length === 0,
    "evidenceRequiredFields",
    missing.length ? `Missing evidence fields: ${missing.join(", ")}` : "Required evidence fields are present.",
    { missing },
  );
}

function assertSource(evidence) {
  const sources = [
    evidence.source,
    evidence.A02Response?.source,
    evidence.A03Response?.source,
    evidence.A04Response?.source,
  ].filter(Boolean);
  const invalid = sources.filter((source) => !VALID_SOURCES.has(source));

  return result(
    invalid.length === 0,
    "source",
    invalid.length ? `Invalid source value(s): ${invalid.join(", ")}` : "Source values are valid.",
    { sources, invalid },
  );
}

function assertFallbackReason(evidence) {
  const values = [
    evidence.fallbackReason,
    evidence.A02Response?.fallbackReason,
    evidence.A03Response?.fallbackReason,
    evidence.A04Response?.fallbackReason,
  ].filter((value) => value !== undefined);
  const invalid = values.filter(
    (value) => value !== null && typeof value !== "string",
  );

  return result(
    invalid.length === 0,
    "fallbackReason",
    invalid.length ? "fallbackReason must be null or string." : "fallbackReason values are valid.",
    { values, invalid },
  );
}

function assertQuestionSnapshot(testCase, evidence) {
  const failures = [];

  if (evidence.topic?.id && evidence.topic.id !== testCase.topicId) {
    failures.push("topicId mismatch");
  }

  if (evidence.question?.text && evidence.question.text !== testCase.questionText) {
    failures.push("questionText mismatch");
  }

  if (
    evidence.questionIndex !== undefined &&
    testCase.questionIndex > 0 &&
    evidence.questionIndex !== testCase.questionIndex
  ) {
    failures.push("questionIndex mismatch");
  }

  return result(
    failures.length === 0,
    "topicQuestionSnapshot",
    failures.length ? failures.join("; ") : "Topic/question snapshot is consistent.",
    {
      expected: {
        topicId: testCase.topicId,
        questionText: testCase.questionText,
        questionIndex: testCase.questionIndex,
      },
      actual: {
        topicId: evidence.topic?.id,
        questionText: evidence.question?.text,
        questionIndex: evidence.questionIndex,
      },
    },
  );
}

function assertA05EnglishValid(evidence) {
  return result(
    evidence.status === "normal" && hasText(evidence.cleanedTranscript),
    "a05EnglishValid",
    evidence.status === "normal"
      ? "A05 produced a valid English transcript."
      : "A05 did not produce a normal valid transcript.",
    {
      status: evidence.status,
      rawTranscript: evidence.rawTranscript,
      cleanedTranscript: evidence.cleanedTranscript,
      displayTranscript: evidence.displayTranscript,
    },
  );
}

function assertA05SelfCorrectionSeparation(evidence) {
  const raw = String(evidence.rawTranscript || "").toLowerCase();
  const display = String(evidence.displayTranscript || "").toLowerCase();
  const cleaned = String(evidence.cleanedTranscript || "").toLowerCase();
  const hasOriginalCorrection = raw.includes("sorry") || raw.includes("i mean");
  const displayPreserves = display.includes("sorry") || display.includes("i mean");
  const cleanedDropsMarker = !cleaned.includes("sorry") && !cleaned.includes("i mean");

  return result(
    hasOriginalCorrection && displayPreserves && cleanedDropsMarker,
    "a05SelfCorrectionSeparation",
    "raw/display should preserve correction trace while cleaned keeps final semantics.",
    { raw, display, cleaned },
  );
}

function assertA05ChineseDivertedBeforeA03(evidence) {
  return result(
    evidence.status === "chinese_answer" && !evidence.A03Request,
    "a05ChineseDivertedBeforeA03",
    "Chinese answer should divert before A03.",
    { status: evidence.status, A03Request: evidence.A03Request },
  );
}

function assertInvalidInputDoesNotCreateA03Request(evidence) {
  return result(
    !evidence.A03Request,
    "invalidInputDoesNotCreateA03Request",
    "Invalid A05 input should not create an A03 request.",
    { A03Request: evidence.A03Request },
  );
}

function assertA03RequestUsesCleanedTranscriptOnly(evidence) {
  const request = evidence.A03Request || {};
  const expected = evidence.cleanedTranscript;
  const userTranscript = request.userTranscript ?? request.cleanedTranscript;
  const polluted = evidence.A02Response
    ? JSON.stringify(request).includes(JSON.stringify(evidence.A02Response))
    : false;

  return result(
    userTranscript === expected && !polluted,
    "a03RequestUsesCleanedTranscriptOnly",
    "A03 request must use cleanedTranscript as user answer and not include A02 output.",
    { expected, userTranscript, request },
  );
}

function assertA02OutputDoesNotPolluteA03(evidence) {
  const a02Text = JSON.stringify(evidence.A02Response || {});
  const a03Answer = String(evidence.A03Request?.userTranscript || "");
  const exactMismatch =
    evidence.A03Request &&
    evidence.cleanedTranscript !== undefined &&
    a03Answer !== evidence.cleanedTranscript;
  const polluted =
    a02Text &&
    a02Text !== "{}" &&
    a02Text
      .split(/[^A-Za-z]+/)
      .filter((word) => word.length >= 6)
      .some((word) => a03Answer.toLowerCase().includes(word.toLowerCase()));

  return result(
    !polluted && !exactMismatch,
    "a02OutputDoesNotPolluteA03",
    "A02 content should not be appended to A03 user answer.",
    {
      A02Response: evidence.A02Response,
      A03UserTranscript: a03Answer,
      cleanedTranscript: evidence.cleanedTranscript,
      exactMismatch,
      polluted,
    },
  );
}

function assertA03PolishedAnswerContract(evidence) {
  const response = evidence.A03Response;

  if (!response) {
    return result(false, "a03PolishedAnswerContract", "Missing A03 response.", {});
  }

  return result(
    directlyRepeatableEnglish(response.polishedAnswer),
    "a03PolishedAnswerContract",
    "polishedAnswer must be directly repeatable English without teaching/status text.",
    { polishedAnswer: response.polishedAnswer },
  );
}

function assertA03ExtensionContract(evidence) {
  const response = evidence.A03Response;

  if (!response) {
    return result(false, "a03ExtensionContract", "Missing A03 response.", {});
  }

  const extension = response.extensionSentence || "";
  const valid = !extension.trim() || directlyRepeatableEnglish(extension);

  return result(
    valid,
    "a03ExtensionContract",
    "extension must be empty or directly repeatable English without teaching/status text.",
    { extensionSentence: extension },
  );
}

function assertNoTeachingTextInA03AnswerFields(evidence) {
  const response = evidence.A03Response || {};
  const fields = {
    polishedAnswer: response.polishedAnswer || "",
    extensionSentence: response.extensionSentence || "",
  };
  const invalid = Object.entries(fields).filter(([, value]) =>
    containsForbiddenAnswerFieldText(value),
  );

  return result(
    invalid.length === 0,
    "noTeachingTextInA03AnswerFields",
    "A03 answer fields must not contain teaching/status text or Chinese.",
    { invalid, fields },
  );
}

function assertMetaInputDoesNotBecomeNormalAnswer(evidence) {
  const statusOk = ["meta_or_no_answer", "no_valid_speech"].includes(
    evidence.status,
  );
  const noNormalA03 = !evidence.A03Request && !evidence.A03Response;

  return result(
    statusOk && noNormalA03,
    "metaInputDoesNotBecomeNormalAnswer",
    "Meta/no-answer input must not create a normal A03 polish path.",
    {
      status: evidence.status,
      A03Request: evidence.A03Request,
      A03Response: evidence.A03Response,
    },
  );
}

function assertOffTopicDoesNotBecomeNormalPolish(testCase, evidence) {
  const question = normalizeText(testCase.questionText);
  const answer = normalizeText(evidence.cleanedTranscript || testCase.input);
  const isAgeQuestion = /\bhow old\b/.test(question);
  const hasAgeSignal =
    /\b\d{1,2}\b|\byears?\s+old\b|\b(twenty|thirty|forty|fifty|sixty)\b/.test(
      answer,
    );
  const hasDifferentAnswerShape = /\b(i live|live in|from|city|town|village|hometown)\b/.test(
    answer,
  );
  const shouldBeAbnormal = isAgeQuestion && !hasAgeSignal && hasDifferentAnswerShape;
  const isNormalPolishPath =
    evidence.status === "normal" &&
    evidence.A03Request &&
    evidence.A03Response &&
    directlyRepeatableEnglish(evidence.A03Response.polishedAnswer || "");

  return result(
    !shouldBeAbnormal || !isNormalPolishPath,
    "offTopicDoesNotBecomeNormalPolish",
    "Structurally off-topic input must not be treated as a normal polish path.",
    { shouldBeAbnormal, isNormalPolishPath, status: evidence.status },
  );
}

function assertFinalMeaningContains(testCase, evidence) {
  const expected = testCase.expectedFinalMeaning || {};
  const missingCleaned = (expected.cleanedContains || []).filter(
    (value) => !includesAny(evidence.cleanedTranscript, [value]),
  );
  const missingDisplay = (expected.displayContains || []).filter(
    (value) => !includesAny(evidence.displayTranscript, [value]),
  );

  return result(
    missingCleaned.length === 0 && missingDisplay.length === 0,
    "finalMeaningContains",
    "Final/display transcripts must contain configured meaning signals.",
    {
      missingCleaned,
      missingDisplay,
      cleanedTranscript: evidence.cleanedTranscript,
      displayTranscript: evidence.displayTranscript,
    },
  );
}

function assertFinalMeaningExcludes(testCase, evidence) {
  const expected = testCase.expectedFinalMeaning || {};
  const presentInCleaned = (expected.cleanedExcludes || []).filter((value) =>
    includesAny(evidence.cleanedTranscript, [value]),
  );

  return result(
    presentInCleaned.length === 0,
    "finalMeaningExcludes",
    "cleanedTranscript must not retain configured denied meaning as final answer.",
    { presentInCleaned, cleanedTranscript: evidence.cleanedTranscript },
  );
}

function assertA03AnswerFieldsExcludeFinalDeniedMeaning(testCase, evidence) {
  const expected = testCase.expectedFinalMeaning || {};
  const fields = answerFieldText(evidence);
  const combined = `${fields.polishedAnswer} ${fields.extensionSentence}`;
  const present = (expected.answerFieldsExclude || []).filter((value) =>
    includesAny(combined, [value]),
  );

  return result(
    present.length === 0,
    "a03AnswerFieldsExcludeFinalDeniedMeaning",
    "A03 normal answer fields must not use denied self-correction content as final answer.",
    { present, fields },
  );
}

function assertA04ReceivesSameQuestionSuggestionContract(testCase, evidence) {
  const request = evidence.A04Request || {};
  const failures = [];

  if (request.topicId !== testCase.topicId) failures.push("topicId");
  if (request.questionId !== testCase.questionId) failures.push("questionId");
  if (request.questionIndex !== testCase.questionIndex) failures.push("questionIndex");
  if (request.questionText !== testCase.questionText) failures.push("questionText");
  if (!hasText(request.firstTranscript)) failures.push("firstTranscript");
  if (!("polishedAnswer" in request)) failures.push("polishedAnswer");
  if (!("extensionSentence" in request)) failures.push("extensionSentence");
  if (!hasText(request.retryTranscript)) failures.push("retryTranscript");

  return result(
    failures.length === 0,
    "a04ReceivesSameQuestionSuggestionContract",
    failures.length ? `A04 contract missing/mismatched: ${failures.join(", ")}` : "A04 received same-question suggestion contract.",
    { request },
  );
}

function assertA04FeedbackEnum(evidence) {
  const feedbackType = evidence.A04Response?.feedbackType;

  return result(
    A04_FEEDBACK_TYPES.has(feedbackType),
    "a04FeedbackEnum",
    "A04 feedbackType must be a legal enum value.",
    { feedbackType },
  );
}

function assertA04FeedbackMatchesExpectedStatus(testCase, evidence) {
  const expected = testCase.expectedStatus;
  const actual = evidence.A04Response?.feedbackType;

  return result(
    actual === expected,
    "a04FeedbackMatchesExpectedStatus",
    "A04 final feedbackType must match fixture expectedStatus.",
    { expected, actual },
  );
}

function assertFallbackFieldsConsistent(evidence) {
  const response = evidence.A03Response || evidence.A04Response || evidence.A02Response || {};
  const source = response.source;
  const fallbackReason = response.fallbackReason;
  const valid =
    source === undefined ||
    (source === "llm" && fallbackReason === null) ||
    (source === "mock_fallback" && typeof fallbackReason === "string") ||
    source === "dry_run";

  return result(
    valid,
    "fallbackFieldsConsistent",
    "Fallback source and fallbackReason must be semantically consistent.",
    { source, fallbackReason },
  );
}

function assertStateIsolationEvidenceShape(evidence) {
  const plan = evidence.stateIsolationPlan;
  const valid =
    isRecord(plan) &&
    Array.isArray(plan.questions) &&
    plan.questions.length === 3 &&
    plan.delayedQuestionIndex === 2;

  return result(
    valid,
    "stateIsolationEvidenceShape",
    "E06 must expose a three-question delay simulation plan.",
    { stateIsolationPlan: plan },
  );
}

function assertE05CoveragePlan(testCase, evidence) {
  const expected = testCase.expectedSubpaths || {};
  const actual = evidence.e05Subpaths || {};
  const mismatched = Object.keys(expected).filter(
    (key) => actual[key] !== expected[key],
  );

  return result(
    mismatched.length === 0,
    "e05CoveragePlan",
    "E05 must expose normal/repair/server fallback/client fallback coverage status.",
    { expected, actual, mismatched },
  );
}

const assertionHandlers = {
  fixtureRequiredFields: (testCase) => assertFixtureRequiredFields(testCase),
  a05EnglishValid: (_testCase, evidence) => assertA05EnglishValid(evidence),
  a05SelfCorrectionSeparation: (_testCase, evidence) =>
    assertA05SelfCorrectionSeparation(evidence),
  a05ChineseDivertedBeforeA03: (_testCase, evidence) =>
    assertA05ChineseDivertedBeforeA03(evidence),
  invalidInputDoesNotCreateA03Request: (_testCase, evidence) =>
    assertInvalidInputDoesNotCreateA03Request(evidence),
  a03RequestUsesCleanedTranscriptOnly: (_testCase, evidence) =>
    assertA03RequestUsesCleanedTranscriptOnly(evidence),
  a02OutputDoesNotPolluteA03: (_testCase, evidence) =>
    assertA02OutputDoesNotPolluteA03(evidence),
  a03PolishedAnswerContract: (_testCase, evidence) =>
    assertA03PolishedAnswerContract(evidence),
  a03ExtensionContract: (_testCase, evidence) => assertA03ExtensionContract(evidence),
  noTeachingTextInA03AnswerFields: (_testCase, evidence) =>
    assertNoTeachingTextInA03AnswerFields(evidence),
  metaInputDoesNotBecomeNormalAnswer: (_testCase, evidence) =>
    assertMetaInputDoesNotBecomeNormalAnswer(evidence),
  offTopicDoesNotBecomeNormalPolish: (testCase, evidence) =>
    assertOffTopicDoesNotBecomeNormalPolish(testCase, evidence),
  finalMeaningContains: (testCase, evidence) =>
    assertFinalMeaningContains(testCase, evidence),
  finalMeaningExcludes: (testCase, evidence) =>
    assertFinalMeaningExcludes(testCase, evidence),
  a03AnswerFieldsExcludeFinalDeniedMeaning: (testCase, evidence) =>
    assertA03AnswerFieldsExcludeFinalDeniedMeaning(testCase, evidence),
  a04ReceivesSameQuestionSuggestionContract: (testCase, evidence) =>
    assertA04ReceivesSameQuestionSuggestionContract(testCase, evidence),
  a04FeedbackEnum: (_testCase, evidence) => assertA04FeedbackEnum(evidence),
  a04FeedbackMatchesExpectedStatus: (testCase, evidence) =>
    assertA04FeedbackMatchesExpectedStatus(testCase, evidence),
  fallbackFieldsConsistent: (_testCase, evidence) =>
    assertFallbackFieldsConsistent(evidence),
  e05CoveragePlan: (testCase, evidence) => assertE05CoveragePlan(testCase, evidence),
  stateIsolationEvidenceShape: (_testCase, evidence) =>
    assertStateIsolationEvidenceShape(evidence),
};

function runAssertions(testCase, evidence) {
  const requested = testCase.machineAssertions || [];
  const results = [
    assertFixtureRequiredFields(testCase),
    assertEvidenceRequiredFields(testCase, evidence),
    assertSource(evidence),
    assertFallbackReason(evidence),
    assertQuestionSnapshot(testCase, evidence),
    assertExpectedStatus(testCase, evidence),
    assertForbiddenContent(testCase, evidence),
  ];

  for (const assertionName of requested) {
    if (assertionName === "fixtureRequiredFields") {
      continue;
    }

    const handler = assertionHandlers[assertionName];

    if (!handler) {
      results.push(
        result(false, assertionName, `Unknown assertion: ${assertionName}`, {}),
      );
      continue;
    }

    results.push(handler(testCase, evidence));
  }

  return results;
}

module.exports = {
  A04_FEEDBACK_TYPES,
  directlyRepeatableEnglish,
  runAssertions,
};
