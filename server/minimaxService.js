// server/minimaxService.js - MiniMax-M3 LLM NLP & Speech-2.8-HD Neural TTS Service
import dotenv from "dotenv";
import { PRODUCT_CATALOG, CATEGORIES } from "./catalogData.js";
import { searchCatalog, getProductSubstitutes, getPredictiveReplenishment, getSeasonalAndSaleRecommendations } from "./recommendationEngine.js";
import { autoCorrectTranscript } from "./autoCorrectService.js";
import { ConversationMemory } from "./conversationMemory.js";

dotenv.config();

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || "";
const MINIMAX_BASE_URL = process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1";
const MINIMAX_TTS_URL = process.env.MINIMAX_TTS_URL || "https://api.minimax.io/v1/t2a_v2";

// Memory cache for synthesized audio to prevent duplicate API calls
const audioCache = new Map();

// -----------------------------------------------------------------------
// STEP 0 — Server-side transcript normalization (mirrors client-side logic)
// Ensures both typed and voice inputs go through the same cleaning pipeline.
// -----------------------------------------------------------------------
function normalizeServerTranscript(raw) {
  if (!raw || typeof raw !== "string") return raw;
  let t = raw.trim();

  // Strip filler/hesitation words
  t = t.replace(/\b(um+|uh+|hmm+|err+|like,?|you know,?|kind of,?|sort of,?|basically,?|actually,?|literally,?|right,?|okay so,?|so like,?|i mean,?)\b/gi, " ");

  // Number word → digit conversion
  const NUMBER_WORDS = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
    "ten": "10", "eleven": "11", "twelve": "12",
    "a dozen": "12", "dozen": "12", "half a dozen": "6",
    "a few": "3", "a couple": "2", "couple of": "2", "couple": "2"
  };
  for (const [word, digit] of Object.entries(NUMBER_WORDS)) {
    const re = new RegExp(`\\b${word}\\b`, "gi");
    t = t.replace(re, digit);
  }

  // Fix STT mishears: "too" as quantity word
  t = t.replace(/\b(add|buy|get|order|i need|put)\s+too\s+/gi, (m, v) => `${v} 2 `);
  // Fix "for" misheard as digit 4 before a noun
  t = t.replace(/\b(add|buy|get|order|put)\s+for\s+(?=[a-z])/gi, (m, v) => `${v} 4 `);

  // Remove leading politeness / noise phrases
  t = t.replace(/^(hey|okay|ok|please|can you|could you|i want to|i'd like to|i would like to|can i get|i'd like)\s+/i, "");

  // Normalize whitespace and trailing punctuation
  t = t.replace(/\s{2,}/g, " ").trim().replace(/[.,!?;:]+$/, "").trim();

  return t;
}

// -----------------------------------------------------------------------
// STEP 1 — Multi-Intent Chunking
// Splits compound commands like "add milk and then remove bread and show cart"
// into independent sub-intents and processes them sequentially.
// -----------------------------------------------------------------------

// Action verb anchors that signal a new intent boundary in a compound command
const ACTION_VERBS = [
  "add", "buy", "order", "get", "put",
  "remove", "delete", "take out", "drop",
  "show", "view", "check", "list",
  "clear", "empty", "reset",
  "search", "find",
  "change", "update", "set", "increase", "decrease", "make",
  "checkout", "place order",
  "substitute", "recommend"
];

/**
 * Splits a compound voice query into atomic sub-queries.
 * Handles: "and then", "also", "after that", and verb-anchored "and X" splits.
 * Returns an array of normalized sub-query strings.
 */
function chunkCompoundQuery(transcript) {
  if (!transcript) return [transcript];

  // Split on explicit multi-intent phrases first
  let parts = transcript
    .split(/\s+and\s+then\s+|\s+after\s+that\s+|\s+also\s+(?=(?:add|remove|delete|clear|search|find|show|check|change|update|checkout|buy|get)\b)/i)
    .map(p => p.trim())
    .filter(Boolean);

  // For remaining "and" conjunctions, detect if what follows starts a new action verb
  const finalParts = [];
  for (const part of parts) {
    // Check for "and <action_verb>" pattern within this part
    const verbPattern = new RegExp(
      `\\s+and\\s+(${ACTION_VERBS.join("|")})\\b`,
      "i"
    );
    const split = part.split(verbPattern);
    // split produces: [prefix, capturedVerb, ...rest]
    if (split.length > 1) {
      finalParts.push(split[0].trim());
      // Reconstruct the subsequent verb+rest chunks
      // split = [prefix, verb1, remainder1, verb2, remainder2, ...]
      for (let i = 1; i < split.length; i += 2) {
        const verb = split[i];
        const rest = split[i + 1] || "";
        finalParts.push(`${verb} ${rest}`.trim());
      }
    } else {
      finalParts.push(part);
    }
  }

  return finalParts.filter(p => p.length > 0);
}

