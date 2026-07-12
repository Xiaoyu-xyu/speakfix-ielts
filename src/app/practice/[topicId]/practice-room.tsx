"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AssistTabs } from "@/components/AssistTabs";
import { CompletionModal } from "@/components/CompletionModal";
import { PracticeHeader } from "@/components/PracticeHeader";
import {
  createPreAnswerInput,
  createPolishInput,
  generatePreAnswerSuggestion,
  generatePolishSuggestion,
  generateRetryFeedback,
  type AiServiceResult,
  type ExpansionType,
  type MarkedTranscriptSegment,
  type PreHelpOutput,
  type PolishResult,
  type RetryFeedbackResult,
} from "@/lib/ai";
import { playQuestionPromptAudio } from "@/lib/tts";
import {
  getSpeakfixSessionId,
  readSpeakfixEvents,
  resetSpeakfixSessionId,
  trackEvent,
  type StoredEvent,
} from "@/lib/analytics";
import type { PracticeStatus, Topic } from "@/types/practice";

type PracticeRoomProps = {
  topic: Topic;
};

type AnswerRecord = {
  id: string;
  messageType: "user_answer" | "retry_answer";
  questionIndex: number;
  kind: "first" | "retry";
  duration: number;
  text: string;
  rawTranscript: string;
  cleanedTranscript: string;
  displayTranscript: string;
  polishExpanded: boolean;
  assistGenerating: boolean;
  polish?: {
    markedTranscript: MarkedTranscriptSegment[];
    polishedAnswer: string;
    noPolishNeeded?: boolean;
    shouldExpand: boolean;
    expansionType: ExpansionType;
    expansionSentence: string;
    reason: string;
    markedErrorCount: number;
    markedImproveCount: number;
    estimatedSpeakingSeconds: number;
    generationMode: "mock" | "ai";
    aiSuccess: boolean;
    fallbackUsed: boolean;
    failureReason?: string;
    aiSource: "llm" | "mock_fallback";
    aiProvider?: "openai" | "siliconflow";
    fallbackReason?: string;
    llmLatencyMs?: number | null;
  };
  retryFeedback?: {
    type: RetryFeedbackResult["feedback_type"];
    text: string;
    generationMode: "mock" | "ai";
    aiSource: "llm" | "mock_fallback";
    aiProvider?: "openai" | "siliconflow";
    fallbackReason?: string;
    llmLatencyMs?: number | null;
    markedRetryTranscript: RetryTranscriptSegment[];
  };
};

type RetryTranscriptSegment = {
  text: string;
  type: "normal" | "adopted";
};

type PreAnswerRecord = {
  output: PreHelpOutput;
  aiProvider?: "openai" | "siliconflow";
  aiSource: "llm" | "mock_fallback";
  fallbackReason?: string;
  llmLatencyMs?: number | null;
};

type SpeechRecognitionLike = {
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult:
    | ((event: {
        results: ArrayLike<{
          0: { transcript: string };
          isFinal: boolean;
        }>;
      }) => void)
    | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type AsrApiResponse = {
  transcript: string;
  provider: "siliconflow";
  source: "asr" | "mock_fallback";
  fallbackReason: string | null;
  latency: number | null;
};

type AsrFailureType =
  | "no_valid_speech"
  | "chinese_answer"
  | "mixed_unclear"
  | "technical_failure"
  | null;
type AsrStatus =
  | "idle"
  | "recording"
  | "transcribing"
  | "success"
  | "no_valid_speech"
  | "chinese_answer"
  | "mixed_unclear"
  | "technical_failure"
  | "skipped_for_debug_text";
type AudioStatus =
  | "idle"
  | "recording"
  | "recorded"
  | "too_short"
  | "empty"
  | "unavailable"
  | "skipped_for_debug_text";

type AsrResult = {
  rawTranscript: string;
  cleanedTranscript: string;
  displayTranscript: string;
  provider: "siliconflow";
  source: "asr" | "none";
  fallbackReason?: string;
  latencyMs: number | null;
  audioMimeType?: string;
  audioStatus: AudioStatus;
  asrStatus: AsrStatus;
  hasValidSpeech: boolean;
  failureType: AsrFailureType;
};

type TranscriptSubmissionMeta = {
  recordedSeconds: number;
  fallbackReason: string | null;
  fallbackMode?: "mock_fallback";
  inputMode: "asr" | "web_speech" | "mock" | "debug_text";
  isMockTranscription: boolean;
  recognitionStatus: string;
  asrProvider: "siliconflow" | "skipped";
  asrSource: "asr" | "none" | "skipped_for_debug_text";
  asrLatencyMs: number | null;
  audioMimeType?: string;
  transcriptSource:
    | "siliconflow_asr"
    | "none"
    | "debug_text";
  audioStatus: AudioStatus;
  asrStatus: AsrStatus;
  rawTranscript: string;
  cleanedTranscript: string;
  displayTranscript: string;
  hasValidSpeech: boolean;
  failureType: AsrFailureType;
};

type SubmissionSnapshot = {
  topicId: string;
  questionId: string;
  questionIndex: number;
  questionText: string;
  answerStructureType: Topic["questions"][number]["answerStructureType"];
  rawTranscript: string;
  cleanedTranscript: string;
  displayTranscript: string;
};

type RetrySubmissionSnapshot = SubmissionSnapshot & {
  firstAnswerCleanedTranscript: string;
  polishedAnswer: string;
  extensionSentence: string;
  retryRawTranscript: string;
  retryCleanedTranscript: string;
  retryDisplayTranscript: string;
};

type IconProps = {
  className?: string;
};

function WaveIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 28 20" fill="none" aria-hidden="true">
      <path
        d="M3 11v-2M8 15V5M13 18V2M18 15V5M23 11v-2"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function XIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m9 18 6-6-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const mockAnswerByQuestion: Record<string, string> = {
  "personal-information-1": "I'm 23 years old.",
  "personal-information-2": "I live in Shanghai now.",
  "personal-information-3": "It is a busy but convenient place.",
  "work-or-study-1": "I'm a university student.",
  "work-or-study-2": "Yes, I enjoy my studies because they are useful.",
  "work-or-study-3": "The main advantage is that I can learn practical skills.",
  "teachers-1": "Yes, I have a favorite English teacher.",
  "teachers-2": "I don't think I want to be a teacher in the future.",
  "teachers-3": "Yes, I still remember my math teacher from middle school.",
  "clothes-1": "I usually like comfortable clothes, like T-shirts and jeans.",
  "clothes-2": "I prefer comfortable and casual clothes in daily life.",
  "clothes-3": "Yes, I like wearing T-shirts because they are easy to match.",
  "website-1": "I often visit websites for news, study, and videos.",
  "website-2": "My favourite website is a video website because I can learn many things there.",
  "website-3": "I prefer websites because they are faster and more convenient.",
  "headphones-1": "Yes, I use headphones almost every day.",
  "headphones-2": "I wear headphones when I study or take the bus.",
  "headphones-3": "Yes, headphones are useful because they help me focus.",
  "shopping-1": "Yes, I like shopping, but not for a very long time.",
  "shopping-2": "I usually go shopping once or twice a month.",
  "shopping-3": "I prefer online shopping because it saves time.",
  "social-media-1": "Yes, I have posted some photos on social media.",
  "social-media-2": "I started using social media when I was in middle school.",
  "social-media-3": "Yes, sometimes I spend too much time on social media.",
  "outer-space-and-stars-1": "Yes, I have learnt a little about outer space from documentaries.",
  "outer-space-and-stars-2": "Yes, I enjoy space movies because they are imaginative.",
  "outer-space-and-stars-3": "Yes, I want to know more about planets and the universe.",
  "hometown-1": "My hometown is a small city in China.",
  "hometown-2": "I lived there for many years when I was younger.",
  "hometown-3": "I like the food in my hometown the most.",
  "parks-1": "Yes, I liked going to parks when I was a child.",
  "parks-2": "Yes, I still like going to parks now to relax.",
  "parks-3": "Yes, I would like to see more parks in my city.",
  "place-of-study-1": "I prefer to study in a library because it is quiet.",
  "place-of-study-2": "My favorite place to study is the library.",
  "place-of-study-3": "I like the library in my school the most.",
};

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  return `00:${safeSeconds.toString().padStart(2, "0")}`;
}

function VoiceBars() {
  return (
    <div className="flex items-center gap-1 text-bamboo-700" aria-hidden="true">
      {[10, 16, 22, 14, 19, 11].map((height, index) => (
        <span
          key={`${height}-${index}`}
          className="w-1 rounded-full bg-current"
          style={{ height }}
        />
      ))}
    </div>
  );
}

function getMockAnswer(
  questionId: string,
  kind: "first" | "retry",
  expansionSentence?: string,
) {
  const debugMockAnswer = getDebugA03MockAnswer(kind);

  if (debugMockAnswer) {
    return debugMockAnswer;
  }

  const baseAnswer = mockAnswerByQuestion[questionId] ?? "";

  if (
    kind === "retry" &&
    expansionSentence === "The main reason is that it feels practical and easy for me."
  ) {
    return "It is a busy but convenient place. The main reason is that it feels practical and easy for me.";
  }

  if (kind === "retry" && baseAnswer) {
    return `${baseAnswer} I can also give a simple reason to make it clearer.`;
  }

  return baseAnswer;
}

function getDebugA03MockAnswer(kind: "first" | "retry") {
  if (
    kind !== "first" ||
    typeof window === "undefined" ||
    new URLSearchParams(window.location.search).get("debug") !== "1"
  ) {
    return "";
  }

  const testCase = new URLSearchParams(window.location.search).get("a03case");

  if (testCase === "grammar") {
    return "I usually wear comfortable clothes because they is easy to wear.";
  }

  if (testCase === "weak") {
    return "I like T-shirts. They are good.";
  }

  if (testCase === "unnatural") {
    return "I like wear clothes very comfortable.";
  }

  if (testCase === "natural") {
    return "I usually like comfortable clothes, like T-shirts and jeans.";
  }

  return "";
}

