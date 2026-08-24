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
    // Initial paint after small timeout to ensure layout is ready
    setTimeout(() => {
      this.resizeCanvas();
      this.drawIdle();
    }, 50);
  }

  resizeCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || this.canvas.clientWidth || 240;
    const h = rect.height || this.canvas.clientHeight || 45;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(120, w * dpr);
    this.canvas.height = Math.max(30, h * dpr);
  }

  async attachMicrophone(mediaStream) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
      }
      if (this.audioCtx.state === "suspended") {
        await this.audioCtx.resume();
      }
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      this.source = this.audioCtx.createMediaStreamSource(mediaStream);
      this.source.connect(this.analyser);
    } catch (e) {
      console.warn("Web Audio API mediaStream attach notice, using dynamic waveform visualization:", e);
    }
  }

  start(mode = "listening") {
    this.resizeCanvas();
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }

    if (mode === "listening") {
      this.isListening = true;
      this.isSpeaking = false;
    } else if (mode === "speaking") {
      this.isSpeaking = true;
      this.isListening = false;
    }

    if (this.animId) cancelAnimationFrame(this.animId);
    this.loop();
  }

  stop() {
    this.isListening = false;
    this.isSpeaking = false;
    if (this.animId) cancelAnimationFrame(this.animId);
    this.drawIdle();
  }

  loop() {
    if (!this.isListening && !this.isSpeaking) {
      this.drawIdle();
      return;
    }

    if (!this.ctx || !this.canvas) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    if (width === 0 || height === 0) {
      this.resizeCanvas();
    }

    this.ctx.clearRect(0, 0, width, height);
    const centerY = height / 2;
    const barCount = 18;
    const barWidth = (width / barCount) * 0.42;
    const spacing = (width - (barCount * barWidth)) / (barCount + 1);

    this.simulatedTime += 0.12;

    let freqData = new Uint8Array(barCount);
    if (this.analyser && this.isListening) {
      this.analyser.getByteFrequencyData(freqData);
    }

    for (let i = 0; i < barCount; i++) {
      let amp = 0.15;
      if (this.isListening) {
        const liveVal = freqData[i] ? freqData[i] / 255 : 0;
        const wave1 = Math.sin(this.simulatedTime + (i * 0.45)) * 0.4 + 0.5;
        const wave2 = Math.cos(this.simulatedTime * 0.8 + (i * 0.3)) * 0.3 + 0.4;
        amp = Math.max(liveVal * 0.95, (wave1 + wave2) * 0.5);
      } else if (this.isSpeaking) {
        amp = (Math.sin(this.simulatedTime * 1.6 + (i * 0.5)) * 0.4 + 0.5) * (0.6 + Math.cos(i * 0.25) * 0.3);
      }

      const barHeight = Math.max(6, amp * (height * 0.85));
      const x = spacing + i * (barWidth + spacing);
      const y = centerY - barHeight / 2;

      // Vibrant visual gradients
      const grad = this.ctx.createLinearGradient(x, y, x, y + barHeight);
      if (this.isListening) {
        grad.addColorStop(0, "#10b981");
        grad.addColorStop(0.5, "#34d399");
        grad.addColorStop(1, "#059669");
      } else {
        grad.addColorStop(0, "#38bdf8");
        grad.addColorStop(0.5, "#818cf8");
        grad.addColorStop(1, "#34d399");
      }

      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      if (this.ctx.roundRect) {
        this.ctx.roundRect(x, y, barWidth, barHeight, 4);
      } else {
        this.ctx.rect(x, y, barWidth, barHeight);
      }
      this.ctx.fill();
    }

    this.animId = requestAnimationFrame(() => this.loop());
  }

  drawIdle() {
    if (!this.ctx || !this.canvas) return;
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (width === 0 || height === 0) return;

    this.ctx.clearRect(0, 0, width, height);
    const centerY = height / 2;
    const barCount = 18;
    const barWidth = (width / barCount) * 0.42;
    const spacing = (width - (barCount * barWidth)) / (barCount + 1);

    for (let i = 0; i < barCount; i++) {
      const x = spacing + i * (barWidth + spacing);
      const barHeight = 4;
      const y = centerY - barHeight / 2;

      this.ctx.fillStyle = "rgba(148, 163, 184, 0.25)";
      this.ctx.beginPath();
      if (this.ctx.roundRect) {
        this.ctx.roundRect(x, y, barWidth, barHeight, 2);
      } else {
        this.ctx.rect(x, y, barWidth, barHeight);
      }
      this.ctx.fill();
    }
  }
}