// -----------------------------------------------------------------------
// STEP 2 — Fast-Path Deterministic Classifier (< 2ms response time)
// Precisely classifies standard shopping intents without calling LLM.
// All regex patterns are carefully ordered and scoped to avoid conflicts.
// -----------------------------------------------------------------------
function fastPathClassify(userTranscript, currentShoppingList = [], pageContext = null, sessionId = "default_session") {
  if (!userTranscript || typeof userTranscript !== "string") return null;
  const raw = userTranscript.trim();
  // Normalize for matching: lowercase, strip punctuation
  const lower = raw.toLowerCase().replace(/[?!.,;:]/g, "").trim();

  // ── 1. GREETING / CHAT ──────────────────────────────────────────────────
  if (/^(hello|hi+|hey+|good\s+(morning|evening|afternoon|night)|who\s+are\s+you|help me|what\s+can\s+you\s+do)$/.test(lower)) {
    return {
      intent: "CHAT",
      detectedLanguage: "en",
      spokenFeedback: "Hello! I'm VoiceCart AI. You can ask me to add groceries, navigate categories, filter organic or vegan foods, adjust price sliders, switch themes, open tabs, or place an order.",
      items: []
    };
  }

  // ── 2. THEME CONTROL (Dark / Light Mode) ──────────────────────────────────
  if (/\b(dark\s+mode|dark\s+theme|night\s+mode|turn\s+on\s+dark|enable\s+dark|switch\s+to\s+dark)\b/i.test(lower)) {
    return {
      intent: "UI_ACTION",
      detectedLanguage: "en",
      spokenFeedback: "Switching to dark mode.",
      uiAction: { type: "SET_THEME", payload: "dark" },
      items: []
    };
  }
  if (/\b(light\s+mode|light\s+theme|day\s+mode|turn\s+on\s+light|enable\s+light|switch\s+to\s+light)\b/i.test(lower)) {
    return {
      intent: "UI_ACTION",
      detectedLanguage: "en",
      spokenFeedback: "Switching to light mode.",
      uiAction: { type: "SET_THEME", payload: "light" },
      items: []
    };
  }
  if (/\b(toggle\s+theme|switch\s+theme|change\s+theme)\b/i.test(lower)) {
    const next = pageContext?.theme === "dark" ? "light" : "dark";
    return {
      intent: "UI_ACTION",
      detectedLanguage: "en",
      spokenFeedback: `Switching theme to ${next} mode.`,
      uiAction: { type: "SET_THEME", payload: next },
      items: []
    };
  }

  // ── 3. HANDS-FREE KITCHEN MODE ───────────────────────────────────────────
  if (/\b(open|start|enable|enter|turn\s+on)\s+(hands\s*free|kitchen\s+mode|hud)\b/i.test(lower)) {
    return {
      intent: "UI_ACTION",
      detectedLanguage: "en",
      spokenFeedback: "Entering Hands-Free Kitchen Mode with continuous voice listening.",
      uiAction: { type: "SET_HANDSFREE_MODE", payload: true },
      items: []
    };
  }
  if (/\b(close|exit|leave|stop|turn\s+off)\s+(hands\s*free|kitchen\s+mode|hud)\b/i.test(lower)) {
    return {
      intent: "UI_ACTION",
      detectedLanguage: "en",
      spokenFeedback: "Exiting Hands-Free mode.",
      uiAction: { type: "SET_HANDSFREE_MODE", payload: false },
      items: []
    };
  }

  // ── 4. CART DRAWER OPEN / CLOSE ──────────────────────────────────────────
  if (/\b(open|show|view|display)\s+(the\s+|my\s+)?(cart|cart\s+drawer|drawer)\b/i.test(lower) && !/^(add|buy|remove|delete)\b/i.test(lower)) {
    return {
      intent: "SHOW_CART",
      detectedLanguage: "en",
      spokenFeedback: "Opening your shopping cart drawer.",
      uiAction: { type: "OPEN_CART_DRAWER" },
      items: []
    };
  }
  if (/\b(close|hide|dismiss)\s+(the\s+|my\s+)?(cart|cart\s+drawer|drawer)\b/i.test(lower)) {
    return {
      intent: "UI_ACTION",
      detectedLanguage: "en",
      spokenFeedback: "Closing the cart drawer.",
      uiAction: { type: "CLOSE_CART_DRAWER" },
      items: []
    };
  }

  // ── 5. WORKSPACE TABS (Restock Smart / Deals & Seasonal / Swap & Diet) ────
  if (/\b(show|open|view|switch\s+to|go\s+to)\s+(deals|seasonal|discounts?|sales?|offers?)\b/i.test(lower)) {
    return {
      intent: "GET_RECOMMENDATIONS",
      detectedLanguage: "en",
      spokenFeedback: "Switching to the Deals & Seasonal Specials tab.",
      uiAction: { type: "SET_WORKSPACE_TAB", payload: "dealsPane" },
      items: []
    };
  }
  if (/\b(show|open|view|switch\s+to|go\s+to)\s+(restock|replenish|restock\s+smart|pantry\s+alerts?)\b/i.test(lower)) {
    return {
      intent: "GET_RECOMMENDATIONS",
      detectedLanguage: "en",
      spokenFeedback: "Opening your AI Restock Alerts tab.",
      uiAction: { type: "SET_WORKSPACE_TAB", payload: "restockPane" },
      items: []
    };
  }
  if (/\b(show|open|view|switch\s+to|go\s+to)\s+(swap|diet|substitutes?|alternatives?)\s+tab\b/i.test(lower)) {
    return {
      intent: "GET_SUBSTITUTE",
      detectedLanguage: "en",
      spokenFeedback: "Opening the Swap & Dietary Substitutes tab.",
      uiAction: { type: "SET_WORKSPACE_TAB", payload: "subsPane" },
      items: []
    };
  }

  // ── 6. SCROLLING VIEW ACTIONS ─────────────────────────────────────────────
  if (/\b(scroll\s+(down\s+)?to|show\s+me)\s+(recommended|recommendations|recommended\s+for\s+you|restock\s+carousel)\b/i.test(lower)) {
    return {
      intent: "UI_ACTION",
      detectedLanguage: "en",
      spokenFeedback: "Scrolling to the Recommended For You section.",
      uiAction: { type: "SCROLL_TO_SECTION", payload: "rfySection" },
      items: []
    };
  }
  if (/\b(scroll\s+to\s+products?|scroll\s+to\s+store|view\s+products?|show\s+products?)\b/i.test(lower)) {
    return {
      intent: "UI_ACTION",
      detectedLanguage: "en",
      spokenFeedback: "Scrolling to the product catalog.",
      uiAction: { type: "SCROLL_TO_SECTION", payload: "productsSection" },
      items: []
    };
  }
  if (/\b(scroll\s+to\s+top|go\s+to\s+top|back\s+to\s+top)\b/i.test(lower)) {
    return {
      intent: "UI_ACTION",
      detectedLanguage: "en",
      spokenFeedback: "Scrolling to the top of the page.",
      uiAction: { type: "SCROLL_TO_SECTION", payload: "top" },
      items: []
    };
  }

  // ── 7. CATEGORY NAVIGATION ───────────────────────────────────────────────
  // Supports all categories dynamically without hardcoding rigid phrases
  const categoryMap = [
    { match: /\b(produce|vegetables?|fruits?|veggies?)\b/i, category: "Produce", spoken: "Showing fresh vegetables and fruits in the Produce section." },
    { match: /\b(dairy|milk|eggs|cheese|yogurt|dairy\s+and\s+eggs)\b/i, category: "Dairy & Eggs", spoken: "Navigating to Dairy, Bread & Eggs." },
    { match: /\b(bakery|breads?|sourdough|croissant|bagels?)\b/i, category: "Bakery", spoken: "Showing fresh bakery and breads." },
    { match: /\b(pantry|atta|rice|oil|olive\s+oil|flour|grains?)\b/i, category: "Pantry", spoken: "Showing essential pantry items, grains, and oils." },
    { match: /\b(meat|seafood|chicken|salmon|fish|poultry)\b/i, category: "Meat & Seafood", spoken: "Showing meat and seafood." },
    { match: /\b(beverages?|drinks?|juices?|cold\s+drinks?|coffee|soda)\b/i, category: "Beverages", spoken: "Showing cold drinks, coffee, and juices." },
    { match: /\b(snacks?|munchies|chips|chocolates?|nuts|almonds)\b/i, category: "Snacks", spoken: "Showing snacks and munchies." },
    { match: /\b(household|cleaning|soap|dish\s+soap|detergent|home\s+essentials?)\b/i, category: "Household", spoken: "Showing home and cleaning essentials." }
  ];

  if (/^(go\s+to|show|view|open|browse|switch\s+to|navigate\s+to|see)\s+/i.test(lower) && !/^(add|buy|remove|delete|clear|checkout)\b/i.test(lower)) {
    for (const cat of categoryMap) {
      if (cat.match.test(lower)) {
        return {
          intent: "NAVIGATE_CATEGORY",
          detectedLanguage: "en",
          spokenFeedback: cat.spoken,
          uiAction: { type: "SET_CATEGORY", payload: cat.category, scrollTarget: "productsSection" },
          items: []
        };
      }
    }
  }

  // ── 8. DIETARY FILTERS (Organic, Vegan, Gluten-Free, Keto) ────────────────
  if (/\b(filter\s+(by\s+)?organic|only\s+organic|organic\s+items?|show\s+organic)\b/i.test(lower)) {
    return {
      intent: "APPLY_FILTER",
      detectedLanguage: "en",
      spokenFeedback: "Filtering products to show Organic items.",
      uiAction: { type: "SET_DIET_FILTER", payload: "Organic" },
      items: []
    };
  }
  if (/\b(filter\s+(by\s+)?vegan|only\s+vegan|vegan\s+items?|show\s+vegan|plant\s*based\s+only)\b/i.test(lower)) {
    return {
      intent: "APPLY_FILTER",
      detectedLanguage: "en",
      spokenFeedback: "Filtering products to show Vegan and plant-based items.",
      uiAction: { type: "SET_DIET_FILTER", payload: "Vegan" },
      items: []
    };
  }
  if (/\b(filter\s+(by\s+)?gluten\s*free|gluten\s*free\s+only|show\s+gluten\s*free)\b/i.test(lower)) {
    return {
      intent: "APPLY_FILTER",
      detectedLanguage: "en",
      spokenFeedback: "Filtering products to show Gluten-Free options.",
      uiAction: { type: "SET_DIET_FILTER", payload: "Gluten-Free" },
      items: []
    };
  }
  if (/\b(filter\s+(by\s+)?keto|keto\s+only|show\s+keto)\b/i.test(lower)) {
    return {
      intent: "APPLY_FILTER",
      detectedLanguage: "en",
      spokenFeedback: "Filtering products to show Keto-friendly items.",
      uiAction: { type: "SET_DIET_FILTER", payload: "Keto" },
      items: []
    };
  }

  // ── 9. PRICE SLIDER FILTER ────────────────────────────────────────────────
  const setPriceMatch = lower.match(/(?:set|change|adjust)?\s*(?:max\s*price|price\s*slider|price\s*range|budget|price\s*limit)\s*(?:to|under|=)?\s*\$?(\d+(?:\.\d+)?)/i);
  if (setPriceMatch && !/^(add|buy|remove)\b/i.test(lower)) {
    const priceVal = parseFloat(setPriceMatch[1]);
    return {
      intent: "SET_PRICE_FILTER",
      detectedLanguage: "en",
      spokenFeedback: `Setting maximum price filter to $${priceVal.toFixed(2)}.`,
      uiAction: { type: "SET_MAX_PRICE", payload: priceVal },
      items: []
    };
  }

  // ── 10. RESET ALL FILTERS ────────────────────────────────────────────────
  if (/\b(reset\s+filters?|clear\s+filters?|remove\s+filters?|show\s+all\s+products?|show\s+all\s+items?|all\s+categories)\b/i.test(lower)) {
    return {
      intent: "RESET_FILTERS",
      detectedLanguage: "en",
      spokenFeedback: "Reset all filters. Showing all items in the store.",
      uiAction: { type: "RESET_FILTERS" },
      items: []
    };
  }

  // ── 11. CLEAR Intent ─────────────────────────────────────────────────────
  // IMPORTANT: Must fire BEFORE the cart/card check, and must NOT match "card" generically or "reset filters".
  if (
    !lower.includes("filter") && (
      /^(clear|empty|reset\s+(my\s+|the\s+)?(cart|list|basket)|delete\s+all|remove\s+all|delete\s+everything|remove\s+everything)\b/i.test(lower) ||
      /\b(clear|empty)\s+(my\s+|the\s+|all\s+)?(cart|basket|list|shopping\s+list)\b/i.test(lower) ||
      /\bremove\s+all\s+(items?|products?|things?)?\s*(from\s+(my\s+|the\s+)?(cart|list))?\b/i.test(lower) ||
      lower === "clear" || lower === "empty" || lower === "clear cart" || lower === "empty cart" || lower === "reset cart"
    )
  ) {
    return {
      intent: "CLEAR",
      detectedLanguage: "en",
      spokenFeedback: "I've cleared all items from your cart.",
      items: []
    };
  }

  // ── 12. CHECKOUT Intent ──────────────────────────────────────────────────
  if (/^(checkout(\s+now)?|check\s+out(\s+now)?|place\s+(my\s+|the\s+)?order|buy\s+(now|everything|all)|order\s+now|complete\s+(my\s+)?(order|purchase)|pay\s+now)$/.test(lower)) {
    return {
      intent: "CHECKOUT",
      detectedLanguage: "en",
      spokenFeedback: "Placing your 10-minute delivery order now.",
      uiAction: { type: "OPEN_CART_DRAWER" },
      items: []
    };
  }

  // ── 13. SHOW_CART — Any query about cart contents, cost, or item count ────
  const CART_WORDS = /\b(cart|basket|my\s+list|shopping\s+list|bag|trolley)\b/i;
  const COST_WORDS = /\b(how\s+much|total\s+cost|total\s+price|total\s+bill|grand\s+total|price\s+total|bill\s+total|what\s+will\s+it\s+cost|what\s+does\s+it\s+cost)\b/i;
  const ITEM_COUNT_WORDS = /\b(how\s+many\s+items?|how\s+many\s+things?|item\s+count|items?\s+(in|present|on)\b|count\s+of\s+items?)\b/i;

  const startsWithMutatingAction = /^(add|buy|order|remove|delete|take\s+out|drop|clear|empty)\b/i.test(lower);
  const startsWithAction = startsWithMutatingAction;

  const isCartQuery = (
    CART_WORDS.test(lower) ||
    COST_WORDS.test(lower) ||
    ITEM_COUNT_WORDS.test(lower) ||
    /^(show|view|check|display|open)\s+(me\s+)?(my\s+|the\s+)?(cart|basket|list|items|order)/i.test(lower) ||
    ["cart", "my cart", "view cart", "show cart", "total", "total price",
     "shopping list", "what is in my cart", "show list", "my list",
     "list items", "cart items", "cart summary"].includes(lower)
  );

  const isRecommendationQuery = /\b(recommend|recommendations?|suggest|suggestions?|restock|deplet|depletion|deals?|seasonal)\b/i.test(lower);
  const hasPriceFilter = /under\s+\$?\d/i.test(lower);

  if (isCartQuery && !startsWithMutatingAction && !hasPriceFilter && !isRecommendationQuery) {
    return {
      intent: "SHOW_CART",
      detectedLanguage: "en",
      spokenFeedback: "Here is your cart summary with all current items, quantities, and total cost.",
      uiAction: { type: "OPEN_CART_DRAWER" },
      items: []
    };
  }

  // ── 14. STORE INVENTORY / CATALOG INQUIRY ────────────────────────────────
  if (
    /\bwhat\s+(do\s+you\s+(have|sell|carry|offer)|items?\s+(do\s+you\s+have|are\s+available))\b/.test(lower) ||
    /\b(in\s+(the|our|your)\s+(store|shop|market|catalog|inventory))\b/.test(lower) ||
    /\ball\s+(the\s+)?(quantities|items|products)\s+in\s+(the\s+|your\s+|our\s+)?store\b/.test(lower)
  ) {
    if (!startsWithAction) {
      return {
        intent: "SEARCH",
        detectedLanguage: "en",
        spokenFeedback: "Our store has 24 fresh grocery items across 8 categories: Produce, Dairy & Eggs, Bakery, Pantry, Meat & Seafood, Beverages, Snacks, and Household essentials.",
        items: [],
        searchParams: { query: "", category: "All" }
      };
    }
  }

  // ── 15. GET_RECOMMENDATIONS Intent ───────────────────────────────────────
  if (
    /^(what\s+should\s+i\s+(buy|get|add)|what\s+do\s+i\s+need|what\s+do\s+you\s+recommend(\s+for\s+restock)?|recommendations?|what\s+are\s+(my\s+|the\s+)?recommendations?|restock|what\s+am\s+i\s+low\s+on|seasonal\s+(items?|specials?|fruits?)|suggestions?|suggest\s+something|what('s|\s+is)\s+on\s+sale)$/i.test(lower) ||
    /\bwhat\s+(do\s+you\s+)?recommend\b/i.test(lower)
  ) {
    return {
      intent: "GET_RECOMMENDATIONS",
      detectedLanguage: "en",
      spokenFeedback: "Here are your personalized restock and seasonal recommendations.",
      uiAction: { type: "SET_WORKSPACE_TAB", payload: "restockPane" },
      items: []
    };
  }

  // ── 16. GET_SUBSTITUTE Intent ────────────────────────────────────────────
  const subMatch = lower.match(/(?:substitute|alternative|replace|swap|instead\s+of)\s+(?:for\s+)?([a-z0-9\s]+)/i);
  if (subMatch && !startsWithAction) {
    const target = subMatch[1].replace(/\b(please|now|thanks|me)\b/gi, "").trim();
    return {
      intent: "GET_SUBSTITUTE",
      detectedLanguage: "en",
      spokenFeedback: `Finding substitutes for ${target}.`,
      substituteTarget: target,
      uiAction: { type: "SET_WORKSPACE_TAB", payload: "subsPane" },
      items: []
    };
  }

  // ── 17. SEARCH Intent ────────────────────────────────────────────────────
  if (
    /^(search(\s+for)?|find(\s+me)?|show\s+me|look\s+for)\b/.test(lower) ||
    /under\s+\$?\d/.test(lower)
  ) {
    const priceMatch = lower.match(/under\s+\$?(\d+(?:\.\d+)?)/i);
    const maxPrice = priceMatch ? parseFloat(priceMatch[1]) : null;
    let cleanQuery = lower
      .replace(/^(search(\s+for)?|find(\s+me)?|show\s+me|look\s+for)\s+/i, "")
      .replace(/under\s+\$?\d+(?:\.\d+)?/i, "")
      .replace(/\b(please|fast|now|for\s+me)\b/gi, "")
      .trim();

    return {
      intent: "SEARCH",
      detectedLanguage: "en",
      spokenFeedback: `Searching for ${cleanQuery || "items"} in our store catalog.`,
      items: [],
      searchParams: { query: cleanQuery, maxPrice },
      uiAction: { type: "SEARCH_STORE", payload: { query: cleanQuery, maxPrice }, scrollTarget: "productsSection" }
    };
  }

  // ── 18. CONVERSATIONAL CONTEXT FOLLOW-UPS (Pronouns & Anaphora) ──────────
  // Uses conversation memory to resolve: "actually make it 3", "make that 4", "remove it", "add those"
  const memoryContext = sessionId ? ConversationMemory.getContext(sessionId) : null;

  // Contextual quantity adjustment: "make it 3", "change it to 4", "set it to 2", "actually make it 3"
  const contextModMatch = lower.match(/^(?:actually\s+)?(?:make|change|update|set)\s+(?:it|that|them)\s+(?:to\s+)?(\d+)$/i);
  if (contextModMatch && memoryContext?.lastMentionedItem) {
    const targetItem = memoryContext.lastMentionedItem;
    const qty = parseInt(contextModMatch[1], 10);
    return {
      intent: "MODIFY_QTY",
      detectedLanguage: "en",
      spokenFeedback: `Updating ${targetItem.name} to ${qty}.`,
      items: [{ name: targetItem.name, quantity: qty }]
    };
  }

  // Contextual item removal: "remove it", "delete it", "take it out", "remove that"
  if (/^(?:actually\s+)?(?:remove|delete|take\s+out|drop)\s+(?:it|that|them)$/i.test(lower) && memoryContext?.lastMentionedItem) {
    const targetItem = memoryContext.lastMentionedItem;
    return {
      intent: "REMOVE",
      detectedLanguage: "en",
      spokenFeedback: `Removing ${targetItem.name} from your cart.`,
      items: [{ name: targetItem.name, quantity: 1 }]
    };
  }

  // Contextual recommendation add: "all of them add to the cart", "add all of them", "add those", "add that", "add them", "add recommended"
  if (
    /^(?:all\s+of\s+them\s+add\s+to\s+(?:the\s+)?cart|add\s+all\s+(?:of\s+them|items?|recommended)?(?:\s+to\s+(?:my\s+|the\s+)?cart)?|(?:add|buy|get)\s+(?:those|that|them|the\s+recommended|recommended\s+items?)(?:\s+to\s+(?:my\s+|the\s+)?cart)?)$/i.test(lower) &&
    memoryContext?.lastRecommendedItems?.length > 0
  ) {
    const recNames = memoryContext.lastRecommendedItems.slice(0, 3);
    const items = recNames.map(name => ({ name, quantity: 1, unit: "item" }));
    return {
      intent: "ADD",
      detectedLanguage: "en",
      spokenFeedback: `Adding recommended items (${recNames.join(", ")}) to your cart.`,
      items
    };
  }

  // ── 9. REMOVE Intent ─────────────────────────────────────────────────────
  if (/^(remove|delete|take\s+out|drop)\b/.test(lower)) {
    const clean = lower
      .replace(/^(remove|delete|take\s+out|drop)\s+/i, "")
      .replace(/\s+(from\s+(my\s+|the\s+)?(cart|card|car|list|basket)|in\s+(my\s+|the\s+)?(cart|card|car|list)|please|now)$/gi, "")
      .trim();

    const parts = clean.split(/\s*(?:,|and|\+)\s*/).filter(Boolean);
    const items = parts.map(p => {
      const name = p.trim().replace(/^(the|a|an|some|my|all|pack\s+of|bottle\s+of|bottles\s+of|box\s+of|loaf\s+of|bunch\s+of)\s+/gi, "").trim();
      return { name: name || p.trim(), quantity: 1 };
    }).filter(i => i.name);

    return {
      intent: "REMOVE",
      detectedLanguage: "en",
      spokenFeedback: `Removing ${items.map(i => i.name).join(", ")} from your cart.`,
      items
    };
  }

  // ── 10. MODIFY_QTY Intent ────────────────────────────────────────────────
  // FIX: Must NOT match "make sure", "change my mind", "update my list" etc.
  // Requires: verb + item_name + optional "quantity" + "to" + digit
  const modMatch = lower.match(
    /^(?:change|update|set|increase|decrease|make)\s+(?:the\s+|my\s+)?(?:quantity\s+of\s+)?([a-z](?:[a-z\s]*?[a-z])?)(?:\s+quantity)?\s+to\s+(\d+)$/i
  );
  if (modMatch) {
    const rawTarget = modMatch[1]
      .replace(/\b(quantity|of|the|my|from|cart|card|car)\b/gi, "")
      .trim();
    const cleanName = rawTarget.replace(/^(the|a|an|some|my|all)\s+/gi, "").trim();
    const qty = parseInt(modMatch[2], 10);
    if (cleanName && !isNaN(qty)) {
      return {
        intent: "MODIFY_QTY",
        detectedLanguage: "en",
        spokenFeedback: `Updating ${cleanName} to ${qty}.`,
        items: [{ name: cleanName, quantity: qty }]
      };
    }
  }

  // ── 11. GENERAL QUESTION GUARD ───────────────────────────────────────────
  //
  // CRITICAL FIX: Return NULL (defer to LLM) instead of CHAT.
  //
  // Previously this returned CHAT immediately for any question-word query that
  // didn't match the narrow isCartQuery patterns — silently blocking queries like
  // "how many items present in my cart" from ever reaching the LLM.
  //
  // Now we ONLY return CHAT for pure greetings/help (handled in step 1).
  // All other question-form queries are deferred to MiniMax-M3 LLM which is
  // far better at understanding natural language intent.
  //
  // The LLM and the fallbackRuleBasedParser both correctly handle:
  //   "how many items present in my cart" → SHOW_CART
  //   "what do you sell"                  → SEARCH
  //   "who are you"                       → CHAT
  //   "can you add milk"                  → ADD
  if (/^(what|how|who|why|where|when|which|is\s+there|are\s+there|do\s+you|can\s+you|tell\s+me)\b/.test(lower)) {
    return null; // Defer to LLM — do NOT short-circuit as CHAT
  }

  // ── 12. ADD Intent ───────────────────────────────────────────────────────
  if (/^(add|buy|i\s+need|put|get|order)\b/.test(lower)) {
    const clean = lower
      .replace(/^(add|buy|i\s+need|put|get|order)\s+/i, "")
      .replace(/\s+(to\s+(my\s+|the\s+)?(cart|card|car|list|basket)|in\s+(my\s+|the\s+)?(cart|card|car|list)|please|now|for\s+me)$/gi, "")
      .trim();

    // Reject noise-only leftovers
    if (["cart", "card", "car", "the cart", "my cart", "order", "checkout", "everything", "list", "something"].includes(clean)) {
      return null;
    }

    // Parse multiple items separated by comma/and/+
    const rawChunks = clean.split(/\s*(?:,|and|\+)\s*/).filter(Boolean);
    const items = [];

    for (const chunk of rawChunks) {
      // Match: [quantity] [unit?] [of?] item_name
      const match = chunk.match(/^(?:(\d+)\s*(?:bottles?|packs?|boxes?|bunches?|loaves?|loaf|lbs?|items?|bags?|cans?|jars?|liters?|litres?|kg|grams?|oz)?\s*(?:of\s+)?)?(.+)$/i);
      if (match) {
        const qty = match[1] ? parseInt(match[1], 10) : 1;
        const name = (match[2] || chunk).trim()
          .replace(/^(the|a|an|some|fresh|organic)\s+/gi, "")
          .trim();
        if (name && !["cart", "card", "car", "my cart", "the cart", "list", "order"].includes(name)) {
          items.push({ name, quantity: Math.max(1, qty), unit: "item" });
        }
      }
    }

    if (items.length > 0) {
      return {
        intent: "ADD",
        detectedLanguage: "en",
        spokenFeedback: `Adding ${items.map(i => `${i.quantity > 1 ? i.quantity + "x " : ""}${i.name}`).join(", ")} to your cart.`,
        items
      };
    }
  }

  // ── 13. Single Item Shortcut ──────────────────────────────────────────────
  // Recognizes bare product names spoken without a verb
  const knownSingleItems = new Set([
    "juice", "milk", "bread", "eggs", "apples", "bananas", "avocados", "coffee", "tea",
    "cheese", "pasta", "oats", "chicken", "salmon", "tofu", "spinach", "tomatoes",
    "croissant", "bagels", "butter", "yogurt", "rice", "honey", "olive oil",
    "almonds", "chocolate", "water", "sparkling water"
  ]);
  if (knownSingleItems.has(lower)) {
    return {
      intent: "ADD",
      detectedLanguage: "en",
      spokenFeedback: `Adding ${lower} to your cart.`,
      items: [{ name: lower, quantity: 1, unit: "item" }]
    };
  }

  return null; // Defer complex/multilingual/conversational queries to MiniMax-M3 LLM
}

// -----------------------------------------------------------------------
// MAIN EXPORT — Parses a voice transcript using hybrid fast-path + LLM
// -----------------------------------------------------------------------
/**
 * Parses user voice transcript or text using High-Speed Hybrid Architecture.
 * Pipeline:
 *  1. Server-side normalization
 *  2. Multi-intent chunking (for compound commands)
 *  3. Fast-path deterministic classifier per chunk (< 2ms)
 *  4. MiniMax-M3 LLM for complex/multilingual queries
 *  5. Rule-based fallback if network fails
 */
export async function parseVoiceCommandWithMiniMax(userTranscript, currentShoppingList = [], pageContext = null, sessionId = "default_session") {
  if (!userTranscript || userTranscript.trim() === "") {
    return {
      intent: "CHAT",
      spokenFeedback: "I didn't catch that. Could you please repeat your shopping command?",
      items: [],
      detectedLanguage: "en",
      autoCorrect: { hasChanges: false, original: "", corrected: "" }
    };
  }

  // 1. Intelligent Speech Autocorrection & Fuzzy Matching
  const autoCorrectResult = autoCorrectTranscript(userTranscript);
  const transcriptToProcess = autoCorrectResult.corrected;

  // 2. Server-side normalization
  const normalized = normalizeServerTranscript(transcriptToProcess);

  // 3. Multi-intent chunking
  const chunks = chunkCompoundQuery(normalized);

  let finalResult;
  // For single-chunk queries (the vast majority), use the standard flow
  if (chunks.length === 1) {
    finalResult = await classifyAndExecuteSingleChunk(chunks[0], currentShoppingList, pageContext, sessionId);
  } else {
    // For multi-chunk compound commands, process each sub-intent and merge results
    const results = [];
    for (const chunk of chunks) {
      const result = await classifyAndExecuteSingleChunk(chunk, currentShoppingList, pageContext, sessionId);
      results.push(result);
    }
    // Merge multi-intent results into one consolidated response
    finalResult = mergeMultiIntentResults(results, normalized);
  }

  // Attach autocorrect metadata so client knows if speech typo was fixed
  finalResult.autoCorrect = autoCorrectResult;
  return finalResult;
}

/**
 * Classifies and returns a NLU result for a single atomic query chunk.
 */
async function classifyAndExecuteSingleChunk(transcript, currentShoppingList, pageContext = null, sessionId = "default_session") {
  // Fast-path classifier with live page context & conversation memory
  const fastResult = fastPathClassify(transcript, currentShoppingList, pageContext, sessionId);
  if (fastResult) {
    console.log(`[NLU Fast-Path] "${transcript}" → ${fastResult.intent}`);
    return fastResult;
  }

  // Complex/multilingual/conversational → MiniMax-M3 LLM with full website awareness & memory
  console.log(`[NLU LLM Call] "${transcript}" (session: ${sessionId}) — deferring to MiniMax-M3 with live context & dialogue memory`);
  const catalogProductNames = PRODUCT_CATALOG.map(p => `${p.name} ($${p.price.toFixed(2)}, ${p.category})`).join(", ");

  // Build live website context description
  let websiteContextSnippet = "Website Live State:\n";
  if (pageContext) {
    websiteContextSnippet += `- Active Category View: "${pageContext.activeCategory || 'All'}"\n`;
    websiteContextSnippet += `- Available Categories: ${pageContext.availableCategories?.map(c => c.category).join(', ') || 'All, Produce, Dairy & Eggs, Bakery, Pantry, Meat & Seafood, Beverages, Snacks, Household'}\n`;
    websiteContextSnippet += `- Active Dietary Filter: "${pageContext.activeDietaryFilter || 'All'}"\n`;
    websiteContextSnippet += `- Price Slider Max Filter: $${pageContext.priceFilter?.currentMax || 15.00}\n`;
    websiteContextSnippet += `- Active Theme: "${pageContext.theme || 'light'}"\n`;
    websiteContextSnippet += `- Active Sidebar Tab: "${pageContext.activeWorkspaceTab?.name || 'Restock Smart'}"\n`;
    websiteContextSnippet += `- Cart Drawer Open: ${Boolean(pageContext.isCartDrawerOpen)}\n`;
    websiteContextSnippet += `- Hands-Free Kitchen Mode Active: ${Boolean(pageContext.isHandsFreeActive)}\n`;
    if (pageContext.visibleProducts && pageContext.visibleProducts.length > 0) {
      websiteContextSnippet += `- Currently Visible On Screen (${pageContext.visibleProducts.length} items): ${pageContext.visibleProducts.slice(0, 10).map(p => `${p.name} ($${p.price})`).join(', ')}\n`;
    }
  }

  // Retrieve multi-turn conversation memory
  const dialogueHistory = ConversationMemory.getHistoryForLLM(sessionId, 4);
  const memoryContext = ConversationMemory.getContext(sessionId);
  let memoryContextSnippet = "";
  if (memoryContext?.lastMentionedItem) {
    memoryContextSnippet += `\nConversation Context: Last discussed item: "${memoryContext.lastMentionedItem.name}" (qty: ${memoryContext.lastMentionedItem.quantity || 1}).`;
  }
  if (memoryContext?.lastRecommendedItems?.length > 0) {
    memoryContextSnippet += `\nLast recommended items: ${memoryContext.lastRecommendedItems.join(', ')}.`;
  }

  const systemPrompt = `You are VoiceCart AI, the intelligent voice assistant controlling the entire 10-minute grocery delivery website.
You have full conversational memory of previous turns. Use it to resolve pronouns ("it", "those", "that", "them"), follow-up commands ("actually make it 3", "remove it", "add those"), and context.
You have full access to scan and control every part of the website: product catalog, shopping cart, categories, dietary filters, price slider, dark/light theme, hands-free mode, and sidebar tabs.

${websiteContextSnippet}${memoryContextSnippet}
Store Catalog: ${catalogProductNames}

Valid intents:
- "ADD": Add product(s) to shopping cart.
- "REMOVE": Remove item(s) from cart.
- "MODIFY_QTY": Change quantity of an item.
- "CLEAR": Empty shopping cart.
- "SHOW_CART": Inspect or open shopping cart.
- "CHECKOUT": Place the delivery order.
- "SEARCH": Search for products in the store by query, max price, or category.
- "NAVIGATE_CATEGORY": Change product category view (Produce, Dairy & Eggs, Bakery, Pantry, Meat & Seafood, Beverages, Snacks, Household, All).
- "APPLY_FILTER": Apply dietary filter (Organic, Vegan, Gluten-Free, Keto, All).
- "SET_PRICE_FILTER": Adjust the max price filter slider.
- "RESET_FILTERS": Clear search and reset category/diet/price filters to default.
- "TOGGLE_THEME": Switch between dark mode and light mode.
- "OPEN_CART_DRAWER" / "CLOSE_CART_DRAWER": Open or close the cart slideout panel.
- "SWITCH_TAB": Switch AI sidebar tab (restockPane, dealsPane, subsPane).
- "TOGGLE_HANDSFREE": Enable or exit hands-free kitchen voice mode.
- "SCROLL_VIEW": Scroll page to (rfySection, productsSection, top).
- "GET_SUBSTITUTE": Find healthy/dietary replacements for an item.
- "GET_RECOMMENDATIONS": Show predictive restock or seasonal deals.
- "CHAT": Answer questions about the store, website view, visible items, delivery time, or cart.

Respond ONLY with strict JSON (no markdown fences, no explanatory text outside JSON).
Format:
{
  "intent": "ADD" | "NAVIGATE_CATEGORY" | "APPLY_FILTER" | "SET_PRICE_FILTER" | "RESET_FILTERS" | "TOGGLE_THEME" | "SHOW_CART" | "SEARCH" | "CHAT" | ...,
  "detectedLanguage": "en",
  "spokenFeedback": "Natural, clear, concise voice response spoken back to user.",
  "items": [{"name": "item name", "quantity": 1, "category": "Produce"}],
  "uiAction": {"type": "SET_CATEGORY" | "SET_THEME" | "SET_DIET_FILTER" | "SET_MAX_PRICE" | "OPEN_CART_DRAWER" | "CLOSE_CART_DRAWER" | "RESET_FILTERS" | "SET_WORKSPACE_TAB" | "SET_HANDSFREE_MODE" | "SCROLL_TO_SECTION", "payload": "value", "scrollTarget": "productsSection"}
}`;

  const userPrompt = `Current Cart Items: ${JSON.stringify(currentShoppingList.map(i => ({ name: i.name, qty: i.quantity, price: i.price })))}
User Spoken Command: "${transcript}"`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout for remote LLM

    // Construct LLM messages including previous conversation turns
    const messages = [
      { role: "system", content: systemPrompt },
      ...dialogueHistory,
      { role: "user", content: userPrompt }
    ];

    const response = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MINIMAX_API_KEY}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "MiniMax-M3",
        messages,
        temperature: 0.1,
        max_tokens: 500
      })
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[MiniMax LLM] API error ${response.status} — using rule-based fallback`);
      return fallbackRuleBasedParser(transcript, currentShoppingList);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";

    // Strip <think>...</think> chain-of-thought blocks if present
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    // Strip markdown code fence wrappers
    if (content.startsWith("```json")) content = content.substring(7);
    if (content.startsWith("```")) content = content.substring(3);
    if (content.endsWith("```")) content = content.substring(0, content.length - 3);
    content = content.trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      // Try extracting JSON object from response text
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          return fallbackRuleBasedParser(transcript, currentShoppingList);
        }
      } else {
        return fallbackRuleBasedParser(transcript, currentShoppingList);
      }
    }

    // Normalize items array from LLM response
    if (parsed.items && Array.isArray(parsed.items)) {
      parsed.items = parsed.items.map(item => ({
        name: typeof item === "string" ? item : (item.name || "item"),
        quantity: parseInt(item.quantity, 10) || 1,
        unit: item.unit || "item",
        category: item.category || "Pantry"
      }));
    } else {
      parsed.items = [];
    }

    console.log(`[NLU LLM Result] Intent: ${parsed.intent}, Items: ${parsed.items?.length || 0}`);
    return parsed;
  } catch (err) {
    if (err.name === "AbortError") {
      console.warn("[MiniMax LLM] Request timed out — using rule-based fallback");
    } else {
      console.error("[MiniMax LLM] Error:", err.message);
    }
    return fallbackRuleBasedParser(transcript, currentShoppingList);
  }
}

