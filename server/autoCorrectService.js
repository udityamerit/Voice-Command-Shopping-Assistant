// server/autoCorrectService.js - Intelligent Speech Autocorrection & Fuzzy Matching Engine
// Corrects speech-to-text misspellings, phonetic variations, and typos against the grocery catalog & vocabulary.

import { PRODUCT_CATALOG, CATEGORIES } from "./catalogData.js";

/**
 * Calculates Levenshtein edit distance between two strings.
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculates Soundex phonetic representation of a word.
 */
function getSoundex(word) {
  if (!word || typeof word !== "string") return "";
  const clean = word.toUpperCase().replace(/[^A-Z]/g, "");
  if (!clean) return "";

  const codes = {
    B: 1, F: 1, P: 1, V: 1,
    C: 2, G: 2, J: 2, K: 2, Q: 2, S: 2, X: 2, Z: 2,
    D: 3, T: 3,
    L: 4,
    M: 5, N: 5,
    R: 6
  };

  const firstChar = clean[0];
  let soundex = firstChar;
  let prevCode = codes[firstChar] || 0;

  for (let i = 1; i < clean.length && soundex.length < 4; i++) {
    const char = clean[i];
    const code = codes[char] || 0;
    if (code !== 0 && code !== prevCode) {
      soundex += code;
    }
    prevCode = code;
  }

  return soundex.padEnd(4, "0");
}

// ── 1. Comprehensive Common STT Phonetic & Typo Dictionary ────────────────
const COMMON_MISHEARS_MAP = {
  // Fruits & Vegetables
  "appel": "apple",
  "appels": "apples",
  "aple": "apple",
  "aples": "apples",
  "apels": "apples",
  "banan": "banana",
  "banans": "bananas",
  "bananans": "bananas",
  "bananna": "banana",
  "banannas": "bananas",
  "bannana": "banana",
  "bannanas": "bananas",
  "avocadoes": "avocados",
  "avocadoe": "avocado",
  "avacado": "avocado",
  "avacados": "avocados",
  "avocodo": "avocado",
  "avocodos": "avocados",
  "spinich": "spinach",
  "spinach": "spinach",
  "tomatos": "tomatoes",
  "tomatoe": "tomato",
  "carrt": "carrot",
  "carrts": "carrots",
  "carot": "carrot",
  "carots": "carrots",
  "strawbery": "strawberry",
  "strawberies": "strawberries",
  "straberry": "strawberry",
  "straberries": "strawberries",
  "strawbry": "strawberry",
  "bluebery": "blueberry",
  "blueberies": "blueberries",
  "rasbery": "raspberry",
  "rasberies": "raspberries",
  "lemn": "lemon",
  "lemns": "lemons",
  "lemmon": "lemon",
  "lemmons": "lemons",

  // Dairy & Eggs
  "eg": "egg",
  "egs": "eggs",
  "egges": "eggs",
  "mlk": "milk",
  "milke": "milk",
  "malik": "milk",
  "mlick": "milk",
  "buter": "butter",
  "buttr": "butter",
  "chese": "cheese",
  "cheez": "cheese",
  "cheze": "cheese",
  "yogert": "yogurt",
  "yoghurt": "yogurt",
  "yogut": "yogurt",
  "oatmilk": "oat milk",
  "almondmilk": "almond milk",
  "soymilk": "soy milk",

  // Bakery & Pantry
  "bred": "bread",
  "braed": "bread",
  "sourdow": "sourdough",
  "sordough": "sourdough",
  "sourdo": "sourdough",
  "sordow": "sourdough",
  "croisant": "croissant",
  "crosant": "croissant",
  "crossant": "croissant",
  "bagel": "bagel",
  "bagels": "bagels",
  "bagle": "bagel",
  "bagles": "bagels",
  "pastaa": "pasta",
  "spagetti": "spaghetti",
  "olv oil": "olive oil",
  "oliveoil": "olive oil",
  "olivoil": "olive oil",
  "hony": "honey",
  "hunny": "honey",
  "choclate": "chocolate",
  "choclet": "chocolate",
  "chocolat": "chocolate",
  "choclat": "chocolate",
  "almond": "almond",
  "almonds": "almonds",
  "almund": "almond",
  "almunds": "almonds",
  "chikn": "chicken",
  "chiken": "chicken",
  "chikken": "chicken",
  "samon": "salmon",
  "solmon": "salmon",
  "tof": "tofu",
  "tofoo": "tofu",

  // Beverages & Household
  "cofee": "coffee",
  "cofe": "coffee",
  "coffe": "coffee",
  "coldbrew": "cold brew",
  "coldbru": "cold brew",
  "juce": "juice",
  "juse": "juice",
  "sope": "soap",
  "sope": "soap",
  "dishsoap": "dish soap",
  "toothpast": "toothpaste",
  "tooth paste": "toothpaste",

  // Shopping & Action Terms
  "chekout": "checkout",
  "check out": "checkout",
  "chek out": "checkout",
  "reccomend": "recommend",
  "reccomendation": "recommendation",
  "reccomendations": "recommendations",
  "recomend": "recommend",
  "recomendation": "recommendation",
  "recomendations": "recommendations",
  "subsitute": "substitute",
  "substitue": "substitute",
  "substitut": "substitute",
  "alterntive": "alternative",
  "dietry": "dietary",
  "organik": "organic",
  "vegen": "vegan",
  "vegun": "vegan",
  "gloten free": "gluten-free",
  "gluten free": "gluten-free"
};

