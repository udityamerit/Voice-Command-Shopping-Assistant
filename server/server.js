// server/server.js - Production-grade Express backend for Voice Command Shopping Assistant
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import { PRODUCT_CATALOG, CATEGORIES } from "./catalogData.js";
import {
  getPredictiveReplenishment,
  getSeasonalAndSaleRecommendations,
  getProductSubstitutes,
  searchCatalog,
  findCatalogProduct
} from "./recommendationEngine.js";
import {
  parseVoiceCommandWithMiniMax,
  generateMiniMaxSpeech
} from "./minimaxService.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "../public")));

// In-Memory persistent shopping list state (with seed sample items for realistic instant demo)
let shoppingList = [
  {
    id: "item_1",
    name: "Organic Gala Apples",
    quantity: 2,
    unit: "1 lb bag",
    category: "Produce",
    price: 3.99,
    completed: false,
    emoji: "🍎",
    dietary: ["Organic", "Gluten-Free", "Vegan"],
    addedVia: "voice",
    createdAt: new Date().toISOString()
  },
  {
    id: "item_2",
    name: "Whole Grade A Milk",
    quantity: 1,
    unit: "1 Gallon",
    category: "Dairy & Eggs",
    price: 3.89,
    completed: false,
    emoji: "🥛",
    dietary: ["Organic"],
    addedVia: "voice",
    createdAt: new Date().toISOString()
  },
  {
    id: "item_3",
    name: "Artisan Sourdough Boule",
    quantity: 1,
    unit: "24 oz loaf",
    category: "Bakery",
    price: 4.99,
    completed: true,
    emoji: "🍞",
    dietary: ["Vegan"],
    addedVia: "manual",
    createdAt: new Date().toISOString()
  }
];

// Helper: Match product strictly in catalog
function resolveCatalogItem({ name, quantity = 1, unit = null }) {
  const matchedProduct = findCatalogProduct(name);
  if (!matchedProduct) {
    return {
      matched: false,
      requestedName: name
    };
  }

  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  return {
    matched: true,
    item: {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      productId: matchedProduct.id,
      name: matchedProduct.name,
      quantity: qty,
      unit: matchedProduct.unit || unit || "1 unit",
      category: matchedProduct.category || "Pantry",
      price: matchedProduct.price,
      completed: false,
      emoji: matchedProduct.emoji || "🛒",
      image: matchedProduct.image || null,
      dietary: matchedProduct.dietary || [],
      addedVia: "voice",
      createdAt: new Date().toISOString()
    }
  };
}

// -------------------------------------------------------------
// REST API Endpoints
// -------------------------------------------------------------

// Health Check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Voice Command Shopping Assistant",
    models: {
      llm: "MiniMax-M3",
      tts: "speech-2.8-hd"
    },
    itemsCount: shoppingList.length
  });
});

// Product Catalog & Search
app.get("/api/catalog", (req, res) => {
  const { q, category, maxPrice, minPrice, dietary, brand, inStock } = req.query;
  const results = searchCatalog({
    query: q,
    category,
    maxPrice,
    minPrice,
    dietary,
    brand,
    onlyInStock: inStock === "true"
  });
  res.json({ count: results.length, data: results });
});

// Categories List
app.get("/api/categories", (req, res) => {
  res.json({ data: CATEGORIES });
});

// Get Shopping List with Totals and Summary
app.get("/api/shopping-list", (req, res) => {
  const totalCost = shoppingList.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const totalItems = shoppingList.reduce((acc, item) => acc + item.quantity, 0);
  const completedCount = shoppingList.filter(i => i.completed).length;

  // Group by category
  const grouped = {};
  for (const item of shoppingList) {
    const cat = item.category || "Other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  res.json({
    data: shoppingList,
    meta: {
      totalCost: parseFloat(totalCost.toFixed(2)),
      totalItems,
      uniqueCount: shoppingList.length,
      completedCount,
      grouped
    }
  });
});

