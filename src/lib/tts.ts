export async function speakQuestionText(
  questionText: string,
): Promise<{
  status: "played" | "failed" | "unsupported";
  reason?: string;
  voiceName?: string | null;
  voiceLang?: string | null;
}> {
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
