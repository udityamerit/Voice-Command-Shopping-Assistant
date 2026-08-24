// public/js/voiceHandler.js - Robust Web Speech API Handler with Instant Feedback & Fallbacks

export class VoiceHandler {
  constructor({ onTranscript, onStateChange, onError }) {
    this.onTranscript = onTranscript || (() => {});
    this.onStateChange = onStateChange || (() => {});
    this.onError = onError || (() => {});

    this.recognition = null;
    this.isListening = false;
    this.isContinuous = false;
    this.selectedLanguage = "en-US";
    this.mediaStream = null;

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
      this.recognition.maxAlternatives = 1;
      this.recognition.lang = this.selectedLanguage;

      this.recognition.onstart = () => {
        this.isListening = true;
        this.onStateChange({ listening: true });
      };

      this.recognition.onresult = (event) => {
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

        this.onTranscript({
          interim: interimTranscript.trim(),
          final: finalTranscript.trim()
        });
      };

      this.recognition.onerror = (event) => {
        console.warn("Speech Recognition notice:", event.error);
        this.isListening = false;
        this.onStateChange({ listening: false, error: event.error });
        this.onError(event.error);

        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          this.promptFallbackInput("Microphone access is blocked in your browser. Please allow microphone permissions or type your command:");
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

  promptFallbackInput(message = "Enter your grocery voice command:") {
    const input = window.prompt(message, "Add 2 bottles of whole milk and 1 loaf of sourdough bread");
    if (input && input.trim() !== "") {
      this.onTranscript({ interim: "", final: input.trim() });
    }
  }

  startListening(continuous = false) {
    this.isContinuous = continuous;

    if (!this.recognition) {
      this.promptFallbackInput();
      return;
    }

    try {
      this.recognition.continuous = continuous;
      this.recognition.lang = this.selectedLanguage;
      this.recognition.start();
      this.isListening = true;
      this.onStateChange({ listening: true });
    } catch (e) {
      console.log("Speech recognition start note:", e.message);
      // If already started, toggle off and on cleanly
      try {
        this.recognition.stop();
        setTimeout(() => {
          try { this.recognition.start(); } catch (err) {}
        }, 100);
      } catch (err) {}
    }
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
