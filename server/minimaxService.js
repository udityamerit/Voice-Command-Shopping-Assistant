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
 * Parses user voice transcript or text using MiniMax-M3 LLM.
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

  const catalogSummary = PRODUCT_CATALOG.slice(0, 30).map(p => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    unit: p.unit
  }));

  const systemPrompt = `You are the AI brain of an industry-grade Voice Shopping Assistant called 'VoiceCart AI'.
Your job is to understand natural language shopping commands in ANY language (English, Spanish, French, German, Hindi, Japanese, Chinese, etc.) and return a strict, valid JSON response.

Supported Intent Types:
- "ADD": User wants to add one or more items to their shopping list. Example: "Add 2 bottles of whole milk and 1 loaf of artisan bread", "I need fresh apples".
- "REMOVE": User wants to remove one or more items from their list. Example: "Remove milk from my list", "Delete eggs". MUST include the item name(s) to remove in the "items" array, e.g. [{"name": "whole milk"}].
- "MODIFY_QTY": User wants to adjust quantity or unit of an existing item. Example: "Change milk quantity to 3 bottles".
- "SEARCH": User wants to search or filter products by keyword, brand, or price. Example: "Find me organic snacks under $5", "Search for gluten-free pasta".
- "GET_SUBSTITUTE": User asks for an alternative, substitute, or healthier/cheaper option. Example: "Suggest an alternative for regular milk", "What can I replace bread with?".
- "GET_RECOMMENDATIONS": User asks what they should buy, what's on sale, what's in season, or what they're low on. Example: "What do I need to restock?", "Any seasonal fruits on sale?".
- "RECIPE_EXPAND": User asks to add ingredients for a recipe or meal. Example: "Add ingredients for avocado toast", "I want to cook pasta marinara".
- "CLEAR": User asks to clear or empty the shopping list. Example: "Clear my entire shopping list".
- "CHAT": General greeting, question about features, or conversation.

Standard Available Categories:
Produce, Dairy & Eggs, Bakery, Pantry, Meat & Seafood, Beverages, Snacks, Household.

Output Format: You MUST output ONLY valid JSON matching this exact schema:
{
  "intent": "ADD" | "REMOVE" | "MODIFY_QTY" | "SEARCH" | "GET_SUBSTITUTE" | "GET_RECOMMENDATIONS" | "RECIPE_EXPAND" | "CLEAR" | "CHAT",
  "detectedLanguage": "en" | "es" | "fr" | "de" | "hi" | "zh" | "ja" | "other",
  "spokenFeedback": "Concise natural voice response to speak to the user in their language (maximum 1-2 sentences)",
  "items": [
    {
      "name": "Item name in English or user language",
      "quantity": 1,
      "unit": "bottle" | "pack" | "bunch" | "loaf" | "lb" | "box" | "item" | "etc",
      "category": "Produce" | "Dairy & Eggs" | "Bakery" | "Pantry" | "Meat & Seafood" | "Beverages" | "Snacks" | "Household",
      "estimatedPrice": 3.99,
      "dietary": ["Organic", "Gluten-Free", "Vegan"],
      "matchedCatalogId": "optional catalog product ID if clear match"
    }
  ],
  "searchParams": {
    "query": "search query string",
    "maxPrice": null or number,
    "minPrice": null or number,
    "category": "All" or category name,
    "dietary": "optional dietary filter e.g. Organic, Vegan, Gluten-Free"
  },
  "substituteTarget": "product name to find substitutes for if GET_SUBSTITUTE"
}`;

  const userPrompt = `Current Shopping List Items: ${JSON.stringify(currentShoppingList.map(i => ({ name: i.name, qty: i.quantity, cat: i.category })))}
User Spoken Voice Command: "${userTranscript}"

Respond with ONLY the JSON object. Do not include markdown code block formatting if possible.`;

  try {
    const response = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MINIMAX_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "MiniMax-M3",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`MiniMax Chat API error (${response.status}):`, errText);
      return fallbackRuleBasedParser(userTranscript, currentShoppingList);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";

    // Strip out <think>...</think> if present
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    // Remove markdown code fences if present
    if (content.startsWith("```json")) {
      content = content.substring(7);
    }
    if (content.startsWith("```")) {
      content = content.substring(3);
    }
    if (content.endsWith("```")) {
      content = content.substring(0, content.length - 3);
    }
    content = content.trim();

    const parsed = JSON.parse(content);

    // Normalize items to ensure array of objects with { name, quantity, category, unit }
    if (parsed.items && Array.isArray(parsed.items)) {
      parsed.items = parsed.items.map(item => {
        if (typeof item === "string") {
          return { name: item, quantity: 1, category: "Pantry", unit: "item" };
        }
        return {
          name: item.name || item.item || "item",
          quantity: parseInt(item.quantity, 10) || 1,
          unit: item.unit || "item",
          category: item.category || "Pantry",
          estimatedPrice: item.estimatedPrice || item.price || 3.99,
          dietary: Array.isArray(item.dietary) ? item.dietary : [],
          matchedCatalogId: item.matchedCatalogId || null
        };
      });
    } else if (parsed.item || parsed.target) {
      const single = parsed.item || parsed.target;
      parsed.items = [{
        name: typeof single === "string" ? single : (single.name || "item"),
        quantity: parseInt(single?.quantity, 10) || 1,
        category: single?.category || "Pantry",
        unit: single?.unit || "item"
      }];
    } else {
      parsed.items = [];
    }

    return parsed;
  } catch (err) {
    console.error("Error executing MiniMax LLM parsing:", err.message);
    return fallbackRuleBasedParser(userTranscript, currentShoppingList);
  }
}

/**
 * Generates natural spoken audio for the assistant using MiniMax Speech-2.8-HD TTS API.
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
    const payload = {
      model: "speech-2.8-hd",
      text: cleanText,
      stream: false,
      voice_setting: {
        voice_id: voiceId,
        speed: 1.0,
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
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`MiniMax TTS API failed with status ${response.status}:`, errText);
      return null;
    }

    const resJson = await response.json();
    const hexAudio = resJson.data?.audio;
    if (!hexAudio) {
      console.warn("No audio data in MiniMax TTS response:", resJson);
      return null;
    }

    // Convert hex string to binary buffer and base64
    const audioBuffer = Buffer.from(hexAudio, "hex");
    const base64Audio = audioBuffer.toString("base64");
    const audioDataUrl = `data:audio/mp3;base64,${base64Audio}`;

    // Cache up to 100 audio phrases
    if (audioCache.size > 100) {
      const firstKey = audioCache.keys().next().value;
      audioCache.delete(firstKey);
    }
    audioCache.set(cacheKey, { audioDataUrl, audioBuffer });

    return { audioDataUrl, audioBuffer };
  } catch (err) {
    console.error("MiniMax TTS request exception:", err.message);
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
