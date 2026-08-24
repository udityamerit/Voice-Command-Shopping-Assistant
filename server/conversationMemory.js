// server/conversationMemory.js - Multi-Turn Conversational Memory & Context Tracker
// Maintains dialogue history, entity context, pronoun resolution, and conversational state across voice turns.

class ConversationMemoryManager {
  constructor(maxTurns = 15, ttlMs = 30 * 60 * 1000) {
    this.maxTurns = maxTurns; // Maintains up to 15 conversational turns
    this.ttlMs = ttlMs; // 30 mins session TTL
    this.sessions = new Map();
  }

  /**
   * Retrieves or initializes a session memory object.
   */
  getSession(sessionId = "default_session") {
    let session = this.sessions.get(sessionId);
    const now = Date.now();

    if (!session || (now - session.lastActivity > this.ttlMs)) {
      session = {
        sessionId,
        turns: [],
        context: {
          lastIntent: null,
          lastMentionedItem: null,
          lastMentionedItems: [],
          lastMentionedCategory: null,
          lastRecommendedItems: [],
          lastSearchResultCount: 0
        },
        createdAt: now,
        lastActivity: now
      };
      this.sessions.set(sessionId, session);
    } else {
      session.lastActivity = now;
    }

    return session;
  }

  /**
   * Adds a new dialogue turn (User + Assistant interaction) to memory.
   */
  addTurn(sessionId = "default_session", {
    userTranscript,
    intent,
    spokenFeedback,
    items = [],
    product = null,
    uiAction = null,
    recommendations = [],
    searchResults = []
  }) {
    const session = this.getSession(sessionId);

    // 1. Update Context Tracking
    session.context.lastIntent = intent;

    if (items && items.length > 0) {
      session.context.lastMentionedItem = items[items.length - 1];
      session.context.lastMentionedItems = items;
    } else if (product) {
      session.context.lastMentionedItem = product;
      session.context.lastMentionedItems = [product];
    } else if (searchResults && searchResults.length > 0) {
      session.context.lastMentionedItem = searchResults[0];
      session.context.lastMentionedItems = searchResults;
    }

    if (uiAction?.type === "SET_CATEGORY") {
      session.context.lastMentionedCategory = uiAction.payload;
    }

    if (recommendations && recommendations.length > 0) {
      session.context.lastRecommendedItems = recommendations.map(r => r.name || r);
    }

    if (searchResults && searchResults.length > 0) {
      session.context.lastSearchResultCount = searchResults.length;
    }

    // 2. Append User & Assistant message turns
    session.turns.push({
      role: "user",
      content: userTranscript,
      timestamp: Date.now()
    });

    session.turns.push({
      role: "assistant",
      content: spokenFeedback,
      intent,
      items: items.length > 0 ? items : (product ? [product] : []),
      uiAction,
      timestamp: Date.now()
    });

    // 3. Trim to sliding window (keeps up to maxTurns pairs)
    if (session.turns.length > this.maxTurns * 2) {
      session.turns = session.turns.slice(-this.maxTurns * 2);
    }

    session.lastActivity = Date.now();
    return session;
  }

  /**
   * Returns conversation history formatted for LLM messages array (default: last 5 conversations / 10 turns).
   */
  getHistoryForLLM(sessionId = "default_session", maxPairs = 5) {
    const session = this.getSession(sessionId);
    const turns = session.turns || [];
    const count = Math.min(turns.length, maxPairs * 2);
    const slice = turns.slice(-count);

    return slice.map(t => ({
      role: t.role,
      content: t.content
    }));
  }

  /**
   * Formats the last N conversational exchanges into a clean textual summary for LLM prompt context injection.
   */
  getRecentExchangesFormatted(sessionId = "default_session", count = 5) {
    const session = this.getSession(sessionId);
    const turns = session.turns || [];
    if (turns.length === 0) return "No previous conversation history in this session.";

    const pairs = [];
    for (let i = 0; i < turns.length; i += 2) {
      const userTurn = turns[i];
      const botTurn = turns[i + 1];
      if (userTurn && botTurn) {
        pairs.push({
          user: userTurn.content,
          bot: botTurn.content,
          intent: botTurn.intent
        });
      }
    }

    const recent = pairs.slice(-count);
    return recent.map((p, idx) => `${idx + 1}. User: "${p.user}" → VoiceCart AI: "${p.bot}" [Intent: ${p.intent || 'GENERAL'}]`).join("\n");
  }

  /**
   * Returns the entity context snapshot for pronoun and context resolution.
   */
  getContext(sessionId = "default_session") {
    const session = this.getSession(sessionId);
    return session.context;
  }

  /**
   * Clears the session dialogue history (e.g. on order checkout or reset).
   */
  clearSession(sessionId = "default_session") {
    const session = this.getSession(sessionId);
    session.turns = [];
    session.context = {
      lastIntent: null,
      lastMentionedItem: null,
      lastMentionedItems: [],
      lastMentionedCategory: null,
      lastRecommendedItems: [],
      lastSearchResultCount: 0
    };
    session.lastActivity = Date.now();
  }
}

export const ConversationMemory = new ConversationMemoryManager();
