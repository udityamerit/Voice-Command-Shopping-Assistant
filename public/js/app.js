// public/js/app.js - Modern Quick-Commerce Orchestrator with MiniMax-M3 & Natural Speech
import { ApiClient } from "./api.js";
import { UI } from "./ui.js";
import { VoiceHandler } from "./voiceHandler.js";
import { AudioVisualizer } from "./visualizer.js";

class VoiceShoppingApp {
  constructor() {
    this.catalog = [];
    this.shoppingList = [];
    this.listMeta = {};
    this.activeCategory = "All";
    this.lastAudioDataUrl = null;
    this.isHandsFree = false;

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
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("voicecart_theme", next);
    this.updateThemeIcon(next);
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

        if (listening) {
          this.stopAssistantSpeaking();
          heroMic?.classList.add("listening");
          searchMic?.classList.add("listening");
          hudOrb?.classList.add("listening");
          if (heroMicIcon) heroMicIcon.className = "fa-solid fa-microphone-lines";
          if (hudStatus) hudStatus.textContent = "Listening... Speak your grocery command";
          if (userTextInput && !userTextInput.value) {
            userTextInput.placeholder = "Listening... Speak your command now...";
          }
          this.visualizer.start("listening");
        } else {
          heroMic?.classList.remove("listening");
          searchMic?.classList.remove("listening");
          hudOrb?.classList.remove("listening");
          if (heroMicIcon) heroMicIcon.className = "fa-solid fa-microphone";
          if (hudStatus) hudStatus.textContent = "Listening continuously... Speak your grocery commands";
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

    // Persona Selector
    document.getElementById("voicePersonaSelect")?.addEventListener("change", (e) => {
      UI.showToast(`Voice persona: ${e.target.options[e.target.selectedIndex].text}`, "info", "fa-microphone");
    });

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
      const result = await ApiClient.processVoiceCommand(transcript, lang, persona);

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

      // Refresh list & catalog
      await this.refreshShoppingList();

      // Handle specific UI actions per intent
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
}

// Bootstrap Application
document.addEventListener("DOMContentLoaded", () => {
  window.app = new VoiceShoppingApp();
});
