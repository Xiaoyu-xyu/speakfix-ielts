#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const ROOT_DIR = path.resolve(__dirname, "../..");

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
  classifyTranscriptLanguageIntent,
  hasValidAnswerText,
  normalizeAsrTranscript,
  normalizeDisplayTranscript,
} = require(path.join(ROOT_DIR, "src/lib/speech-transcript.ts"));

const cases = [
  {
    name: "self correction keeps final library meaning",
    raw: "Um, at home... sorry, I mean in a library.",
    questionText: "Do you prefer to study at home or in a library?",
    answerStructureType: "choice_compare",
    expect: {
      language: "english_answer",
      cleaned: "in a library.",
      display: "Um, at home. Sorry, I mean in a library.",
      valid: true,
    },
  },
  {
    name: "display keeps English filler and cleaned keeps final correction",
    raw: "嗯, at home... sorry, I'm in a library.",
    questionText: "Do you prefer to study at home or in a library?",
    answerStructureType: "choice_compare",
    expect: {
      language: "english_answer",
      cleaned: "in a library.",
      display: "Um, at home. Sorry, I mean in a library.",
      valid: true,
    },
  },
  {
    name: "short spoken age remains valid",
    raw: "I'm 24.",
    questionText: "How old are you?",
    answerStructureType: "basic_fact",
    expect: {
      language: "english_answer",
      cleaned: "I'm 24.",
      display: "I'm 24.",
      valid: true,
    },
  },
  {
    name: "spoken age display keeps spoken form",
    raw: "twenty-four",
    questionText: "How old are you?",
    answerStructureType: "basic_fact",
    expect: {
      language: "english_answer",
      cleaned: "twenty-four.",
      display: "Twenty-four",
      valid: true,
    },
  },
  {
    name: "numeric age remains valid for age question",
    raw: "24.",
    questionText: "How old are you?",
    answerStructureType: "basic_fact",
    expect: {
      language: "english_answer",
      cleaned: "24.",
      display: "24.",
      valid: true,
    },
  },
  {
    name: "short choice answer remains valid for choice question",
    raw: "Comfortable clothes.",
    questionText:
      "Do you prefer to wear comfortable and casual clothes or formal clothes?",
    answerStructureType: "choice_compare",
    expect: {
      language: "english_answer",
      cleaned: "Comfortable clothes.",
      display: "Comfortable clothes.",
      valid: true,
    },
  },
  {
    name: "Chinese sentence diverts before A03",
    raw: "我喜欢在图书馆学习，因为那里很安静。",
    questionText: "What is your favorite place to study?",
    answerStructureType: "preference_reason",
    expect: {
      language: "chinese_answer",
      cleaned: "",
      display: "",
      valid: false,
    },
  },
  {
    name: "safe Chinese city entity normalizes to English",
    raw: "上海",
    questionText: "Where do you live?",
    answerStructureType: "basic_fact",
    expect: {
      language: "english_answer",
      cleaned: "Shanghai.",
      display: "上海",
      valid: true,
    },
  },
  {
    name: "high-confidence ASR correction only changes cleaned transcript",
    raw: "Yes, I like wear in T-shirts.",
    questionText: "Do you like wearing T-shirts?",
    answerStructureType: "yes_no_reason",
    expect: {
      language: "english_answer",
      cleaned: "Yes, I like wearing T-shirts.",
      display: "Yes, I like wear in T-shirts.",
      valid: true,
    },
  },
  {
    name: "ambiguous ASR word is not force-corrected",
    raw: "I like close.",
    questionText: "What kind of clothes do you like to wear?",
    answerStructureType: "type_reason",
    expect: {
      language: "english_answer",
      cleaned: "I like close.",
      display: "I like close.",
      valid: true,
    },
  },
];

for (const testCase of cases) {
  const language = classifyTranscriptLanguageIntent(testCase.raw);
  const cleaned =
    language === "english_answer"
      ? normalizeAsrTranscript(testCase.raw, {
          questionText: testCase.questionText,
          answerStructureType: testCase.answerStructureType,
        })
      : "";
  const display =
    language === "english_answer" ? normalizeDisplayTranscript(testCase.raw) : "";
  const valid =
    language === "english_answer" &&
    hasValidAnswerText({
      cleanedTranscript: cleaned,
      questionText: testCase.questionText,
      answerStructureType: testCase.answerStructureType,
    });

  assert.strictEqual(language, testCase.expect.language, `${testCase.name}: language`);
  assert.strictEqual(cleaned, testCase.expect.cleaned, `${testCase.name}: cleaned`);
  assert.strictEqual(display, testCase.expect.display, `${testCase.name}: display`);
  assert.strictEqual(valid, testCase.expect.valid, `${testCase.name}: valid`);
}

console.log(`speech-transcript tests passed=${cases.length}`);
