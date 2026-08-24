// server/minimaxService.js - MiniMax-M3 LLM NLP & Speech-2.8-HD Neural TTS Service
import dotenv from "dotenv";
import { PRODUCT_CATALOG, CATEGORIES } from "./catalogData.js";
import { searchCatalog, getProductSubstitutes, getPredictiveReplenishment, getSeasonalAndSaleRecommendations } from "./recommendationEngine.js";

dotenv.config();

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || "";
const MINIMAX_BASE_URL = process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1";
const MINIMAX_TTS_URL = process.env.MINIMAX_TTS_URL || "https://api.minimax.io/v1/t2a_v2";

// Memory cache for synthesized audio to prevent duplicate API calls
const audioCache = new Map();

/**
 * Fast-path deterministic classifier (< 2ms response time)
 * Accurately parses standard shopping intents, speech typos (card/car/cart), single items, cart questions, and store inquiries.
 */
function fastPathClassify(userTranscript, currentShoppingList = []) {
  if (!userTranscript || typeof userTranscript !== "string") return null;
  const raw = userTranscript.trim();
  const lower = raw.toLowerCase().replace(/[?!.,;:]/g, "").trim();

  // 1. GREETING / CHAT / HINDI CONVERSATION
  if (/^(hello|hi|hey|good\s+morning|good\s+evening|who\s+are\s+you|help|what\s+can\s+you\s+do)$/i.test(lower) || lower.includes("mere mein") || lower.includes("kaise ho")) {
    return {
      intent: "CHAT",
      detectedLanguage: "en",
      spokenFeedback: "Hello! I am VoiceCart AI. You can ask me to add groceries, find substitutes, check your cart, or place an order.",
      items: []
    };
  }

  // 2. CLEAR Intent (Handles "remove all the items present in my cart", "clear my cart", "empty cart", "delete everything")
  if (/^(clear|empty|reset|delete\s+all|remove\s+all|delete\s+everything|remove\s+everything)/i.test(lower) || 
      lower.includes("remove all") || lower.includes("delete all") || lower.includes("clear all") || 
      lower.includes("empty cart") || lower.includes("clear my card") || lower.includes("clear cart") ||
      lower === "clear" || lower === "empty") {
    return {
      intent: "CLEAR",
      detectedLanguage: "en",
      spokenFeedback: "I've cleared all items from your cart.",
      items: []
    };
  }

  // 3. STORE INVENTORY / CATALOG INQUIRY (e.g. "how much items i have in my store", "what items in the store", "what do you have in store")
  if (/(in\s+(my|the|our|your)?\s*(store|shop|market|catalog|inventory|app)|what\s+do\s+you\s+sell|all\s+the\s+quantities\s+in\s+store)/i.test(lower) && !lower.startsWith("add") && !lower.startsWith("buy")) {
    return {
      intent: "SEARCH",
      detectedLanguage: "en",
      spokenFeedback: "Our store has 24 fresh grocery items in stock across 8 categories: Produce, Dairy & Eggs, Bakery, Pantry, Meat, Beverages, Snacks, and Household essentials.",
      items: [],
      searchParams: { query: "", category: "All" }
    };
  }

  // 4. SHOW_CART & CART COST / QUANTITY QUESTIONS
  // Handles:
  // - "what is the cost of my total items present in the car"
  // - "how much items in the cart"
  // - "what is the price of the carts that contains the items"
  // - "how many items do i have in my cart"
  // - "what's in my cart" / "view cart" / "show cart" / "cart total"
  const isCartCostOrQtyQuestion = 
    /(cost|price|total|value|amount|quantit|how\s+much|how\s+many).*(cart|card|car|order|items?|products?|bag)/i.test(lower) ||
    /^(what('s|\s+is|\s+do\s+i\s+have|\s+you\s+have)\s+.*(cart|card|car|list|basket))/i.test(lower) ||
    /^(show|view|check|list)\s+.*(cart|card|car|list|basket|order|items)/i.test(lower) ||
    /(total\s+(cost|price|bill|amount)|what\s+is\s+the\s+total|how\s+much\s+total)/i.test(lower) ||
    lower === "cart" || lower === "my cart" || lower === "the cart" || lower === "view cart" || lower === "total" || lower === "total price";

  if (isCartCostOrQtyQuestion && !lower.startsWith("add") && !lower.startsWith("buy") && !lower.startsWith("remove") && !lower.startsWith("delete")) {
    return {
      intent: "SHOW_CART",
      detectedLanguage: "en",
      spokenFeedback: "Here is your cart summary with all current items, quantities, and total cost.",
      items: []
    };
  }

  // 5. CHECKOUT Intent
  if (/^(checkout(\s+now)?|check\s+out(\s+now)?|place\s+(my\s+|the\s+)?order|buy\s+(now|everything|all)|order\s+now|complete\s+(my\s+)?(order|purchase)|pay\s+now)$/i.test(lower)) {
    return {
      intent: "CHECKOUT",
      detectedLanguage: "en",
      spokenFeedback: "Placing your 10-minute delivery order now.",
      items: []
    };
  }

  // 6. GET_RECOMMENDATIONS Intent
  if (/^(what\s+should\s+i\s+buy|what\s+do\s+i\s+need|recommendations|restock|what\s+am\s+i\s+low\s+on|seasonal\s+(items|specials|fruits)|suggestions|suggest\s+something)/i.test(lower)) {
    return {
      intent: "GET_RECOMMENDATIONS",
      detectedLanguage: "en",
      spokenFeedback: "Here are your personalized restock and seasonal recommendations.",
      items: []
    };
  }

  // 7. GET_SUBSTITUTE Intent
  const subMatch = lower.match(/(?:substitute|alternative|replace|swap|instead\s+of)\s+(?:for\s+)?([a-z0-9\s]+)/i);
  if (subMatch && !lower.startsWith("add") && !lower.startsWith("buy")) {
    const target = subMatch[1].replace(/please|now|thanks/gi, "").trim();
    return {
      intent: "GET_SUBSTITUTE",
      detectedLanguage: "en",
      spokenFeedback: `Finding substitutes for ${target}.`,
      substituteTarget: target,
      items: []
    };
  }

  // 8. SEARCH Intent
  if (lower.startsWith("search") || lower.startsWith("find") || lower.includes("under $") || lower.includes("under ")) {
    const priceMatch = lower.match(/under\s+\$?(\d+(?:\.\d+)?)/i);
    const maxPrice = priceMatch ? parseFloat(priceMatch[1]) : null;
    let cleanQuery = lower
      .replace(/^(search|find|show\s+me|look\s+for)\s+(for\s+)?/i, "")
      .replace(/under\s+\$?\d+(?:\.\d+)?/i, "")
      .replace(/please|fast|now/gi, "")
      .trim();

    return {
      intent: "SEARCH",
      detectedLanguage: "en",
      spokenFeedback: `Searching for ${cleanQuery || "items"} in our store catalog.`,
      items: [],
      searchParams: {
        query: cleanQuery,
        maxPrice
      }
    };
  }

  // 9. REMOVE Intent
  if (lower.startsWith("remove") || lower.startsWith("delete") || lower.startsWith("take out") || lower.startsWith("drop")) {
    const clean = lower
      .replace(/^(remove|delete|take\s+out|drop)\s+/i, "")
      .replace(/\s+(from\s+(my\s+|the\s+)?(cart|card|car|list)|please|now)$/gi, "")
      .trim();

    const parts = clean.split(/\s*(?:,|and|\+)\s*/).filter(Boolean);
    const items = parts.map(p => ({ name: p.trim(), quantity: 1 }));
    return {
      intent: "REMOVE",
      detectedLanguage: "en",
      spokenFeedback: `Removing ${clean} from your cart.`,
      items
    };
  }

  // 10. MODIFY_QTY Intent
  const modMatch = lower.match(/(?:change|make|update|set|increase|decrease)\s+([a-z\s]+?)\s+(?:quantity\s+)?(?:to\s+)?(\d+)/i);
  if (modMatch) {
    const targetItem = modMatch[1].replace(/quantity|of|the|my/gi, "").trim();
    const qty = parseInt(modMatch[2], 10);
    return {
      intent: "MODIFY_QTY",
      detectedLanguage: "en",
      spokenFeedback: `Updating quantity of ${targetItem} to ${qty}.`,
      items: [{ name: targetItem, quantity: qty }]
    };
  }

  // 11. GENERAL QUESTION GUARD:
  // If the query is a question starting with question words, never treat it as an ADD item!
  if (/^(what|how|who|why|where|when|which|is\s+there|are\s+there|do\s+you|can\s+you|tell\s+me)\b/i.test(lower)) {
    return {
      intent: "CHAT",
      detectedLanguage: "en",
      spokenFeedback: "I can help you add groceries, check your cart, find substitutes, or search store items. What would you like to do?",
      items: []
    };
  }

  // 12. ADD Intent (Handles "Add 2 apples and 1 milk", "buy milk", "i need bread")
  if (lower.startsWith("add") || lower.startsWith("buy") || lower.startsWith("i need") || lower.startsWith("put") || lower.startsWith("get") || lower.startsWith("order")) {
    const clean = lower
      .replace(/^(add|buy|i\s+need|put|get|order)\s+/i, "")
      .replace(/\s+(to\s+(my\s+|the\s+)?(cart|card|car|list)|in\s+(my\s+|the\s+)?(cart|card|car|list)|please|now)$/gi, "")
      .trim();

    if (["cart", "card", "car", "the cart", "my cart", "order", "checkout", "everything", "list", "something"].includes(clean)) {
      return null;
    }

    const rawChunks = clean.split(/\s*(?:,|and|\+)\s*/).filter(Boolean);
    const items = [];

    for (const chunk of rawChunks) {
      const match = chunk.match(/^(?:(\d+)\s*(?:bottles?|packs?|boxes?|bunches?|loaves?|loaf|lbs?|items?|bags?|cans?|jars?)?\s*(?:of\s+)?)?(.+)$/i);
      if (match) {
        const qty = match[1] ? parseInt(match[1], 10) : 1;
        const name = (match[2] || chunk).trim();
        if (name && !["cart", "card", "car", "my cart", "the cart", "list", "order"].includes(name)) {
          items.push({
            name,
            quantity: Math.max(1, qty),
            unit: "item"
          });
        }
      }
    }

    if (items.length > 0) {
      return {
        intent: "ADD",
        detectedLanguage: "en",
        spokenFeedback: `Adding ${items.map(i => `${i.quantity > 1 ? i.quantity + 'x ' : ''}${i.name}`).join(", ")} to your cart.`,
        items
      };
    }
  }

  // 13. Single Item Shortcut (e.g., user just says "juice", "milk", "bread", "apples", "eggs")
  const singleItemTokens = ["juice", "milk", "bread", "eggs", "apples", "bananas", "avocados", "coffee", "tea", "cheese", "pasta", "oats", "chicken", "salmon", "tofu", "spinach", "tomatoes", "croissant"];
  if (singleItemTokens.includes(lower)) {
    return {
      intent: "ADD",
      detectedLanguage: "en",
      spokenFeedback: `Adding ${lower} to your cart.`,
      items: [{ name: lower, quantity: 1, unit: "item" }]
    };
  }

  return null; // Defer to MiniMax-M3 LLM for complex/multilingual/conversational queries
}

/**
 * Parses user voice transcript or text using High-Speed Hybrid Architecture.
 */
export async function parseVoiceCommandWithMiniMax(userTranscript, currentShoppingList = []) {
  if (!userTranscript || userTranscript.trim() === "") {
    return {
      intent: "CHAT",
      spokenFeedback: "I didn't catch that. Could you please repeat your shopping command?",
      items: [],
      detectedLanguage: "en"
    };
  }

  // 1. Check Fast-Path (< 2ms response time)
  const fastResult = fastPathClassify(userTranscript, currentShoppingList);
  if (fastResult) {
    return fastResult;
  }

  // 2. Complex or Multilingual Queries: MiniMax-M3 LLM
  const catalogProductNames = PRODUCT_CATALOG.map(p => `${p.name} (${p.category})`).join(", ");

  const systemPrompt = `You are VoiceCart AI shopping assistant. Return strict JSON.
Store Catalog: ${catalogProductNames}
Intents: "ADD", "REMOVE", "MODIFY_QTY", "SEARCH", "GET_SUBSTITUTE", "GET_RECOMMENDATIONS", "RECIPE_EXPAND", "CLEAR", "SHOW_CART", "CHECKOUT", "CHAT"
Output format:
{"intent": "ADD", "detectedLanguage": "en", "spokenFeedback": "Short 1-sentence response", "items": [{"name": "item", "quantity": 1, "category": "Pantry"}]}`;

  const userPrompt = `Cart: ${JSON.stringify(currentShoppingList.map(i => ({ name: i.name, qty: i.quantity })))}
User: "${userTranscript}"`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s realistic timeout for remote LLM

    const response = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MINIMAX_API_KEY}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "MiniMax-M3",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 250
      })
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return fallbackRuleBasedParser(userTranscript, currentShoppingList);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    if (content.startsWith("```json")) content = content.substring(7);
    if (content.startsWith("```")) content = content.substring(3);
    if (content.endsWith("```")) content = content.substring(0, content.length - 3);
    content = content.trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        return fallbackRuleBasedParser(userTranscript, currentShoppingList);
      }
    }

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

    return parsed;
  } catch (err) {
    return fallbackRuleBasedParser(userTranscript, currentShoppingList);
  }
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
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s TTS limit

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

    if (audioCache.size > 150) {
      const firstKey = audioCache.keys().next().value;
      audioCache.delete(firstKey);
    }
    audioCache.set(cacheKey, { audioDataUrl, audioBuffer });

    return { audioDataUrl, audioBuffer };
  } catch (err) {
    return null;
  }
}