/**
 * Merges an array of per-chunk NLU results into a unified response object.
 * Used for compound voice commands like "add milk and remove bread".
 */
function mergeMultiIntentResults(results, originalTranscript) {
  if (results.length === 0) {
    return {
      intent: "CHAT",
      spokenFeedback: "I processed your command.",
      items: [],
      detectedLanguage: "en"
    };
  }

  if (results.length === 1) return results[0];

  // Determine primary intent (first non-CHAT result wins)
  const primaryResult = results.find(r => r.intent !== "CHAT") || results[0];

  // Collect all items and actions across all chunks
  const allItems = results.flatMap(r => r.items || []);
  const allIntents = results.map(r => r.intent);

  // Build combined spoken feedback
  const feedbacks = results.map(r => r.spokenFeedback).filter(Boolean);
  const combinedFeedback = feedbacks.join(" Then, ");

  return {
    ...primaryResult,
    intent: primaryResult.intent,
    // Signal to server.js that this is a multi-intent command
    isMultiIntent: true,
    multiIntentResults: results,
    allIntents,
    items: allItems,
    spokenFeedback: combinedFeedback,
    detectedLanguage: primaryResult.detectedLanguage || "en"
  };
}

/**
 * Generates natural spoken audio using MiniMax Speech-2.8-HD TTS API with timeout protection.
 */