function normalizeSpeechFallbackReason(
  recognitionSupported: boolean,
  recognitionError: string,
) {
  if (!recognitionSupported) {
    return "speech_recognition_unsupported";
  }

  if (
    recognitionError === "not-allowed" ||
    recognitionError === "service-not-allowed" ||
    recognitionError === "permission_denied"
  ) {
    return "permission_denied";
  }

  if (
    recognitionError === "audio-capture" ||
    recognitionError === "no_microphone"
  ) {
    return "no_microphone";
  }

  if (recognitionError === "recognition_empty") {
    return "recognition_empty";
  }

  if (recognitionError === "speech_recognition_unsupported") {
    return "speech_recognition_unsupported";
  }

  return recognitionError ? "recognition_error" : "recognition_empty";
}

function getSupportedRecordingMimeType() {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return "";
  }

  const supportedMimeTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];

  return (
    supportedMimeTypes.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType),
    ) ?? ""
  );
}

function getMockFallbackNotice(fallbackReason?: string) {
  if (fallbackReason === "chinese_answer") {
    return "这是英语口语练习，请用英文回答哦~";
  }

  if (fallbackReason === "mixed_unclear") {
    return "请尽量用完整英文再说一次~";
  }

  if (fallbackReason === "media_recorder_unsupported") {
    return "当前浏览器录音能力不稳定，已使用备用转写继续练习。";
  }

  if (fallbackReason === "permission_denied") {
    return "未获得麦克风权限，已使用备用转写继续练习。";
  }

  if (fallbackReason === "asr_request_failed") {
    return "语音识别暂时不可用，已使用备用转写继续练习。";
  }

  if (fallbackReason === "empty_audio" || fallbackReason === "empty_transcript") {
    return "未识别到有效语音，已使用备用转写继续练习。";
  }

  if (fallbackReason === "speech_recognition_unsupported") {
    return "转写暂时失败，请再试一次~";
  }

  if (fallbackReason === "recognition_empty") {
    return "没有听清，再说一次吧~";
  }

  return "转写暂时失败，请再试一次~";
}

function toPolishViewModel(result: AiServiceResult<PolishResult>) {
  const markedErrorCount = result.data.markedTranscript.filter(
    (segment) => segment.type === "error",
  ).length;
  const markedImproveCount = result.data.markedTranscript.filter(
    (segment) => segment.type === "improve",
  ).length;
  const polishedWordCount = result.data.polishedAnswer
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return {
    markedTranscript: result.data.markedTranscript,
    polishedAnswer: result.data.polishedAnswer,
    noPolishNeeded: result.data.noPolishNeeded,
    shouldExpand: result.data.shouldExpand,
    expansionType: result.data.expansionType,
    expansionSentence: result.data.expansionSentence,
    reason: result.data.reason,
    markedErrorCount,
    markedImproveCount,
    estimatedSpeakingSeconds: Math.round(polishedWordCount / 2.2),
    generationMode: result.generation_mode,
    aiSuccess: result.ai_success,
    fallbackUsed: result.fallback_used,
    failureReason: result.failure_reason,
    aiSource: result.ai_source,
    aiProvider: result.ai_provider,
    fallbackReason: result.fallback_reason,
    llmLatencyMs: result.llm_latency_ms,
  };
}

function toRetryFeedbackViewModel(
  result: AiServiceResult<RetryFeedbackResult>,
  markedRetryTranscript: RetryTranscriptSegment[],
) {
  return {
    type: result.data.feedback_type,
    text: result.data.feedback_text,
    generationMode: result.generation_mode,
    aiSource: result.ai_source,
    aiProvider: result.ai_provider,
    fallbackReason: result.fallback_reason,
    llmLatencyMs: result.llm_latency_ms,
    markedRetryTranscript,
  };
}

function createMarkedRetryTranscript(
  retryTranscript: string,
  firstTranscript: string,
  polishedAnswer: string,
  expansionSentence: string,
): RetryTranscriptSegment[] {
  const exactExpansion = expansionSentence.trim().toLowerCase();
  const retryLower = retryTranscript.toLowerCase();

  if (
    exactExpansion.length >= 18 &&
    retryLower.includes(exactExpansion) &&
    !firstTranscript.toLowerCase().includes(exactExpansion)
  ) {
    const start = retryLower.indexOf(exactExpansion);
    const end = start + exactExpansion.length;

    return [
      ...(start > 0
        ? [{ text: retryTranscript.slice(0, start), type: "normal" as const }]
        : []),
      {
        text: retryTranscript.slice(start, end),
        type: "adopted" as const,
      },
      ...(end < retryTranscript.length
        ? [{ text: retryTranscript.slice(end), type: "normal" as const }]
        : []),
    ];
  }

  const suggestionPhrases = extractAdoptablePhrases(
    `${polishedAnswer} ${expansionSentence}`,
  ).filter((phrase) => !firstTranscript.toLowerCase().includes(phrase));
  const matchedPhrase = suggestionPhrases.find((phrase) =>
    retryLower.includes(phrase),
  );

  if (!matchedPhrase) {
    return [{ text: retryTranscript, type: "normal" }];
  }

  const start = retryLower.indexOf(matchedPhrase);
  const end = start + matchedPhrase.length;

  return [
    ...(start > 0
      ? [{ text: retryTranscript.slice(0, start), type: "normal" as const }]
      : []),
    {
      text: retryTranscript.slice(start, end),
      type: "adopted" as const,
    },
    ...(end < retryTranscript.length
      ? [{ text: retryTranscript.slice(end), type: "normal" as const }]
      : []),
  ];
}

function extractAdoptablePhrases(text: string) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const phrases: string[] = [];

  for (let size = Math.min(8, words.length); size >= 4; size -= 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      const phrase = words.slice(index, index + size).join(" ");

      if (phrase.length >= 18 && !isWeakAdoptionPhrase(phrase)) {
        phrases.push(phrase);
      }
    }
  }

  return Array.from(new Set(phrases));
}

function isWeakAdoptionPhrase(phrase: string) {
  const weakPhrases = [
    "i would say",
    "i think it",
    "it is a",
    "and it is",
    "for this topic",
    "part 1 question",
  ];

  return weakPhrases.some((weakPhrase) => phrase.includes(weakPhrase));
}