// Add Item Manually or from Product ID
app.post("/api/shopping-list/item", (req, res) => {
  const { productId, name, quantity = 1, unit, category, price, dietary } = req.body;

  let newItem;
  if (productId) {
    const product = PRODUCT_CATALOG.find(p => p.id === productId);
    if (!product) return res.status(404).json({ error: "Product not found" });
    newItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: product.name,
      quantity: parseInt(quantity, 10) || 1,
      unit: product.unit,
      category: product.category,
      price: product.price,
      completed: false,
      emoji: product.emoji,
      dietary: product.dietary,
      productId: product.id,
      addedVia: "manual",
      createdAt: new Date().toISOString()
    };
  } else if (name) {
    newItem = matchOrCreateItem({ name, quantity, unit, category, estimatedPrice: price, dietary });
  } else {
    return res.status(400).json({ error: "Item name or productId required" });
  }

  // Check if item already exists - if so, bump quantity
  const existing = shoppingList.find(i => i.name.toLowerCase() === newItem.name.toLowerCase());
  if (existing) {
    existing.quantity += newItem.quantity;
    return res.json({ message: `Updated quantity of ${existing.name}`, item: existing, data: shoppingList });
  }

  shoppingList.unshift(newItem);
  res.status(201).json({ message: `Added ${newItem.name} to shopping list`, item: newItem, data: shoppingList });
});

// Update Item (quantity, completed, etc.)
app.patch("/api/shopping-list/item/:id", (req, res) => {
  const { id } = req.params;
  const { quantity, completed, category, name } = req.body;

  const item = shoppingList.find(i => i.id === id);
  if (!item) return res.status(404).json({ error: "Item not found" });

  if (quantity !== undefined) item.quantity = Math.max(1, parseInt(quantity, 10));
  if (completed !== undefined) item.completed = Boolean(completed);
  if (category !== undefined) item.category = category;
  if (name !== undefined) item.name = name;

  res.json({ message: "Item updated successfully", item, data: shoppingList });
});

// Delete Item
app.delete("/api/shopping-list/item/:id", (req, res) => {
  const { id } = req.params;
  const index = shoppingList.findIndex(i => i.id === id);
  if (index === -1) return res.status(404).json({ error: "Item not found" });

  const removed = shoppingList.splice(index, 1)[0];
  res.json({ message: `Removed ${removed.name} from list`, item: removed, data: shoppingList });
});

// Clear Entire Shopping List
app.delete("/api/shopping-list", (req, res) => {
  shoppingList = [];
  res.json({ message: "Shopping list cleared", data: [] });
});

function findCartItem(targetStr, cartList) {
  if (!targetStr || typeof targetStr !== "string") return null;

  // Clean determiners and noise words
  const cleanTarget = targetStr.toLowerCase()
    .replace(/^(the|a|an|some|my|all|pack of|bottle of|bottles of|box of|loaf of|bunch of)\s+/gi, "")
    .replace(/\s+(from\s+(my\s+|the\s+)?(cart|card|car|list)|in\s+(my\s+|the\s+)?(cart|card|car|list)|please|now)$/gi, "")
    .trim();

  if (!cleanTarget) return null;

  // 1. Direct name or partial match
  const directMatch = cartList.find(i => {
    const itemName = i.name.toLowerCase();
    return itemName === cleanTarget || itemName.includes(cleanTarget) || cleanTarget.includes(itemName);
  });
  if (directMatch) return directMatch;

  // 2. Catalog-assisted alias matching (e.g. user says "milk", matches "dairy_milk_whole")
  const matchedCatalog = findCatalogProduct(cleanTarget);
  if (matchedCatalog) {
    const byId = cartList.find(i => i.productId === matchedCatalog.id);
    if (byId) return byId;
  }

  // 3. Word token overlap
  const targetTokens = cleanTarget.split(/\s+/).filter(t => t.length > 2);
  let bestItem = null;
  let highestOverlap = 0;

  for (const item of cartList) {
    const itemTokens = item.name.toLowerCase().split(/\s+/);
    let count = 0;
    for (const tok of targetTokens) {
      if (itemTokens.some(it => it.includes(tok) || tok.includes(it))) count++;
    }
    if (count > highestOverlap) {
      highestOverlap = count;
      bestItem = item;
    }
  }

  if (highestOverlap > 0) return bestItem;
  return null;
}