export async function generateMiniMaxSpeech(text, voiceId = "English_radiant_girl") {
  if (!text || text.trim() === "") {
    return null;
  }

  const cleanText = text.trim();
  const cacheKey = `${voiceId}_${cleanText}`;

  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // FIX: Increased from 4s→8s for neural TTS

    const payload = {
      model: "speech-2.8-hd",
      text: cleanText,
      stream: false,
      voice_setting: {
        voice_id: voiceId,
        speed: 1.05,
        vol: 1.0,
        pitch: 0
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: "mp3",
        channel: 1
      },
      output_format: "hex"
    };

    const response = await fetch(MINIMAX_TTS_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MINIMAX_API_KEY}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify(payload)
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const resJson = await response.json();
    const hexAudio = resJson.data?.audio;
    if (!hexAudio) return null;

    const audioBuffer = Buffer.from(hexAudio, "hex");
    const base64Audio = audioBuffer.toString("base64");
    const audioDataUrl = `data:audio/mp3;base64,${base64Audio}`;

    // Evict oldest cached audio if cache is full
    if (audioCache.size > 150) {
      const firstKey = audioCache.keys().next().value;
      audioCache.delete(firstKey);
    }
    audioCache.set(cacheKey, { audioDataUrl, audioBuffer });

    return { audioDataUrl, audioBuffer };
  } catch (err) {
    if (err.name === "AbortError") {
      console.warn("[TTS] Request timed out after 8s — returning null");
    }
    return null;
  }
}

