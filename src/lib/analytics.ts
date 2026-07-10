import { createClient } from "@supabase/supabase-js";

const EVENT_STORAGE_KEY = "speakfix_events";
const SESSION_STORAGE_KEY = "speakfix_session_id";

type UploadStatus = "pending" | "uploaded" | "failed" | "skipped";

export type TrackEventPayload = {
  topic_id?: string;
  topic_title?: string;
  question_index?: number;
  question_text?: string;
  payload?: Record<string, unknown>;
};

export type StoredEvent = {
  event_id: string;
  event_name: string;
  timestamp: string;
  session_id: string;
  topic_id?: string;
  topic_title?: string;
  question_index?: number;
  question_text?: string;
  payload: Record<string, unknown>;
  upload_status: UploadStatus;
  user_agent?: string;
};

let cachedSessionId: string | null = null;

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getSpeakfixSessionId() {
  if (cachedSessionId) {
    return cachedSessionId;
  }

  if (typeof window === "undefined") {
    cachedSessionId = createId();
    return cachedSessionId;
  }

  const existingSessionId = window.sessionStorage.getItem(SESSION_STORAGE_KEY);

  if (existingSessionId) {
    cachedSessionId = existingSessionId;
    return existingSessionId;
  }

  const nextSessionId = createId();
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
  cachedSessionId = nextSessionId;
  return nextSessionId;
}

export function resetSpeakfixSessionId() {
  const nextSessionId = createId();
  cachedSessionId = nextSessionId;

  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
  }

  return nextSessionId;
}

export function readSpeakfixEvents() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawEvents = window.localStorage.getItem(EVENT_STORAGE_KEY);
    return rawEvents ? (JSON.parse(rawEvents) as StoredEvent[]) : [];
  } catch {
    return [];
  }
}

function writeSpeakfixEvents(events: StoredEvent[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(events));
}

function updateEventStatus(eventId: string, uploadStatus: UploadStatus) {
  const events = readSpeakfixEvents();
  writeSpeakfixEvents(
    events.map((event) =>
      event.event_id === eventId
        ? { ...event, upload_status: uploadStatus }
        : event,
    ),
  );
}

export function trackEvent(
  eventName: string,
  eventPayload: TrackEventPayload = {},
) {
  if (typeof window === "undefined") {
    return;
  }

  const event: StoredEvent = {
    event_id: createId(),
    event_name: eventName,
    timestamp: new Date().toISOString(),
    session_id: getSpeakfixSessionId(),
    topic_id: eventPayload.topic_id,
    topic_title: eventPayload.topic_title,
    question_index: eventPayload.question_index,
    question_text: eventPayload.question_text,
    payload: eventPayload.payload ?? {},
    upload_status: "pending",
    user_agent: window.navigator.userAgent,
  };

  writeSpeakfixEvents([...readSpeakfixEvents(), event]);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    updateEventStatus(event.event_id, "skipped");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  void (async () => {
    try {
      const { error } = await supabase.from("events").insert({
        event_id: event.event_id,
        event_name: event.event_name,
        timestamp: event.timestamp,
        session_id: event.session_id,
        topic_id: event.topic_id,
        topic_title: event.topic_title,
        question_index: event.question_index,
        question_text: event.question_text,
        payload: event.payload,
        user_agent: event.user_agent,
      });

      updateEventStatus(event.event_id, error ? "failed" : "uploaded");
    } catch {
      updateEventStatus(event.event_id, "failed");
    }
  })();
}
