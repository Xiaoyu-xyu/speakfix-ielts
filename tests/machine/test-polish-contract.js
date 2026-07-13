#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");
const Module = require("module");

const ROOT_DIR = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;

function resolveAlias(request) {
  const basePath = path.join(ROOT_DIR, "src", request.slice(2));
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? basePath;
}

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return resolveAlias(request);
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });

  module._compile(output.outputText, filename);
};

const {
  createPolishFallbackResponse,
  finalizePolishResponse,
} = require(path.join(
  ROOT_DIR,
  "src/app/api/ai/_shared.ts",
));

const { hasAiSubstantiveDifference } = require(path.join(
  ROOT_DIR,
  "src/lib/ai.ts",
));

function createInput(overrides) {
  return {
    topic_id: "personal-information",
    topic_title: "Personal information",
    question_text: "What kind of place is it?",
    answerStructureType: "place_description",
    user_answer: "It is a beautiful place.",
    question_index: 3,
    target_level: "IELTS 6.0-6.5",
    ...overrides,
  };
}

const noPolish = createPolishFallbackResponse(
  createInput({ user_answer: "It is a beautiful place." }),
  "missing_api_key",
  null,
);

assert.strictEqual(noPolish.hasMeaningfulPolish, false);
assert.deepStrictEqual(
  noPolish.originalSegments.map((segment) => segment.markType),
  ["none"],
);
assert.ok(
  !/answer directly|add one short|you should|start with/i.test(
    `${noPolish.polishedAnswer} ${noPolish.extensionSentence}`,
  ),
);

const grammarFix = createPolishFallbackResponse(
  createInput({
    question_text: "Do you prefer to wear comfortable and casual clothes or formal clothes?",
    answerStructureType: "choice_compare",
    user_answer: "I prefer comfortable clothes because it make me relaxed.",
  }),
  "missing_api_key",
  null,
);

assert.ok(grammarFix.polishedAnswer.trim(), "grammar fix should have polishedAnswer");
assert.ok(
  grammarFix.originalSegments.some((segment) => segment.markType === "red"),
  "high-confidence grammar issue should be marked red",
);
assert.ok(
  /it makes me relaxed/i.test(grammarFix.polishedAnswer),
  "polishedAnswer should contain the grammar correction",
);

function modelResponse(input, overrides) {
  return finalizePolishResponse({
    input,
    source: "llm",
    fallbackReason: null,
    response: {
      originalSegments: [
        {
          text: input.user_answer,
          markType: "orange",
          reason: "Model marked this as a style polish.",
        },
      ],
      polishedAnswer: input.user_answer,
      extensionSentence: "",
      hasMeaningfulPolish: true,
      source: "llm",
      aiProvider: "siliconflow",
      fallbackReason: null,
      llmLatencyMs: 1,
      ...overrides,
    },
  });
}

function markTypes(result) {
  return result.originalSegments.map((segment) => segment.markType);
}

function assertNoPolishForFormattingOnly(result, original) {
  assert.strictEqual(result.hasMeaningfulPolish, false);
  assert.deepStrictEqual(markTypes(result), ["none"]);
  assert.strictEqual(result.polishedAnswer, original);
}

const case1Input = createInput({
  question_text: "What kind of clothes do you like to wear?",
  answerStructureType: "type_reason",
  user_answer: "I like to wear simple style clothes.",
});
assertNoPolishForFormattingOnly(
  modelResponse(case1Input, {
    polishedAnswer: "I like to wear simple-style clothes.",
  }),
  case1Input.user_answer,
);

const case2Input = createInput({
  question_text: "Do you like wearing T-shirts?",
  answerStructureType: "yes_no_reason",
  user_answer: "Yes I like wearing t shirts",
});
assertNoPolishForFormattingOnly(
  modelResponse(case2Input, {
    polishedAnswer: "Yes, I like wearing T-shirts.",
  }),
  case2Input.user_answer,
);

const case3Input = createInput({
  question_text: "How old are you?",
  answerStructureType: "basic_fact",
  user_answer: "Im 24",
});
assertNoPolishForFormattingOnly(
  modelResponse(case3Input, {
    polishedAnswer: "I’m 24.",
  }),
  case3Input.user_answer,
);

const case4Input = createInput({
  question_text: "Do you prefer to wear comfortable and casual clothes or formal clothes?",
  answerStructureType: "choice_compare",
  user_answer: "I prefer comfortable clothes because it make me relaxed.",
});
const case4 = modelResponse(case4Input, {
  originalSegments: [
    {
      text: "it make me relaxed",
      markType: "red",
      reason: "Grammar issue.",
    },
  ],
  polishedAnswer: "I prefer comfortable clothes because they make me relaxed.",
});
assert.strictEqual(case4.hasMeaningfulPolish, true);
assert.ok(markTypes(case4).includes("red"));
assert.ok(/they make me relaxed/i.test(case4.polishedAnswer));

const case5Input = createInput({
  question_text: "Do you like wearing T-shirts?",
  answerStructureType: "yes_no_reason",
  user_answer: "I very like T-shirts.",
});
const case5 = modelResponse(case5Input, {
  originalSegments: [
    {
      text: "very like",
      markType: "orange",
      reason: "This is more natural in spoken English.",
    },
  ],
  polishedAnswer: "I really like T-shirts.",
});
assert.strictEqual(case5.hasMeaningfulPolish, true);
assert.ok(markTypes(case5).includes("orange"));
assert.ok(/really like/i.test(case5.polishedAnswer));

const case6Input = createInput({
  question_text: "Do you like wearing T-shirts?",
  answerStructureType: "yes_no_reason",
  user_answer: "I like T-shirts.",
});
const case6 = modelResponse(case6Input, {
  polishedAnswer: "I like wearing T-shirts because they’re comfortable.",
});
assert.strictEqual(case6.hasMeaningfulPolish, false);
assert.deepStrictEqual(markTypes(case6), ["none"]);
assert.strictEqual(case6.polishedAnswer, case6Input.user_answer);
assert.ok(/because they/i.test(case6.extensionSentence));

const case7Input = createInput({
  question_text: "Do you work or study?",
  answerStructureType: "basic_fact",
  user_answer: "I work part time.",
});
assertNoPolishForFormattingOnly(
  modelResponse(case7Input, {
    polishedAnswer: "I work part-time.",
  }),
  case7Input.user_answer,
);

const case8Input = createInput({
  question_text: "Where do you live?",
  answerStructureType: "basic_fact",
  user_answer: "I live in tokyo",
});
assertNoPolishForFormattingOnly(
  modelResponse(case8Input, {
    polishedAnswer: "I live in Tokyo.",
  }),
  case8Input.user_answer,
);

assert.strictEqual(
  hasAiSubstantiveDifference("twenty-four", "24"),
  false,
  "equivalent spoken-number formatting should not be substantive",
);

console.log("polish-contract tests passed=11");