function DebugPanel({
  currentQuestionIndex,
  events,
  questionStates,
  sessionId,
  topicId,
}: {
  currentQuestionIndex: number;
  events: StoredEvent[];
  questionStates: Array<{
    canGoNext: boolean;
    isCompleted: boolean;
    polishOpened: boolean;
    retryFeedbackType?: string;
    retryUsed: boolean;
  }>;
  sessionId: string;
  topicId: string;
}) {
  const speechEvent = events.find((event) =>
    [
      "answer_submitted",
      "retry_answer_submitted",
      "transcription_failed",
    ].includes(event.event_name),
  );
  const ttsEvent = events.find((event) => event.event_name === "tts_playback");
  const aiEvent = events.find((event) =>
    [
      "pre_answer_generated",
      "polish_generated",
      "retry_feedback_generated",
    ].includes(event.event_name),
  );
  const speechPayload = speechEvent?.payload ?? {};
  const ttsPayload = ttsEvent?.payload ?? {};
  const aiPayload = aiEvent?.payload ?? {};
  const debugValue = (payload: Record<string, unknown>, key: string) => {
    const value = payload[key];

    if (value === null) {
      return "null";
    }

    if (value === undefined || value === "") {
      return "missing";
    }

    return String(value);
  };

  return (
    <details className="fixed right-3 top-3 z-[80] max-h-[74vh] w-[19rem] overflow-auto rounded-2xl border border-bamboo-100 bg-white/95 p-3 text-xs shadow-soft backdrop-blur">
      <summary className="cursor-pointer font-bold text-bamboo-700">
        Debug
      </summary>
      <div className="mt-3 space-y-2 text-slate-600">
        <p>
          <span className="font-bold text-ink">session_id:</span> {sessionId}
        </p>
        <p>
          <span className="font-bold text-ink">topic_id:</span> {topicId}
        </p>
        <p>
          <span className="font-bold text-ink">question_index:</span>{" "}
          {currentQuestionIndex + 1}
        </p>
        <div className="rounded-xl bg-bamboo-50 p-2">
          {questionStates.map((state, index) => (
            <p key={index}>
              Q{index + 1}: {state.isCompleted ? "done" : "active"} / retry{" "}
              {state.retryUsed ? "yes" : "no"} / goNext{" "}
              {state.canGoNext ? "yes" : "no"}
            </p>
          ))}
        </div>
        <div className="rounded-xl bg-amber-50 p-2">
          <p className="font-bold text-ink">latest TTS</p>
          <p>audio_source: {debugValue(ttsPayload, "audio_source")}</p>
          <p>audio_status: {debugValue(ttsPayload, "audio_status")}</p>
          <p>audio_src: {debugValue(ttsPayload, "audio_src")}</p>
          <p>
            audio_error_reason: {debugValue(ttsPayload, "audio_error_reason")}
          </p>
          <p>tts_status: {debugValue(ttsPayload, "tts_status")}</p>
          <p>tts_error_reason: {debugValue(ttsPayload, "tts_error_reason")}</p>
          <p>voice_name: {debugValue(ttsPayload, "voice_name")}</p>
          <p>voice_lang: {debugValue(ttsPayload, "voice_lang")}</p>
          <p>is_tts_fallback: {debugValue(ttsPayload, "is_tts_fallback")}</p>
        </div>
        <div className="rounded-xl bg-amber-50 p-2">
          <p className="font-bold text-ink">latest speech/transcription</p>
          <p>event_name: {speechEvent?.event_name ?? "missing"}</p>
          <p>input_mode: {debugValue(speechPayload, "input_mode")}</p>
          <p>
            is_mock_transcription:{" "}
            {debugValue(speechPayload, "is_mock_transcription")}
          </p>
          <p>
            transcript_source: {debugValue(speechPayload, "transcript_source")}
          </p>
          <p>asr_provider: {debugValue(speechPayload, "asr_provider")}</p>
          <p>asr_source: {debugValue(speechPayload, "asr_source")}</p>
          <p>audio_status: {debugValue(speechPayload, "audio_status")}</p>
          <p>asr_status: {debugValue(speechPayload, "asr_status")}</p>
          <p>
            raw_transcript: {debugValue(speechPayload, "raw_transcript")}
          </p>
          <p>
            cleaned_transcript:{" "}
            {debugValue(speechPayload, "cleaned_transcript")}
          </p>
          <p>
            has_valid_speech:{" "}
            {debugValue(speechPayload, "has_valid_speech")}
          </p>
          <p>failure_type: {debugValue(speechPayload, "failure_type")}</p>
          <p>asr_latency_ms: {debugValue(speechPayload, "asr_latency_ms")}</p>
          <p>
            audio_mime_type: {debugValue(speechPayload, "audio_mime_type")}
          </p>
          <p>
            audio_duration_seconds:{" "}
            {debugValue(speechPayload, "audio_duration_seconds")}
          </p>
          <p>
            fallback_reason: {debugValue(speechPayload, "fallback_reason")}
          </p>
          <p>fallback_mode: {debugValue(speechPayload, "fallback_mode")}</p>
          <p>
            recognition_status: {debugValue(speechPayload, "recognition_status")}
          </p>
          <p>answer_text: {debugValue(speechPayload, "answer_text")}</p>
        </div>
        <div className="rounded-xl bg-bamboo-50 p-2">
          <p className="font-bold text-ink">latest A03/A04 AI</p>
          <p>event_name: {aiEvent?.event_name ?? "missing"}</p>
          <p>ai_node: {debugValue(aiPayload, "ai_node")}</p>
          <p>ai_provider: {debugValue(aiPayload, "ai_provider")}</p>
          <p>ai_source: {debugValue(aiPayload, "ai_source")}</p>
          <p>fallback_reason: {debugValue(aiPayload, "fallback_reason")}</p>
          <p>llm_latency_ms: {debugValue(aiPayload, "llm_latency_ms")}</p>
        </div>
        <div className="space-y-1">
          {events.map((event) => (
            <div key={event.event_id} className="rounded-xl bg-slate-50 p-2">
              <p className="font-bold text-ink">{event.event_name}</p>
              <p>created_at: {event.timestamp}</p>
              <p>upload_status: {event.upload_status}</p>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

export function PracticeRoom({ topic }: PracticeRoomProps) {
  const [status, setStatus] = useState<PracticeStatus>("idle");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [recognitionSupported, setRecognitionSupported] = useState(true);
  const [recognitionError, setRecognitionError] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [notice, setNotice] = useState("");
  const [showCompletion, setShowCompletion] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [debugFirstText, setDebugFirstText] = useState("");
  const [debugRetryText, setDebugRetryText] = useState("");
  const [debugTextError, setDebugTextError] = useState("");
  const [debugTextSubmitting, setDebugTextSubmitting] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [debugEvents, setDebugEvents] = useState<StoredEvent[]>([]);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputBarRef = useRef<HTMLElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioMimeTypeRef = useRef("");
  const mediaRecorderErrorRef = useRef("");
  const submitLockedRef = useRef(false);
  const trackedRef = useRef({
    answerSubmitted: new Set<number>(),
    polishGenerated: new Set<number>(),
    questionStarted: new Set<number>(),
    retryAnswerSubmitted: new Set<number>(),
    retryClicked: new Set<number>(),
    topicCompleted: false,
    topicStarted: false,
  });
  const [inputBarHeight, setInputBarHeight] = useState(88);
  const [pendingScrollTargetId, setPendingScrollTargetId] = useState<
    string | null
  >(null);
  const [playingQuestionIndex, setPlayingQuestionIndex] = useState<
    number | null
  >(null);
  const [ttsFallbackQuestionIds, setTtsFallbackQuestionIds] = useState<
    string[]
  >([]);
  const [preAnswerByQuestionId, setPreAnswerByQuestionId] = useState<
    Record<string, PreAnswerRecord>
  >({});
  const [preAnswerLoadingIds, setPreAnswerLoadingIds] = useState<string[]>([]);

  const isRetryDebugTextMode = isDebugMode && status === "retryRecording";
  const isRecording =
    status === "recording" ||
    (status === "retryRecording" && !isRetryDebugTextMode);
  const currentQuestion = topic.questions[currentQuestionIndex];

  function getSpeechRecognitionConstructor() {
    if (typeof window === "undefined") {
      return null;
    }

    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };

    return (
      speechWindow.SpeechRecognition ??
      speechWindow.webkitSpeechRecognition ??
      null
    );
  }

  function resetSpeechState() {
    setTranscript("");
    setInterimTranscript("");
    setRecognitionError("");
  }

  function stopRecognition() {
    try {
      recognitionRef.current?.stop();
    } catch {
      // The browser may already have stopped recognition.
    }
  }

  function abortRecognition() {
    try {
      recognitionRef.current?.abort();
    } catch {
      // The browser may already have stopped recognition.
    }
    recognitionRef.current = null;
  }

  function releaseMediaStream() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
  }

  function createRecordedAudioBlob() {
    const chunks = audioChunksRef.current.filter((chunk) => chunk.size > 0);

    if (chunks.length === 0) {
      return null;
    }

    const mimeType = audioMimeTypeRef.current || chunks[0]?.type || "audio/webm";
    const audioBlob = new Blob(chunks, { type: mimeType });

    return audioBlob.size > 0 ? audioBlob : null;
  }

  function stopActiveMediaRecorder() {
    const recorder = mediaRecorderRef.current;

    if (!recorder) {
      releaseMediaStream();
      return;
    }

    if (recorder.state === "recording") {
      recorder.onstop = () => {
        releaseMediaStream();
      };
      try {
        recorder.stop();
      } catch {
        releaseMediaStream();
      }
      return;
    }

    releaseMediaStream();
  }

  function discardMediaRecording() {
    const recorder = mediaRecorderRef.current;
    audioChunksRef.current = [];
    audioMimeTypeRef.current = "";
    mediaRecorderErrorRef.current = "";

    if (recorder?.state === "recording") {
      recorder.onstop = () => {
        releaseMediaStream();
      };
      try {
        recorder.stop();
      } catch {
        releaseMediaStream();
      }
      return;
    }

    releaseMediaStream();
  }

  async function stopMediaRecorderForBlob() {
    const recorder = mediaRecorderRef.current;

    if (!recorder) {
      return createRecordedAudioBlob();
    }

    if (recorder.state !== "recording") {
      releaseMediaStream();
      return createRecordedAudioBlob();
    }

    return await new Promise<Blob | null>((resolve) => {
      const fallbackTimeout = window.setTimeout(() => {
        releaseMediaStream();
        resolve(createRecordedAudioBlob());
      }, 1800);

      recorder.onstop = () => {
        window.clearTimeout(fallbackTimeout);
        releaseMediaStream();
        resolve(createRecordedAudioBlob());
      };

      try {
        recorder.stop();
      } catch {
        window.clearTimeout(fallbackTimeout);
        releaseMediaStream();
        resolve(createRecordedAudioBlob());
      }
    });
  }

  async function startMediaRecording() {
    audioChunksRef.current = [];
    audioMimeTypeRef.current = "";
    mediaRecorderErrorRef.current = "";
    releaseMediaStream();

    if (
      typeof window === "undefined" ||
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      mediaRecorderErrorRef.current = "media_recorder_unsupported";
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioMimeTypeRef.current = recorder.mimeType || mimeType || "audio/webm";

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        mediaRecorderErrorRef.current = "media_recorder_failed";
      };
      recorder.start();
    } catch (error) {
      mediaRecorderErrorRef.current =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "permission_denied"
          : "media_recorder_failed";
      releaseMediaStream();
    }
  }

function getAudioFileExtension(mimeType: string) {
    if (mimeType.includes("mp4")) {
      return "mp4";
    }

    if (mimeType.includes("ogg")) {
      return "ogg";
    }

    if (mimeType.includes("wav")) {
      return "wav";
    }

    return "webm";
  }

  function normalizeAsrTranscript(rawTranscript: string) {
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
    text = applySelfCorrectionCleanup(text);
    text = cleanupSpeechDisfluencies(text);
    text = normalizeAsrFragmentation(text);

    if (text && !/[.!?]$/.test(text)) {
      text = `${text}.`;
    }

    return text;
  }

  function classifyTranscriptLanguageIntent(rawTranscript: string) {
    const normalized = rawTranscript.normalize("NFKC").trim();
    const withoutChineseFillers = normalized.replace(/[嗯呃啊哦唔\s，。！？、,.!?-]+/g, "");
    const chineseChars = normalized.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
    const englishChars = normalized.match(/[a-z]/gi)?.length ?? 0;

    if (!normalized || (!chineseChars && !englishChars)) {
      return "no_valid_speech" as const;
    }

    if (!withoutChineseFillers) {
      return "no_valid_speech" as const;
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

    return "english_answer" as const;
  }

  function normalizeEnglishPracticeLanguage(text: string) {
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

  function normalizeDisplayTranscript(cleanedTranscript: string) {
    const text = normalizeAsrFragmentation(cleanedTranscript)
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

      if (
        previous &&
        shouldMergeDisplayFragment(previous, normalizedSentence)
      ) {
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

  function fixStandaloneDisplayPronoun(text: string) {
    return text.replace(/\bi\b/gi, "I");
  }

  function normalizeAsrFragmentation(text: string) {
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

  function applySelfCorrectionCleanup(text: string) {
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

  function cleanupSpeechDisfluencies(text: string) {
    return text
      .replace(/\b(?:um|uh|er|ah|hmm)\b[,\s]*/gi, "")
      .replace(/\b(i'm|i am)\s*,\s*\1\b/gi, "$1")
      .replace(/\b(i|we|you|they)\s*,\s*\1\b/gi, "$1")
      .replace(/\b(i'm|i am)\s*,\s+(?=\d|twenty|thirty|forty|fifty|sixty)\b/gi, "$1 ")
      .replace(/\s+/g, " ")
      .replace(/\s+([.,!?])/g, "$1")
      .trim();
  }

  function hasValidAnswerText({
    cleanedTranscript,
    questionText,
    answerStructureType,
  }: {
    cleanedTranscript: string;
    questionText: string;
    answerStructureType: Topic["questions"][number]["answerStructureType"];
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
      /^(yes|no|yeah|nope|sometimes|usually|maybe|sure)$/.test(
        answerText,
      )
    );
  }

  function allowsShortAnswerForQuestion(
    questionText: string,
    answerStructureType: Topic["questions"][number]["answerStructureType"],
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
      answerStructureType === "past_present_compare"
    );
  }

  function hasShortAnswerSignal(
    answerText: string,
    questionText: string,
    answerStructureType: Topic["questions"][number]["answerStructureType"],
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

    return false;
  }

  function getAsrFailureType(fallbackReason?: string): AsrFailureType {
    if (fallbackReason === "chinese_answer") {
      return "chinese_answer";
    }

    if (fallbackReason === "mixed_unclear") {
      return "mixed_unclear";
    }

    if (
      fallbackReason === "empty_audio" ||
      fallbackReason === "recording_too_short" ||
      fallbackReason === "empty_transcript" ||
      fallbackReason === "invalid_language_text"
    ) {
      return "no_valid_speech";
    }

    return "technical_failure";
  }

  async function transcribeWithAsr(
    audioBlob: Blob | null,
    kind: "first" | "retry",
    recordedSeconds: number,
  ): Promise<AsrResult> {
    const failureResult = (
      fallbackReason: string,
      latencyMs: number | null = null,
      audioStatus: AudioStatus = "recorded",
      rawTranscript = "",
    ): AsrResult => ({
      rawTranscript,
      cleanedTranscript: "",
      displayTranscript: "",
      provider: "siliconflow",
      source: "none",
      fallbackReason,
      latencyMs,
      audioMimeType: audioBlob?.type || audioMimeTypeRef.current || "",
      audioStatus,
      asrStatus:
        getAsrFailureType(fallbackReason) === "no_valid_speech" ||
        getAsrFailureType(fallbackReason) === "chinese_answer" ||
        getAsrFailureType(fallbackReason) === "mixed_unclear"
          ? getAsrFailureType(fallbackReason) ?? "technical_failure"
          : "technical_failure",
      hasValidSpeech: false,
      failureType: getAsrFailureType(fallbackReason),
    });

    if (recordedSeconds > 0 && recordedSeconds < 1) {
      return failureResult("recording_too_short", null, "too_short");
    }

    if (!audioBlob || audioBlob.size === 0) {
      const fallbackReason = mediaRecorderErrorRef.current || "empty_audio";
      return failureResult(
        fallbackReason,
        null,
        fallbackReason === "empty_audio" ? "empty" : "unavailable",
      );
    }

    const formData = new FormData();
    const mimeType = audioBlob.type || "audio/webm";
    const extension = getAudioFileExtension(mimeType);
    formData.append(
      "audio",
      audioBlob,
      `${currentQuestion.id}-${kind}.${extension}`,
    );
    formData.append("topicId", topic.id);
    formData.append("questionId", currentQuestion.id);
    formData.append("kind", kind);
    formData.append("durationSeconds", String(recordedSeconds));
    formData.append("mimeType", mimeType);

    try {
      const response = await fetch("/api/asr/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        return failureResult("asr_request_failed");
      }

      const result = (await response.json()) as AsrApiResponse;
      const rawTranscript = result.transcript?.trim() ?? "";

      if (result.source === "asr" && rawTranscript) {
        const languageIntent = classifyTranscriptLanguageIntent(rawTranscript);

        if (languageIntent === "chinese_answer") {
          return failureResult("chinese_answer", result.latency, "recorded", rawTranscript);
        }

        if (languageIntent === "mixed_unclear") {
          return failureResult("mixed_unclear", result.latency, "recorded", rawTranscript);
        }

        const cleanedTranscript = normalizeAsrTranscript(rawTranscript);
        const displayTranscript = normalizeDisplayTranscript(cleanedTranscript);
        const hasValidSpeech = hasValidAnswerText({
          cleanedTranscript,
          questionText: currentQuestion.text,
          answerStructureType: currentQuestion.answerStructureType,
        });

        if (!hasValidSpeech) {
          return failureResult("invalid_language_text", result.latency);
        }

        return {
          rawTranscript,
          cleanedTranscript,
          displayTranscript,
          provider: "siliconflow",
          source: "asr",
          fallbackReason: undefined,
          latencyMs: result.latency,
          audioMimeType: mimeType,
          audioStatus: "recorded",
          asrStatus: "success",
          hasValidSpeech: true,
          failureType: null,
        };
      }

      return failureResult(
        result.fallbackReason ?? "empty_transcript",
        result.latency,
      );
    } catch {
      return failureResult("asr_request_failed");
    }
  }

  function startSpeechRecognition() {
    resetSpeechState();
    const SpeechRecognitionConstructor = getSpeechRecognitionConstructor();

    if (!SpeechRecognitionConstructor) {
      setRecognitionSupported(false);
      setRecognitionError("speech_recognition_unsupported");
      trackPracticeEvent("transcription_failed", currentQuestionIndex, {
        ai_node: "A05_ASR_TRANSCRIPTION",
        fallback_available: true,
        fallback_reason: "speech_recognition_unsupported",
        input_mode: "asr",
        is_mock_transcription: false,
        recognition_status: "unsupported",
        reason: "speech_recognition_unsupported",
        transcript_source: "none",
      });
      setNotice("");
      return;
    }

    setRecognitionSupported(true);

    try {
      const recognition = new SpeechRecognitionConstructor();
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let finalText = "";
        let interimText = "";

        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          const text = result[0]?.transcript ?? "";

          if (result.isFinal) {
            finalText += text;
          } else {
            interimText += text;
          }
        }

        if (finalText.trim()) {
          setTranscript((currentTranscript) =>
            `${currentTranscript} ${finalText}`.trim(),
          );
        }
        setInterimTranscript(interimText.trim());
      };
      recognition.onerror = (event) => {
        const error = event.error ?? "speech_recognition_error";
        const fallbackReason = normalizeSpeechFallbackReason(true, error);
        setRecognitionError(fallbackReason);
        trackPracticeEvent("transcription_failed", currentQuestionIndex, {
          ai_node: "A05_ASR_TRANSCRIPTION",
          fallback_available: true,
          fallback_reason: fallbackReason,
          input_mode: "asr",
          is_mock_transcription: false,
          recognition_status: "failed",
          reason: error,
          transcript_source: "none",
        });

        if (
          error === "not-allowed" ||
          error === "service-not-allowed" ||
          error === "audio-capture"
        ) {
          setNotice("");
        }
      };
      recognition.onend = () => {
        recognitionRef.current = null;
      };
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      setRecognitionSupported(true);
      setRecognitionError("recognition_error");
      trackPracticeEvent("transcription_failed", currentQuestionIndex, {
        ai_node: "A05_ASR_TRANSCRIPTION",
        fallback_available: true,
        fallback_reason: "recognition_error",
        input_mode: "asr",
        is_mock_transcription: false,
        recognition_status: "failed",
        reason: "speech_recognition_start_failed",
        transcript_source: "none",
      });
      setNotice("");
    }
  }
  function refreshDebugEvents() {
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("debug") === "1"
    ) {
      setDebugEvents(readSpeakfixEvents().slice(-20).reverse());
    }
  }

  function eventContext(questionIndex = currentQuestionIndex) {
    const question = topic.questions[questionIndex];

    return {
      topic_id: topic.id,
      topic_title: topic.title,
      question_index: questionIndex + 1,
      question_text: question?.text,
    };
  }

  function trackPracticeEvent(
    eventName: string,
    questionIndex = currentQuestionIndex,
    payload: Record<string, unknown> = {},
  ) {
    trackEvent(eventName, {
      ...eventContext(questionIndex),
      payload,
    });
    window.setTimeout(refreshDebugEvents, 80);
  }

  function resetTrackedEvents() {
    trackedRef.current = {
      answerSubmitted: new Set<number>(),
      polishGenerated: new Set<number>(),
      questionStarted: new Set<number>(),
      retryAnswerSubmitted: new Set<number>(),
      retryClicked: new Set<number>(),
      topicCompleted: false,
      topicStarted: false,
    };
  }

  function markTopicStarted() {
    if (trackedRef.current.topicStarted) {
      return;
    }

    trackedRef.current.topicStarted = true;
    trackPracticeEvent("topic_started", 0);
  }

  function markQuestionStarted(questionIndex: number) {
    if (trackedRef.current.questionStarted.has(questionIndex)) {
      return;
    }

    trackedRef.current.questionStarted.add(questionIndex);
    trackPracticeEvent("question_started", questionIndex);
  }

  function wordCount(text: string) {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  async function ensurePreAnswer(questionIndex: number) {
    const question = topic.questions[questionIndex];

    if (
      !question ||
      preAnswerByQuestionId[question.id] ||
      preAnswerLoadingIds.includes(question.id)
    ) {
      return;
    }

    setPreAnswerLoadingIds((ids) => [...ids, question.id]);
    const result = await generatePreAnswerSuggestion(
      createPreAnswerInput(topic, question),
    );

    setPreAnswerByQuestionId((records) => ({
      ...records,
      [question.id]: {
        output: result.data,
        aiProvider: result.ai_provider,
        aiSource: result.ai_source,
        fallbackReason: result.fallback_reason,
        llmLatencyMs: result.llm_latency_ms,
      },
    }));
    setPreAnswerLoadingIds((ids) => ids.filter((id) => id !== question.id));
    trackPracticeEvent("pre_answer_generated", questionIndex, {
      ai_node: "pre_answer",
      ai_provider: result.ai_provider,
      ai_source: result.ai_source,
      fallback_reason: result.fallback_reason,
      generation_mode: result.generation_mode,
      llm_latency_ms: result.llm_latency_ms ?? null,
    });
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      window.setTimeout(() => {
        const container = chatContainerRef.current;

        if (!container) {
          return;
        }

        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      }, 0);
    });
  }

  function ensureElementVisible(element: HTMLElement | null) {
    if (!element) {
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = chatContainerRef.current;

        if (!container) {
          return;
        }

        const containerRect = container.getBoundingClientRect();
        const targetRect = element.getBoundingClientRect();
        const inputHeight = inputBarRef.current?.offsetHeight || inputBarHeight;
        const safeBottom = containerRect.bottom - inputHeight - 24;
        const overflow = targetRect.bottom - safeBottom;

        if (overflow > 0) {
          container.scrollTo({
            top: container.scrollTop + overflow,
            behavior: "smooth",
          });
        }
      });
    });
  }

  useLayoutEffect(() => {
    const inputBar = inputBarRef.current;

    if (!inputBar) {
      return;
    }

    const updateHeight = () => {
      setInputBarHeight(inputBar.offsetHeight || 88);
    };

    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(inputBar);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setIsDebugMode(
      new URLSearchParams(window.location.search).get("debug") === "1",
    );
    setSessionId(getSpeakfixSessionId());
    markTopicStarted();
    refreshDebugEvents();
  }, []);

  useEffect(() => {
    if (!isDebugMode) {
      return;
    }

    const timer = window.setInterval(refreshDebugEvents, 1200);
    return () => window.clearInterval(timer);
  }, [isDebugMode]);

  useEffect(() => {
    if (!isRecording) {
      setRecordingSeconds(0);
      return;
    }

    setRecordingSeconds(1);
    const timer = window.setInterval(() => {
      setRecordingSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording || recordingSeconds < 120) {
      return;
    }

    stopRecognition();
    stopActiveMediaRecorder();
    setNotice("\u672c\u6b21\u5f55\u97f3\u5df2\u5230 120 \u79d2\uff0c\u53ef\u4ee5\u5148\u53d1\u9001\u8fd9\u7248\u56de\u7b54\u3002");
  }, [isRecording, recordingSeconds]);

  useEffect(() => {
    scrollToBottom();
  }, [
    answers,
    currentQuestionIndex,
    inputBarHeight,
    notice,
    showCompletion,
    status,
  ]);

  useEffect(() => {
    if (!pendingScrollTargetId) {
      return;
    }

    requestAnimationFrame(() => {
      const target = chatContainerRef.current?.querySelector<HTMLElement>(
        `[data-scroll-id="${pendingScrollTargetId}"]`,
      );

      ensureElementVisible(target ?? null);
      setPendingScrollTargetId(null);
    });
  }, [pendingScrollTargetId, answers]);

  const progressLabel = useMemo(
    () => `Question ${currentQuestionIndex + 1}/${topic.questions.length}`,
    [currentQuestionIndex, topic.questions.length],
  );

  const questionStates = useMemo(
    () =>
      topic.questions.map((question, questionIndex) => {
        const questionAnswers = answers.filter(
          (answer) => answer.questionIndex === questionIndex,
        );
        const firstAnswer = questionAnswers.find(
          (answer) => answer.kind === "first",
        );
        const retryAnswer = questionAnswers.find(
          (answer) => answer.kind === "retry",
        );

        return {
          canGoNext: Boolean(firstAnswer),
          firstAnswer,
          isCompleted: questionIndex < currentQuestionIndex || showCompletion,
          polishOpened: Boolean(firstAnswer?.polishExpanded),
          question,
          retryAnswer,
          retryFeedbackType: retryAnswer?.retryFeedback?.type,
          retryUsed: Boolean(retryAnswer),
        };
      }),
    [answers, currentQuestionIndex, showCompletion, topic.questions],
  );

  async function playQuestionAudio(
    questionText: string,
    questionIndex: number,
    shouldEnableAnswer = false,
  ) {
    const question = topic.questions[questionIndex];

    setPlayingQuestionIndex(questionIndex);
    const result = question
      ? await playQuestionPromptAudio({
          questionId: question.id,
          questionText,
          topicId: topic.id,
        })
      : await playQuestionPromptAudio({
          questionId: "",
          questionText,
          topicId: topic.id,
        });
    setPlayingQuestionIndex((activeIndex) =>
      activeIndex === questionIndex ? null : activeIndex,
    );
    trackPracticeEvent("tts_playback", questionIndex, {
      ai_node: "A01_TTS_QUESTION",
      audio_error_reason: result.audioErrorReason ?? null,
      audio_source: "pre_generated_audio",
      audio_src: result.audioSrc ?? null,
      audio_status: result.audioStatus ?? "unsupported",
      is_tts_fallback: result.source !== "pre_generated_audio",
      question_text_visible_by_user: result.status !== "played",
      tts_error_reason: result.reason ?? null,
      tts_source: result.source,
      tts_status: result.status === "played" ? "played" : result.status,
      voice_lang: result.voiceLang ?? null,
      voice_name: result.voiceName ?? null,
    });

    if (shouldEnableAnswer) {
      setStatus("readyToAnswer");
    }

    if (result.status !== "played") {
      if (question) {
        setTtsFallbackQuestionIds((questionIds) =>
          questionIds.includes(question.id)
            ? questionIds
            : [...questionIds, question.id],
        );
        setPendingScrollTargetId(`help-${question.id}-original`);
      }
      setNotice("语音播放失败，已为您展开原文，可继续练习。");
    }
  }

  function startQuestion() {
    trackPracticeEvent("practice_started", currentQuestionIndex);
    markQuestionStarted(currentQuestionIndex);
    setStatus("asking");
    void playQuestionAudio(currentQuestion.text, currentQuestionIndex, true);
  }

  function startRecording() {
    if (status === "readyToAnswer") {
      setNotice("");
      setIsTranscribing(false);
      submitLockedRef.current = false;
      // A05_ASR_TRANSCRIPTION: MediaRecorder ASR first, Web Speech and Mock fallback.
      void startMediaRecording();
      startSpeechRecognition();
      setStatus("recording");
    }
  }

  function cancelRecording() {
    abortRecognition();
    discardMediaRecording();
    resetSpeechState();
    setIsTranscribing(false);
    submitLockedRef.current = false;
    setStatus(status === "retryRecording" ? "answered" : "readyToAnswer");
  }

  async function submitAnswerText(
    kind: "first" | "retry",
    answerText: string,
    submissionMeta: TranscriptSubmissionMeta,
  ) {
    const questionSnapshot = currentQuestion;
    const questionIndexSnapshot = currentQuestionIndex;
    const cleanedTranscript = submissionMeta.cleanedTranscript || answerText;
    const rawTranscript = submissionMeta.rawTranscript || cleanedTranscript;
    const displayTranscript =
      submissionMeta.displayTranscript || normalizeDisplayTranscript(cleanedTranscript);
    const submissionSnapshot: SubmissionSnapshot = {
      topicId: topic.id,
      questionId: questionSnapshot.id,
      questionIndex: questionIndexSnapshot + 1,
      questionText: questionSnapshot.text,
      answerStructureType: questionSnapshot.answerStructureType,
      rawTranscript,
      cleanedTranscript,
      displayTranscript,
    };
    const firstAnswer = answers.find(
      (answer) =>
        answer.questionIndex === questionIndexSnapshot && answer.kind === "first",
    );

    if (!cleanedTranscript.trim()) {
      trackPracticeEvent("transcription_failed", questionIndexSnapshot, {
        ai_node: "A05_ASR_TRANSCRIPTION",
        fallback_reason:
          submissionMeta.fallbackReason ?? "empty_transcription",
        fallback_mode: submissionMeta.fallbackMode ?? "mock_fallback",
        input_mode: submissionMeta.inputMode,
        is_mock_transcription: submissionMeta.isMockTranscription,
        reason: recognitionError || "empty_transcription",
        recognition_status: submissionMeta.recognitionStatus,
        asr_provider: submissionMeta.asrProvider,
        asr_source: submissionMeta.asrSource,
        asr_latency_ms: submissionMeta.asrLatencyMs,
        audio_status: submissionMeta.audioStatus,
        asr_status: submissionMeta.asrStatus,
        raw_transcript: submissionMeta.rawTranscript,
        cleaned_transcript: submissionMeta.cleanedTranscript,
        display_transcript: displayTranscript,
        has_valid_speech: submissionMeta.hasValidSpeech,
        failure_type: submissionMeta.failureType,
        audio_mime_type: submissionMeta.audioMimeType,
        audio_duration_seconds: submissionMeta.recordedSeconds,
        transcript_source: submissionMeta.transcriptSource,
      });
      setNotice("\u6ca1\u6709\u8bc6\u522b\u5230\u6709\u6548\u56de\u7b54\uff0c\u8bf7\u518d\u8bd5\u4e00\u6b21\u3002");
      submitLockedRef.current = false;
      setStatus("readyToAnswer");
      return;
    }

    const answerLength = wordCount(cleanedTranscript);
    const answerId = `${submissionSnapshot.questionId}-${kind}-${Date.now()}`;
    const answerDuration = Math.max(submissionMeta.recordedSeconds, 4);
    setAnswers((prevAnswers) => [
      ...prevAnswers,
      {
        id: answerId,
        messageType: kind === "retry" ? "retry_answer" : "user_answer",
        questionIndex: questionIndexSnapshot,
        kind,
        duration: answerDuration,
        text: cleanedTranscript,
        rawTranscript,
        cleanedTranscript,
        displayTranscript,
        polishExpanded: true,
        assistGenerating: true,
      },
    ]);
    setPendingScrollTargetId(`answer-assist-${answerId}`);
    resetSpeechState();
    setStatus("answered");

    const polishResult =
      kind === "first"
        ? await generatePolishSuggestion(
            createPolishInput(
              topic,
              questionSnapshot,
              questionIndexSnapshot,
              cleanedTranscript,
              {
                rawTranscript: submissionSnapshot.rawTranscript,
                cleanedTranscript: submissionSnapshot.cleanedTranscript,
                displayTranscript: submissionSnapshot.displayTranscript,
              },
            ),
          )
        : undefined;
    const retrySnapshot: RetrySubmissionSnapshot | undefined =
      kind === "retry"
        ? {
            ...submissionSnapshot,
            firstAnswerCleanedTranscript:
              firstAnswer?.cleanedTranscript ?? firstAnswer?.text ?? "",
            polishedAnswer: firstAnswer?.polish?.polishedAnswer ?? "",
            extensionSentence: firstAnswer?.polish?.expansionSentence ?? "",
            retryRawTranscript: rawTranscript,
            retryCleanedTranscript: cleanedTranscript,
            retryDisplayTranscript: displayTranscript,
          }
        : undefined;
    const retryFeedbackResult =
      kind === "retry" && retrySnapshot
        ? await generateRetryFeedback({
            topic_id: retrySnapshot.topicId,
            question_id: retrySnapshot.questionId,
            question_index: retrySnapshot.questionIndex,
            answerStructureType: retrySnapshot.answerStructureType,
            question_text: retrySnapshot.questionText,
            first_answer: retrySnapshot.firstAnswerCleanedTranscript,
            first_cleaned_transcript: retrySnapshot.firstAnswerCleanedTranscript,
            polished_answer: retrySnapshot.polishedAnswer,
            expansion_sentence: retrySnapshot.extensionSentence,
            retry_answer: retrySnapshot.retryCleanedTranscript,
            retry_cleaned_transcript: retrySnapshot.retryCleanedTranscript,
            retry_raw_transcript: retrySnapshot.retryRawTranscript,
            retry_display_transcript: retrySnapshot.retryDisplayTranscript,
          })
        : undefined;
    const polish = polishResult ? toPolishViewModel(polishResult) : undefined;
    const retryFeedback = retryFeedbackResult
      ? toRetryFeedbackViewModel(
          retryFeedbackResult,
           createMarkedRetryTranscript(
             displayTranscript,
             firstAnswer?.displayTranscript ??
               firstAnswer?.cleanedTranscript ??
               firstAnswer?.text ??
               "",
             retrySnapshot?.polishedAnswer ?? "",
             retrySnapshot?.extensionSentence ?? "",
           ),
         )
       : undefined;
    const hasPolishOutput = Boolean(
      polish?.polishedAnswer || polish?.noPolishNeeded,
    );

    if (answerLength < 3) {
      trackPracticeEvent("answer_too_short_detected", questionIndexSnapshot, {
        answer_text: cleanedTranscript,
        answer_length: answerLength,
      });
    }

    if (
      kind === "first" &&
      (!hasPolishOutput || polishResult?.fallback_used)
    ) {
      trackPracticeEvent("ai_generation_failed", questionIndexSnapshot, {
        ai_node: "polish",
        ai_provider: polishResult?.ai_provider,
        ai_source: polishResult?.ai_source ?? "mock_fallback",
        fallback_reason:
          polishResult?.fallback_reason ??
          polishResult?.failure_reason ??
          "empty_polish",
        llm_latency_ms: polishResult?.llm_latency_ms ?? null,
        reason:
          polishResult?.fallback_reason ??
          polishResult?.failure_reason ??
          "empty_polish",
      });
      if (!hasPolishOutput) {
        setNotice("\u6da6\u8272\u5185\u5bb9\u6682\u65f6\u751f\u6210\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002");
      }
    }

    if (kind === "retry" && retryFeedbackResult?.fallback_used) {
      trackPracticeEvent("ai_generation_failed", questionIndexSnapshot, {
        ai_node: "retry_feedback",
        ai_provider: retryFeedbackResult.ai_provider,
        ai_source: retryFeedbackResult.ai_source,
        fallback_reason:
          retryFeedbackResult.fallback_reason ??
          retryFeedbackResult.failure_reason ??
          "retry_feedback_failed",
        llm_latency_ms: retryFeedbackResult.llm_latency_ms ?? null,
        reason:
          retryFeedbackResult.fallback_reason ??
          retryFeedbackResult.failure_reason ??
          "retry_feedback_failed",
      });
      setNotice("\u91cd\u8bf4\u53cd\u9988\u6682\u65f6\u751f\u6210\u5931\u8d25\uff0c\u4f46\u60a8\u7684\u91cd\u8bf4\u56de\u7b54\u5df2\u4fdd\u5b58\u3002");
    }

    setAnswers((prevAnswers) =>
      prevAnswers.map((answer) =>
        answer.id === answerId
          ? {
              ...answer,
              assistGenerating: false,
              polishExpanded: true,
              polish,
              retryFeedback,
            }
          : answer,
      ),
    );
    setPendingScrollTargetId(`answer-assist-${answerId}`);

    if (
      kind === "first" &&
      !trackedRef.current.answerSubmitted.has(questionIndexSnapshot)
    ) {
      trackedRef.current.answerSubmitted.add(questionIndexSnapshot);
      trackPracticeEvent("answer_submitted", questionIndexSnapshot, {
        ai_node: "A05_ASR_TRANSCRIPTION",
        answer_text: cleanedTranscript,
        answer_length: answerLength,
        fallback_reason: submissionMeta.fallbackReason,
        fallback_mode: submissionMeta.fallbackMode,
        input_mode: submissionMeta.inputMode,
        is_mock_transcription: submissionMeta.isMockTranscription,
        recognition_status: submissionMeta.recognitionStatus,
        asr_provider: submissionMeta.asrProvider,
        asr_source: submissionMeta.asrSource,
        asr_latency_ms: submissionMeta.asrLatencyMs,
        audio_status: submissionMeta.audioStatus,
        asr_status: submissionMeta.asrStatus,
        raw_transcript: submissionMeta.rawTranscript,
        cleaned_transcript: submissionMeta.cleanedTranscript,
        display_transcript: displayTranscript,
        has_valid_speech: submissionMeta.hasValidSpeech,
        failure_type: submissionMeta.failureType,
        audio_mime_type: submissionMeta.audioMimeType,
        audio_duration_seconds: submissionMeta.recordedSeconds,
        recording_duration_seconds: submissionMeta.recordedSeconds,
        transcript_source: submissionMeta.transcriptSource,
      });
    }

    if (
      kind === "first" &&
      polish &&
      hasPolishOutput &&
      !trackedRef.current.polishGenerated.has(questionIndexSnapshot)
    ) {
      trackedRef.current.polishGenerated.add(questionIndexSnapshot);
      trackPracticeEvent("polish_generated", questionIndexSnapshot, {
        ai_success: polish.aiSuccess,
        ai_node: "polish",
        ai_provider: polish.aiProvider,
        ai_source: polish.aiSource,
        fallback_used: polish.fallbackUsed,
        fallback_reason: polish.fallbackReason,
        failure_reason: polish.failureReason,
        generation_mode: polish.generationMode,
        llm_latency_ms: polish.llmLatencyMs ?? null,
        a03_generated: hasPolishOutput,
        marked_error_count: polish.markedErrorCount,
        marked_improve_count: polish.markedImproveCount,
        should_expand: polish.shouldExpand,
        expansion_type: polish.expansionType,
        polished_word_count: wordCount(polish.polishedAnswer),
        estimated_speaking_seconds: polish.estimatedSpeakingSeconds,
      });
    }

    if (
      kind === "retry" &&
      retryFeedback &&
      !trackedRef.current.retryAnswerSubmitted.has(questionIndexSnapshot)
    ) {
      trackedRef.current.retryAnswerSubmitted.add(questionIndexSnapshot);
      trackPracticeEvent("retry_feedback_generated", questionIndexSnapshot, {
        ai_node: "retry_feedback",
        ai_provider: retryFeedback.aiProvider,
        ai_source: retryFeedback.aiSource,
        fallback_reason: retryFeedback.fallbackReason,
        feedback_generation_mode: retryFeedback.generationMode,
        llm_latency_ms: retryFeedback.llmLatencyMs ?? null,
        retry_feedback_type: retryFeedback.type,
      });
      trackPracticeEvent("retry_answer_submitted", questionIndexSnapshot, {
        ai_node: "A05_ASR_TRANSCRIPTION",
        retry_ai_node: "retry_feedback",
        retry_ai_provider: retryFeedback.aiProvider,
        retry_ai_source: retryFeedback.aiSource,
        retry_fallback_reason: retryFeedback.fallbackReason,
        retry_llm_latency_ms: retryFeedback.llmLatencyMs ?? null,
        fallback_reason: submissionMeta.fallbackReason,
        fallback_mode: submissionMeta.fallbackMode,
        feedback_generation_mode: retryFeedback.generationMode,
        input_mode: submissionMeta.inputMode,
        is_mock_transcription: submissionMeta.isMockTranscription,
        recognition_status: submissionMeta.recognitionStatus,
        asr_provider: submissionMeta.asrProvider,
        asr_source: submissionMeta.asrSource,
        asr_latency_ms: submissionMeta.asrLatencyMs,
        audio_status: submissionMeta.audioStatus,
        asr_status: submissionMeta.asrStatus,
        raw_transcript: submissionMeta.rawTranscript,
        cleaned_transcript: submissionMeta.cleanedTranscript,
        display_transcript: displayTranscript,
        has_valid_speech: submissionMeta.hasValidSpeech,
        failure_type: submissionMeta.failureType,
        audio_mime_type: submissionMeta.audioMimeType,
        audio_duration_seconds: submissionMeta.recordedSeconds,
        recording_duration_seconds: submissionMeta.recordedSeconds,
        transcript_source: submissionMeta.transcriptSource,
        retry_answer_text: cleanedTranscript,
        retry_feedback_type: retryFeedback.type,
      });
    }

    if (!submissionMeta.isMockTranscription) {
      setNotice("");
    } else {
      setNotice(getMockFallbackNotice(submissionMeta.fallbackReason ?? undefined));
    }
    submitLockedRef.current = false;
  }

  async function submitRecording() {
    if (!isRecording || submitLockedRef.current) {
      return;
    }

    submitLockedRef.current = true;
    const kind = status === "retryRecording" ? "retry" : "first";
    const recordedSeconds = recordingSeconds;
    stopRecognition();
    setIsTranscribing(true);
    setNotice("正在识别你的回答...");
    const audioBlob = await stopMediaRecorderForBlob();
    const asrResult = await transcribeWithAsr(audioBlob, kind, recordedSeconds);
    setIsTranscribing(false);

    if (!asrResult.hasValidSpeech) {
      trackPracticeEvent("transcription_failed", currentQuestionIndex, {
        ai_node: "A05_ASR_TRANSCRIPTION",
        audio_status: asrResult.audioStatus,
        asr_status: asrResult.asrStatus,
        raw_transcript: asrResult.rawTranscript,
        cleaned_transcript: asrResult.cleanedTranscript,
        display_transcript: asrResult.displayTranscript,
        has_valid_speech: false,
        failure_type: asrResult.failureType,
        fallback_reason: asrResult.fallbackReason ?? null,
        fallback_mode: undefined,
        input_mode: "asr",
        is_mock_transcription: false,
        recognition_status: asrResult.asrStatus,
        asr_provider: asrResult.provider,
        asr_source: asrResult.source,
        asr_latency_ms: asrResult.latencyMs,
        audio_mime_type: asrResult.audioMimeType,
        audio_duration_seconds: recordedSeconds,
        recording_duration_seconds: recordedSeconds,
        transcript_source: "none",
      });
      resetSpeechState();
      setNotice(
        asrResult.failureType === "no_valid_speech"
          ? "没有听清，再说一次吧~"
          : asrResult.failureType === "chinese_answer"
            ? "这是英语口语练习，请用英文回答哦~"
            : asrResult.failureType === "mixed_unclear"
              ? "请尽量用完整英文再说一次~"
              : "转写暂时失败，请再试一次~",
      );
      submitLockedRef.current = false;
      setStatus(kind === "retry" ? "answered" : "readyToAnswer");
      return;
    }

    await submitAnswerText(kind, asrResult.cleanedTranscript, {
      recordedSeconds,
      fallbackReason: null,
      fallbackMode: undefined,
      inputMode: "asr",
      isMockTranscription: false,
      recognitionStatus: "success",
      asrProvider: asrResult.provider,
      asrSource: asrResult.source,
      asrLatencyMs: asrResult.latencyMs,
      audioMimeType: asrResult.audioMimeType,
      transcriptSource: "siliconflow_asr",
      audioStatus: asrResult.audioStatus,
      asrStatus: asrResult.asrStatus,
      rawTranscript: asrResult.rawTranscript,
      cleanedTranscript: asrResult.cleanedTranscript,
      displayTranscript: asrResult.displayTranscript,
      hasValidSpeech: asrResult.hasValidSpeech,
      failureType: null,
    });
  }

  async function submitDebugText(kind: "first" | "retry") {
    if (!isDebugMode || submitLockedRef.current || debugTextSubmitting) {
      return;
    }

    if (kind === "first" && status !== "readyToAnswer") {
      return;
    }

    if (kind === "retry" && status !== "retryRecording") {
      return;
    }

    const rawText = kind === "first" ? debugFirstText : debugRetryText;
    const answerText = rawText.trim();

    if (!answerText) {
      setDebugTextError("请输入测试文本后再提交。");
      return;
    }

    setDebugTextError("");
    setDebugTextSubmitting(true);
    submitLockedRef.current = true;

    try {
      await submitAnswerText(kind, answerText, {
        recordedSeconds: 0,
        fallbackReason: null,
        fallbackMode: undefined,
        inputMode: "debug_text",
        isMockTranscription: false,
        recognitionStatus: "skipped_for_debug_text",
        asrProvider: "skipped",
        asrSource: "skipped_for_debug_text",
        asrLatencyMs: null,
        audioMimeType: undefined,
        transcriptSource: "debug_text",
        audioStatus: "skipped_for_debug_text",
        asrStatus: "skipped_for_debug_text",
        rawTranscript: answerText,
        cleanedTranscript: answerText,
        displayTranscript: answerText,
        hasValidSpeech: true,
        failureType: null,
      });

      if (kind === "first") {
        setDebugFirstText("");
      } else {
        setDebugRetryText("");
      }
    } finally {
      submitLockedRef.current = false;
      setDebugTextSubmitting(false);
    }
  }

  function toggleAnswerAssist(answerId: string, shouldExpand: boolean) {
    const targetAnswer = answers.find((answer) => answer.id === answerId);

    setAnswers((prevAnswers) =>
      prevAnswers.map((answer) =>
        answer.id === answerId
          ? { ...answer, polishExpanded: !answer.polishExpanded }
          : answer,
      ),
    );
    setStatus("polishExpanded");

    if (shouldExpand) {
      const questionIndex = targetAnswer?.questionIndex ?? currentQuestionIndex;

      if (targetAnswer?.kind === "first") {
        trackPracticeEvent("polish_expand_opened", questionIndex, {
          answer_id: answerId,
        });
      }

      setPendingScrollTargetId(
        targetAnswer?.kind === "first"
          ? `question-followup-${targetAnswer.questionIndex}`
          : `answer-assist-${answerId}`,
      );
    }
  }

  function retryQuestion() {
    const retryUsed = answers.some(
      (answer) =>
        answer.questionIndex === currentQuestionIndex && answer.kind === "retry",
    );

    if (!retryUsed) {
      trackedRef.current.retryClicked.add(currentQuestionIndex);
      trackPracticeEvent("retry_clicked", currentQuestionIndex);
      setNotice("");
      setIsTranscribing(false);
      submitLockedRef.current = false;
      if (isDebugMode) {
        setDebugTextError("");
        setStatus("retryRecording");
        return;
      }
      // A05_ASR_TRANSCRIPTION: MediaRecorder ASR first, Web Speech and Mock fallback.
      void startMediaRecording();
      startSpeechRecognition();
      setStatus("retryRecording");
    }
  }

  function replayAnswerAudio() {
    setNotice("\u5f53\u524d\u4e3a\u6a21\u62df\u8f6c\u5199\uff0c\u6682\u65e0\u5f55\u97f3\u53ef\u64ad\u653e\u3002");
  }

  function goNextQuestion() {
    const isLastQuestion = currentQuestionIndex === topic.questions.length - 1;

    if (isLastQuestion) {
      if (!trackedRef.current.topicCompleted) {
        trackedRef.current.topicCompleted = true;
        trackPracticeEvent("topic_completed", currentQuestionIndex);
      }
      setStatus("completed");
      setShowCompletion(true);
      return;
    }

    const nextQuestionIndex = currentQuestionIndex + 1;
    const nextQuestion = topic.questions[nextQuestionIndex];

    setCurrentQuestionIndex(nextQuestionIndex);
    markQuestionStarted(nextQuestionIndex);
    setStatus("asking");
    if (nextQuestion) {
      void playQuestionAudio(nextQuestion.text, nextQuestionIndex, true);
    }
  }

  function restartTopic() {
    resetTrackedEvents();
    setSessionId(resetSpeakfixSessionId());
    setCurrentQuestionIndex(0);
    setAnswers([]);
    setRecordingSeconds(0);
    resetSpeechState();
    abortRecognition();
    discardMediaRecording();
    setIsTranscribing(false);
    setNotice("");
    setDebugFirstText("");
    setDebugRetryText("");
    setDebugTextError("");
    setDebugTextSubmitting(false);
    submitLockedRef.current = false;
    setTtsFallbackQuestionIds([]);
    setPreAnswerByQuestionId({});
    setPreAnswerLoadingIds([]);
    setStatus("idle");
    setShowCompletion(false);
    window.setTimeout(() => {
      markTopicStarted();
      refreshDebugEvents();
    }, 0);
  }

  function renderAiMessage(questionIndex: number) {
    const question = topic.questions[questionIndex];
    const isActiveQuestion = questionIndex === currentQuestionIndex;
    const isCurrentlyAsking = isActiveQuestion && status === "asking";
    const isQuestionPlaying =
      playingQuestionIndex === questionIndex || isCurrentlyAsking;
    const preAnswerRecord = preAnswerByQuestionId[question.id];
    const preHelpOutput = preAnswerRecord?.output;
    const preHelpLoading = preAnswerLoadingIds.includes(question.id);

    return (
      <div key={`ai-${question.id}`} className="space-y-0">
        <div className="rounded-t-[22px] border border-b-0 border-bamboo-100 bg-bamboo-50 px-4 py-3 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-ink">
              Question {questionIndex + 1}
              <span className="px-1.5 text-bamboo-600">·</span>
              {isQuestionPlaying ? "正在播放" : "已播放"}
            </p>
            <div className="flex items-center rounded-full bg-white px-2 py-1.5">
              <button
                type="button"
                onClick={() =>
                  void playQuestionAudio(question.text, questionIndex)
                }
                className="rounded-full bg-bamboo-50 px-2 py-1 text-xs font-bold text-bamboo-700"
              >
                重播
              </button>
            </div>
          </div>
        </div>

        {!isCurrentlyAsking && (
          <AssistTabs
            forcedAssist={
              ttsFallbackQuestionIds.includes(question.id) ? "original" : null
            }
            question={question}
            preHelpOutput={preHelpOutput}
            preHelpLoading={preHelpLoading}
            scrollIdBase={`help-${question.id}`}
            onIdeaRequested={() => {
              void ensurePreAnswer(questionIndex);
            }}
            onExpandedChange={(scrollId) => {
              if (scrollId) {
                const helpType = scrollId.split("-").at(-1);
                trackPracticeEvent("pre_help_opened", questionIndex, {
                  help_type: helpType,
                });
                setPendingScrollTargetId(scrollId);
              }
            }}
          />
        )}
      </div>
    );
  }

  function renderAnswer(answer: AnswerRecord) {
    const isRetryAnswer = answer.kind === "retry";
    const transcriptSegments =
      isRetryAnswer && answer.retryFeedback?.markedRetryTranscript
        ? answer.retryFeedback.markedRetryTranscript
        : answer.kind === "first" && answer.polish?.markedTranscript
        ? answer.polish.markedTranscript
        : [{ text: answer.displayTranscript || answer.text, type: "normal" as const }];
    const hasAdoptedSegment =
      isRetryAnswer &&
      answer.retryFeedback?.markedRetryTranscript.some(
        (segment) => segment.type === "adopted",
      );

    return (
      <div key={answer.id} className="space-y-0.5">
        <div
          className="ml-auto max-w-[86%] rounded-[22px] border border-bamboo-100 bg-bamboo-50 px-4 py-3 text-ink shadow-soft"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-6">
                {transcriptSegments.map((segment, index) => (
                  <span
                    key={`${answer.id}-${index}`}
                    className={
                      segment.type === "error"
                        ? "rounded bg-red-50 px-1 font-semibold text-red-600"
                        : segment.type === "improve"
                          ? "rounded bg-amber-50 px-1 font-semibold text-amber-600"
                          : segment.type === "adopted"
                            ? "rounded bg-bamboo-100 px-1 font-semibold text-bamboo-700"
                            : ""
                    }
                  >
                    {segment.text}
                  </span>
                ))}
              </p>
            </div>
            <button
              type="button"
              onClick={replayAnswerAudio}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-bold text-bamboo-700"
              aria-label="\u56de\u542c\u5f55\u97f3"
            >
              ▶
            </button>
          </div>
        </div>

        <div className="ml-auto -mt-0.5 max-w-[86%] rounded-b-2xl bg-bamboo-50/70 px-3 pb-2 pt-1">
          <button
            type="button"
            onClick={() =>
              toggleAnswerAssist(answer.id, !answer.polishExpanded)
            }
            className="flex w-full items-center justify-between text-left text-sm font-bold text-bamboo-700"
          >
            {isRetryAnswer ? "重说反馈" : "润色扩展"}
            <ChevronIcon
              className={`h-4 w-4 transition ${
                answer.polishExpanded ? "rotate-90" : ""
              }`}
            />
          </button>

          {answer.polishExpanded && (
            answer.assistGenerating ? (
              <div
                className="mt-1 rounded-xl bg-white/80 px-3 py-2 text-sm font-semibold leading-6 text-slate-500"
                data-scroll-id={`answer-assist-${answer.id}`}
              >
                {isRetryAnswer ? "AI 正在生成重说反馈..." : "AI 正在生成润色扩展..."}
              </div>
            ) : isRetryAnswer ? (
              <div
                className="mt-1 rounded-xl bg-white/80 px-3 py-2 text-sm leading-6 text-slate-700"
                data-scroll-id={`answer-assist-${answer.id}`}
              >
                {hasAdoptedSegment && (
                  <p className="mb-1 text-xs font-semibold text-slate-400">
                    <span className="text-bamboo-700">绿色</span>
                    ＝已采纳润色/扩展表达
                  </p>
                )}
                <p className="mt-1">{answer.retryFeedback?.text}</p>
              </div>
            ) : (
              <div
                className="mt-1 grid gap-2"
                data-scroll-id={`answer-assist-${answer.id}`}
              >
                <p className="px-1 text-xs font-semibold text-slate-400">
                  <span className="text-red-600">红色</span>
                  ＝语法错误；<span className="text-amber-600">橙色</span>
                  ＝雅思口语化优化
                </p>
                <div className="rounded-xl bg-white/80 px-3 py-2 text-sm leading-6 text-slate-700">
                  {answer.polish?.noPolishNeeded ? (
                    <p>
                      <span className="font-bold text-ink">润色：</span>
                      <span className="text-bamboo-800">
                        说得很自然，继续加油！
                      </span>
                    </p>
                  ) : (
                    <p>
                      <span className="font-bold text-ink">润色：</span>
                      <span className="text-bamboo-800">
                        {answer.polish?.polishedAnswer}
                      </span>
                    </p>
                  )}
                  {answer.polish?.shouldExpand &&
                    answer.polish.expansionSentence.trim() && (
                      <p className="mt-1">
                        <span className="font-bold text-ink">扩展：</span>
                        {`${answer.polish.expansionType}。${answer.polish.expansionSentence}`}
                      </p>
                    )}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    );
  }

  const currentAnswers = answers.filter(
    (answer) => answer.questionIndex === currentQuestionIndex,
  );
  const currentHasAnswer = currentAnswers.length > 0;
  const currentAssistGenerating = currentAnswers.some(
    (answer) => answer.assistGenerating,
  );
  const currentRetryUsed = currentAnswers.some(
    (answer) => answer.kind === "retry",
  );
  const shouldShowCurrentControls =
    currentHasAnswer &&
    !currentAssistGenerating &&
    !isRecording &&
    status !== "completed" &&
    status !== "retryRecording" &&
    currentQuestionIndex === answers[answers.length - 1]?.questionIndex;
  const shouldShowDebugFirstInput = isDebugMode && status === "readyToAnswer";
  const shouldShowDebugRetryInput =
    isDebugMode && status === "retryRecording";
  const shouldShowDebugTextInput =
    shouldShowDebugFirstInput || shouldShowDebugRetryInput;
  const debugTextKind = shouldShowDebugRetryInput ? "retry" : "first";
  const debugTextValue =
    debugTextKind === "retry" ? debugRetryText : debugFirstText;
  const debugTextPlaceholder =
    debugTextKind === "retry"
      ? "输入重说测试文本"
      : "输入首次回答测试文本";
  const debugTextButtonLabel =
    debugTextKind === "retry" ? "提交重说测试文本" : "提交测试文本";

  return (
    <main className="relative mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden">
      <PracticeHeader
        title={topic.title}
        current={currentQuestionIndex + 1}
        total={topic.questions.length}
        onRestart={restartTopic}
      />

      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto overscroll-contain px-5 py-5"
        style={{ paddingBottom: inputBarHeight + 24 }}
      >
        <section className="rounded-[26px] border border-bamboo-100 bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-bamboo-50 px-3 py-1 text-xs font-bold text-bamboo-700">
              {topic.title}
            </span>
            <span className="text-xs font-semibold text-slate-500">
              {progressLabel}
            </span>
          </div>

          {status === "idle" && answers.length === 0 && (
            <div className="mt-6">
              <p className="text-lg font-bold text-ink">
                点击开始练习，系统播放语音
              </p>
              <button
                type="button"
                onClick={startQuestion}
                className="mt-5 min-h-12 rounded-2xl bg-bamboo-600 px-5 text-base font-bold text-white shadow-soft"
              >
                开始练习
              </button>
            </div>
          )}
        </section>

        <section className="mt-4 space-y-4">
          {topic.questions
            .slice(0, status === "idle" && answers.length === 0 ? 0 : currentQuestionIndex + 1)
            .map((question, questionIndex) => (
              <div key={question.id} className="space-y-3">
                {renderAiMessage(questionIndex)}
                <div
                  className="space-y-3"
                  data-scroll-id={`question-followup-${questionIndex}`}
                >
                  {answers
                    .filter((answer) => answer.questionIndex === questionIndex)
                    .map(renderAnswer)}

                  {shouldShowCurrentControls &&
                    questionIndex === currentQuestionIndex && (
                      <div className="grid grid-cols-2 gap-3">
                        {!currentRetryUsed ? (
                          <button
                            type="button"
                            onClick={retryQuestion}
                            className="min-h-12 rounded-2xl border border-bamboo-200 bg-bamboo-50 px-3 text-sm font-bold text-bamboo-700"
                          >
                            再说一次本题
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="min-h-12 rounded-2xl border border-bamboo-100 bg-white px-3 text-sm font-bold text-slate-300"
                          >
                            已重说一次
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={goNextQuestion}
                          className="min-h-12 rounded-2xl bg-bamboo-600 px-3 text-sm font-bold text-white shadow-soft"
                        >
                          {currentQuestionIndex === topic.questions.length - 1
                            ? "\u5b8c\u6210\u672c\u8bdd\u9898"
                            : "\u4e0b\u4e00\u9898"}
                        </button>
                      </div>
                    )}
                </div>
              </div>
            ))}
          {notice && (
            <div className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-500 shadow-soft">
              {notice}
            </div>
          )}
          <div ref={messagesEndRef} className="h-px" />
        </section>
      </div>

      <footer
        ref={inputBarRef}
        className="absolute inset-x-0 bottom-0 z-30 border-t border-bamboo-100 bg-white/95 px-5 py-4 backdrop-blur"
      >
        <div className="mx-auto w-full max-w-[430px]">
          {isRecording ? (
            <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3 rounded-full border border-bamboo-100 bg-bamboo-50 p-2 shadow-soft">
              <button
                type="button"
                onClick={cancelRecording}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-500"
                aria-label="取消录音"
              >
                <XIcon className="h-5 w-5" />
              </button>
              <div className="text-center">
                <p className="text-sm font-bold text-ink">
                  {isTranscribing
                    ? "正在识别你的回答..."
                    : `录音中 ${formatTime(recordingSeconds)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={submitRecording}
                disabled={isTranscribing}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-bamboo-600 text-white disabled:bg-slate-300"
                aria-label="\u53d1\u9001\u5f55\u97f3"
              >
                <SendIcon className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              disabled={status !== "readyToAnswer"}
              className="flex min-h-14 w-full items-center justify-center gap-3 rounded-full border border-bamboo-100 bg-white px-5 text-base font-bold text-bamboo-700 shadow-soft disabled:text-slate-300"
            >
              <WaveIcon className="h-5 w-8" />
              点击说话
            </button>
          )}
          {shouldShowDebugTextInput && (
            <div className="mt-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-3 py-3">
              <p className="mb-2 text-xs font-bold text-amber-700">
                仅 Debug 测试可见
              </p>
              <textarea
                value={debugTextValue}
                onChange={(event) => {
                  setDebugTextError("");
                  if (debugTextKind === "retry") {
                    setDebugRetryText(event.target.value);
                  } else {
                    setDebugFirstText(event.target.value);
                  }
                }}
                placeholder={debugTextPlaceholder}
                rows={3}
                className="w-full resize-none rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm leading-5 text-ink outline-none placeholder:text-slate-400 focus:border-amber-400"
              />
              {debugTextError && (
                <p className="mt-1 text-xs font-semibold text-red-600">
                  {debugTextError}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  void submitDebugText(debugTextKind);
                }}
                disabled={debugTextSubmitting}
                className="mt-2 min-h-10 w-full rounded-xl bg-amber-500 px-3 text-sm font-bold text-white shadow-soft disabled:bg-slate-300"
              >
                {debugTextSubmitting ? "提交中..." : debugTextButtonLabel}
              </button>
            </div>
          )}
        </div>
      </footer>

      <CompletionModal
        isOpen={showCompletion}
        onClose={() => setShowCompletion(false)}
      />
      {isDebugMode && (
        <DebugPanel
          currentQuestionIndex={currentQuestionIndex}
          events={debugEvents}
          questionStates={questionStates}
          sessionId={sessionId}
          topicId={topic.id}
        />
      )}
    </main>
  );
}