// -------------------------------------------------------------
// Voice Command AI Endpoint (MiniMax-M3 LLM + Neural TTS)
// -------------------------------------------------------------
app.post("/api/voice/process", async (req, res) => {
  const { transcript, language = "en", voiceId = "English_radiant_girl" } = req.body;

  if (!transcript || transcript.trim() === "") {
    return res.status(400).json({ error: "Voice transcript is required" });
  }

  try {
    // 1. Parse NLP Intent using MiniMax-M3 LLM
    const nlpResult = await parseVoiceCommandWithMiniMax(transcript, shoppingList);
    const intent = nlpResult.intent || "CHAT";
    let actionsTaken = [];
    let searchResults = null;
    let substituteData = null;
    let recommendationData = null;

    // 2. Execute List Mutations based on Intent
    let finalSpokenFeedback = nlpResult.spokenFeedback;

    if (intent === "ADD" || intent === "RECIPE_EXPAND") {
      if (Array.isArray(nlpResult.items) && nlpResult.items.length > 0) {
        const addedItems = [];
        const unavailableItems = [];

        for (const itemData of nlpResult.items) {
          const res = resolveCatalogItem(itemData);
          if (res.matched && res.item) {
            const itemObj = res.item;
            const existing = shoppingList.find(i => i.productId === itemObj.productId || i.name.toLowerCase() === itemObj.name.toLowerCase());
            if (existing) {
              existing.quantity += itemObj.quantity;
              actionsTaken.push(`Updated ${existing.name} quantity to ${existing.quantity}`);
              addedItems.push({ name: existing.name, quantity: itemObj.quantity });
            } else {
              shoppingList.unshift(itemObj);
              actionsTaken.push(`Added ${itemObj.quantity}x ${itemObj.name} (${itemObj.category})`);
              addedItems.push({ name: itemObj.name, quantity: itemObj.quantity });
            }
          } else {
            unavailableItems.push(itemData.name || res.requestedName || "item");
            actionsTaken.push(`Item '${itemData.name || "item"}' is currently not in store catalog`);
          }
        }

        // Contextual speech feedback based on catalog availability
        if (unavailableItems.length > 0) {
          if (addedItems.length > 0) {
            const addedSummary = addedItems.map(i => `${i.quantity > 1 ? i.quantity + 'x ' : ''}${i.name}`).join(", ");
            finalSpokenFeedback = `Added ${addedSummary} to your cart. However, '${unavailableItems.join("', '")}' is currently not available in our store.`;
          } else {
            finalSpokenFeedback = `Sorry, '${unavailableItems.join("', '")}' is currently not available in our store. We deliver fresh produce, dairy, bakery, meat, pantry, beverages, snacks, and household essentials in 10 minutes.`;
          }
        } else if (addedItems.length > 0) {
          const addedSummary = addedItems.map(i => `${i.quantity > 1 ? i.quantity + 'x ' : ''}${i.name}`).join(", ");
          finalSpokenFeedback = `Added ${addedSummary} to your cart.`;
        }
      }
    } else if (intent === "REMOVE") {
      if (Array.isArray(nlpResult.items) && nlpResult.items.length > 0) {
        const removed = [];
        for (const target of nlpResult.items) {
          const targetName = target.name || "";
          const found = findCartItem(targetName, shoppingList);

          if (found) {
            const index = shoppingList.indexOf(found);
            if (index !== -1) {
              const removedItem = shoppingList.splice(index, 1)[0];
              removed.push(removedItem.name);
              actionsTaken.push(`Removed ${removedItem.name}`);
            }
          }
        }
        if (removed.length > 0) {
          finalSpokenFeedback = `Removed ${removed.join(", ")} from your cart.`;
        } else {
          finalSpokenFeedback = `I couldn't find '${nlpResult.items.map(i => i.name).join(", ")}' in your cart.`;
        }
      }
    } else if (intent === "MODIFY_QTY") {
      if (Array.isArray(nlpResult.items) && nlpResult.items.length > 0) {
        const modified = [];
        for (const mod of nlpResult.items) {
          const targetName = mod.name || "";
          const found = findCartItem(targetName, shoppingList);
          if (found && mod.quantity) {
            found.quantity = Math.max(1, parseInt(mod.quantity, 10));
            actionsTaken.push(`Adjusted ${found.name} quantity to ${found.quantity}`);
            modified.push(`${found.name} to ${found.quantity}`);
          }
        }
        if (modified.length > 0) {
          finalSpokenFeedback = `Updated quantity of ${modified.join(", ")}.`;
        } else {
          finalSpokenFeedback = `I couldn't find '${nlpResult.items.map(i => i.name).join(", ")}' in your cart.`;
        }
      }
    } else if (intent === "CLEAR") {
      shoppingList = [];
      actionsTaken.push("Cleared all shopping list items");
      finalSpokenFeedback = "I've cleared all items from your cart.";
    } else if (intent === "SEARCH") {
      const p = nlpResult.searchParams || {};
      searchResults = searchCatalog({
        query: p.query || transcript,
        category: p.category,
        maxPrice: p.maxPrice,
        minPrice: p.minPrice,
        dietary: p.dietary
      });
      actionsTaken.push(`Found ${searchResults.length} matching products`);
      if (searchResults.length > 0) {
        finalSpokenFeedback = `Found ${searchResults.length} items matching '${p.query || transcript}'.`;
      } else {
        finalSpokenFeedback = `No items found matching '${p.query || transcript}'. Try searching for produce, milk, bakery, or snacks.`;
      }
    } else if (intent === "GET_SUBSTITUTE") {
      const target = nlpResult.substituteTarget || transcript;
      substituteData = getProductSubstitutes(target);
      actionsTaken.push(`Found ${substituteData.substitutes.length} substitutes for ${substituteData.target?.name || target}`);
      if (substituteData.substitutes.length > 0) {
        finalSpokenFeedback = `Here are ${substituteData.substitutes.length} substitutes for ${substituteData.target?.name || target}: ${substituteData.substitutes.map(s => s.name).slice(0, 2).join(" and ")}.`;
      } else {
        finalSpokenFeedback = `I couldn't find direct substitutes for '${target}'. Explore our catalogue for similar items.`;
      }
    } else if (intent === "GET_RECOMMENDATIONS") {
      const replenishment = getPredictiveReplenishment(shoppingList.map(i => i.name));
      const seasonal = getSeasonalAndSaleRecommendations();
      recommendationData = { replenishment, seasonal };
      actionsTaken.push("Fetched personalized recommendations");
      finalSpokenFeedback = "Here are your personalized restock and seasonal recommendations.";
    } else if (intent === "SHOW_CART") {
      if (shoppingList.length === 0) {
        finalSpokenFeedback = "Your cart is currently empty. You can say 'Add 2 gala apples and milk' to get started.";
        actionsTaken.push("Checked cart status: empty");
      } else {
        const totalCost = shoppingList.reduce((s, i) => s + (i.price * i.quantity), 0).toFixed(2);
        const totalUnits = shoppingList.reduce((s, i) => s + i.quantity, 0);
        const itemSummaries = shoppingList.map(i => `${i.quantity}x ${i.name}`).join(", ");
        
        const lowerTrans = (transcript || "").toLowerCase();
        if (lowerTrans.includes("cost") || lowerTrans.includes("price") || lowerTrans.includes("how much")) {
          finalSpokenFeedback = `The total cost of the ${totalUnits} items in your cart is $${totalCost} (${itemSummaries}).`;
        } else if (lowerTrans.includes("how many") || lowerTrans.includes("quantity") || lowerTrans.includes("quantities")) {
          finalSpokenFeedback = `You have ${totalUnits} total items (${shoppingList.length} unique products) in your cart: ${itemSummaries}, totaling $${totalCost}.`;
        } else {
          finalSpokenFeedback = `You have ${totalUnits} items in your cart: ${itemSummaries}, totaling $${totalCost}.`;
        }
        actionsTaken.push(`Checked cart status: ${totalUnits} items, $${totalCost}`);
      }
    } else if (intent === "CHECKOUT") {
      if (shoppingList.length === 0) {
        finalSpokenFeedback = "Your cart is empty! Please add items before checking out.";
        actionsTaken.push("Checkout attempted with empty cart");
      } else {
        const total = shoppingList.reduce((s, i) => s + (i.price * i.quantity), 0).toFixed(2);
        const orderId = `ORD_${Date.now().toString().slice(-6)}`;
        finalSpokenFeedback = `Order placed successfully! Total is $${total}. Your fresh groceries are arriving in 10 minutes.`;
        actionsTaken.push(`Placed order #${orderId} for $${total}`);
        shoppingList = []; // Clear cart on checkout
      }
    }

    // 3. Synthesize Spoken Audio using MiniMax Speech-2.8-HD TTS
    const speechText = finalSpokenFeedback || nlpResult.spokenFeedback || "Your cart has been updated.";
    const ttsResult = await generateMiniMaxSpeech(speechText, voiceId);

    res.json({
      success: true,
      transcript,
      nlp: nlpResult,
      intent,
      spokenFeedback: speechText,
      audioDataUrl: ttsResult?.audioDataUrl || null,
      actionsTaken,
      searchResults,
      substituteData,
      recommendationData,
      shoppingList
    });
  } catch (err) {
    console.error("Voice command processing failure:", err);
    res.status(500).json({
      error: "Failed to process voice command",
      details: err.message
    });
  }
});