/**
 * Robust fallback parser in case of offline/network issues
 */
function fallbackRuleBasedParser(transcript, currentList = []) {
  const lower = (transcript || "").toLowerCase().trim();
  
  if (lower.includes("clear") || lower.includes("empty list") || lower.includes("card") || lower.includes("cart")) {
    if (lower.startsWith("clear") || lower.includes("empty")) {
      return {
        intent: "CLEAR",
        detectedLanguage: "en",
        spokenFeedback: "Cleared all items from your shopping list.",
        items: []
      };
    }
  }

  if (lower.includes("what") && (lower.includes("cart") || lower.includes("card") || lower.includes("car") || lower.includes("cost") || lower.includes("total") || lower.includes("have"))) {
    return {
      intent: "SHOW_CART",
      detectedLanguage: "en",
      spokenFeedback: "Here is what's currently in your cart.",
      items: []
    };
  }

  if (lower.includes("remove") || lower.includes("delete")) {
    const cleanItem = lower.replace(/remove|delete|from my list|from list|please/gi, "").trim();
    return {
      intent: "REMOVE",
      detectedLanguage: "en",
      spokenFeedback: `Removed ${cleanItem} from your list.`,
      items: [{ name: cleanItem, quantity: 1 }]
    };
  }

  if (lower.includes("find") || lower.includes("search") || lower.includes("under $")) {
    const priceMatch = lower.match(/under \$?(\d+(\.\d+)?)/);
    const maxPrice = priceMatch ? parseFloat(priceMatch[1]) : null;
    const cleanQuery = lower.replace(/find|search for|under \$\d+/gi, "").trim();
    return {
      intent: "SEARCH",
      detectedLanguage: "en",
      spokenFeedback: `Searching for items matching ${cleanQuery || "your filter"}.`,
      items: [],
      searchParams: {
        query: cleanQuery,
        maxPrice
      }
    };
  }

  if (lower.includes("substitute") || lower.includes("alternative")) {
    const cleanItem = lower.replace(/substitute for|alternative for|replace/gi, "").trim();
    return {
      intent: "GET_SUBSTITUTE",
      detectedLanguage: "en",
      spokenFeedback: `Finding substitutes for ${cleanItem}.`,
      substituteTarget: cleanItem,
      items: []
    };
  }

  // Default: Add item
  const cleanAdd = lower.replace(/add|i need|buy|put|to my list|to list|please/gi, "").trim();
  const qtyMatch = cleanAdd.match(/^(\d+)\s*(.*)/);
  const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
  const itemName = qtyMatch ? qtyMatch[2] : cleanAdd;

  // Best effort category guess
  let category = "Pantry";
  if (/apple|banana|berry|spinach|lemon|carrot|produce|fruit|salad|avocado/i.test(itemName)) category = "Produce";
  else if (/milk|egg|cheese|yogurt|butter|dairy/i.test(itemName)) category = "Dairy & Eggs";
  else if (/bread|croissant|bagel|sourdough|bakery/i.test(itemName)) category = "Bakery";
  else if (/chicken|beef|salmon|fish|meat|tofu/i.test(itemName)) category = "Meat & Seafood";
  else if (/water|juice|coffee|tea|beverage|drink/i.test(itemName)) category = "Beverages";
  else if (/chocolate|chips|nuts|almonds|popcorn|snack/i.test(itemName)) category = "Snacks";
  else if (/soap|towel|paper|detergent|toothpaste|household/i.test(itemName)) category = "Household";

  return {
    intent: "ADD",
    detectedLanguage: "en",
    spokenFeedback: `Added ${qty} ${itemName} to your shopping list.`,
    items: [{
      name: itemName || "item",
      quantity: qty,
      unit: "item",
      category,
      estimatedPrice: 3.50
    }]
  };
}
