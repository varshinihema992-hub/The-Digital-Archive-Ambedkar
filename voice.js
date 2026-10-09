/**
 * SMRITI — Voice Module (Frontend, runs in the kiosk browser)
 * ---------------------------------------------------------------
 * Uses the browser's built-in Web Speech API for BOTH:
 *   - Speech-to-Text (voice input / "voice assistant" mic button)
 *   - Text-to-Speech (narration of answers/documents)
 *
 * Why Web Speech API instead of a paid service: it's free, built into
 * Chrome (which you'll run in kiosk mode anyway), needs no backend
 * call, and works offline for TTS. This is the practical, zero-cost
 * choice for a hackathon kiosk. Translation of the underlying TEXT
 * still goes through translate.js (Gemini) — this module just
 * handles turning speech into text and text into speech.
 *
 * Include this as a <script> in your kiosk frontend, or import it
 * into your React components.
 * ---------------------------------------------------------------
 */

// Maps your kiosk's language codes to BCP-47 locale tags the
// Web Speech API expects.
const VOICE_LOCALES = {
  en: "en-IN",
  hi: "hi-IN",
  ta: "ta-IN",
  te: "te-IN",
  mr: "mr-IN",
  bn: "bn-IN",
};

// -----------------------------------------------------------------
// SPEECH-TO-TEXT (voice input for search / AI Research Assistant)
// -----------------------------------------------------------------
/**
 * Starts listening via the microphone and returns the transcribed
 * text once the visitor stops speaking.
 *
 * @param {string} langCode - kiosk language code, e.g. "en", "hi"
 * @param {function} onInterim - optional callback fired with partial
 *   (in-progress) transcripts, useful for showing live text as they speak
 * @returns {Promise<string>} the final transcribed text
 */
function listenForSpeech(langCode = "en", onInterim = null) {
  return new Promise((resolve, reject) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      reject(new Error("Speech recognition not supported in this browser"));
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = VOICE_LOCALES[langCode] || "en-IN";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = "";

    recognition.onresult = (event) => {
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      if (onInterim) onInterim(interimTranscript);
    };

    recognition.onerror = (event) => reject(new Error(`Speech recognition error: ${event.error}`));
    recognition.onend = () => resolve(finalTranscript.trim());

    recognition.start();
  });
}

// -----------------------------------------------------------------
// TEXT-TO-SPEECH (narration of answers / documents)
// -----------------------------------------------------------------
/**
 * Speaks the given text aloud in the specified language.
 * Returns a promise that resolves when narration finishes — useful
 * for chaining UI state (e.g. highlighting text as it's spoken).
 */
function speakText(text, langCode = "en", { rate = 0.95, onWordBoundary = null } = {}) {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error("Speech synthesis not supported in this browser"));
      return;
    }

    // Cancel any narration already in progress before starting a new one
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = VOICE_LOCALES[langCode] || "en-IN";
    utterance.rate = rate;

    // Fires as each word is spoken — use this to power the
    // "read-along highlight" feature on the document viewer screen
    if (onWordBoundary) {
      utterance.onboundary = (event) => {
        if (event.name === "word") {
          onWordBoundary(event.charIndex, event.charLength);
        }
      };
    }

    utterance.onend = () => resolve();
    utterance.onerror = (event) => reject(new Error(`Speech synthesis error: ${event.error}`));

    window.speechSynthesis.speak(utterance);
  });
}

function stopSpeaking() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

// -----------------------------------------------------------------
// PUTTING IT TOGETHER: the "voice assistant" flow
// -----------------------------------------------------------------
/**
 * Full voice-assistant loop for the kiosk:
 *   1. Listen for the visitor's spoken question
 *   2. Send the transcribed text to your backend (answerQuery from rag.js)
 *   3. Translate the answer if needed (translate.js, on the backend)
 *   4. Speak the answer back aloud
 *
 * `askBackend` is a function you provide that calls your Express
 * endpoint wrapping answerQuery() + translateAnswer().
 */
async function runVoiceAssistant(langCode, askBackend, onInterim, onAnswer) {
  const question = await listenForSpeech(langCode, onInterim);
  if (!question) return null;

  const result = await askBackend(question, langCode); // { answer, sources, language }
  if (onAnswer) onAnswer(result);

  await speakText(result.answer, langCode);
  return result;
}

// Export for use in React components / other frontend modules
if (typeof module !== "undefined") {
  module.exports = { listenForSpeech, speakText, stopSpeaking, runVoiceAssistant, VOICE_LOCALES };
}