// MiniMax Neural Text-to-Speech Direct Endpoint
app.post("/api/voice/tts", async (req, res) => {
  const { text, voiceId = "English_expressive_narrator" } = req.body;
  if (!text) return res.status(400).json({ error: "Text is required" });

  const result = await generateMiniMaxSpeech(text, voiceId);
  if (!result) return res.status(500).json({ error: "Failed to synthesize speech audio" });

  res.json({ audioDataUrl: result.audioDataUrl });
});

// Smart Suggestions Endpoints
app.get("/api/recommendations/replenishment", (req, res) => {
  const suggestions = getPredictiveReplenishment(shoppingList.map(i => i.name));
  res.json({ data: suggestions });
});

app.get("/api/recommendations/seasonal", (req, res) => {
  const items = getSeasonalAndSaleRecommendations();
  res.json({ data: items });
});

app.get("/api/recommendations/substitutes", (req, res) => {
  const { product } = req.query;
  if (!product) return res.status(400).json({ error: "Product query required" });

  const data = getProductSubstitutes(product);
  res.json({ data });
});

// Export shopping list (Markdown, CSV, Text)
app.get("/api/export", (req, res) => {
  const { format = "text" } = req.query;
  const totalCost = shoppingList.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  if (format === "csv") {
    let csv = "Item,Quantity,Unit,Category,Unit Price,Total Price,Status\n";
    for (const item of shoppingList) {
      csv += `"${item.name}",${item.quantity},"${item.unit}","${item.category}",$${item.price.toFixed(2)},$${(item.price * item.quantity).toFixed(2)},"${item.completed ? 'Purchased' : 'Pending'}"\n`;
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="shopping_list.csv"');
    return res.send(csv);
  }

  // Default: Plain Text / WhatsApp friendly format
  let text = `🛒 *VoiceCart AI - Shopping List*\n📅 ${new Date().toLocaleDateString()} | Total: $${totalCost.toFixed(2)}\n\n`;
  const grouped = {};
  for (const item of shoppingList) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  for (const [cat, items] of Object.entries(grouped)) {
    text += `*${cat.toUpperCase()}*\n`;
    for (const i of items) {
      text += ` [${i.completed ? '✓' : ' '}] ${i.quantity}x ${i.name} ($${(i.price * i.quantity).toFixed(2)})\n`;
    }
    text += "\n";
  }

  text += `Generated with VoiceCart AI (Powered by MiniMax-M3)`;
  res.json({ text, totalCost: totalCost.toFixed(2) });
});

// Fallback to index.html for SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Start Server with Error Handling
const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🛒 Voice Command Shopping Assistant Server Running!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🧠 AI Engine: MiniMax-M3 LLM + Speech-2.8-HD TTS`);
  console.log(`=======================================================`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    const nextPort = Number(PORT) + 1;
    console.warn(`⚠️ Port ${PORT} was busy. Starting on fallback port ${nextPort}...`);
    app.listen(nextPort, () => {
      console.log(`🛒 Server running on fallback URL: http://localhost:${nextPort}`);
    });
  } else {
    console.error("Server startup error:", err);
  }
});
