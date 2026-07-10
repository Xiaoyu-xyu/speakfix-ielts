import { NextResponse } from "next/server";

type AsrFallbackReason =
  | "missing_api_key"
  | "missing_audio"
  | "asr_request_failed"
  | "asr_timeout"
  | "empty_transcript";

const SILICONFLOW_TRANSCRIPTIONS_URL =
  "https://api.siliconflow.cn/v1/audio/transcriptions";
const SILICONFLOW_ASR_MODEL = "FunAudioLLM/SenseVoiceSmall";
const ASR_TIMEOUT_MS = 20_000;

function createFallbackResponse(
  fallbackReason: AsrFallbackReason,
  latency: number | null,
  status = 200,
) {
  return NextResponse.json(
    {
      transcript: "",
      provider: "siliconflow",
      source: "mock_fallback",
      fallbackReason,
      latency,
    },
    { status },
  );
}

function getFileExtension(mimeType: string) {
  if (mimeType.includes("mp4")) {
    return "mp4";
  }

  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
    return "mp3";
  }

  if (mimeType.includes("wav")) {
    return "wav";
  }

  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  return "webm";
}

export async function POST(request: Request) {
  const apiKey = process.env.SILICONFLOW_API_KEY;

  if (!apiKey) {
    return createFallbackResponse("missing_api_key", null);
  }

  let requestFormData: FormData;

  try {
    requestFormData = await request.formData();
  } catch {
    return createFallbackResponse("missing_audio", null, 400);
  }

  const audio = requestFormData.get("audio");

  if (!(audio instanceof File) || audio.size === 0) {
    return createFallbackResponse("missing_audio", null, 400);
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ASR_TIMEOUT_MS);
  const audioFile = new File(
    [audio],
    audio.name || `answer.${getFileExtension(audio.type)}`,
    {
      type: audio.type || "audio/webm",
    },
  );
  const siliconFlowFormData = new FormData();
  siliconFlowFormData.append("file", audioFile);
  siliconFlowFormData.append("model", SILICONFLOW_ASR_MODEL);

  try {
    const response = await fetch(SILICONFLOW_TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: siliconFlowFormData,
      signal: controller.signal,
    });
    const latency = Date.now() - startedAt;

    if (!response.ok) {
      return createFallbackResponse("asr_request_failed", latency);
    }

    const responseJson = (await response.json()) as { text?: unknown };
    const transcript =
      typeof responseJson.text === "string" ? responseJson.text.trim() : "";

    if (!transcript) {
      return createFallbackResponse("empty_transcript", latency);
    }

    return NextResponse.json({
      transcript,
      provider: "siliconflow",
      source: "asr",
      fallbackReason: null,
      latency,
    });
  } catch (error) {
    const latency = Date.now() - startedAt;
    const fallbackReason =
      error instanceof Error && error.name === "AbortError"
        ? "asr_timeout"
        : "asr_request_failed";

    return createFallbackResponse(fallbackReason, latency);
  } finally {
    clearTimeout(timeoutId);
  }
}
