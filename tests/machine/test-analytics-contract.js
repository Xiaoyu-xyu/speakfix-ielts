#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT_DIR = path.resolve(__dirname, "../..");
const practiceRoomPath = path.join(
  ROOT_DIR,
  "src/app/practice/[topicId]/practice-room.tsx",
);
const source = fs.readFileSync(practiceRoomPath, "utf8");

function getFunctionBody(name) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} should exist`);

  const openBrace = source.indexOf("{", start);
  assert.ok(openBrace >= 0, `${name} should have a body`);

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBrace + 1, index);
      }
    }
  }

  throw new Error(`${name} body was not closed`);
}

const startSpeechRecognitionBody = getFunctionBody("startSpeechRecognition");
assert.ok(
  !startSpeechRecognitionBody.includes('"transcription_failed"'),
  "Web Speech recognition errors must not emit final transcription_failed telemetry",
);

const submitAnswerBody = getFunctionBody("submitAnswerText");
const retryAnswerSubmittedIndex = submitAnswerBody.indexOf('"retry_answer_submitted"');
const generateRetryFeedbackIndex = submitAnswerBody.indexOf("generateRetryFeedback({");
const retryFeedbackGeneratedIndex = submitAnswerBody.indexOf('"retry_feedback_generated"');

assert.ok(retryAnswerSubmittedIndex >= 0, "retry_answer_submitted should be tracked");
assert.ok(retryFeedbackGeneratedIndex >= 0, "retry_feedback_generated should be tracked");
assert.ok(
  retryAnswerSubmittedIndex < generateRetryFeedbackIndex,
  "retry_answer_submitted should be emitted before A04 generation starts",
);
assert.ok(
  generateRetryFeedbackIndex < retryFeedbackGeneratedIndex,
  "retry_feedback_generated should be emitted only after A04 generation completes",
);

assert.ok(
  source.includes("normalizeRetryFeedbackTypeForAnalytics") &&
    source.includes('return "adopted_suggestion"') &&
    source.includes('return "improved_expression"') &&
    source.includes('return "needs_adjustment"'),
  "retry feedback analytics should normalize to the frozen English enum",
);

assert.ok(
  /payload:\s*\{[\s\S]*\.\.\.payload,[\s\S]*test_user_id:\s*testUserId,[\s\S]*\}/.test(
    source,
  ),
  "trackPracticeEvent should attach test_user_id to every event payload",
);

assert.ok(
  source.includes('return value || "anonymous";'),
  "missing test_user_id should fall back to anonymous",
);

for (const field of [
  "completed_question_count",
  "total_question_count",
  "retry_question_count",
  "total_duration_seconds",
]) {
  assert.ok(
    source.includes(field),
    `topic_completed should include ${field}`,
  );
}

assert.ok(
  !source.includes('"polish_expand_opened"'),
  "A03 should not add polish_expand_opened telemetry",
);

assert.ok(
  /answerLength\s*<\s*3\s*&&\s*!answerHasValidMeaning/.test(source),
  "answer_too_short_detected should be gated by semantic validity, not only word count",
);

console.log("analytics-contract tests passed=8");