/**
 * Robust fallback parser used when the LLM is unavailable (offline / timeout).
 * Uses rule-based matching as a safety net.
 */
function fallbackRuleBasedParser(transcript, currentList = []) {
  const lower = (transcript || "").toLowerCase().trim();

  // CLEAR — must match ONLY clear/empty of the cart, NOT "card" generically
  if (
    /\b(clear|empty)\s+(my\s+|the\s+|all\s+)?(cart|basket|list|shopping\s+list)\b/.test(lower) ||
    lower.startsWith("clear") || lower === "empty"
  ) {
    return {
      intent: "CLEAR",
      detectedLanguage: "en",
      spokenFeedback: "Cleared all items from your shopping list.",
      items: []
    };
  }

  // SHOW_CART — questions about cart content, cost, quantity
  if (
    (lower.includes("what") || lower.includes("how")) &&
    (lower.includes("cart") || lower.includes("list") || lower.includes("cost") ||
     lower.includes("total") || lower.includes("have") || lower.includes("items"))
  ) {
    return {
      intent: "SHOW_CART",
      detectedLanguage: "en",
      spokenFeedback: "Here is what's currently in your cart.",
      items: []
    };
  }

  // REMOVE
  if (lower.includes("remove") || lower.includes("delete") || lower.includes("take out")) {
    const cleanItem = lower
      .replace(/\b(remove|delete|take\s+out|from\s+my\s+list|from\s+list|please)\b/gi, "")
      .trim();
    return {
      intent: "REMOVE",
      detectedLanguage: "en",
      spokenFeedback: `Removing ${cleanItem} from your list.`,
      items: [{ name: cleanItem, quantity: 1 }]
    };
  }

  // SEARCH
  if (lower.includes("find") || lower.includes("search") || /under\s+\$/.test(lower)) {
    const priceMatch = lower.match(/under\s+\$?(\d+(\.\d+)?)/);
    const maxPrice = priceMatch ? parseFloat(priceMatch[1]) : null;
    const cleanQuery = lower.replace(/\b(find|search\s+for|under\s+\$\d+)\b/gi, "").trim();
    return {
      intent: "SEARCH",
      detectedLanguage: "en",
      spokenFeedback: `Searching for items matching ${cleanQuery || "your filter"}.`,
      items: [],
      searchParams: { query: cleanQuery, maxPrice }
    };
  }

  // GET_SUBSTITUTE
  if (lower.includes("substitute") || lower.includes("alternative") || lower.includes("replace")) {
    const cleanItem = lower.replace(/\b(substitute\s+(for)?|alternative\s+(for)?|replace)\b/gi, "").trim();
    return {
      intent: "GET_SUBSTITUTE",
      detectedLanguage: "en",
      spokenFeedback: `Finding substitutes for ${cleanItem}.`,
      substituteTarget: cleanItem,
      items: []
    };
  }

  // Default: ADD item
  const cleanAdd = lower.replace(/\b(add|i\s+need|buy|put|to\s+my\s+list|to\s+list|please)\b/gi, "").trim();
  const qtyMatch = cleanAdd.match(/^(\d+)\s*(.*)/);
  const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
  const itemName = (qtyMatch ? qtyMatch[2] : cleanAdd).trim();

  // Best-effort category guess
  let category = "Pantry";
  if (/apple|banana|berry|spinach|lemon|carrot|produce|fruit|salad|avocado|tomato/i.test(itemName)) category = "Produce";
  else if (/milk|egg|cheese|yogurt|butter|dairy/i.test(itemName)) category = "Dairy & Eggs";
  else if (/bread|croissant|bagel|sourdough|bakery/i.test(itemName)) category = "Bakery";
  else if (/chicken|beef|salmon|fish|meat|tofu/i.test(itemName)) category = "Meat & Seafood";
  else if (/water|juice|coffee|tea|beverage|drink/i.test(itemName)) category = "Beverages";
  else if (/chocolate|chips|nuts|almonds|popcorn|snack/i.test(itemName)) category = "Snacks";
  else if (/soap|towel|paper|detergent|toothpaste|household/i.test(itemName)) category = "Household";

  return {
    intent: "ADD",
    detectedLanguage: "en",
    spokenFeedback: `Adding ${qty > 1 ? qty + "x " : ""}${itemName || "item"} to your shopping list.`,
    items: [{
      name: itemName || "item",
      quantity: Math.max(1, qty),
      unit: "item",
      category,
      estimatedPrice: 3.50
    }]
  };
}
