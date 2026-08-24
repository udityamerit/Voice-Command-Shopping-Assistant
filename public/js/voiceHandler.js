// public/js/voiceHandler.js - Robust Web Speech API Handler with Instant Feedback & Fallbacks

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
          this.onTranscript({
            interim: "",
            final: finalTranscript.trim()
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

