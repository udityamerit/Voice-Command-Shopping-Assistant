// public/js/pageScanner.js - Real-time Full Website DOM Scanner & State Extractor
// Provides the Voice Agent with dynamic live access to every element, category, product,
// filter, cart, drawer, theme, and tab on the website.

export const PageScanner = {
  /**
   * Scans and returns a comprehensive snapshot of the website's live state.
   */
  scan() {
    return {
      timestamp: Date.now(),
      theme: document.documentElement.getAttribute("data-theme") || "light",
      activeCategory: this.getActiveCategory(),
      availableCategories: this.getAvailableCategories(),
      activeDietaryFilter: this.getActiveDietaryFilter(),
      availableDietaryFilters: this.getAvailableDietaryFilters(),
      priceFilter: this.getPriceFilter(),
      searchQuery: document.getElementById("globalSearchInput")?.value || "",
      visibleProducts: this.getVisibleProducts(),
      recommendedProducts: this.getRecommendedProducts(),
      cartState: this.getCartState(),
      activeWorkspaceTab: this.getActiveWorkspaceTab(),
      isHandsFreeActive: document.getElementById("handsFreeOverlay")?.style.display === "flex",
      isCartDrawerOpen: document.getElementById("cartDrawerOverlay")?.style.display === "flex",
      selectedVoicePersona: document.getElementById("voicePersonaSelect")?.value || "English_radiant_girl",
      selectedLanguage: document.getElementById("langSelect")?.value || "en-US",
      availableSections: [
        { id: "voiceHub", name: "Voice Assistant Hub", selector: ".voice-assistant-hub" },
        { id: "rfySection", name: "Recommended For You", selector: "#rfySection" },
        { id: "categoryRail", name: "Product Categories Rail", selector: ".category-icon-rail" },
        { id: "productsSection", name: "Products Showcase Grid", selector: ".products-section" },
        { id: "smartAiSidebar", name: "Smart Grocery AI Workspace", selector: ".sidebar-workspace" }
      ]
    };
  },

  getActiveCategory() {
    const activePill = document.querySelector(".cat-pill-item.active");
    return activePill?.getAttribute("data-category") || "All";
  },

  getAvailableCategories() {
    const pills = document.querySelectorAll(".cat-pill-item");
    return Array.from(pills).map(pill => {
      const cat = pill.getAttribute("data-category") || "";
      const label = pill.querySelector("span")?.textContent.trim() || cat;
      return { category: cat, label };
    });
  },

  getActiveDietaryFilter() {
    const activeChip = document.querySelector("#dietaryFilterChips .diet-chip.active");
    return activeChip?.getAttribute("data-diet") || "All";
  },

  getAvailableDietaryFilters() {
    const chips = document.querySelectorAll("#dietaryFilterChips .diet-chip");
    return Array.from(chips).map(c => ({
      filter: c.getAttribute("data-diet") || "All",
      label: c.textContent.trim()
    }));
  },

  getPriceFilter() {
    const slider = document.getElementById("priceRangeSlider");
    const val = slider ? parseFloat(slider.value) : 15.00;
    const min = slider ? parseFloat(slider.min) : 1.00;
    const max = slider ? parseFloat(slider.max) : 15.00;
    return { currentMax: val, min, max };
  },

  getVisibleProducts() {
    const cards = document.querySelectorAll("#mainProductsGrid .product-card");
    return Array.from(cards).map(card => {
      const id = card.getAttribute("data-product-id");
      const title = card.querySelector(".card-title")?.textContent.trim() || "";
      const brand = card.querySelector(".card-brand")?.textContent.trim() || "";
      const unit = card.querySelector(".card-unit")?.textContent.trim() || "";
      const priceText = card.querySelector(".current-price")?.textContent.replace("$", "").trim() || "0";
      const price = parseFloat(priceText);
      const deliveryTime = card.querySelector(".badge-delivery-time")?.textContent.trim() || "8 MINS";
      const discount = card.querySelector(".badge-discount")?.textContent.trim() || null;
      const stepper = card.querySelector(".stepper-count");
      const inCartQty = stepper ? parseInt(stepper.textContent.trim(), 10) : 0;

      return {
        id,
        name: title,
        brand,
        unit,
        price,
        deliveryTime,
        discount,
        isInCart: inCartQty > 0,
        inCartQuantity: inCartQty
      };
    });
  },

  getRecommendedProducts() {
    const rfyCards = document.querySelectorAll("#rfyCarouselTrack .rfy-card");
    return Array.from(rfyCards).map(card => {
      const id = card.getAttribute("data-product-id");
      const name = card.querySelector(".rfy-card-name")?.textContent.trim() || "";
      const reason = card.querySelector(".rfy-card-reason")?.textContent.trim() || "";
      const urgency = card.querySelector(".rfy-urgency-badge")?.textContent.trim() || "";
      const confidence = card.querySelector(".rfy-confidence-pct")?.textContent.trim() || "";
      const price = card.querySelector(".rfy-card-price")?.textContent.trim() || "";
      const isInCart = card.classList.contains("in-cart");

      return { id, name, reason, urgency, confidence, price, isInCart };
    });
  },

  getCartState() {
    const rows = document.querySelectorAll("#shoppingListContainer .cart-item-row");
    const items = Array.from(rows).map(row => {
      const id = row.getAttribute("data-id");
      const name = row.querySelector(".row-title")?.textContent.trim() || "";
      const sub = row.querySelector(".row-sub")?.textContent.trim() || "";
      const price = row.querySelector(".row-price")?.textContent.trim() || "";
      const qty = parseInt(row.querySelector(".stepper-count")?.textContent.trim() || "1", 10);
      return { id, name, sub, price, quantity: qty };
    });

    const headerTotal = document.getElementById("headerCartTotal")?.textContent.trim() || "$0.00";
    const headerCount = parseInt(document.getElementById("headerCartCount")?.textContent.trim() || "0", 10);
    const grandTotal = document.getElementById("billGrandTotal")?.textContent.trim() || "$0.00";
    const budget = document.getElementById("drawerBudgetSpentDisplay")?.textContent.trim() || "$0.00 / $50.00";

    return {
      items,
      itemCount: headerCount,
      totalCost: headerTotal,
      grandTotal,
      budget,
      isEmpty: items.length === 0
    };
  },

  getActiveWorkspaceTab() {
    const activeTab = document.querySelector(".workspace-tabs-header .ws-tab.active");
    const target = activeTab?.getAttribute("data-target") || "restockPane";
    const name = activeTab?.textContent.trim() || "Restock Smart";
    return { target, name };
  }
};
