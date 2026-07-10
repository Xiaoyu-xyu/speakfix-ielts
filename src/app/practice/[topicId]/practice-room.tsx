"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AssistTabs } from "@/components/AssistTabs";
import { CompletionModal } from "@/components/CompletionModal";
import { PracticeHeader } from "@/components/PracticeHeader";
import {
  createPreHelpInput,
  createPolishInput,
  generatePolishSuggestion,
  generatePreHelp,
  generateRetryFeedback,
  type AiServiceResult,
  type ExpansionType,
  type MarkedTranscriptSegment,
  type PolishResult,
  type RetryFeedbackResult,
} from "@/lib/ai";
import { speakQuestionText } from "@/lib/tts";
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

function getMockFallbackNotice(fallbackReason?: string) {
  if (fallbackReason === "speech_recognition_unsupported") {
    return "当前浏览器语音识别不可用，已使用模拟转写继续练习。";
  }

  if (fallbackReason === "recognition_empty") {
    return "未识别到有效语音，已使用模拟转写继续练习。";
  }

  return "已使用模拟转写继续练习。";
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
    ["polish_generated", "retry_feedback_generated"].includes(event.event_name),
  );
  const speechPayload = speechEvent?.payload ?? {};
  const ttsPayload = ttsEvent?.payload ?? {};
  const aiPayload = aiEvent?.payload ?? {};
  const debugValue = (payload: Record<string, unknown>, key: string) => {
    const value = payload[key];

    if (value === undefined || value === null || value === "") {
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
  const [notice, setNotice] = useState("");
  const [showCompletion, setShowCompletion] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [debugEvents, setDebugEvents] = useState<StoredEvent[]>([]);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputBarRef = useRef<HTMLElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
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

  const isRecording =
    status === "recording" || status === "retryRecording";
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
        input_mode: "mock",
        is_mock_transcription: true,
        recognition_status: "unsupported",
        reason: "speech_recognition_unsupported",
        transcript_source: "mock_fallback",
      });
      setNotice("当前浏览器语音识别不可用，已使用模拟转写继续练习。");
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
          input_mode: "mock",
          is_mock_transcription: true,
          recognition_status: "failed",
          reason: error,
          transcript_source: "mock_fallback",
        });

        if (
          error === "not-allowed" ||
          error === "service-not-allowed" ||
          error === "audio-capture"
        ) {
          setNotice("未识别到有效语音，已使用模拟转写继续练习。");
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
        input_mode: "mock",
        is_mock_transcription: true,
        recognition_status: "failed",
        reason: "speech_recognition_start_failed",
        transcript_source: "mock_fallback",
      });
      setNotice("当前浏览器语音识别不可用，已使用模拟转写继续练习。");
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
    const result = await speakQuestionText(questionText);
    setPlayingQuestionIndex((activeIndex) =>
      activeIndex === questionIndex ? null : activeIndex,
    );
    trackPracticeEvent("tts_playback", questionIndex, {
      ai_node: "A01_TTS_QUESTION",
      is_tts_fallback: result.status !== "played",
      question_text_visible_by_user: result.status !== "played",
      tts_error_reason: result.reason ?? null,
      tts_source: "browser_speech_synthesis",
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
      submitLockedRef.current = false;
      // A05_ASR_TRANSCRIPTION: speech transcription input, Web Speech first, Mock fallback.
      startSpeechRecognition();
      setStatus("recording");
    }
  }

  function cancelRecording() {
    abortRecognition();
    resetSpeechState();
    submitLockedRef.current = false;
    setStatus(status === "retryRecording" ? "answered" : "readyToAnswer");
  }

  async function submitRecording() {
    if (!isRecording || submitLockedRef.current) {
      return;
    }

    submitLockedRef.current = true;
    const kind = status === "retryRecording" ? "retry" : "first";
    stopRecognition();
    const firstAnswer = answers.find(
      (answer) =>
        answer.questionIndex === currentQuestionIndex && answer.kind === "first",
    );

    const realTranscript = transcript.trim();
    const interimFallback = interimTranscript.trim();
    const mockTranscript = getMockAnswer(
      currentQuestion.id,
      kind,
      firstAnswer?.polish?.expansionSentence,
    );
    const hasRealTranscript = Boolean(realTranscript || interimFallback);
    const answerText = realTranscript || interimFallback || mockTranscript;
    const transcriptSource = realTranscript
      ? "web_speech_final"
      : interimFallback
        ? "web_speech_interim_fallback"
        : "mock_fallback";
    const inputMode = hasRealTranscript ? "web_speech" : "mock";
    const isMockTranscription = !hasRealTranscript;
    const fallbackReason = isMockTranscription
      ? normalizeSpeechFallbackReason(recognitionSupported, recognitionError)
      : undefined;

    if (!answerText.trim()) {
      trackPracticeEvent("transcription_failed", currentQuestionIndex, {
        ai_node: "A05_ASR_TRANSCRIPTION",
        fallback_reason: fallbackReason ?? "empty_transcription",
        fallback_mode: "mock_fallback",
        input_mode: inputMode,
        is_mock_transcription: isMockTranscription,
        reason: recognitionError || "empty_transcription",
        recognition_status: fallbackReason ?? "recognition_empty",
        transcript_source: transcriptSource,
      });
      setNotice("\u6ca1\u6709\u8bc6\u522b\u5230\u6709\u6548\u56de\u7b54\uff0c\u8bf7\u518d\u8bd5\u4e00\u6b21\u3002");
      submitLockedRef.current = false;
      setStatus("readyToAnswer");
      return;
    }

    const answerLength = wordCount(answerText);
    const answerId = `${currentQuestion.id}-${kind}-${Date.now()}`;
    const recordedSeconds = recordingSeconds;
    const answerDuration = Math.max(recordedSeconds, 4);
    setAnswers((prevAnswers) => [
      ...prevAnswers,
      {
        id: answerId,
        messageType: kind === "retry" ? "retry_answer" : "user_answer",
        questionIndex: currentQuestionIndex,
        kind,
        duration: answerDuration,
        text: answerText,
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
              currentQuestion,
              currentQuestionIndex,
              answerText,
            ),
          )
        : undefined;
    const retryFeedbackResult =
      kind === "retry"
        ? await generateRetryFeedback({
            topic_id: topic.id,
            question_id: currentQuestion.id,
            question_text: currentQuestion.text,
            first_answer: firstAnswer?.text ?? "",
            polished_answer: firstAnswer?.polish?.polishedAnswer ?? "",
            expansion_sentence: firstAnswer?.polish?.expansionSentence ?? "",
            retry_answer: answerText,
          })
        : undefined;
    const polish = polishResult ? toPolishViewModel(polishResult) : undefined;
    const retryFeedback = retryFeedbackResult
      ? toRetryFeedbackViewModel(
          retryFeedbackResult,
          createMarkedRetryTranscript(
            answerText,
            firstAnswer?.text ?? "",
            firstAnswer?.polish?.polishedAnswer ?? "",
            firstAnswer?.polish?.expansionSentence ?? "",
          ),
        )
      : undefined;
    const hasPolishOutput = Boolean(
      polish?.polishedAnswer || polish?.noPolishNeeded,
    );

    if (answerLength < 3) {
      trackPracticeEvent("answer_too_short_detected", currentQuestionIndex, {
        answer_text: answerText,
        answer_length: answerLength,
      });
    }

    if (
      kind === "first" &&
      (!hasPolishOutput || polishResult?.fallback_used)
    ) {
      trackPracticeEvent("ai_generation_failed", currentQuestionIndex, {
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
      trackPracticeEvent("ai_generation_failed", currentQuestionIndex, {
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
      !trackedRef.current.answerSubmitted.has(currentQuestionIndex)
    ) {
      trackedRef.current.answerSubmitted.add(currentQuestionIndex);
      trackPracticeEvent("answer_submitted", currentQuestionIndex, {
        ai_node: "A05_ASR_TRANSCRIPTION",
        answer_text: answerText,
        answer_length: answerLength,
        fallback_reason: fallbackReason,
        fallback_mode: isMockTranscription ? "mock_fallback" : undefined,
        input_mode: inputMode,
        is_mock_transcription: isMockTranscription,
        recognition_status: isMockTranscription
          ? fallbackReason ?? "mock_fallback"
          : "success",
        recording_duration_seconds: recordedSeconds,
        transcript_source: transcriptSource,
      });
    }

    if (
      kind === "first" &&
      polish &&
      hasPolishOutput &&
      !trackedRef.current.polishGenerated.has(currentQuestionIndex)
    ) {
      trackedRef.current.polishGenerated.add(currentQuestionIndex);
      trackPracticeEvent("polish_generated", currentQuestionIndex, {
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
      !trackedRef.current.retryAnswerSubmitted.has(currentQuestionIndex)
    ) {
      trackedRef.current.retryAnswerSubmitted.add(currentQuestionIndex);
      trackPracticeEvent("retry_feedback_generated", currentQuestionIndex, {
        ai_node: "retry_feedback",
        ai_provider: retryFeedback.aiProvider,
        ai_source: retryFeedback.aiSource,
        fallback_reason: retryFeedback.fallbackReason,
        feedback_generation_mode: retryFeedback.generationMode,
        llm_latency_ms: retryFeedback.llmLatencyMs ?? null,
        retry_feedback_type: retryFeedback.type,
      });
      trackPracticeEvent("retry_answer_submitted", currentQuestionIndex, {
        ai_node: "A05_ASR_TRANSCRIPTION",
        retry_ai_node: "retry_feedback",
        retry_ai_provider: retryFeedback.aiProvider,
        retry_ai_source: retryFeedback.aiSource,
        retry_fallback_reason: retryFeedback.fallbackReason,
        retry_llm_latency_ms: retryFeedback.llmLatencyMs ?? null,
        fallback_reason: fallbackReason,
        fallback_mode: isMockTranscription ? "mock_fallback" : undefined,
        feedback_generation_mode: retryFeedback.generationMode,
        input_mode: inputMode,
        is_mock_transcription: isMockTranscription,
        recognition_status: isMockTranscription
          ? fallbackReason ?? "mock_fallback"
          : "success",
        recording_duration_seconds: recordedSeconds,
        transcript_source: transcriptSource,
        retry_answer_text: answerText,
        retry_feedback_type: retryFeedback.type,
      });
    }

    if (!isMockTranscription) {
      setNotice("");
    } else {
      setNotice(getMockFallbackNotice(fallbackReason));
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
      submitLockedRef.current = false;
      // A05_ASR_TRANSCRIPTION: speech transcription input, Web Speech first, Mock fallback.
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
    setNotice("");
    submitLockedRef.current = false;
    setTtsFallbackQuestionIds([]);
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
    const preHelpOutput = generatePreHelp(
      createPreHelpInput(topic, question, questionIndex),
    ).data;

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
            scrollIdBase={`help-${question.id}`}
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
        : [{ text: answer.text, type: "normal" as const }];
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
                {isRetryAnswer ? "重说反馈生成中…" : "润色扩展生成中…"}
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
                        这句话已经清楚自然，可以直接复说。
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
                  <p className="mt-1">
                    <span className="font-bold text-ink">扩展：</span>
                    {answer.polish?.shouldExpand
                      ? `${answer.polish.expansionType}。${answer.polish.expansionSentence}`
                      : "本次回答结构已基本完整，可直接再说一次。"}
                  </p>
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
    currentQuestionIndex === answers[answers.length - 1]?.questionIndex;

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
                  录音中 {formatTime(recordingSeconds)}
                </p>
              </div>
              <button
                type="button"
                onClick={submitRecording}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-bamboo-600 text-white"
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
