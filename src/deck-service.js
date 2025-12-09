// Deck Service - Manages flashcard decks and spaced repetition data in localStorage

const DECKS_KEY = 'flashcard_decks';
const REVIEW_SESSIONS_KEY = 'review_sessions';

// SM-2 Algorithm constants
const MIN_EASE_FACTOR = 1.3;
const DEFAULT_EASE_FACTOR = 2.5;

// Load decks from localStorage
export function loadDecks() {
  try {
    const saved = localStorage.getItem(DECKS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Failed to load decks:', e);
  }
  return { default: { name: 'My Vocabulary', cards: [] } };
}

// Save decks to localStorage
export function saveDecks(decks) {
  try {
    localStorage.setItem(DECKS_KEY, JSON.stringify(decks));
  } catch (e) {
    console.warn('Failed to save decks:', e);
  }
}

// Add a card to a deck
export function addCardToDeck(deckId, card) {
  const decks = loadDecks();
  if (!decks[deckId]) {
    decks[deckId] = { name: deckId, cards: [] };
  }
  
  // Check if card already exists (by word)
  const existingIndex = decks[deckId].cards.findIndex(c => c.word === card.word);
  if (existingIndex >= 0) {
    // Update existing card
    decks[deckId].cards[existingIndex] = {
      ...decks[deckId].cards[existingIndex],
      ...card,
      updatedAt: Date.now()
    };
  } else {
    // Add new card with SM-2 initial values
    decks[deckId].cards.push({
      ...card,
      id: Date.now().toString(),
      createdAt: Date.now(),
      // SM-2 fields
      easeFactor: DEFAULT_EASE_FACTOR,
      interval: 0,
      repetitions: 0,
      nextReview: Date.now()
    });
  }
  
  saveDecks(decks);
  return decks;
}

// Remove a card from a deck
export function removeCardFromDeck(deckId, cardId) {
  const decks = loadDecks();
  if (decks[deckId]) {
    decks[deckId].cards = decks[deckId].cards.filter(c => c.id !== cardId);
    saveDecks(decks);
  }
  return decks;
}

// Get cards due for review
export function getDueCards(deckId) {
  const decks = loadDecks();
  if (!decks[deckId]) return [];
  
  const now = Date.now();
  return decks[deckId].cards.filter(card => card.nextReview <= now);
}

// Get all cards in a deck
export function getDeckCards(deckId) {
  const decks = loadDecks();
  return decks[deckId]?.cards || [];
}

// SM-2 Algorithm: Update card after review
// quality: 0-5 (0-2 = fail, 3-5 = pass)
export function reviewCard(deckId, cardId, quality) {
  const decks = loadDecks();
  if (!decks[deckId]) return null;
  
  const cardIndex = decks[deckId].cards.findIndex(c => c.id === cardId);
  if (cardIndex < 0) return null;
  
  const card = decks[deckId].cards[cardIndex];
  
  // SM-2 Algorithm
  if (quality < 3) {
    // Failed - reset
    card.repetitions = 0;
    card.interval = 0;
  } else {
    // Passed
    if (card.repetitions === 0) {
      card.interval = 1; // 1 day
    } else if (card.repetitions === 1) {
      card.interval = 6; // 6 days
    } else {
      card.interval = Math.round(card.interval * card.easeFactor);
    }
    card.repetitions++;
  }
  
  // Update ease factor
  card.easeFactor = Math.max(
    MIN_EASE_FACTOR,
    card.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );
  
  // Set next review date
  card.nextReview = Date.now() + card.interval * 24 * 60 * 60 * 1000;
  card.lastReviewed = Date.now();
  
  decks[deckId].cards[cardIndex] = card;
  saveDecks(decks);
  
  return card;
}

// Load review sessions
export function loadReviewSessions() {
  try {
    const saved = localStorage.getItem(REVIEW_SESSIONS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Failed to load review sessions:', e);
  }
  return [];
}

// Save a review session
export function saveReviewSession(session) {
  const sessions = loadReviewSessions();
  sessions.push({
    ...session,
    id: Date.now().toString(),
    timestamp: Date.now()
  });
  
  // Keep only last 100 sessions
  if (sessions.length > 100) {
    sessions.splice(0, sessions.length - 100);
  }
  
  try {
    localStorage.setItem(REVIEW_SESSIONS_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.warn('Failed to save review session:', e);
  }
  
  return sessions;
}

// Get deck statistics
export function getDeckStats(deckId) {
  const decks = loadDecks();
  if (!decks[deckId]) return null;
  
  const cards = decks[deckId].cards;
  const now = Date.now();
  const dueCards = cards.filter(c => c.nextReview <= now);
  const masteredCards = cards.filter(c => c.repetitions >= 5);
  
  return {
    total: cards.length,
    due: dueCards.length,
    mastered: masteredCards.length,
    learning: cards.length - masteredCards.length
  };
}

// Get all deck names
export function getDeckNames() {
  const decks = loadDecks();
  return Object.keys(decks).map(id => ({
    id,
    name: decks[id].name,
    cardCount: decks[id].cards.length
  }));
}

// Create a new deck
export function createDeck(name) {
  const decks = loadDecks();
  const id = name.toLowerCase().replace(/\s+/g, '_');
  if (!decks[id]) {
    decks[id] = { name, cards: [] };
    saveDecks(decks);
  }
  return id;
}
