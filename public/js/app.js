// public/js/app.js - Modern Quick-Commerce Orchestrator with MiniMax-M3 & Natural Speech
import { ApiClient } from "./api.js";
import { UI } from "./ui.js";
import { VoiceHandler } from "./voiceHandler.js";
import { AudioVisualizer } from "./visualizer.js";
import { PageScanner } from "./pageScanner.js";

class VoiceShoppingApp {
  constructor() {
    this.catalog = [];
    this.shoppingList = [];
    this.listMeta = {};
    this.activeCategory = "All";
    this.lastAudioDataUrl = null;
    this.isHandsFree = false;
    this.sessionId = localStorage.getItem("voicecart_session_id") || `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    localStorage.setItem("voicecart_session_id", this.sessionId);

    this.init();
  }

  async init() {
    console.log("🛒 Initializing VoiceCart AI...");

    this.initTheme();
    this.initVisualizer();
    this.initVoiceHandler();
    this.initEventListeners();

    // Initial data load
    await this.refreshShoppingList();
    await this.loadCatalog();
    await this.loadHistoryRecommendations();
    await this.loadReplenishmentSuggestions();
    await this.loadSeasonalSuggestions();
    await this.loadSubstitutes("Whole Grade A Milk");

    UI.showToast("VoiceCart ready! Tap any mic or press Space to speak.", "info", "fa-microphone");
  }

  initTheme() {
    const savedTheme = localStorage.getItem("voicecart_theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
    this.updateThemeIcon(savedTheme);
  }

  updateThemeIcon(theme) {
    const icon = document.querySelector("#themeToggleBtn i");
    if (icon) {
      icon.className = theme === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon";
    }
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "light" ? "dark" : "light";
    this.setTheme(next);
  }

  setTheme(targetTheme) {
    const theme = targetTheme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("voicecart_theme", theme);
    this.updateThemeIcon(theme);
    UI.showToast(`Switched to ${theme} theme`, "info", theme === "dark" ? "fa-moon" : "fa-sun");
  }

  initVisualizer() {
    this.visualizer = new AudioVisualizer("audioVisualizer");
  }

  stopAssistantSpeaking() {
    // Cut off TTS audio playback immediately
    const player = document.getElementById("ttsAudioPlayer");
    if (player) {
      try {
        player.pause();
        player.currentTime = 0;
      } catch (e) {}
    }
    // Cut off native Web Speech Synthesis
    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
    // Reset visualizer
    if (this.visualizer) {
      this.visualizer.stop();
    }
  }

  initVoiceHandler() {
    this.voiceHandler = new VoiceHandler({
      onAudioStream: (stream) => {
        this.visualizer.attachMicrophone(stream);
      },
      onBargeIn: () => {
        // User is speaking or mic is engaged: immediately stop assistant from speaking
        this.stopAssistantSpeaking();
      },
      onTranscript: ({ interim, final }) => {
        const userTextInput = document.getElementById("liveUserTextInput");
        const hudUserText = document.getElementById("hudUserText");

        const display = final || interim;
        if (userTextInput && display) userTextInput.value = display;
        if (hudUserText && display) hudUserText.textContent = `"${display}"`;

        if (interim) {
          this.visualizer?.start("listening");
        }

        if (final && final.trim() !== "") {
          this.handleVoiceCommand(final.trim());
        }
      },
      onStateChange: ({ listening, error }) => {
        const heroMic = document.getElementById("heroMainMicBtn");
        const searchMic = document.getElementById("searchBarMicBtn");
        const hudOrb = document.getElementById("hudMicBtn");
        const hudStatus = document.getElementById("hudStatus");
        const userTextInput = document.getElementById("liveUserTextInput");
        const heroMicIcon = document.getElementById("heroMicIcon");
        const floatingMic = document.getElementById("floatingMicBtn");
        const floatingMicIcon = document.getElementById("floatingMicIcon");
        const floatingVoiceHint = document.getElementById("floatingVoiceHint");

        if (listening) {
          this.stopAssistantSpeaking();
          heroMic?.classList.add("listening");
          searchMic?.classList.add("listening");
          hudOrb?.classList.add("listening");
          floatingMic?.classList.add("listening");
          if (heroMicIcon) heroMicIcon.className = "fa-solid fa-microphone-lines";
          if (floatingMicIcon) floatingMicIcon.className = "fa-solid fa-microphone-lines";
          if (hudStatus) hudStatus.textContent = "Listening... Speak your grocery command";
          if (floatingVoiceHint) floatingVoiceHint.textContent = "Listening... Speak now";
          if (userTextInput && !userTextInput.value) {
            userTextInput.placeholder = "Listening... Speak your command now...";
          }
          this.visualizer.start("listening");
        } else {
          heroMic?.classList.remove("listening");
          searchMic?.classList.remove("listening");
          hudOrb?.classList.remove("listening");
          floatingMic?.classList.remove("listening");
          if (heroMicIcon) heroMicIcon.className = "fa-solid fa-microphone";
          if (floatingMicIcon) floatingMicIcon.className = "fa-solid fa-microphone";
          if (hudStatus) hudStatus.textContent = "Listening continuously... Speak your grocery commands";
          if (floatingVoiceHint) floatingVoiceHint.innerHTML = 'Click or press <kbd>Space</kbd>';
          if (userTextInput) {
            userTextInput.placeholder = 'Type or speak command... (e.g. "Add 2 oat milks", "What is in my cart?")';
          }
          this.visualizer.stop();
        }

        if (error && error !== "no-speech" && error !== "aborted") {
          UI.showToast(`Microphone: ${error}`, "info", "fa-microphone-slash");
        }
      },
      onError: (err) => {
        console.warn("Voice error callback:", err);
      }
    });
  }

  initEventListeners() {
    // Floating Voice Widget Scroll Listener
    const floatingWidget = document.getElementById("floatingVoiceWidget");
    window.addEventListener("scroll", () => {
      if (window.scrollY > 240) {
        floatingWidget?.classList.add("visible");
      } else {
        floatingWidget?.classList.remove("visible");
      }
    }, { passive: true });

    // Floating Voice Button Click
    const triggerFloatingVoice = () => {
      this.stopAssistantSpeaking();
      this.voiceHandler.toggleListening(false);
    };
    document.getElementById("floatingMicBtn")?.addEventListener("click", triggerFloatingVoice);
    document.getElementById("floatingVoiceLabel")?.addEventListener("click", triggerFloatingVoice);

    // RFY Carousel Scroll Buttons
    const rfyTrack = document.getElementById("rfyCarouselTrack");
    document.getElementById("rfyScrollLeft")?.addEventListener("click", () => {
      rfyTrack?.scrollBy({ left: -440, behavior: "smooth" });
    });
    document.getElementById("rfyScrollRight")?.addEventListener("click", () => {
      rfyTrack?.scrollBy({ left: 440, behavior: "smooth" });
    });

    // RFY Refresh Button
    document.getElementById("rfyRefreshBtn")?.addEventListener("click", async () => {
      const btn = document.getElementById("rfyRefreshBtn");
      btn?.classList.add("spinning");
      await this.loadHistoryRecommendations();
      setTimeout(() => btn?.classList.remove("spinning"), 600);
    });

    // Inline YOU form submission (Type & Press Enter or Click Arrow)
    document.getElementById("userTextForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("liveUserTextInput");
      const text = input?.value.trim();
      if (text) {
        this.stopAssistantSpeaking();
        this.handleVoiceCommand(text);
      }
    });

    document.getElementById("sendUserTextBtn")?.addEventListener("click", (e) => {
      e.preventDefault();
      const input = document.getElementById("liveUserTextInput");
      const text = input?.value.trim();
      if (text) {
        this.stopAssistantSpeaking();
        this.handleVoiceCommand(text);
      }
    });

    // Hero Mic button
    document.getElementById("heroMainMicBtn")?.addEventListener("click", () => {
      this.stopAssistantSpeaking();
      this.voiceHandler.toggleListening(false);
    });

    // Search bar embedded mic button
    document.getElementById("searchBarMicBtn")?.addEventListener("click", () => {
      this.stopAssistantSpeaking();
      this.voiceHandler.toggleListening(false);
    });

    // Hands-free HUD Mic Orb click
    document.getElementById("hudMicBtn")?.addEventListener("click", () => {
      this.stopAssistantSpeaking();
      this.voiceHandler.toggleListening(true);
    });

    // Hands-Free Modal Launch & Close
    document.getElementById("handsFreeBtn")?.addEventListener("click", () => {
      this.openHandsFreeMode();
    });
    document.getElementById("closeHandsFreeBtn")?.addEventListener("click", () => {
      this.closeHandsFreeMode();
    });

    // Theme Toggle
    document.getElementById("themeToggleBtn")?.addEventListener("click", () => {
      this.toggleTheme();
    });

    // Language Selector
    document.getElementById("langSelect")?.addEventListener("change", (e) => {
      const lang = e.target.value;
      this.voiceHandler.setLanguage(lang);
      UI.showToast(`Voice set to ${e.target.options[e.target.selectedIndex].text}`, "info", "fa-globe");
    });

    // Persona Selector with LocalStorage Persistence
    const personaSelect = document.getElementById("voicePersonaSelect");
    const savedPersona = localStorage.getItem("voicecart_voice_persona") || "English_radiant_girl";
    if (personaSelect) {
      personaSelect.value = savedPersona;
      personaSelect.addEventListener("change", (e) => {
        const val = e.target.value;
        localStorage.setItem("voicecart_voice_persona", val);
        UI.showToast(`Voice persona: ${e.target.options[e.target.selectedIndex].text}`, "info", "fa-microphone");
      });
    }

    // Replay Audio button
    document.getElementById("replayAudioBtn")?.addEventListener("click", () => {
      this.playAssistantAudio(this.lastAudioDataUrl);
    });

    // Global Search Input
    document.getElementById("globalSearchInput")?.addEventListener("input", (e) => {
      this.filterCatalog(e.target.value.trim());
    });

    // Spoken Command Chips (Event Delegation + direct query)
    const chipsContainer = document.getElementById("heroChipsRail");
    if (chipsContainer) {
      chipsContainer.addEventListener("click", (e) => {
        const chip = e.target.closest(".hub-cmd-chip, .hero-chip");
        if (chip) {
          const cmd = chip.getAttribute("data-cmd");
          if (cmd) {
            this.stopAssistantSpeaking();
            const userTextInput = document.getElementById("liveUserTextInput");
            if (userTextInput) userTextInput.value = cmd;
            this.handleVoiceCommand(cmd);
          }
        }
      });
    }

    // Direct listener on chips for safety
    document.querySelectorAll(".hub-cmd-chip, .hero-chip").forEach(chip => {
      chip.addEventListener("click", (e) => {
        const cmd = e.currentTarget.getAttribute("data-cmd");
        if (cmd) {
          this.stopAssistantSpeaking();
          const userTextInput = document.getElementById("liveUserTextInput");
          if (userTextInput) userTextInput.value = cmd;
          this.handleVoiceCommand(cmd);
        }
      });
    });

    // Workspace Sidebar Tab Navigation
    document.querySelectorAll(".ws-tab").forEach(tab => {
      tab.addEventListener("click", (e) => {
        const btn = e.currentTarget;
        const targetId = btn.getAttribute("data-target");

        document.querySelectorAll(".ws-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".ws-pane").forEach(p => p.classList.remove("active"));

        btn.classList.add("active");
        const targetPane = document.getElementById(targetId);
        if (targetPane) targetPane.classList.add("active");
      });
    });

    // Category Icon Rail click
    document.querySelectorAll(".cat-pill-item").forEach(item => {
      item.addEventListener("click", (e) => {
        const catElem = e.currentTarget;
        document.querySelectorAll(".cat-pill-item").forEach(i => i.classList.remove("active"));
        catElem.classList.add("active");

        const cat = catElem.getAttribute("data-category") || "All";
        this.activeCategory = cat;

        const heading = document.getElementById("currentCategoryHeading");
        if (heading) heading.textContent = cat === "All" ? "Fresh Groceries & Essentials" : cat;

        this.filterCatalog();
      });
    });

    // Drawer Manual Add Form
    document.getElementById("drawerManualAddForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("drawerManualInput");
      const text = input.value.trim();
      if (!text) return;

      try {
        const res = await ApiClient.addListItem({
          name: text,
          category: "Pantry",
          quantity: 1
        });
        input.value = "";
        UI.showToast(res.message, "success", "fa-cart-plus");
        await this.refreshShoppingList();
      } catch (err) {
        UI.showToast(err.message, "error", "fa-circle-xmark");
      }
    });

    // Header & Sidebar Cart Open triggers
    document.getElementById("openCartDrawerBtn")?.addEventListener("click", () => {
      this.openCartDrawer();
    });
    document.getElementById("sidebarOpenCartBtn")?.addEventListener("click", () => {
      this.openCartDrawer();
    });

    // Close Cart Drawer triggers
    document.getElementById("closeCartDrawerBtn")?.addEventListener("click", () => {
      this.closeCartDrawer();
    });
    document.getElementById("cartDrawerBackdrop")?.addEventListener("click", () => {
      this.closeCartDrawer();
    });

    // Place Order Button (Simulation)
    document.getElementById("placeOrderBtn")?.addEventListener("click", () => {
      if (this.shoppingList.length === 0) {
        UI.showToast("Your cart is empty! Add items first.", "info", "fa-basket-shopping");
        return;
      }
      UI.showToast("🎉 Order Placed Successfully! Delivery in 10 mins.", "success", "fa-circle-check");
      setTimeout(async () => {
        await ApiClient.clearShoppingList();
        await this.refreshShoppingList();
        this.closeCartDrawer();
      }, 1500);
    });

    // Substitute Search
    document.getElementById("findSubstituteBtn")?.addEventListener("click", () => {
      const target = document.getElementById("substituteTargetInput")?.value.trim();
      if (target) this.loadSubstitutes(target);
    });
    document.getElementById("substituteTargetInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const target = e.target.value.trim();
        if (target) this.loadSubstitutes(target);
      }
    });

    // Price Slider Filter
    document.getElementById("priceRangeSlider")?.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value).toFixed(2);
      const label = document.getElementById("priceRangeValue");
      if (label) label.textContent = `$${val}`;
      this.filterCatalog();
    });

    // Dietary Filter Chips
    document.querySelectorAll("#dietaryFilterChips .diet-chip").forEach(chip => {
      chip.addEventListener("click", (e) => {
        document.querySelectorAll("#dietaryFilterChips .diet-chip").forEach(c => c.classList.remove("active"));
        e.currentTarget.classList.add("active");
        this.filterCatalog();
      });
    });

    // Review Modal Close triggers
    document.getElementById("closeReviewModalBtn")?.addEventListener("click", () => {
      this.closeProductReviewsModal();
    });
    document.getElementById("reviewModalBackdrop")?.addEventListener("click", () => {
      this.closeProductReviewsModal();
    });

    // Review Modal "Add to Cart" button
    document.getElementById("modalAddToCartBtn")?.addEventListener("click", async () => {
      if (this.activeReviewedProduct) {
        await this.addItemFromCatalog(this.activeReviewedProduct.productId || this.activeReviewedProduct.id);
        this.closeProductReviewsModal();
      }
    });

    // Export & Action Buttons
    document.getElementById("clearListBtn")?.addEventListener("click", async () => {
      if (confirm("Clear all items from your cart?")) {
        await ApiClient.clearShoppingList();
        UI.showToast("Shopping list cleared", "info", "fa-trash-can");
        await this.refreshShoppingList();
      }
    });

    document.getElementById("exportTextBtn")?.addEventListener("click", async () => {
      const res = await ApiClient.exportList("text");
      navigator.clipboard.writeText(res.text);
      UI.showToast("Cart copied to clipboard!", "success", "fa-copy");
    });

    document.getElementById("exportCsvBtn")?.addEventListener("click", () => {
      ApiClient.exportList("csv");
    });

    document.getElementById("exportWhatsAppBtn")?.addEventListener("click", async () => {
      const res = await ApiClient.exportList("text");
      const url = `https://wa.me/?text=${encodeURIComponent(res.text)}`;
      window.open(url, "_blank");
    });

    // Hotkeys (Space to toggle voice, Escape to close modals)
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) {
        e.preventDefault();
        this.stopAssistantSpeaking();
        this.voiceHandler.toggleListening(this.isHandsFree);
      } else if (e.code === "Escape") {
        this.stopAssistantSpeaking();
        if (this.isHandsFree) this.closeHandsFreeMode();
        this.closeCartDrawer();
      }
    });
  }

  // Handle Spoken Commands via MiniMax-M3 LLM + Speech-2.8 Neural TTS
  async handleVoiceCommand(transcript) {
    if (!transcript || transcript.trim() === "") return;
    if (this.isProcessingCommand) return;
    this.isProcessingCommand = true;

    const aiBadge = document.getElementById("detectedIntentBadge");
    const aiText = document.getElementById("assistantResponseText");
    const hudAiText = document.getElementById("hudAiText");
    const replayBtn = document.getElementById("replayAudioBtn");
    const persona = document.getElementById("voicePersonaSelect")?.value || "English_radiant_girl";
    const lang = document.getElementById("langSelect")?.value || "en-US";

    if (aiBadge) aiBadge.textContent = "PROCESSING...";
    if (aiText) aiText.textContent = "Thinking with MiniMax-M3...";
    if (hudAiText) hudAiText.textContent = "Processing your command...";

    try {
      // 1. Scan live website DOM and entire state
      const pageContext = PageScanner.scan();

      // 2. Process voice command with live website context & multi-turn memory
      const result = await ApiClient.processVoiceCommand(transcript, lang, persona, pageContext, this.sessionId);

      // Show Auto-Correct feedback if speech recognition had a typo
      if (result.autoCorrect && result.autoCorrect.hasChanges) {
        UI.showToast(`✨ Auto-corrected: "${result.autoCorrect.original}" → "${result.autoCorrect.corrected}"`, "info", "fa-wand-magic-sparkles");
      }

      // Update Intent Badge
      if (aiBadge) aiBadge.textContent = result.intent;

      // Update Spoken text
      const speechText = result.spokenFeedback || "Your order has been updated.";
      if (aiText) aiText.textContent = `"${speechText}"`;
      if (hudAiText) hudAiText.textContent = `"${speechText}"`;

      // Play Ultra-Natural Neural TTS Audio
      if (result.audioDataUrl) {
        this.lastAudioDataUrl = result.audioDataUrl;
        if (replayBtn) replayBtn.style.display = "inline-flex";
        this.playAssistantAudio(result.audioDataUrl, speechText);
      } else {
        this.fallbackSpeakText(speechText);
      }

      // Show Actions Taken as Toast
      if (result.actionsTaken && result.actionsTaken.length > 0) {
        result.actionsTaken.forEach(act => UI.showToast(act, "success", "fa-circle-check"));
      }

      // Refresh shopping list
      await this.refreshShoppingList();

      // 3. Execute any dynamic UI Actions returned by the Voice Agent
      if (result.uiAction) {
        await this.executeUIAction(result.uiAction);
      }

      // Handle specific secondary intent UI states
      if (result.intent === "SHOW_CART") {
        this.openCartDrawer();
      } else if (result.intent === "CHECKOUT") {
        this.openCartDrawer();
        UI.showToast("🎉 Order Placed Successfully! Delivery in 10 mins.", "success", "fa-circle-check");
      } else if (result.intent === "SEARCH") {
        const p = result.nlp?.searchParams || {};
        if (p.maxPrice) {
          const slider = document.getElementById("priceRangeSlider");
          const label = document.getElementById("priceRangeValue");
          if (slider) slider.value = p.maxPrice;
          if (label) label.textContent = `$${p.maxPrice.toFixed(2)}`;
        }
        await this.filterCatalog(p.query || "");
      } else if (result.intent === "GET_SUBSTITUTE" && result.substituteData) {
        this.switchWorkspaceTab("subsPane");
        UI.renderSubstitutes(result.substituteData, (id) => this.addItemFromCatalog(id));
      } else if (result.intent === "GET_RECOMMENDATIONS") {
        this.switchWorkspaceTab("restockPane");
        await this.loadReplenishmentSuggestions();
      }

    } catch (err) {
      console.error("Voice processing error:", err);
      if (aiBadge) aiBadge.textContent = "ERROR";
      if (aiText) aiText.textContent = `Sorry, I encountered an issue: ${err.message}`;
      UI.showToast(err.message, "error", "fa-triangle-exclamation");
    } finally {
      this.isProcessingCommand = false;
    }
  }

  /**
   * Executes dynamic UI actions across the entire website.
   * Gives the Voice Agent full interactive control over the interface.
   */
  async executeUIAction(action) {
    if (!action || !action.type) return;

    switch (action.type) {
      case "SET_CATEGORY": {
        const targetCat = action.payload || "All";
        const catPills = document.querySelectorAll(".cat-pill-item");
        let matched = false;

        catPills.forEach(pill => {
          const cat = pill.getAttribute("data-category");
          if (cat && cat.toLowerCase() === targetCat.toLowerCase()) {
            catPills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            this.activeCategory = cat;
            matched = true;
          }
        });

        if (!matched && targetCat.toLowerCase() === "all") {
          catPills[0]?.classList.add("active");
          this.activeCategory = "All";
        }

        const heading = document.getElementById("currentCategoryHeading");
        if (heading) heading.textContent = this.activeCategory === "All" ? "Fresh Groceries & Essentials" : this.activeCategory;
        
        await this.filterCatalog();

        if (action.scrollTarget) {
          this.scrollToSection(action.scrollTarget);
        }
        break;
      }

      case "SET_DIET_FILTER": {
        const targetDiet = action.payload || "";
        const chips = document.querySelectorAll("#dietaryFilterChips .diet-chip");
        chips.forEach(chip => {
          const diet = chip.getAttribute("data-diet") || "";
          chip.classList.toggle("active", diet.toLowerCase() === targetDiet.toLowerCase());
        });
        await this.filterCatalog();
        break;
      }

      case "SET_MAX_PRICE": {
        const price = parseFloat(action.payload);
        if (!isNaN(price)) {
          const slider = document.getElementById("priceRangeSlider");
          const label = document.getElementById("priceRangeValue");
          if (slider) slider.value = Math.max(1, Math.min(15, price));
          if (label) label.textContent = `$${price.toFixed(2)}`;
          await this.filterCatalog();
        }
        break;
      }

      case "RESET_FILTERS": {
        const searchInput = document.getElementById("globalSearchInput");
        if (searchInput) searchInput.value = "";

        const slider = document.getElementById("priceRangeSlider");
        const label = document.getElementById("priceRangeValue");
        if (slider) slider.value = 15;
        if (label) label.textContent = "$15.00";

        const chips = document.querySelectorAll("#dietaryFilterChips .diet-chip");
        chips.forEach(chip => chip.classList.toggle("active", (chip.getAttribute("data-diet") || "") === ""));

        const catPills = document.querySelectorAll(".cat-pill-item");
        catPills.forEach((p, idx) => p.classList.toggle("active", idx === 0));
        this.activeCategory = "All";

        const heading = document.getElementById("currentCategoryHeading");
        if (heading) heading.textContent = "Fresh Groceries & Essentials";

        await this.filterCatalog("");
        break;
      }

      case "SEARCH_STORE": {
        const query = typeof action.payload === "string" ? action.payload : action.payload?.query;
        const maxPrice = action.payload?.maxPrice;

        const searchInput = document.getElementById("globalSearchInput");
        if (searchInput && query !== undefined) searchInput.value = query;

        if (maxPrice) {
          const slider = document.getElementById("priceRangeSlider");
          const label = document.getElementById("priceRangeValue");
          if (slider) slider.value = maxPrice;
          if (label) label.textContent = `$${parseFloat(maxPrice).toFixed(2)}`;
        }

        await this.filterCatalog(query || "");
        if (action.scrollTarget) this.scrollToSection(action.scrollTarget);
        break;
      }

      case "SET_THEME": {
        const theme = action.payload === "dark" ? "dark" : action.payload === "light" ? "light" : (document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
        this.setTheme(theme);
        break;
      }

      case "OPEN_CART_DRAWER": {
        this.openCartDrawer();
        break;
      }

      case "CLOSE_CART_DRAWER": {
        this.closeCartDrawer();
        break;
      }

      case "SET_WORKSPACE_TAB": {
        const tab = action.payload || "restockPane";
        this.switchWorkspaceTab(tab);
        break;
      }

      case "SET_HANDSFREE_MODE": {
        if (action.payload) {
          this.openHandsFreeMode();
        } else {
          this.closeHandsFreeMode();
        }
        break;
      }

      case "SHOW_PRODUCT_REVIEWS": {
        this.openProductReviewsModal(action.payload);
        break;
      }

      case "SCROLL_TO_SECTION": {
        const target = action.payload || "productsSection";
        this.scrollToSection(target);
        break;
      }

      default:
        console.log(`[UI Action] Unhandled action: ${action.type}`, action);
    }
  }

  scrollToSection(targetId) {
    if (targetId === "top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const elem = document.getElementById(targetId) || document.querySelector(`.${targetId}`);
    if (elem) {
      elem.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  playAssistantAudio(audioDataUrl, fallbackText = "") {
    if (!audioDataUrl) {
      if (fallbackText) this.fallbackSpeakText(fallbackText);
      return;
    }
    const player = document.getElementById("ttsAudioPlayer");
    if (!player) {
      if (fallbackText) this.fallbackSpeakText(fallbackText);
      return;
    }

    player.src = audioDataUrl;
    player.onplay = () => this.visualizer.start("speaking");
    player.onended = () => this.visualizer.stop();
    player.onerror = () => {
      this.visualizer.stop();
      if (fallbackText) this.fallbackSpeakText(fallbackText);
    };

    player.play().catch(e => {
      console.warn("Autoplay audio notice, falling back to speech synthesis:", e);
      if (fallbackText) this.fallbackSpeakText(fallbackText);
    });
  }

  fallbackSpeakText(text) {
    if (!window.speechSynthesis || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Zira") || v.name.includes("Samantha")) && v.lang.startsWith("en")) || voices.find(v => v.lang.startsWith("en"));
      if (preferred) utterance.voice = preferred;

      utterance.onstart = () => this.visualizer.start("speaking");
      utterance.onend = () => this.visualizer.stop();
      utterance.onerror = () => this.visualizer.stop();
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis fallback failed:", e);
    }
  }

  switchWorkspaceTab(paneId) {
    document.querySelectorAll(".ws-tab").forEach(t => {
      t.classList.toggle("active", t.getAttribute("data-target") === paneId);
    });
    document.querySelectorAll(".ws-pane").forEach(p => {
      p.classList.toggle("active", p.id === paneId);
    });
  }

  async refreshShoppingList() {
    try {
      const res = await ApiClient.getShoppingList();
      this.shoppingList = res.data || [];
      this.listMeta = res.meta || {};

      UI.renderShoppingCartList(this.shoppingList, {
        onUpdateQuantity: async (id, quantity) => {
          await ApiClient.updateListItem(id, { quantity });
          await this.refreshShoppingList();
        },
        onDelete: async (id) => {
          await ApiClient.deleteListItem(id);
          UI.showToast("Item removed from cart", "info", "fa-trash-can");
          await this.refreshShoppingList();
        }
      });

      UI.renderHandsFreeCart(this.shoppingList, (this.listMeta.totalCost || 0).toFixed(2));

      // Re-render main products to sync stepper counts
      this.renderMainProducts();

      // Refresh RFY section: cart changes affect which items are shown as "already in cart"
      await this.loadHistoryRecommendations();
    } catch (err) {
      console.error("Failed to refresh shopping list:", err);
    }
  }

  async loadCatalog() {
    try {
      const res = await ApiClient.getCatalog();
      this.catalog = res.data || [];
      this.renderMainProducts();
    } catch (err) {
      console.error("Failed to load catalog:", err);
    }
  }

  renderMainProducts() {
    UI.renderMainProducts(this.catalog, this.shoppingList, {
      onAddProduct: async (prodId) => {
        await this.addItemFromCatalog(prodId);
      },
      onShowReviews: async (prodId) => {
        await this.showReviewsForProduct(prodId);
      },
      onUpdateQuantity: async (id, quantity) => {
        await ApiClient.updateListItem(id, { quantity });
        await this.refreshShoppingList();
      },
      onDelete: async (id) => {
        await ApiClient.deleteListItem(id);
        await this.refreshShoppingList();
      }
    });
  }

  async filterCatalog(searchQuery) {
    const q = searchQuery !== undefined ? searchQuery : (document.getElementById("globalSearchInput")?.value || "");
    const maxPrice = document.getElementById("priceRangeSlider")?.value || null;
    const activeDiet = document.querySelector("#dietaryFilterChips .diet-chip.active");
    const dietary = activeDiet?.getAttribute("data-diet") || "";

    try {
      const res = await ApiClient.getCatalog({
        q,
        category: this.activeCategory === "All" ? "" : this.activeCategory,
        maxPrice,
        dietary
      });
      this.catalog = res.data || [];
      this.renderMainProducts();
    } catch (err) {
      console.error("Catalog filter error:", err);
    }
  }

  async addItemFromCatalog(productId) {
    try {
      const res = await ApiClient.addListItem({ productId, quantity: 1 });
      UI.showToast(res.message, "success", "fa-cart-plus");
      await this.refreshShoppingList();
    } catch (err) {
      UI.showToast(err.message, "error", "fa-triangle-exclamation");
    }
  }

  async loadReplenishmentSuggestions() {
    try {
      const res = await ApiClient.getReplenishmentSuggestions();
      UI.renderReplenishmentSuggestions(res.data, (id) => this.addItemFromCatalog(id));
    } catch (err) {
      console.error("Replenishment load error:", err);
    }
  }

  /**
   * Loads and renders the "Recommended For You" purchase-history carousel.
   * Auto-refreshes after cart mutations so "In Cart" state is always accurate.
   */
  async loadHistoryRecommendations() {
    try {
      const res = await ApiClient.getHistoryRecommendations(8);
      UI.renderHistoryRecommendations(res.data || [], async (productId) => {
        await this.addItemFromCatalog(productId);
        // Refresh RFY to update "In Cart" badge on the card that was just added
        await this.loadHistoryRecommendations();
      });
    } catch (err) {
      console.error("History recommendations load error:", err);
    }
  }

  async loadSeasonalSuggestions() {
    try {
      const res = await ApiClient.getSeasonalSuggestions();
      UI.renderSeasonalSuggestions(res.data, (id) => this.addItemFromCatalog(id));
    } catch (err) {
      console.error("Seasonal load error:", err);
    }
  }

  async loadSubstitutes(productName) {
    try {
      const res = await ApiClient.getSubstitutes(productName);
      UI.renderSubstitutes(res.data, (id) => this.addItemFromCatalog(id));
    } catch (err) {
      console.error("Substitutes load error:", err);
    }
  }

  openCartDrawer() {
    const overlay = document.getElementById("cartDrawerOverlay");
    if (overlay) {
      overlay.style.display = "flex";
      document.body.style.overflow = "hidden";
    }
  }

  closeCartDrawer() {
    const overlay = document.getElementById("cartDrawerOverlay");
    if (overlay) {
      overlay.style.display = "none";
      document.body.style.overflow = "";
    }
  }

  openHandsFreeMode() {
    this.isHandsFree = true;
    const overlay = document.getElementById("handsFreeOverlay");
    if (overlay) overlay.style.display = "flex";
    UI.renderHandsFreeCart(this.shoppingList, (this.listMeta.totalCost || 0).toFixed(2));
    this.voiceHandler.startListening(true);
  }

  closeHandsFreeMode() {
    this.isHandsFree = false;
    const overlay = document.getElementById("handsFreeOverlay");
    if (overlay) overlay.style.display = "none";
    this.voiceHandler.stopListening();
  }

  async showReviewsForProduct(productId) {
    try {
      const res = await ApiClient.getProductReviews(productId);
      if (res.reviews) {
        this.openProductReviewsModal(res.reviews);
      }
    } catch (err) {
      console.error("Error loading product reviews:", err);
      UI.showToast("Could not load reviews for this item", "error", "fa-triangle-exclamation");
    }
  }

  openProductReviewsModal(data) {
    if (!data) return;
    this.activeReviewedProduct = data;
    const modal = document.getElementById("productReviewModal");
    if (!modal) return;

    // 1. Header Information
    const catBadge = document.getElementById("reviewModalCategory");
    const title = document.getElementById("reviewModalTitle");
    const brand = document.getElementById("reviewModalBrand");
    const price = document.getElementById("reviewModalPrice");

    if (catBadge) catBadge.innerHTML = `<i class="fa-solid fa-layer-group"></i> ${data.category || 'Grocery'}`;
    if (title) title.textContent = data.name || "Product Reviews";
    if (brand) brand.textContent = `${data.brand || 'Fresh Brand'} • ${data.unit || '1 unit'}`;
    if (price) price.textContent = `$${(data.price || 4.99).toFixed(2)}`;

    // 2. Score & Rating Bars
    const scoreNum = document.getElementById("reviewScoreNumber");
    const scoreCount = document.getElementById("reviewScoreCount");
    const starsVisual = document.getElementById("reviewStarsVisual");

    if (scoreNum) scoreNum.textContent = (data.rating || 4.8).toFixed(1);
    if (scoreCount) scoreCount.textContent = `Based on ${(data.reviewsCount || 350).toLocaleString()} verified reviews`;

    const roundedRating = Math.round(data.rating || 5);
    if (starsVisual) {
      starsVisual.innerHTML = Array.from({ length: 5 }, (_, i) => 
        `<i class="fa-${i < roundedRating ? 'solid' : 'regular'} fa-star"></i>`
      ).join("");
    }

    const b = data.breakdown || { fiveStar: 88, fourStar: 8, threeStar: 2, twoStar: 1, oneStar: 1 };
    const bar5 = document.getElementById("bar5Star");
    const pct5 = document.getElementById("pct5Star");
    const bar4 = document.getElementById("bar4Star");
    const pct4 = document.getElementById("pct4Star");
    const bar3 = document.getElementById("bar3Star");
    const pct3 = document.getElementById("pct3Star");
    const bar2 = document.getElementById("bar2Star");
    const pct2 = document.getElementById("pct2Star");
    const bar1 = document.getElementById("bar1Star");
    const pct1 = document.getElementById("pct1Star");

    if (bar5) bar5.style.width = `${b.fiveStar}%`;
    if (pct5) pct5.textContent = `${b.fiveStar}%`;
    if (bar4) bar4.style.width = `${b.fourStar}%`;
    if (pct4) pct4.textContent = `${b.fourStar}%`;
    if (bar3) bar3.style.width = `${b.threeStar}%`;
    if (pct3) pct3.textContent = `${b.threeStar}%`;
    if (bar2) bar2.style.width = `${b.twoStar}%`;
    if (pct2) pct2.textContent = `${b.twoStar}%`;
    if (bar1) bar1.style.width = `${b.oneStar}%`;
    if (pct1) pct1.textContent = `${b.oneStar}%`;

    // 3. Sentiment Highlight Pills
    const sentimentContainer = document.getElementById("reviewSentimentPills");
    if (sentimentContainer) {
      const tags = data.sentimentTags || ["High Quality", "Fresh & Delicious", "Great Value"];
      sentimentContainer.innerHTML = tags.map(tag => `
        <span class="sentiment-pill">
          <i class="fa-solid fa-sparkles"></i> ${tag}
        </span>
      `).join("");
    }

    // 4. Web Consensus Card
    const web = data.webConsensus || {
      headline: `Consistently rated a top favorite among grocery shoppers online.`,
      summary: `Culinary reviewers and online consumers praise ${data.name} for freshness, balanced flavor profile, and clean quality ingredients.`,
      keyStrengths: ["Premium freshness guarantee", "Top-rated consumer taste", "Great everyday value"]
    };

    const headlineElem = document.getElementById("consensusHeadline");
    const summaryElem = document.getElementById("consensusSummary");
    const strengthsContainer = document.getElementById("consensusStrengths");

    if (headlineElem) headlineElem.textContent = `"${web.headline}"`;
    if (summaryElem) summaryElem.textContent = web.summary;
    if (strengthsContainer) {
      const strengths = web.keyStrengths || ["Verified Quality", "Fast 10-min Delivery"];
      strengthsContainer.innerHTML = strengths.map(st => `
        <span class="consensus-strength-item">
          <i class="fa-solid fa-circle-check"></i> ${st}
        </span>
      `).join("");
    }

    // 5. Verified Customer Reviews List
    const reviewsContainer = document.getElementById("verifiedCustomerReviewsList");
    if (reviewsContainer) {
      const reviews = data.customerReviews || [
        { author: "Verified Customer", rating: 5, date: "Recent", comment: `${data.name} is super fresh and exceeded my expectations!` }
      ];

      reviewsContainer.innerHTML = reviews.map(r => `
        <div class="verified-review-card">
          <div class="verified-review-top">
            <div class="reviewer-name">
              <i class="fa-solid fa-circle-user"></i> ${r.author}
              <span class="verified-badge"><i class="fa-solid fa-shield-check"></i> Verified Buyer</span>
            </div>
            <span class="review-date">${r.date}</span>
          </div>
          <div class="review-stars-mini">
            ${Array.from({ length: r.rating || 5 }, () => '<i class="fa-solid fa-star"></i>').join('')}
          </div>
          <p class="review-comment">"${r.comment}"</p>
        </div>
      `).join("");
    }

    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  closeProductReviewsModal() {
    const modal = document.getElementById("productReviewModal");
    if (modal) {
      modal.style.display = "none";
      document.body.style.overflow = "";
    }
  }
}

// Bootstrap Application
document.addEventListener("DOMContentLoaded", () => {
  window.app = new VoiceShoppingApp();
});