// ── 2. Protected Common English Words & Conjunctions (Never Autocorrect) ────
const PROTECTED_WORDS = new Set([
  "and", "the", "for", "to", "in", "on", "at", "by", "with", "from", "of",
  "now", "my", "me", "you", "it", "those", "that", "them", "this", "all",
  "are", "have", "can", "what", "how", "under", "new", "not", "any", "some",
  "like", "then", "also", "out", "off", "up", "down", "is", "a", "an", "do", "i"
]);

// ── 3. Build Vocabulary from Catalog & Actions ────────────────────────────
const VOCABULARY = new Set([
  ...PROTECTED_WORDS,

  // Core action verbs
  "add", "buy", "order", "get", "put", "remove", "delete", "clear", "empty",
  "show", "view", "check", "find", "search", "update", "change", "set", "checkout",
  "substitute", "alternative", "recommend", "recommendations", "restock",
  "filter", "reset", "toggle", "scroll", "cart", "drawer", "handsfree", "theme",
  "organic", "vegan", "gluten-free", "keto",

  // Categories
  ...CATEGORIES.map(c => c.toLowerCase()),

  // Products and tokens
  ...PRODUCT_CATALOG.flatMap(p => [
    p.name.toLowerCase(),
    p.brand?.toLowerCase(),
    ...p.name.toLowerCase().split(/\s+/),
    ...(p.substitutes || [])
  ]).filter(Boolean)
]);

/**
 * Finds the closest vocabulary match for a misspelled word using Levenshtein distance and Soundex.
 */
function findClosestVocabWord(word) {
  if (!word || word.length < 3 || /^\d+$/.test(word)) return word;
  const lower = word.toLowerCase();

  // 1. Never modify protected common English words
  if (PROTECTED_WORDS.has(lower)) {
    return word;
  }

  // 2. Direct dictionary check
  if (COMMON_MISHEARS_MAP[lower]) {
    return COMMON_MISHEARS_MAP[lower];
  }

  // 3. Already in vocabulary
  if (VOCABULARY.has(lower)) {
    return word;
  }

  const wordSoundex = getSoundex(lower);
  let bestMatch = word;
  let minDistance = Infinity;

  // Max allowable distance scales with word length (1 for short words, 2 for longer)
  const maxDistance = lower.length <= 4 ? 1 : 2;

  for (const vocabWord of VOCABULARY) {
    if (typeof vocabWord !== "string" || vocabWord.includes(" ")) continue;
    // Don't fuzzily replace unknown words with protected stop words (e.g. don't replace "and" with "add")
    if (PROTECTED_WORDS.has(vocabWord)) continue;
    if (Math.abs(vocabWord.length - lower.length) > maxDistance) continue;

    const dist = levenshteinDistance(lower, vocabWord);
    const sameSoundex = getSoundex(vocabWord) === wordSoundex;

    // Weight distance lower if phonetically identical
    const effectiveDist = sameSoundex ? dist - 0.5 : dist;

    if (dist <= maxDistance && effectiveDist < minDistance) {
      minDistance = effectiveDist;
      bestMatch = vocabWord;
    }
  }

  return minDistance <= maxDistance ? bestMatch : word;
}

