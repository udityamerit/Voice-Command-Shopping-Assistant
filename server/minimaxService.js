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
 * Accurately parses standard shopping intents and extracts multi-item grocery lists.
 */
function fastPathClassify(userTranscript, currentShoppingList = []) {
  if (!userTranscript || typeof userTranscript !== "string") return null;
  const raw = userTranscript.trim();
  const lower = raw.toLowerCase();

  // 1. CLEAR Intent
  if (/^(clear|empty|reset)\s*(all|my)?\s*(shopping\s*list|cart|items|everything)?$/i.test(lower) || lower === "clear" || lower === "empty cart") {
    return {
      intent: "CLEAR",
      detectedLanguage: "en",
      spokenFeedback: "I've cleared all items from your cart.",
      items: []
    };
  }

  // 2. SHOW_CART Intent
  if (/^(what('s|\s+is)\s+in\s+my\s+cart|show\s+(my\s+)?(cart|list)|view\s+(my\s+)?(cart|list)|check\s+cart|how\s+many\s+items)/i.test(lower)) {
    return {
      intent: "SHOW_CART",
      detectedLanguage: "en",
      spokenFeedback: "Here is what's currently in your cart.",
      items: []
    };
  }

  // 3. CHECKOUT Intent
  if (/^(checkout|place\s+(my\s+)?order|buy\s+(now|everything|all)|order\s+now|complete\s+order)$/i.test(lower)) {
    return {
      intent: "CHECKOUT",
      detectedLanguage: "en",
      spokenFeedback: "Placing your 10-minute delivery order now.",
      items: []
    };
  }

  // 4. GET_RECOMMENDATIONS Intent
  if (/^(what\s+should\s+i\s+buy|what\s+do\s+i\s+need|recommendations|restock|what\s+am\s+i\s+low\s+on|seasonal\s+(items|specials|fruits))/i.test(lower)) {
    return {
      intent: "GET_RECOMMENDATIONS",
      detectedLanguage: "en",
      spokenFeedback: "Here are your personalized restock and seasonal recommendations.",
      items: []
    };
  }

  // 5. GET_SUBSTITUTE Intent
  const subMatch = lower.match(/(?:substitute|alternative|replace|swap)\s+(?:for\s+)?([a-z0-9\s]+)/i);
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

  // 6. SEARCH Intent
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

  // 7. REMOVE Intent
  if (lower.startsWith("remove") || lower.startsWith("delete") || lower.startsWith("take out") || lower.startsWith("drop")) {
    const clean = lower
      .replace(/^(remove|delete|take\s+out|drop)\s+/i, "")
      .replace(/\s+(from\s+(my\s+)?(cart|list)|please|now)$/gi, "")
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

  // 8. MODIFY_QTY Intent
  const modMatch = lower.match(/(?:change|make|update|set|increase|decrease)\s+([a-z\s]+?)\s+(?:quantity\s+)?(?:to\s+)?(\d+)/i);
  if (modMatch) {
    const targetItem = modMatch[1].replace(/quantity|of|the/gi, "").trim();
    const qty = parseInt(modMatch[2], 10);
    return {
      intent: "MODIFY_QTY",
      detectedLanguage: "en",
      spokenFeedback: `Updating quantity of ${targetItem} to ${qty}.`,
      items: [{ name: targetItem, quantity: qty }]
    };
  }

  // 9. ADD Intent (Handles "Add 2 apples and 1 milk", "buy milk", "i need bread and eggs")
  if (lower.startsWith("add") || lower.startsWith("buy") || lower.startsWith("i need") || lower.startsWith("put") || lower.startsWith("get")) {
    const clean = lower
      .replace(/^(add|buy|i\s+need|put|get)\s+/i, "")
      .replace(/\s+(to\s+(my\s+)?(cart|list)|in\s+(my\s+)?(cart|list)|please|now)$/gi, "")
      .trim();

    // Split compound items by "and" or comma
    const rawChunks = clean.split(/\s*(?:,|and|\+)\s*/).filter(Boolean);
    const items = [];

    for (const chunk of rawChunks) {
      const match = chunk.match(/^(?:(\d+)\s*(?:bottles?|packs?|boxes?|bunches?|loaves?|loaf|lbs?|items?|bags?|cans?|jars?)?\s*(?:of\s+)?)?(.+)$/i);
      if (match) {
        const qty = match[1] ? parseInt(match[1], 10) : 1;
        const name = (match[2] || chunk).trim();
        if (name) {
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
    const timeoutId = setTimeout(() => controller.abort(), 3500);

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
    console.warn("LLM fallback triggered for:", userTranscript, err.message);
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
    const timeoutId = setTimeout(() => controller.abort(), 2800); // 2.8s TTS limit

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
  const lower = transcript.toLowerCase();
  
  if (lower.startsWith("clear") || lower.includes("empty list")) {
    return {
      intent: "CLEAR",
      detectedLanguage: "en",
      spokenFeedback: "Cleared all items from your shopping list.",
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
    spokenFeedback: `Added ${qty} ${itemName} to your shopping list under ${category}.`,
    items: [{
      name: itemName || "item",
      quantity: qty,
      unit: "item",
      category,
      estimatedPrice: 3.50
    }]
  };
}
