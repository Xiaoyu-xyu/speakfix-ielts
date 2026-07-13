#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const { runAssertions } = require("./assertions");

const ROOT_DIR = path.resolve(__dirname, "../..");
const CASES_PATH = path.join(__dirname, "a02-a05-machine-cases.json");
const RESULTS_DIR = path.join(__dirname, "results");
const DEFAULT_BASE_URL = "http://localhost:3000";
const REQUEST_TIMEOUT_MS = Number(process.env.MACHINE_CHECK_TIMEOUT_MS ?? 20_000);

function registerTypeScriptRuntime() {
  require.extensions[".ts"] = function loadTypeScript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
      fileName: filename,
    });

    module._compile(output.outputText, filename);
  };
}

registerTypeScriptRuntime();

const {
  classifyTranscriptLanguageIntent,
  hasValidAnswerText,
  normalizeAsrTranscript,
  normalizeDisplayTranscript,
} = require(path.join(ROOT_DIR, "src/lib/speech-transcript.ts"));

function timestampForFileName(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const safeData = JSON.parse(JSON.stringify(data));
  fs.writeFileSync(`${filePath}.tmp`, JSON.stringify(safeData, null, 2));
  fs.renameSync(`${filePath}.tmp`, filePath);
}

function getConfig() {
  const args = new Set(process.argv.slice(2));
  const executeRealLlm = args.has("--execute-real-llm");
  const dryRun = !executeRealLlm || args.has("--dry-run");
  const baseUrlArg = process.argv.find((arg) => arg.startsWith("--baseUrl="));

  return {
    dryRun,
    executeRealLlm,
    validateFixtureOnly: args.has("--validate-fixture"),
    baseUrl: baseUrlArg ? baseUrlArg.slice("--baseUrl=".length) : DEFAULT_BASE_URL,
  };
}

function validateFixtureFile(data) {
  const problems = [];

  if (!Array.isArray(data.cases)) {
    problems.push("Fixture must contain cases[].");
    return problems;
  }

  if (data.cases.length !== 18) {
    problems.push(`Expected 18 cases, got ${data.cases.length}.`);
  }

  const ids = new Set();

  data.cases.forEach((testCase, index) => {
    if (!testCase.caseId) {
      problems.push(`Case at index ${index} is missing caseId.`);
      return;
    }

    if (ids.has(testCase.caseId)) {
      problems.push(`Duplicate caseId: ${testCase.caseId}.`);
    }

    ids.add(testCase.caseId);

    for (const field of [
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
    ]) {
      if (!(field in testCase)) {
        problems.push(`${testCase.caseId}: missing ${field}.`);
      }
    }
  });

  return problems;
}

function buildA02Request(testCase) {
  return {
    topicId: testCase.topicId,
    questionId: testCase.questionId,
    questionText: testCase.questionText,
    answerStructureType: testCase.answerStructureType,
  };
}

function buildA03Request(testCase, cleanedTranscript, transcripts) {
  return {
    topicId: testCase.topicId,
    questionId: testCase.questionId,
    questionIndex: testCase.questionIndex,
    questionText: testCase.questionText,
    userTranscript: cleanedTranscript,
    cleanedTranscript,
    rawTranscript: transcripts.rawTranscript,
    displayTranscript: transcripts.displayTranscript,
    answerStructureType: testCase.answerStructureType,
  };
}

function buildA04Request(testCase, firstTranscript, retryTranscript, a03Response) {
  return {
    topicId: testCase.topicId,
    questionId: testCase.questionId,
    questionIndex: testCase.questionIndex,
    questionText: testCase.questionText,
    answerStructureType: testCase.answerStructureType,
    firstTranscript,
    firstCleanedTranscript: firstTranscript,
    polishedAnswer: a03Response?.polishedAnswer ?? "",
    extensionSentence: a03Response?.extensionSentence ?? "",
    retryTranscript,
    retryCleanedTranscript: retryTranscript,
    retryRawTranscript: retryTranscript,
    retryDisplayTranscript: retryTranscript,
  };
}

