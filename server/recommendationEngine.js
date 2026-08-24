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

/**
 * Strict & Fuzzy Catalog Product Matcher
 * Finds the exact or closest matching product in the catalog.
 * Returns the product object if matched, or null if no catalog item matches.
 */
export function findCatalogProduct(queryStr) {
  if (!queryStr || typeof queryStr !== "string") return null;
  const raw = queryStr.toLowerCase().trim();
  if (raw === "") return null;

  // Clean noise words
  const clean = raw
    .replace(/^(a|an|the|some|fresh|organic|pack of|bottle of|box of|loaf of|bunch of|bag of|dozen)\s+/gi, "")
    .replace(/\s+(please|now|fast|today)$/gi, "")
    .trim();

  // 1. Direct ID match
  const byId = PRODUCT_CATALOG.find(p => p.id.toLowerCase() === raw || p.id.toLowerCase() === clean);
  if (byId) return byId;

  // 2. Exact name match
  const exact = PRODUCT_CATALOG.find(p => p.name.toLowerCase() === raw || p.name.toLowerCase() === clean);
  if (exact) return exact;

  // 3. Normalized alias dictionary for standard grocery terms and multilingual keywords
  const ALIASES = {
    "apple": "prod_apple_gala",
    "apples": "prod_apple_gala",
    "gala apple": "prod_apple_gala",
    "gala apples": "prod_apple_gala",
    "red apple": "prod_apple_gala",
    "red apples": "prod_apple_gala",
    "manzana": "prod_apple_gala",
    "pomme": "prod_apple_gala",
    "seb": "prod_apple_gala",
    "honeycrisp": "prod_apple_honeycrisp",
    "honeycrisp apple": "prod_apple_honeycrisp",
    "honeycrisp apples": "prod_apple_honeycrisp",
    "green apple": "prod_apple_honeycrisp",
    "green apples": "prod_apple_honeycrisp",
    "banana": "prod_banana",
    "bananas": "prod_banana",
    "platano": "prod_banana",
    "banane": "prod_banana",
    "kela": "prod_banana",
    "spinach": "prod_spinach",
    "baby spinach": "prod_spinach",
    "spinach leaves": "prod_spinach",
    "espinaca": "prod_spinach",
    "palak": "prod_spinach",
    "avocado": "prod_avocado",
    "avocados": "prod_avocado",
    "hass avocado": "prod_avocado",
    "aguacate": "prod_avocado",
    "strawberry": "prod_berries_straw",
    "strawberries": "prod_berries_straw",
    "fresa": "prod_berries_straw",
    "fraise": "prod_berries_straw",
    "blueberry": "prod_berries_blue",
    "blueberries": "prod_berries_blue",
    "arandano": "prod_berries_blue",
    "tomato": "prod_tomatoes_roma",
    "tomatoes": "prod_tomatoes_roma",
    "roma tomato": "prod_tomatoes_roma",
    "roma tomatoes": "prod_tomatoes_roma",
    "tomate": "prod_tomatoes_roma",
    "tamatar": "prod_tomatoes_roma",
    "lemon": "prod_lemon_meyer",
    "lemons": "prod_lemon_meyer",
    "meyer lemon": "prod_lemon_meyer",
    "limon": "prod_lemon_meyer",
    "citron": "prod_lemon_meyer",
    "nimbu": "prod_lemon_meyer",
    "milk": "dairy_milk_whole",
    "whole milk": "dairy_milk_whole",
    "cow milk": "dairy_milk_whole",
    "leche": "dairy_milk_whole",
    "lait": "dairy_milk_whole",
    "doodh": "dairy_milk_whole",
    "oat milk": "dairy_milk_oat",
    "oatly": "dairy_milk_oat",
    "barista milk": "dairy_milk_oat",
    "oat drink": "dairy_milk_oat",
    "almond milk": "dairy_milk_almond",
    "califia": "dairy_milk_almond",
    "egg": "dairy_eggs_freerange",
    "eggs": "dairy_eggs_freerange",
    "brown eggs": "dairy_eggs_freerange",
    "huevo": "dairy_eggs_freerange",
    "huevos": "dairy_eggs_freerange",
    "oeuf": "dairy_eggs_freerange",
    "ande": "dairy_eggs_freerange",
    "yogurt": "dairy_greek_yogurt",
    "greek yogurt": "dairy_greek_yogurt",
    "curd": "dairy_greek_yogurt",
    "dahi": "dairy_greek_yogurt",
    "fage": "dairy_greek_yogurt",
    "butter": "dairy_butter_salted",
    "salted butter": "dairy_butter_salted",
    "irish butter": "dairy_butter_salted",
    "mantequilla": "dairy_butter_salted",
    "beurre": "dairy_butter_salted",
    "makhan": "dairy_butter_salted",
    "cheese": "dairy_cheese_cheddar",
    "cheddar": "dairy_cheese_cheddar",
    "cheddar cheese": "dairy_cheese_cheddar",
    "white cheddar": "dairy_cheese_cheddar",
    "queso": "dairy_cheese_cheddar",
    "fromage": "dairy_cheese_cheddar",
    "paneer": "meat_tofu_firm",
    "bread": "bakery_sourdough",
    "sourdough": "bakery_sourdough",
    "sourdough bread": "bakery_sourdough",
    "pan": "bakery_sourdough",
    "pain": "bakery_sourdough",
    "loaf": "bakery_sourdough",
    "croissant": "bakery_croissant",
    "croissants": "bakery_croissant",
    "butter croissant": "bakery_croissant",
    "bagel": "bakery_bagels_everything",
    "bagels": "bakery_bagels_everything",
    "everything bagel": "bakery_bagels_everything",
    "olive oil": "pantry_olive_oil",
    "extra virgin olive oil": "pantry_olive_oil",
    "aceite": "pantry_olive_oil",
    "oil": "pantry_olive_oil",
    "pasta": "pantry_pasta_organic",
    "spaghetti": "pantry_pasta_organic",
    "noodles": "pantry_pasta_organic",
    "honey": "pantry_honey_raw",
    "wildflower honey": "pantry_honey_raw",
    "organic honey": "pantry_honey_raw",
    "miel": "pantry_honey_raw",
    "shahad": "pantry_honey_raw",
    "rice": "pantry_rice_basmati",
    "basmati": "pantry_rice_basmati",
    "basmati rice": "pantry_rice_basmati",
    "arroz": "pantry_rice_basmati",
    "riz": "pantry_rice_basmati",
    "chawal": "pantry_rice_basmati",
    "oats": "pantry_oats_rolled",
    "rolled oats": "pantry_oats_rolled",
    "oatmeal": "pantry_oats_rolled",
    "avena": "pantry_oats_rolled",
    "chicken": "meat_chicken_breast",
    "chicken breast": "meat_chicken_breast",
    "chicken breasts": "meat_chicken_breast",
    "pollo": "meat_chicken_breast",
    "poulet": "meat_chicken_breast",
    "murgh": "meat_chicken_breast",
    "salmon": "meat_salmon_wild",
    "salmon fillet": "meat_salmon_wild",
    "fish": "meat_salmon_wild",
    "pescado": "meat_salmon_wild",
    "tofu": "meat_tofu_firm",
    "firm tofu": "meat_tofu_firm",
    "extra firm tofu": "meat_tofu_firm",
    "coffee": "bev_coffee_coldbrew",
    "cold brew": "bev_coffee_coldbrew",
    "cold brew coffee": "bev_coffee_coldbrew",
    "cafe": "bev_coffee_coldbrew",
    "sparkling water": "bev_sparkling_water",
    "seltzer": "bev_sparkling_water",
    "soda water": "bev_sparkling_water",
    "spindrift": "bev_sparkling_water",
    "matcha": "bev_tea_green",
    "green tea": "bev_tea_green",
    "matcha green tea": "bev_tea_green",
    "tea": "bev_tea_green",
    "chai": "bev_tea_green",
    "chocolate": "snack_dark_chocolate",
    "dark chocolate": "snack_dark_chocolate",
    "almond": "snack_almonds_roasted",
    "almonds": "snack_almonds_roasted",
    "roasted almonds": "snack_almonds_roasted",
    "nuts": "snack_almonds_roasted",
    "badam": "snack_almonds_roasted",
    "dish soap": "house_dish_soap",
    "soap": "house_dish_soap",
    "dish wash": "house_dish_soap",
    "dishwashing liquid": "house_dish_soap",
    "method soap": "house_dish_soap",
    "toothpaste": "house_toothpaste",
    "paste": "house_toothpaste",
    "whitening toothpaste": "house_toothpaste"
  };

  if (ALIASES[raw]) {
    const p = PRODUCT_CATALOG.find(x => x.id === ALIASES[raw]);
    if (p) return p;
  }
  if (ALIASES[clean]) {
    const p = PRODUCT_CATALOG.find(x => x.id === ALIASES[clean]);
    if (p) return p;
  }

  // 4. Token overlap scoring against product name & category
  const queryTokens = clean.split(/\s+/).filter(t => t.length > 2);
  let bestMatch = null;
  let highestScore = 0;

  for (const product of PRODUCT_CATALOG) {
    const prodName = product.name.toLowerCase();
    const prodBrand = (product.brand || "").toLowerCase();
    const prodCat = product.category.toLowerCase();

    // Direct containment
    if (prodName.includes(clean) || clean.includes(prodName)) {
      return product;
    }

    let score = 0;
    for (const token of queryTokens) {
      if (prodName.includes(token)) score += 3;
      else if (prodBrand.includes(token)) score += 2;
      else if (prodCat.includes(token)) score += 1.5;
    }

    if (score > highestScore && score >= 2.5) {
      highestScore = score;
      bestMatch = product;
    }
  }

  return bestMatch; // Returns genuine catalog product or null if item doesn't exist in store
}
