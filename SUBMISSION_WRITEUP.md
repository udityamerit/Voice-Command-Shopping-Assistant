# Technical Approach Write-up (Deliverable 3 - 200 Words Max)

VoiceCart AI is an industry-grade, multimodal shopping assistant engineered with modern full-stack best practices. The architecture decouples speech orchestration, natural language understanding, and reactive state management for low-latency, real-time performance.

For voice input, continuous Web Speech recognition streams transcripts with live audio waveform canvas rendering. Complex natural language queries are parsed via **MiniMax-M3 LLM**, executing zero-shot multi-intent classification (`ADD`, `REMOVE`, `MODIFY_QTY`, `VOICE_SEARCH`, `GET_SUBSTITUTE`, `RECIPE_EXPAND`), fuzzy entity extraction, and multi-lingual translation across 7+ languages with a robust deterministic fallback engine.

The smart suggestion subsystem combines a **predictive replenishment algorithm** (tracking purchase history restock cycles), a **seasonal/promotional curator**, and an **intelligent substitution matrix** for dietary (vegan, gluten-free) and budget-friendly alternatives. Voice-activated search supports dynamic price bounds (e.g., *"Find snacks under $5"*).

Assistant responses are synthesized into natural speech via **MiniMax Speech-2.8-HD Neural TTS** with LRU audio caching. The frontend is built on a responsive Vanilla CSS glassmorphism design system featuring dark/light modes, keyboard hotkeys, and an immersive Hands-Free HUD optimized for cooking and driving scenarios.