function createDryRunA02Response() {
  return {
    directionZh: "先直接回答，再补一句",
    keywords: ["dry run", "safe check", "placeholder"],
    sentenceStarters: ["I would say ___.", "It is ___ for me."],
    optionalReminder: "",
    source: "dry_run",
    aiProvider: "siliconflow",
    fallbackReason: null,
    llmLatencyMs: null,
  };
}

function createDryRunA03Response(cleanedTranscript) {
  const safeAnswer = cleanedTranscript && /[a-z0-9]/i.test(cleanedTranscript)
    ? cleanedTranscript
    : "I can give a short answer.";

  return {
    originalSegments: [{ text: cleanedTranscript || "", markType: "none", reason: "" }],
    polishedAnswer: safeAnswer,
    extensionSentence: "",
    hasMeaningfulPolish: false,
    source: "dry_run",
    aiProvider: "siliconflow",
    fallbackReason: null,
    llmLatencyMs: null,
  };
}

function createDryRunA04Response(testCase) {
  const feedbackType =
    testCase.expectedStatus === "adopted_suggestion" ||
    testCase.expectedStatus === "improved_expression"
      ? testCase.expectedStatus
      : "needs_adjustment";

  return {
    feedbackType,
    feedbackText: "dry-run feedback placeholder",
    adoptedExpressions: [],
    source: "dry_run",
    aiProvider: "siliconflow",
    fallbackReason: null,
    llmLatencyMs: null,
  };
}

function getA05Evidence(testCase) {
  if (Array.isArray(testCase.input)) {
    return {
      rawTranscript: "",
      displayTranscript: "",
      cleanedTranscript: "",
      status: "not_executed",
      source: "dry_run",
      fallbackReason: null,
    };
  }

  const rawTranscript = String(testCase.input ?? "");
  const languageIntent = classifyTranscriptLanguageIntent(rawTranscript);
  const displayTranscript =
    languageIntent === "chinese_answer" || languageIntent === "mixed_unclear"
      ? ""
      : normalizeDisplayTranscript(rawTranscript);
  const cleanedTranscript =
    languageIntent === "english_answer" ? normalizeAsrTranscript(rawTranscript) : "";
  const valid =
    languageIntent === "english_answer" &&
    hasValidAnswerText({
      cleanedTranscript,
      questionText: testCase.questionText,
      answerStructureType: testCase.answerStructureType,
    });
  let status = "normal";

  if (languageIntent !== "english_answer") {
    status = languageIntent;
  } else if (!valid) {
    status = "no_valid_speech";
  }

  if (/sorry,\s*could you repeat the question/i.test(rawTranscript)) {
    status = "meta_or_no_answer";
  }

  return {
    rawTranscript,
    displayTranscript,
    cleanedTranscript,
    status,
    source: languageIntent === "english_answer" ? "asr" : "none",
    fallbackReason: status === "normal" ? null : status,
  };
}

async function postJson(url, body) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : null;

    return { ok: response.ok, status: response.status, json };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function maybeCallApi(config, endpoint, body, dryRunResponse) {
  if (config.dryRun) {
    return dryRunResponse;
  }

  const response = await postJson(`${config.baseUrl}${endpoint}`, body);

  if (!response.ok) {
    return {
      source: "mock_fallback",
      fallbackReason: `http_${response.status}`,
      rawResponse: response.json,
    };
  }

  return response.json;
}

