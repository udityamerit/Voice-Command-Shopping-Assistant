// public/js/api.js - Frontend REST Client for VoiceCart AI Backend

const BASE_URL = ""; // Relative path to Express server

export const ApiClient = {
  async getShoppingList() {
    const res = await fetch(`${BASE_URL}/api/shopping-list`);
    if (!res.ok) throw new Error("Failed to fetch shopping list");
    return res.json();
  },

  async addListItem(data) {
    const res = await fetch(`${BASE_URL}/api/shopping-list/item`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Failed to add item to shopping list");
    return res.json();
  },

  async updateListItem(id, data) {
    const res = await fetch(`${BASE_URL}/api/shopping-list/item/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Failed to update item");
    return res.json();
  },

  async deleteListItem(id) {
    const res = await fetch(`${BASE_URL}/api/shopping-list/item/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    if (!res.ok) throw new Error("Failed to delete item");
    return res.json();
  },

  async clearShoppingList() {
    const res = await fetch(`${BASE_URL}/api/shopping-list`, {
      method: "DELETE"
    });
    if (!res.ok) throw new Error("Failed to clear list");
    return res.json();
  },

  async processVoiceCommand(transcript, language = "en", voiceId = "English_expressive_narrator", pageContext = null, sessionId = "default_session") {
    const res = await fetch(`${BASE_URL}/api/voice/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, language, voiceId, pageContext, sessionId })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to process voice command");
    }
    return res.json();
  },

  async getCatalog(params = {}) {
    const queryStr = new URLSearchParams(params).toString();
    const res = await fetch(`${BASE_URL}/api/catalog?${queryStr}`);
    if (!res.ok) throw new Error("Failed to fetch catalog");
    return res.json();
  },

  async getReplenishmentSuggestions() {
    const res = await fetch(`${BASE_URL}/api/recommendations/replenishment`);
    if (!res.ok) throw new Error("Failed to fetch replenishment suggestions");
    return res.json();
  },

  async getSeasonalSuggestions() {
    const res = await fetch(`${BASE_URL}/api/recommendations/seasonal`);
    if (!res.ok) throw new Error("Failed to fetch seasonal items");
    return res.json();
  },

  async getHistoryRecommendations(limit = 8) {
    const res = await fetch(`${BASE_URL}/api/recommendations/history?limit=${limit}`);
    if (!res.ok) throw new Error("Failed to fetch history recommendations");
    return res.json();
  },

  async getSubstitutes(productName) {
    const res = await fetch(`${BASE_URL}/api/recommendations/substitutes?product=${encodeURIComponent(productName)}`);
    if (!res.ok) throw new Error("Failed to fetch substitutes");
    return res.json();
  },

  async getProductReviews(productId) {
    const res = await fetch(`${BASE_URL}/api/products/${encodeURIComponent(productId)}/reviews`);
    if (!res.ok) throw new Error("Failed to fetch product reviews");
    return res.json();
  },

  async exportList(format = "text") {
    if (format === "csv") {
      window.location.href = `${BASE_URL}/api/export?format=csv`;
      return { success: true };
    }
    const res = await fetch(`${BASE_URL}/api/export?format=${format}`);
    if (!res.ok) throw new Error("Failed to export shopping list");
    return res.json();
  }
};
