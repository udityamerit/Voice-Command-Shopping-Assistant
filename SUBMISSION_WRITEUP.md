# Technical Approach Write-up (Deliverable 3 - 200 Words Max)

VoiceCart AI is a multimodal, voice-first shopping assistant engineered with low-latency full-stack architecture.

**Voice & Autocorrection Pipeline:** Continuous Web Speech recognition streams transcripts with live waveform canvas rendering. A multi-stage **STT Autocorrection Engine** pairs phonetic Soundex and Levenshtein edit distance against catalog vocabulary to eliminate speech mishears.

**NLU & Multi-Turn Memory:** Natural language understanding combines deterministic fast-path classification with **MiniMax-M3 LLM**. A stateful **Conversation Memory** module tracks entities and dialogue turns across sliding windows, resolving conversational follow-ups (*"actually make it 4"*, *"remove it"*, *"add those"*). A bidirectional **PageScanner** extracts live DOM states (categories, dietary chips, price bounds, theme, visible products) enabling the agent to execute real-time UI actions alongside cart mutations.

**Intelligence & Neural Voice:** The recommendation subsystem powers a purchase-history **Predictive Replenishment Carousel**, seasonal/promotional curator, and intelligent dietary substitution matrix (vegan, gluten-free, organic, budget-friendly). Voice search supports dynamic price bounds (*"Find snacks under $5"*). Responses are synthesized via **MiniMax Speech-2.8-HD Neural TTS** with LRU audio caching, wrapped in a glassmorphic UI with an immersive Hands-Free HUD.
