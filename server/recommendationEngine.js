// server/recommendationEngine.js - Smart recommendation & prediction engine
import { PRODUCT_CATALOG, USER_PURCHASE_HISTORY } from "./catalogData.js";

/**
 * Predictive replenishment: Calculates items that the user is likely running low on.
 */
export function getPredictiveReplenishment(currentCartItemNames = []) {
  const currentNormalized = currentCartItemNames.map(name => name.toLowerCase());

  const suggestions = USER_PURCHASE_HISTORY
    .map(history => {
      const product = PRODUCT_CATALOG.find(p => p.id === history.productId);
      if (!product) return null;

      // Skip if already in active cart
      const alreadyInCart = currentNormalized.some(name =>
        product.name.toLowerCase().includes(name) || name.includes(product.name.toLowerCase())
      );
      if (alreadyInCart) return null;

      const overdueDays = history.lastPurchasedDaysAgo - history.frequencyDays;
      const urgency = overdueDays >= 2 ? "high" : overdueDays >= 0 ? "medium" : "low";

      return {
        product,
        reason: `Based on your usual ${history.frequencyDays}-day restock cycle (${history.lastPurchasedDaysAgo} days since last purchase).`,
        urgency,
        confidence: Math.min(0.98, 0.70 + (history.totalBought * 0.02))
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.urgency === "high" ? 1 : 0) - (a.urgency === "high" ? 1 : 0));

  return suggestions;
}

/**
 * Seasonal & On-Sale Recommendations: Fresh season specials and promotional discounts.
 */
export function getSeasonalAndSaleRecommendations() {
  const seasonal = PRODUCT_CATALOG.filter(p => p.isSeasonal || p.isSale).map(p => {
    let highlight = "";
    if (p.isSale && p.discountPercent) {
      highlight = `🔥 Special Offer: Save ${p.discountPercent}% off`;
    } else if (p.isSeasonal) {
      highlight = `🌱 In Season: ${p.season}`;
    }
    return {
      product: p,
      highlight,
      badge: p.isSale ? "ON SALE" : "SEASONAL"
    };
  });

  return seasonal;
}

/**
 * Intelligent Substitutions: Finds healthy, dietary, or budget alternatives.
 */
export function getProductSubstitutes(productIdOrName) {
  let targetProduct = PRODUCT_CATALOG.find(p => p.id === productIdOrName);
  if (!targetProduct) {
    const q = productIdOrName.toLowerCase();
    targetProduct = PRODUCT_CATALOG.find(p => p.name.toLowerCase().includes(q));
  }

  if (!targetProduct) {
    return { target: null, substitutes: [] };
  }

  const substitutes = (targetProduct.substitutes || [])
    .map(subId => {
      const subProduct = PRODUCT_CATALOG.find(p => p.id === subId);
      if (!subProduct) return null;

      // Determine smart reasoning
      let reason = "Alternative option";
      if (subProduct.dietary.some(d => d.includes("Vegan") || d.includes("Plant-Based"))) {
        reason = "Plant-based / Vegan friendly alternative";
      } else if (subProduct.dietary.some(d => d.includes("Gluten-Free"))) {
        reason = "Certified gluten-free alternative";
      } else if (subProduct.price < targetProduct.price) {
        reason = `Budget-friendly option (Save $${(targetProduct.price - subProduct.price).toFixed(2)})`;
      } else if (subProduct.dietary.some(d => d.includes("Organic"))) {
        reason = "Premium organic alternative";
      }

      return {
        product: subProduct,
        reason
      };
    })
    .filter(Boolean);

  return {
    target: targetProduct,
    substitutes
  };
}

/**
 * Search & Filter Engine with support for Voice Queries (e.g. price range, brand, dietary)
 */
export function searchCatalog({
  query = "",
  category = "All",
  maxPrice = null,
  minPrice = null,
  dietary = null,
  brand = null,
  onlyInStock = false
} = {}) {
  let results = PRODUCT_CATALOG;

  if (query && query.trim() !== "") {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    results = results.filter(item => {
      const targetStr = `${item.name} ${item.category} ${item.brand} ${item.dietary.join(" ")} ${item.description}`.toLowerCase();
      return terms.every(term => targetStr.includes(term));
    });
  }

  if (category && category !== "All") {
    results = results.filter(item => item.category.toLowerCase() === category.toLowerCase());
  }

  if (maxPrice !== null && !isNaN(maxPrice)) {
    results = results.filter(item => item.price <= parseFloat(maxPrice));
  }

  if (minPrice !== null && !isNaN(minPrice)) {
    results = results.filter(item => item.price >= parseFloat(minPrice));
  }

  if (dietary && dietary.trim() !== "") {
    const dietTarget = dietary.toLowerCase();
    results = results.filter(item =>
      item.dietary.some(d => d.toLowerCase().includes(dietTarget))
    );
  }

  if (brand && brand.trim() !== "") {
    const brandTarget = brand.toLowerCase();
    results = results.filter(item => item.brand.toLowerCase().includes(brandTarget));
  }

  if (onlyInStock) {
    results = results.filter(item => item.inStock);
  }

  return results;
}
