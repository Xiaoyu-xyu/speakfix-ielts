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

const { createPolishFallbackResponse } = require(path.join(
  ROOT_DIR,
  "src/app/api/ai/_shared.ts",
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

console.log("polish-contract tests passed=2");