/**
 * Intelligent Multi-Stage Autocorrection Engine
 * Corrects STT misspellings, multi-word phrases, and phonetic glitches while preserving quantities and commands.
 *
 * @param {string} rawTranscript - Input voice or text query
 * @returns {{ corrected: string, original: string, hasChanges: boolean, corrections: Array<{from: string, to: string}> }}
 */
export function autoCorrectTranscript(rawTranscript) {
  if (!rawTranscript || typeof rawTranscript !== "string") {
    return { corrected: rawTranscript || "", original: rawTranscript || "", hasChanges: false, corrections: [] };
  }

  let text = rawTranscript.trim();
  const original = text;
  const corrections = [];

  // Stage 1: Multi-word phrase replacements
  const MULTI_WORD_PHRASES = [
    { pattern: /\b(?:at\s+to\s+the\s+part|at\s+to\s+the\s+cart|add\s+to\s+the\s+part|to\s+the\s+part)\b/gi, replacement: "to the cart" },
    { pattern: /\bat\s+to\b/gi, replacement: "add to" },
    { pattern: /\btheam\b/gi, replacement: "theme" },
    { pattern: /\b(?:oat\s+malik|oat\s+milke|oat\s+mlk)\b/gi, replacement: "oat milk" },
    { pattern: /\b(?:almond\s+malik|almond\s+milke|almond\s+mlk)\b/gi, replacement: "almond milk" },
    { pattern: /\b(?:sour\s*dow\s+bread|sordough\s+bread|sourdow\s+bred|sour\s*dow|sourdow|sordow)\b/gi, replacement: "sourdough bread" },
    { pattern: /\b(?:cold\s*bru\s+coffe|cold\s*brew\s+coffe|coldbrew\s+coffe|cold\s*bru|coldbrew)\b/gi, replacement: "cold brew coffee" },
    { pattern: /\b(?:olive\s*oyl|olv\s*oil|olivoil|oliveoil)\b/gi, replacement: "olive oil" },
    { pattern: /\b(?:dish\s*sope|dish\s*soap)\b/gi, replacement: "dish soap" },
    { pattern: /\b(?:tooth\s*past|tooth\s*paste)\b/gi, replacement: "toothpaste" },
    { pattern: /\b(?:chek\s*out|check\s*out\s*now|chekout\s*now)\b/gi, replacement: "checkout" },
    { pattern: /\b(?:gluten\s*fre|gloten\s*free)\b/gi, replacement: "gluten-free" },
    { pattern: /\b(?:dark\s*choclate|dark\s*choclet)\b/gi, replacement: "dark chocolate" },
    { pattern: /\b(?:free\s*range\s*egs|pasture\s*egs)\b/gi, replacement: "free-range eggs" },
    { pattern: /\b(?:gala\s*appels|honey\s*crisp\s*appels)\b/gi, replacement: "gala apples" }
  ];

  for (const item of MULTI_WORD_PHRASES) {
    if (item.pattern.test(text)) {
      const prev = text;
      text = text.replace(item.pattern, item.replacement);
      if (prev !== text) {
        corrections.push({ from: prev, to: item.replacement });
      }
    }
  }

  // Stage 2: Token-level fuzzy dictionary & Levenshtein matching
  const tokens = text.split(/(\s+|[.,!?;:])/);
  const correctedTokens = tokens.map(token => {
    // Skip whitespace, punctuation, numbers, and very short tokens
    if (/^[\s.,!?;:]+$/.test(token) || /^\d+$/.test(token) || token.length < 3) {
      return token;
    }

    const corrected = findClosestVocabWord(token);
    if (corrected.toLowerCase() !== token.toLowerCase()) {
      corrections.push({ from: token, to: corrected });
      return corrected;
    }
    return token;
  });

  const correctedText = correctedTokens.join("").replace(/\s{2,}/g, " ").trim();
  const hasChanges = correctedText.toLowerCase() !== original.toLowerCase();

  if (hasChanges) {
    console.log(`[AutoCorrect] "${original}" → "${correctedText}" (${corrections.length} correction${corrections.length === 1 ? '' : 's'})`);
  }

  return {
    corrected: correctedText,
    original,
    hasChanges,
    corrections
  };
}
