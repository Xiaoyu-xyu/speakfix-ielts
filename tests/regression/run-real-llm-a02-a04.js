#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "../..");
const CASES_PATH = path.join(__dirname, "a02-a04-cases.json");
const RESULTS_DIR = path.join(__dirname, "results");
const DEFAULT_BASE_URL = "http://localhost:3000";
const REQUEST_TIMEOUT_MS = Number(process.env.REGRESSION_TIMEOUT_MS ?? 20_000);
const RETRY_LIMIT = 1;
const DELAY_BETWEEN_CASES_MS = 1_000;

function readDotEnvLocal() {
  const envPath = path.join(ROOT_DIR, ".env.local");

  if (!fs.existsSync(envPath)) {
    throw new Error("Missing project root .env.local");
  }

  return fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .reduce((env, line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        return env;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        return env;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      env[key] = value;
      return env;
    }, {});
}

function getConfig() {
  const fileEnv = readDotEnvLocal();
  const missingFileEnv = [
    "AI_PROVIDER",
    "SILICONFLOW_API_KEY",
    "SILICONFLOW_MODEL",
  ].filter((key) => !fileEnv[key]);

  if (missingFileEnv.length > 0) {
    throw new Error(
      `.env.local is missing required real LLM regression variables: ${missingFileEnv.join(
        ", ",
      )}`,
    );
  }

  // Match the Next.js server's effective environment: shell env can override
  // values loaded from .env.local, but .env.local must still define the baseline.
  const readEnv = (key) => process.env[key] ?? fileEnv[key];
  const provider = readEnv("AI_PROVIDER").toLowerCase();

  if (provider !== "siliconflow") {
    throw new Error(
      `Real LLM regression baseline requires AI_PROVIDER=siliconflow, got ${provider}`,
    );
  }

  const model = readEnv("SILICONFLOW_MODEL");

  return {
    baseUrl: readEnv("REGRESSION_BASE_URL") || DEFAULT_BASE_URL,
    provider,
    model,
  };
}