function resolveRetryInput(testCase, a03Response) {
  if (isRecord(testCase.retryInput) && testCase.retryInput.mode === "useA03PolishedAnswer") {
    return a03Response?.polishedAnswer || "";
  }

  return typeof testCase.retryInput === "string" ? testCase.retryInput : "";
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deriveConclusion(testCase, assertionResults, config) {
  if (testCase.caseId === "E06") {
    return "PARTIALLY_COVERED";
  }

  if (testCase.caseId === "E05") {
    return "PARTIALLY_COVERED";
  }

  if (config.dryRun) {
    return "NOT_EXECUTED";
  }

  const failed = assertionResults.filter((assertion) => !assertion.passed);

  if (failed.length === 0) {
    return "PASS";
  }

  return failed.some((assertion) =>
    /contract|Required|A03|A04|A05|snapshot/i.test(assertion.assertion + assertion.message),
  )
    ? "FAIL_P0"
    : "FAIL_P1";
}

function classifyFailure(testCase, assertion) {
  if (["N02", "E01"].includes(testCase.caseId)) {
    return "KNOWN_BUSINESS_ISSUE";
  }

  if (["N03", "N07"].includes(testCase.caseId)) {
    return "POTENTIAL_BUSINESS_ISSUE";
  }

  if (assertion.assertion === "evidenceRequiredFields") {
    return "RUNNER_ERROR";
  }

  if (assertion.assertion === "fixtureRequiredFields") {
    return "FIXTURE_ERROR";
  }

  if (
    assertion.assertion === "a03PolishedAnswerContract" &&
    assertion.message === "Missing A03 response."
  ) {
    return "NOT_EVALUABLE_IN_DRY_RUN";
  }

  return "POTENTIAL_BUSINESS_ISSUE";
}

async function executeCase(testCase, config) {
  const a05 = getA05Evidence(testCase);
  const evidence = {
    caseId: testCase.caseId,
    caseType: testCase.caseType,
    topic: { id: testCase.topicId, title: testCase.topicTitle },
    question: {
      id: testCase.questionId,
      text: testCase.questionText,
      answerStructureType: testCase.answerStructureType,
    },
    questionIndex: testCase.questionIndex,
    input: testCase.input,
    retryInput: testCase.retryInput,
    expectedPath: testCase.expectedPath,
    actualPath: config.dryRun ? "dry_run_schema_path" : "api_execution_path",
    rawTranscript: a05.rawTranscript,
    displayTranscript: a05.displayTranscript,
    cleanedTranscript: a05.cleanedTranscript,
    A02Request: null,
    A02Response: null,
    A03Request: null,
    A03Response: null,
    A04Request: null,
    A04Response: null,
    status: a05.status,
    source: a05.source,
    fallbackReason: a05.fallbackReason,
    coverageStatus: null,
    e05Subpaths: null,
    stateIsolationPlan: null,
    machineConclusion: "NOT_EXECUTED",
  };

  if (testCase.caseId === "E05") {
    evidence.coverageStatus = "partially_covered_without_client_fallback";
    evidence.e05Subpaths = {
      normal: "covered_by_dry_run_schema",
      repair: "partially_covered_without_business_hook",
      serverFallback: "partially_covered_without_business_hook",
      clientFallback: "not_covered",
    };
  }

  if (testCase.caseId === "E06") {
    evidence.coverageStatus = "second_phase_required";
    evidence.stateIsolationPlan = {
      delayedQuestionIndex: 2,
      delayMs: 1500,
      questions: testCase.input,
      phase: "second_phase_required",
      strategy:
        "Intercept or mock A03/A04 responses by questionIndex and assert late Q2 response cannot overwrite Q3 state.",
    };
  }

  if (testCase.nodeOrChain.includes("A02")) {
    evidence.A02Request = buildA02Request(testCase);
    evidence.A02Response = await maybeCallApi(
      config,
      "/api/ai/pre-answer",
      evidence.A02Request,
      createDryRunA02Response(),
    );
  }

  const shouldCreateA03 =
    testCase.nodeOrChain.includes("A03") &&
    evidence.status !== "chinese_answer" &&
    evidence.status !== "mixed_unclear" &&
    evidence.status !== "no_valid_speech" &&
    evidence.status !== "meta_or_no_answer" &&
    testCase.caseId !== "E06";

  if (shouldCreateA03) {
    evidence.A03Request = buildA03Request(testCase, a05.cleanedTranscript, a05);
    evidence.A03Response = await maybeCallApi(
      config,
      "/api/ai/polish",
      evidence.A03Request,
      createDryRunA03Response(a05.cleanedTranscript),
    );
  }

  if (testCase.nodeOrChain.includes("A04") && testCase.caseId !== "E06") {
    const retryTranscript = resolveRetryInput(testCase, evidence.A03Response);
    evidence.retryInput = retryTranscript;
    evidence.A04Request = buildA04Request(
      testCase,
      a05.cleanedTranscript,
      retryTranscript,
      evidence.A03Response,
    );
    evidence.A04Response = await maybeCallApi(
      config,
      "/api/ai/retry-feedback",
      evidence.A04Request,
      createDryRunA04Response(testCase),
    );
  }

  evidence.machineConclusion =
    testCase.caseId === "E05" || testCase.caseId === "E06"
      ? "PARTIALLY_COVERED"
      : config.dryRun
        ? "NOT_EXECUTED"
        : "NOT_EXECUTED";
  const assertions = runAssertions(testCase, evidence);
  const failedAssertions = assertions.filter((assertion) => !assertion.passed);

  return {
    ...evidence,
    assertions,
    failedAssertions,
    failureEvidence: failedAssertions.map((assertion) => ({
      assertion: assertion.assertion,
      message: assertion.message,
      evidence: assertion.evidence,
      classification: classifyFailure(testCase, assertion),
    })),
    machineConclusion: deriveConclusion(testCase, assertions, config),
  };
}

function summarize(results) {
  const byCaseType = {};
  const byConclusion = {};

  for (const result of results) {
    byCaseType[result.caseType] ??= { total: 0, executablePass: 0, failed: 0 };
    byCaseType[result.caseType].total += 1;

    if (result.machineConclusion === "PASS") {
      byCaseType[result.caseType].executablePass += 1;
    }

    if (result.machineConclusion.startsWith("FAIL")) {
      byCaseType[result.caseType].failed += 1;
    }

    byConclusion[result.machineConclusion] =
      (byConclusion[result.machineConclusion] ?? 0) + 1;
  }

  return {
    total: results.length,
    byCaseType,
    byConclusion,
  };
}

async function main() {
  const config = getConfig();
  const fixture = readJson(CASES_PATH);
  const validationProblems = validateFixtureFile(fixture);

  if (config.validateFixtureOnly) {
    if (validationProblems.length > 0) {
      console.error(validationProblems.join("\n"));
      process.exitCode = 2;
      return;
    }

    console.log(`fixture_valid=yes\ncases=${fixture.cases.length}`);
    return;
  }

  const startedAt = new Date();
  const resultPath = path.join(
    RESULTS_DIR,
    `${timestampForFileName(startedAt)}-a02-a05-machine-${config.dryRun ? "dry-run" : "real-llm"}.json`,
  );
  const run = {
    suite: fixture.suite,
    mode: config.dryRun ? "dry-run" : "real-llm",
    realLlmExecuted: !config.dryRun,
    startedAt: startedAt.toISOString(),
    endedAt: null,
    baseUrl: config.baseUrl,
    validationProblems,
    results: [],
    summary: null,
  };

  if (validationProblems.length > 0) {
    run.endedAt = new Date().toISOString();
    run.summary = summarize(run.results);
    writeJson(resultPath, run);
    console.error(validationProblems.join("\n"));
    process.exitCode = 2;
    return;
  }

  for (const testCase of fixture.cases) {
    run.results.push(await executeCase(testCase, config));
    run.summary = summarize(run.results);
    writeJson(resultPath, run);
  }

  run.endedAt = new Date().toISOString();
  run.summary = summarize(run.results);
  writeJson(resultPath, run);

  console.log(
    [
      `mode=${run.mode}`,
      `real_llm_executed=${run.realLlmExecuted ? "yes" : "no"}`,
      `cases=${run.results.length}`,
      `result=${resultPath}`,
      `summary=${JSON.stringify(run.summary.byConclusion)}`,
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
