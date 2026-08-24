// server/tests/api.test.js - Comprehensive automated integration test suite
import assert from "assert";
import { searchCatalog, getProductSubstitutes, getPredictiveReplenishment, getSeasonalAndSaleRecommendations } from "../recommendationEngine.js";
import { parseVoiceCommandWithMiniMax, generateMiniMaxSpeech } from "../minimaxService.js";
import { PRODUCT_CATALOG } from "../catalogData.js";

async function runTests() {
  console.log("🚀 Starting Automated Test Suite for Voice Command Shopping Assistant...\n");
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  // 1. Catalog & Search Tests
  console.log("[1/5] Testing Product Catalog & Filter Engine...");
  test("Catalog contains items across all essential categories", () => {
    assert(PRODUCT_CATALOG.length >= 20, "Catalog should have at least 20 items");
    const categories = new Set(PRODUCT_CATALOG.map(p => p.category));
    assert(categories.has("Produce"), "Missing Produce category");
    assert(categories.has("Dairy & Eggs"), "Missing Dairy & Eggs category");
    assert(categories.has("Bakery"), "Missing Bakery category");
    assert(categories.has("Pantry"), "Missing Pantry category");
  });

  test("Search filters by maximum price correctly", () => {
    const under5 = searchCatalog({ maxPrice: 5.0 });
    assert(under5.length > 0, "Should return items under $5");
    under5.forEach(item => {
      assert(item.price <= 5.0, `Item ${item.name} price ${item.price} exceeds 5.0`);
    });
  });

  test("Search filters by dietary tag (e.g., Organic, Vegan)", () => {
    const organic = searchCatalog({ dietary: "Organic" });
    assert(organic.length > 0, "Should find organic items");
    organic.forEach(item => {
      assert(item.dietary.some(d => d.toLowerCase().includes("organic")), `Item ${item.name} should be organic`);
    });
  });

  // 2. Recommendation Engine Tests
  console.log("\n[2/5] Testing Recommendation Engine...");
  test("Predictive replenishment flags overdue items", () => {
    const suggestions = getPredictiveReplenishment([]);
    assert(suggestions.length > 0, "Should generate predictive replenishment suggestions");
    assert(suggestions[0].urgency, "Suggestion should have urgency level");
  });

  test("Seasonal & on-sale recommendations function properly", () => {
    const seasonal = getSeasonalAndSaleRecommendations();
    assert(seasonal.length > 0, "Should return seasonal/sale products");
    assert(seasonal.some(s => s.badge === "ON SALE"), "Should include on-sale items");
  });

  test("Substitutions engine finds plant-based & budget alternatives", () => {
    const result = getProductSubstitutes("Whole Grade A Milk");
    assert(result.target, "Should find target product");
    assert(result.substitutes.length > 0, "Should find substitutes for Whole Milk");
    const subNames = result.substitutes.map(s => s.product.name);
    assert(subNames.some(n => n.includes("Oat") || n.includes("Almond")), "Should include oat or almond milk substitute");
  });

  // 3. MiniMax-M3 LLM NLP Integration Tests
  console.log("\n[3/5] Testing MiniMax-M3 LLM Natural Language Parsing...");
  await testAsync("MiniMax-M3 correctly parses multi-item addition command", async () => {
    const result = await parseVoiceCommandWithMiniMax("Add 2 bottles of whole milk and 1 loaf of artisan bread to my cart");
    assert(result.intent === "ADD" || result.intent === "RECIPE_EXPAND", `Expected ADD intent, got ${result.intent}`);
    assert(Array.isArray(result.items) && result.items.length >= 1, "Should extract items array");
    const itemNames = result.items.map(i => i.name.toLowerCase());
    assert(itemNames.some(n => n.includes("milk")), "Should extract milk");
  });

  await testAsync("MiniMax-M3 understands multilingual Spanish command", async () => {
    const result = await parseVoiceCommandWithMiniMax("Por favor agrega 3 manzanas y una barra de pan");
    assert(result.intent === "ADD", `Expected ADD intent, got ${result.intent}`);
    assert(result.items.length > 0, "Should extract items in Spanish");
  });

  await testAsync("MiniMax-M3 handles removal command", async () => {
    const result = await parseVoiceCommandWithMiniMax("Remove whole milk from my list");
    assert(result.intent === "REMOVE", `Expected REMOVE intent, got ${result.intent}`);
    assert(result.items.length > 0, "Should extract item to remove");
  });

  // 4. MiniMax Speech-2.8-HD Neural TTS Test
  console.log("\n[4/5] Testing MiniMax Speech-2.8-HD TTS Synthesis...");
  await testAsync("MiniMax TTS generates valid audio stream buffer", async () => {
    const tts = await generateMiniMaxSpeech("Hello! I have added organic apples to your shopping list.");
    assert(tts !== null, "TTS should return an audio object");
    assert(tts.audioDataUrl && tts.audioDataUrl.startsWith("data:audio/mp3;base64,"), "Audio Data URL should be valid mp3 data URI");
    assert(tts.audioBuffer && tts.audioBuffer.length > 1000, "Audio buffer should contain binary data");
  });

  // Summary
  console.log("\n=======================================================");
  console.log(`Test Execution Complete: ${passed} Passed, ${failed} Failed`);
  console.log("=======================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
