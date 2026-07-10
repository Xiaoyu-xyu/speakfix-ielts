type QuestionAudioResult = {
  status: "played" | "failed" | "unsupported";
  reason?: string;
  audioSrc?: string;
  audioStatus?: "played" | "failed" | "unsupported";
  audioErrorReason?: string | null;
  source: "pre_generated_audio" | "browser_speech_synthesis";
  voiceName?: string | null;
  voiceLang?: string | null;
};

type SpeechSynthesisResult = {
  status: "played" | "failed" | "unsupported";
  reason?: string;
  voiceName?: string | null;
  voiceLang?: string | null;
};

function createQuestionAudioSrcs(topicId: string, questionId: string) {
  const basePath = `/audio/questions/${topicId}/${questionId}`;

  return [`${basePath}.mp3`, `${basePath}.wav`];
}

function playPreGeneratedQuestionAudio(audioSrc: string) {
  return new Promise<{
    status: "played" | "failed";
    reason?: string;
  }>((resolve) => {
    if (typeof window === "undefined" || typeof Audio === "undefined") {
      resolve({
        status: "failed",
        reason: "html_audio_unavailable",
      });
      return;
    }

    const audio = new Audio(audioSrc);
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      finish({ status: "failed", reason: "audio_playback_timeout" });
    }, 8000);

    function finish(result: { status: "played" | "failed"; reason?: string }) {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      resolve(result);
    }

    audio.preload = "auto";
    audio.onended = () => finish({ status: "played" });
    audio.onerror = () =>
      finish({
        status: "failed",
        reason: "audio_load_or_play_failed",
      });

    audio.play().catch((error) => {
      finish({
        status: "failed",
        reason: error instanceof Error ? error.message : "audio_play_failed",
      });
    });
  });
}

export async function playQuestionPromptAudio({
  questionId,
  questionText,
  topicId,
}: {
  questionId: string;
  questionText: string;
  topicId: string;
}): Promise<QuestionAudioResult> {
  const audioSrcs = createQuestionAudioSrcs(topicId, questionId);
  let audioSrc = audioSrcs[0];
  let audioResult: Awaited<ReturnType<typeof playPreGeneratedQuestionAudio>> = {
    status: "failed",
    reason: "audio_not_attempted",
  };

  for (const candidateSrc of audioSrcs) {
    audioSrc = candidateSrc;
    audioResult = await playPreGeneratedQuestionAudio(candidateSrc);

    if (audioResult.status === "played") {
      break;
    }
  }

  if (audioResult.status === "played") {
    return {
      status: "played",
      audioSrc,
      audioStatus: "played",
      audioErrorReason: null,
      source: "pre_generated_audio",
      voiceLang: null,
      voiceName: null,
    };
  }

  const speechResult = await speakQuestionText(questionText);

  return {
    status: speechResult.status,
    reason: speechResult.reason ?? audioResult.reason,
    audioSrc,
    audioStatus: "failed",
    audioErrorReason: audioResult.reason ?? "audio_playback_failed",
    source:
      speechResult.status === "played"
        ? "browser_speech_synthesis"
        : "pre_generated_audio",
    voiceLang: speechResult.voiceLang ?? null,
    voiceName: speechResult.voiceName ?? null,
  };
}

export async function speakQuestionText(
  questionText: string,
): Promise<SpeechSynthesisResult> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return {
      status: "unsupported",
      reason: "speech_synthesis_unavailable",
      voiceName: null,
      voiceLang: null,
    };
  }

  const voice = await selectPreferredEnglishFemaleVoice();

  return new Promise((resolve) => {
    try {
      window.speechSynthesis.cancel();
      let settled = false;

      const utterance = new SpeechSynthesisUtterance(questionText);
      utterance.lang = "en-US";
      utterance.rate = 0.92;
      utterance.pitch = 1;

      if (voice) {
        utterance.voice = voice;
      }

      const timeoutId = window.setTimeout(() => {
        finish({
          status: "failed",
          reason: "speech_synthesis_timeout",
          voiceName: voice?.name ?? null,
          voiceLang: voice?.lang ?? null,
        });
      }, 8000);

      function finish(result: {
        status: "played" | "failed" | "unsupported";
        reason?: string;
        voiceName?: string | null;
        voiceLang?: string | null;
      }) {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutId);
        resolve(result);
      }

      utterance.onend = () => {
        finish({
          status: "played",
          voiceName: voice?.name ?? null,
          voiceLang: voice?.lang ?? null,
        });
      };

      utterance.onerror = (event) => {
        finish({
          status: "failed",
          reason: event.error || "speech_synthesis_failed",
          voiceName: voice?.name ?? null,
          voiceLang: voice?.lang ?? null,
        });
      };

      window.speechSynthesis.speak(utterance);
    } catch (error) {
      resolve({
        status: "failed",
        reason: error instanceof Error ? error.message : "speech_synthesis_failed",
        voiceName: voice?.name ?? null,
        voiceLang: voice?.lang ?? null,
      });
    }
  });
}

function isEnglishVoice(voice: SpeechSynthesisVoice) {
  return voice.lang.toLowerCase().startsWith("en");
}

function isLikelyFemaleVoice(voice: SpeechSynthesisVoice) {
  const voiceName = voice.name.toLowerCase();
  const femaleVoiceHints = [
    "female",
    "woman",
    "jenny",
    "susan",
    "samantha",
    "zira",
    "google uk english female",
    "microsoft zira",
    "microsoft jenny",
  ];

  return femaleVoiceHints.some((hint) => voiceName.includes(hint));
}

function selectVoiceFromList(voices: SpeechSynthesisVoice[]) {
  return (
    voices.find((voice) => isEnglishVoice(voice) && isLikelyFemaleVoice(voice)) ??
    voices.find(isEnglishVoice) ??
    null
  );
}

function waitForVoices() {
  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const voices = window.speechSynthesis.getVoices();

    if (voices.length > 0) {
      resolve(voices);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", handleVoices);
      resolve(window.speechSynthesis.getVoices());
    }, 250);

    function handleVoices() {
      window.clearTimeout(timeoutId);
      window.speechSynthesis.removeEventListener("voiceschanged", handleVoices);
      resolve(window.speechSynthesis.getVoices());
    }

    window.speechSynthesis.addEventListener("voiceschanged", handleVoices);
  });
}

async function selectPreferredEnglishFemaleVoice() {
  const voices = await waitForVoices();

  return selectVoiceFromList(voices);
}
