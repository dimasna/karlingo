// LLM Service using OpenRouter with Gemini 2 Flash

import { languageSettings } from './panel.js';

const OPENROUTER_API_KEY = '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';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Conversation history for context
let conversationHistory = [];

// Language names for display
const languageNames = {
  en: 'English',
  es: 'Spanish',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  id: 'Indonesian',
  fr: 'French',
  de: 'German'
};

// Get system prompt based on language settings
function getSystemPrompt() {
  const nativeLang = languageNames[languageSettings.nativeLanguage] || 'English';
  const targetLang = languageNames[languageSettings.targetLanguage] || 'Japanese';
    console.log('Native Language:', nativeLang);
    console.log('Target Language:', targetLang);
  return `You are a friendly AI language practice partner named Robo. You help users practice ${targetLang}.

User's native language: ${nativeLang}
Language they're learning: ${targetLang}

Your role:
- Speak primarily in ${targetLang} with simple vocabulary
- If user ask for meaning or intent to translate use native language ${targetLang} to ${nativeLang} translation
- Correct mistakes gently and explain briefly
- Ask simple questions to encourage conversation
- Use common everyday phrases

IMPORTANT: Keep responses SHORT (1-2 sentences max). Be encouraging! ONLY response with ${targetLang} language`;
}

// Initialize conversation with system prompt
function initConversation() {
  conversationHistory = [
    { role: 'system', content: getSystemPrompt() }
  ];
}

// Send message to LLM and get response
export async function sendMessageToLLM(userMessage) {
  // Initialize if needed (or reinit if language changed)
  if (conversationHistory.length === 0) {
    initConversation();
  }

  // Add user message to history
  conversationHistory.push({
    role: 'user',
    content: userMessage
  });

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Language Practice Partner'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp:free',
        messages: conversationHistory,
        max_tokens: 100,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenRouter API error:', response.status, errorData);
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content || "Sorry, try again! 🤖";

    // Add assistant response to history
    conversationHistory.push({
      role: 'assistant',
      content: assistantMessage
    });

    // Keep conversation history manageable (last 10 exchanges)
    if (conversationHistory.length > 21) {
      conversationHistory = [
        conversationHistory[0], // Keep system prompt
        ...conversationHistory.slice(-20)
      ];
    }

    return assistantMessage;
  } catch (error) {
    console.error('LLM request failed:', error);
    return "Oops! Try again! 🔧";
  }
}

// Reset conversation (also updates system prompt with current language settings)
export function resetConversation() {
  initConversation();
}

// Get greeting message based on target language
export function getGreeting() {
  const targetLang = languageSettings.targetLanguage;
  const greetings = {
    en: "Hello! Let's practice! 👋",
    es: "¡Hola! ¡Practiquemos! 👋",
    zh: "你好！我们来练习吧！👋",
    ja: "こんにちは！練習しましょう！👋",
    ko: "안녕하세요! 연습해요! 👋",
    id: "Halo! Ayo berlatih! 👋",
    fr: "Bonjour! Pratiquons! 👋",
    de: "Hallo! Lass uns üben! 👋"
  };
  return greetings[targetLang] || greetings.en;
}