function timestampForFileName(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function safeFilePart(value) {
  return String(value || "unknown")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function loadCases() {
  const data = JSON.parse(fs.readFileSync(CASES_PATH, "utf8"));

  if (!Array.isArray(data.cases)) {
    throw new Error("tests/regression/a02-a04-cases.json must contain cases[]");
  }

  return data;
}

function getSelectedCaseIds() {
  const argument = process.argv.find((value) => value.startsWith("--caseIds="));

  if (!argument) {
    return null;
  }

  const caseIds = argument
    .slice("--caseIds=".length)
    .split(",")
    .map((caseId) => caseId.trim())
    .filter(Boolean);

  if (caseIds.length === 0) {
    throw new Error("--caseIds must include at least one Case ID");
  }

  return new Set(caseIds);
}

function selectCases(data, selectedCaseIds) {
  if (!selectedCaseIds) {
    return data;
  }

  const selectedCases = data.cases.filter((testCase) =>
    selectedCaseIds.has(testCase.caseId),
  );
  const foundCaseIds = new Set(selectedCases.map((testCase) => testCase.caseId));
  const missingCaseIds = [...selectedCaseIds].filter(
    (caseId) => !foundCaseIds.has(caseId),
  );

  if (missingCaseIds.length > 0) {
    throw new Error(`Unknown Case ID(s): ${missingCaseIds.join(", ")}`);
  }

  return {
    ...data,
    cases: selectedCases,
    selectedCaseIds: [...selectedCaseIds],
  };
}

function getAssertions(testCase) {
  return testCase.expected ?? testCase.assertions ?? null;
}

function validateCaseFile(data) {
  const problems = [];

  for (const testCase of data.cases) {
    if (!testCase.caseId) {
      problems.push("A case is missing caseId");
      continue;
    }

    if (!testCase.node) {
      problems.push(`${testCase.caseId}: missing node`);
    }

    if (!testCase.question) {
      problems.push(`${testCase.caseId}: missing question`);
    }

    if (!getAssertions(testCase)) {
      problems.push(
        `${testCase.caseId}: missing expected/assertions for automatic judgement`,
      );
    }
  }

  return problems;
}

function inferAnswerStructureType(testCase) {
  const text = `${testCase.question ?? ""} ${testCase.questionType ?? ""}`;

  if (/how old/i.test(text)) {
    return "basic_fact";
  }

  if (/where do you live|place|地点/i.test(text)) {
    return "place_description";
  }

  if (/prefer| or /i.test(text)) {
    return "choice_compare";
  }

  if (/think|useful|观点/i.test(text)) {
    return "opinion_reason";
  }

  if (/when did you start/i.test(text)) {
    return "past_present_compare";
  }

  if (/what kind|type|类型/i.test(text)) {
    return "type_reason";
  }

  return "basic_fact";
}

function buildRequest(testCase) {
  const answerStructureType =
    testCase.answerStructureType ?? inferAnswerStructureType(testCase);

  if (testCase.node === "A02") {
    return {
      endpoint: "/api/ai/pre-answer",
      body: {
        topicId: "regression-a02-a04",
        questionId: testCase.caseId,
        questionText: testCase.question,
        answerStructureType,
      },
    };
  }

  if (testCase.node === "A03") {
    return {
      endpoint: "/api/ai/polish",
      body: {
        topicId: "regression-a02-a04",
        questionText: testCase.question,
        answerStructureType,
        userTranscript: testCase.input?.answer,
      },
    };
  }

  if (testCase.node === "A04") {
    const body = {
      questionText: testCase.question,
      firstTranscript: testCase.input?.firstAnswer,
      retryTranscript: testCase.input?.secondAnswer,
    };

    if (shouldSendA04ExtensionSentence(testCase)) {
      body.extensionSentence = testCase.input.a03Suggestion;
    }

    return {
      endpoint: "/api/ai/retry-feedback",
      body,
    };
  }

  throw new Error(`${testCase.caseId}: unsupported node ${testCase.node}`);
}

function shouldSendA04ExtensionSentence(testCase) {
  const suggestion = testCase.input?.a03Suggestion;

  return (
    testCase.caseId === "A04-002" &&
    typeof suggestion === "string" &&
    suggestion.trim().length > 0 &&
    /[A-Za-z]/.test(suggestion) &&
    /[.!?]$/.test(suggestion.trim())
  );
}

function validateRequestBody(testCase, request) {
  const requiredByNode = {
    A02: [
      ["topicId", "string"],
      ["questionId", "string"],
      ["questionText", "string"],
      ["answerStructureType", "string"],
    ],
    A03: [
      ["topicId", "string"],
      ["questionText", "string"],
      ["userTranscript", "string"],
      ["answerStructureType", "string"],
    ],
    A04: [
      ["questionText", "string"],
      ["firstTranscript", "string"],
      ["retryTranscript", "string"],
    ],
  };
  const rules = requiredByNode[testCase.node];

  if (!rules) {
    throw new Error(`${testCase.caseId}: unsupported node ${testCase.node}`);
  }

  for (const [field, type] of rules) {
    const value = request.body[field];

    if (typeof value !== type || value.trim().length === 0) {
      throw new Error(`${testCase.caseId}: missing or invalid request field ${field}`);
    }
  }

  for (const optionalField of ["polishedAnswer", "extensionSentence"]) {
    if (
      Object.prototype.hasOwnProperty.call(request.body, optionalField) &&
      typeof request.body[optionalField] !== "string"
    ) {
      throw new Error(
        `${testCase.caseId}: missing or invalid request field ${optionalField}`,
      );
    }
  }
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

function valueContains(actual, expected) {
  if (Array.isArray(actual)) {
    return actual.some((item) => valueContains(item, expected));
  }

  return String(actual ?? "")
    .toLowerCase()
    .includes(String(expected).toLowerCase());
}

function evaluateAssertions(responseJson, assertions) {
  const failures = [];
  const rules = Array.isArray(assertions) ? assertions : [assertions];

  for (const rule of rules) {
    if (!rule || typeof rule !== "object") {
      failures.push("assertion rule must be an object");
      continue;
    }

    const actual = getByPath(responseJson, rule.path);

    if (Object.prototype.hasOwnProperty.call(rule, "equals")) {
      if (actual !== rule.equals) {
        failures.push(`${rule.path} expected ${JSON.stringify(rule.equals)}`);
      }
    }

    if (Object.prototype.hasOwnProperty.call(rule, "contains")) {
      if (!valueContains(actual, rule.contains)) {
        failures.push(`${rule.path} must contain ${JSON.stringify(rule.contains)}`);
      }
    }

    if (Object.prototype.hasOwnProperty.call(rule, "notContains")) {
      if (valueContains(actual, rule.notContains)) {
        failures.push(
          `${rule.path} must not contain ${JSON.stringify(rule.notContains)}`,
        );
      }
    }

    if (Object.prototype.hasOwnProperty.call(rule, "arrayLength")) {
      if (!Array.isArray(actual) || actual.length !== rule.arrayLength) {
        failures.push(`${rule.path} expected array length ${rule.arrayLength}`);
      }
    }

    if (Object.prototype.hasOwnProperty.call(rule, "minArrayLength")) {
      if (!Array.isArray(actual) || actual.length < rule.minArrayLength) {
        failures.push(
          `${rule.path} expected array length >= ${rule.minArrayLength}`,
        );
      }
    }
  }

  return {
    passed: failures.length === 0,
    failureReason: failures.join("; "),
  };
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
    let json = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { rawText: text };
    }

    return {
      ok: response.ok,
      status: response.status,
      json,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestWithRetry(url, body) {
  let lastError = null;

  for (let attempt = 0; attempt <= RETRY_LIMIT; attempt += 1) {
    try {
      return await postJson(url, body);
    } catch (error) {
      lastError = error;

      if (attempt < RETRY_LIMIT) {
        await delay(1_000);
      }
    }
  }

  return {
    ok: false,
    status: null,
    json: null,
    requestError: lastError instanceof Error ? lastError.message : String(lastError),
  };
}

function summarize(results) {
  const originalTotal = results.length;
  const originalPassed = results.filter((result) => result.passed).length;
  const originalFailed = originalTotal - originalPassed;
  const validResults = results.filter((result) => !result.invalid_test_data);
  const validTotal = validResults.length;
  const validPassed = validResults.filter((result) => result.passed).length;
  const validFailed = validTotal - validPassed;

  return {
    originalTotal,
    originalPassed,
    originalFailed,
    originalPassRate:
      originalTotal === 0 ? 0 : Number((originalPassed / originalTotal).toFixed(4)),
    validTotal,
    validPassed,
    validFailed,
    validPassRate:
      validTotal === 0 ? 0 : Number((validPassed / validTotal).toFixed(4)),
  };
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(`${filePath}.tmp`, JSON.stringify(data, null, 2));
  fs.renameSync(`${filePath}.tmp`, filePath);
}

function writeMarkdown(filePath, run) {
  const summary = run.summary ?? summarize(run.results);
  const lines = [
    `# A02-A04 Real LLM Regression`,
    "",
    `- Provider: ${run.provider}`,
    `- Model: ${run.model || "(not configured)"}`,
    `- Started: ${run.startedAt}`,
    `- Ended: ${run.endedAt ?? "(running)"}`,
    `- Original 17: ${summary.originalPassed}/${summary.originalTotal} passed, ${summary.originalFailed} failed, ${(summary.originalPassRate * 100).toFixed(1)}%`,
    `- Valid cases: ${summary.validPassed}/${summary.validTotal} passed, ${summary.validFailed} failed, ${(summary.validPassRate * 100).toFixed(1)}%`,
    "",
    `| Case | Node | Passed | Invalid Test Data | HTTP | Failure |`,
    `| --- | --- | --- | --- | --- | --- |`,
  ];

  for (const result of run.results) {
    lines.push(
      `| ${result.caseId} | ${result.node} | ${result.passed ? "yes" : "no"} | ${result.invalid_test_data ? "yes" : "no"} | ${result.httpStatus ?? ""} | ${(result.failureReason ?? "").replace(/\|/g, "\\|")} |`,
    );
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

async function main() {
  const config = getConfig();
  const data = selectCases(loadCases(), getSelectedCaseIds());
  const validationProblems = validateCaseFile(data);
  const startedAt = new Date();
  const fileBase = `${timestampForFileName(startedAt)}-${safeFilePart(
    config.provider,
  )}-${safeFilePart(config.model)}`;
  const jsonPath = path.join(RESULTS_DIR, `${fileBase}.json`);
  const mdPath = path.join(RESULTS_DIR, `${fileBase}.md`);
  const run = {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    startedAt: startedAt.toISOString(),
    endedAt: null,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    retryLimit: RETRY_LIMIT,
    delayBetweenCasesMs: DELAY_BETWEEN_CASES_MS,
    validationProblems,
    results: [],
    summary: null,
  };

  writeJson(jsonPath, run);
  writeMarkdown(mdPath, run);

  if (validationProblems.length > 0) {
    run.endedAt = new Date().toISOString();
    run.summary = summarize(run.results);
    writeJson(jsonPath, run);
    writeMarkdown(mdPath, run);
    console.error(
      [
        "Case file is missing machine-checkable expected/assertions fields.",
        "No LLM requests were sent.",
        ...validationProblems,
      ].join("\n"),
    );
    process.exitCode = 2;
    return;
  }

  for (const testCase of data.cases) {
    const started = new Date();
    const assertions = getAssertions(testCase);
    const request = buildRequest(testCase);
    validateRequestBody(testCase, request);
    const { endpoint, body } = request;
    const url = `${config.baseUrl}${endpoint}`;
    const response = await requestWithRetry(url, body);
    const ended = new Date();
    const invalidTestData = testCase.caseId === "A04-001";
    const assertionResult =
      response.ok && assertions
        ? evaluateAssertions(response.json, assertions)
        : {
            passed: false,
            failureReason: response.requestError ?? `HTTP ${response.status}`,
          };
    const result = {
      caseId: testCase.caseId,
      node: testCase.node,
      input: testCase.input ?? body,
      expectedConditions: assertions,
      httpStatus: response.status,
      rawJsonResponse: response.json,
      passed: invalidTestData ? false : assertionResult.passed,
      failureReason: invalidTestData
        ? "invalid test data: A04-001 is excluded from valid pass rate"
        : assertionResult.failureReason,
      invalid_test_data: invalidTestData,
      provider: config.provider,
      model: config.model,
      startedAt: started.toISOString(),
      endedAt: ended.toISOString(),
      durationMs: ended.getTime() - started.getTime(),
    };

    run.results.push(result);
    run.summary = summarize(run.results);
    writeJson(jsonPath, run);
    writeMarkdown(mdPath, run);

    if (run.results.length < data.cases.length) {
      await delay(DELAY_BETWEEN_CASES_MS);
    }
  }

  run.endedAt = new Date().toISOString();
  run.summary = summarize(run.results);
  writeJson(jsonPath, run);
  writeMarkdown(mdPath, run);
  const sourceCounts = run.results.reduce((counts, result) => {
    const source = result.rawJsonResponse?.source ?? "unknown";
    counts[source] = (counts[source] ?? 0) + 1;
    return counts;
  }, {});
  console.log(
    [
      `completed=${run.results.length}`,
      `source_llm=${sourceCounts.llm ?? 0}`,
      `source_mock_fallback=${sourceCounts.mock_fallback ?? 0}`,
      `json=${jsonPath}`,
      `markdown=${mdPath}`,
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
