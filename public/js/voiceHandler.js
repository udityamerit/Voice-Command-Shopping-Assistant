// public/js/voiceHandler.js - Robust Web Speech API Handler with Instant Feedback & Fallbacks

/**
 * Normalizes a raw STT transcript before NLU processing.
 * Handles:
 *  - Filler word removal (um, uh, like, you know, kind of, basically, actually)
 *  - Number word → digit conversion (one→1, two→2 … ten→10)
 *  - Common STT mishears in shopping context (e.g., "too"→"2" before a noun)
 *  - Leading noise phrases removal
 *  - Trailing punctuation cleanup
 */
function normalizeTranscript(raw) {
  if (!raw || typeof raw !== "string") return raw;

  let t = raw.trim();

  // 1. Remove filler / hesitation words (whole-word only to avoid corruption)
  t = t.replace(/\b(um+|uh+|hmm+|err+|like,?|you know,?|kind of,?|sort of,?|basically,?|actually,?|literally,?|right,?|okay so,?|so like,?|i mean,?)\b/gi, " ");

  // 2. Number word → digit (handles both standalone and within phrases)
  const NUMBER_WORDS = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
    "ten": "10", "eleven": "11", "twelve": "12", "a dozen": "12",
    "dozen": "12", "half a dozen": "6", "a few": "3", "a couple": "2",
    "couple of": "2", "couple": "2"
  };
  for (const [word, digit] of Object.entries(NUMBER_WORDS)) {
    // Replace whole-word occurrences
    const re = new RegExp(`\\b${word}\\b`, "gi");
    t = t.replace(re, digit);
  }

  // 3. Fix common STT mishear "too" / "to" used as a number before items
  // e.g., "add too apples" → "add 2 apples"
  t = t.replace(/\badd\s+too\s+/gi, "add 2 ");
  t = t.replace(/\bbuy\s+too\s+/gi, "buy 2 ");
  t = t.replace(/\bget\s+too\s+/gi, "get 2 ");
  t = t.replace(/\bi need too\s+/gi, "i need 2 ");

  // 4. Fix "for" misheard as a number: "add for apples" → "add 4 apples"
  t = t.replace(/\b(add|buy|get|order|put)\s+for\s+(?=[a-z])/gi, (match, verb) => `${verb} 4 `);

  // 5. Remove leading noise phrases users commonly say before a command
  t = t.replace(/^(hey|okay|ok|please|can you|could you|i want to|i'd like to|i would like to|can i get|i'd like)\s+/i, "");

  // 6. Normalize whitespace
  t = t.replace(/\s{2,}/g, " ").trim();

  // 7. Strip trailing punctuation artifacts from STT
  t = t.replace(/[.,!?;:]+$/, "").trim();

  return t;
}

export class VoiceHandler {
  constructor({ onTranscript, onStateChange, onError, onAudioStream, onBargeIn }) {
    this.onTranscript = onTranscript || (() => {});
    this.onStateChange = onStateChange || (() => {});
    this.onError = onError || (() => {});
    this.onAudioStream = onAudioStream || (() => {});
    this.onBargeIn = onBargeIn || (() => {});

    this.recognition = null;
    this.isListening = false;
    this.isContinuous = false;
    this.selectedLanguage = "en-US";
    this.mediaStream = null;
    this.hasMicPermission = false;

    this.initRecognition();
  }

  initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Web Speech API not supported in this browser environment. Using interactive text-prompt fallback.");
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 3;
      this.recognition.lang = this.selectedLanguage;

      this.recognition.onstart = () => {
        this.isListening = true;
        this.onStateChange({ listening: true, error: null });
        this.onBargeIn();
      };

      this.recognition.onspeechstart = () => {
        // User started speaking: interrupt any playing assistant speech immediately
        this.onBargeIn();
      };

      this.recognition.onsoundstart = () => {
        this.onBargeIn();
      };

      this.recognition.onaudiostart = () => {
        this.onBargeIn();
      };

      this.recognition.onresult = (event) => {
        // Cut off any assistant speech on speech detection
        this.onBargeIn();

        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            finalTranscript += item[0].transcript;
          } else {
            interimTranscript += item[0].transcript;
          }
        }

        if (finalTranscript.trim() !== "") {
          // Normalize STT output before dispatching — removes fillers, converts number words, fixes mishears
          const normalizedFinal = normalizeTranscript(finalTranscript.trim());
          this.onTranscript({
            interim: "",
            final: normalizedFinal
          });
        } else if (interimTranscript.trim() !== "") {
          this.onTranscript({
            interim: interimTranscript.trim(),
            final: ""
          });
        }
      };

      this.recognition.onerror = (event) => {
        console.warn("Speech Recognition status:", event.error);

        // Ignore benign no-speech timeout (user just waited a second)
        if (event.error === "no-speech") {
          return;
        }

        // Aborted is normal when user clicks stop
        if (event.error === "aborted") {
          this.isListening = false;
          this.onStateChange({ listening: false });
          return;
        }

        this.isListening = false;
        this.onStateChange({ listening: false, error: event.error });
        this.onError(event.error);

        if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "audio-capture") {
          this.promptFallbackInput("Microphone access is unavailable or blocked in your browser. Please type your command below:");
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.onStateChange({ listening: false });

        if (this.isContinuous) {
          setTimeout(() => {
            if (this.isContinuous) this.startListening(true);
          }, 300);
        }
      };
    } catch (err) {
      console.error("Failed to initialize SpeechRecognition:", err);
    }
  }

  setLanguage(langCode) {
    this.selectedLanguage = langCode;
    if (this.recognition) {
      this.recognition.lang = langCode;
    }
  }

  promptFallbackInput(message = "Enter your grocery voice command (e.g. 'Add 2 apples and milk'):") {
    const input = window.prompt(message, "Add 2 bottles of whole milk and 1 loaf of sourdough bread");
    if (input && input.trim() !== "") {
      this.onTranscript({ interim: "", final: input.trim() });
    }
  }

  async requestMicrophoneAccess() {
    if (this.mediaStream) return this.mediaStream;
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaStream = stream;
        this.hasMicPermission = true;
        this.onAudioStream(stream);
        return stream;
      }
    } catch (err) {
      console.warn("Microphone getUserMedia permission notice:", err.message);
    }
    return null;
  }

  startListening(continuous = false) {
    this.isContinuous = continuous;

    if (!this.recognition) {
      this.promptFallbackInput();
      return;
    }

    // Call recognition.start() synchronously to maintain Chrome's user gesture context
    try {
      this.recognition.continuous = continuous;
      this.recognition.lang = this.selectedLanguage;
      this.recognition.start();
      this.isListening = true;
      this.onStateChange({ listening: true, error: null });
    } catch (e) {
      console.log("Speech recognition start note:", e.message);
      try {
        this.recognition.stop();
        setTimeout(() => {
          try {
            this.recognition.lang = this.selectedLanguage;
            this.recognition.start();
            this.isListening = true;
            this.onStateChange({ listening: true, error: null });
          } catch (err) {
            console.error("Second attempt speech start error:", err);
          }
        }, 150);
      } catch (err) {}
    }

    // Request media stream non-blockingly for visualizer
    this.requestMicrophoneAccess().catch(() => {});
  }

  stopListening() {
    this.isContinuous = false;
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
    this.isListening = false;
    this.onStateChange({ listening: false });
  }

  toggleListening(continuous = false) {
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening(continuous);
    }
  }
}

