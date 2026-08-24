// public/js/visualizer.js - HTML5 Canvas Audio Waveform & Pulse Visualizer

export class AudioVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");
    this.audioCtx = null;
    this.analyser = null;
    this.source = null;
    this.animId = null;
    this.isListening = false;
    this.isSpeaking = false;
    this.simulatedTime = 0;

    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());
    this.drawIdle();
  }

  resizeCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * (window.devicePixelRatio || 1);
    this.canvas.height = rect.height * (window.devicePixelRatio || 1);
  }

  async attachMicrophone(mediaStream) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      this.source = this.audioCtx.createMediaStreamSource(mediaStream);
      this.source.connect(this.analyser);
    } catch (e) {
      console.warn("Web Audio API not supported or blocked, using simulated visualization:", e);
    }
  }

  start(mode = "listening") {
    if (mode === "listening") {
      this.isListening = true;
      this.isSpeaking = false;
    } else if (mode === "speaking") {
      this.isSpeaking = true;
      this.isListening = false;
    }
    this.loop();
  }

  stop() {
    this.isListening = false;
    this.isSpeaking = false;
    if (this.animId) cancelAnimationFrame(this.animId);
    this.drawIdle();
  }

  loop() {
    if (!this.isListening && !this.isSpeaking) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerY = height / 2;
    const barCount = 18;
    const barWidth = (width / barCount) * 0.45;
    const spacing = (width - (barCount * barWidth)) / (barCount + 1);

    this.simulatedTime += 0.08;

    let freqData = new Uint8Array(barCount);
    if (this.analyser && this.isListening) {
      this.analyser.getByteFrequencyData(freqData);
    }

    for (let i = 0; i < barCount; i++) {
      let amp = 0.1;
      if (this.isListening) {
        const liveVal = freqData[i] ? freqData[i] / 255 : 0;
        const wave = Math.sin(this.simulatedTime + (i * 0.4)) * 0.5 + 0.5;
        amp = Math.max(liveVal * 0.9, wave * 0.7);
      } else if (this.isSpeaking) {
        amp = (Math.sin(this.simulatedTime * 1.5 + (i * 0.5)) * 0.4 + 0.5) * (0.5 + Math.cos(i * 0.2) * 0.3);
      }

      const barHeight = Math.max(6, amp * (height * 0.75));
      const x = spacing + i * (barWidth + spacing);
      const y = centerY - barHeight / 2;

      // Gradient color depending on state
      const grad = this.ctx.createLinearGradient(x, y, x, y + barHeight);
      if (this.isListening) {
        grad.addColorStop(0, "#f43f5e");
        grad.addColorStop(0.5, "#fb923c");
        grad.addColorStop(1, "#facc15");
      } else {
        grad.addColorStop(0, "#818cf8");
        grad.addColorStop(0.5, "#38bdf8");
        grad.addColorStop(1, "#34d399");
      }

      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.roundRect(x, y, barWidth, barHeight, 4);
      this.ctx.fill();
    }

    this.animId = requestAnimationFrame(() => this.loop());
  }

  drawIdle() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerY = height / 2;
    const barCount = 18;
    const barWidth = (width / barCount) * 0.45;
    const spacing = (width - (barCount * barWidth)) / (barCount + 1);

    for (let i = 0; i < barCount; i++) {
      const x = spacing + i * (barWidth + spacing);
      const barHeight = 4;
      const y = centerY - barHeight / 2;

      this.ctx.fillStyle = "rgba(148, 163, 184, 0.25)";
      this.ctx.beginPath();
      this.ctx.roundRect(x, y, barWidth, barHeight, 2);
      this.ctx.fill();
    }
  }
}
