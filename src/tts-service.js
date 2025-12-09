// Text-to-Speech Service using Web Speech API

import { languageSettings } from './panel.js';

let isSpeaking = false;
let currentUtterance = null;

// Language code to BCP 47 locale mapping
const langToLocale = {
  en: 'en',
  es: 'es',
  zh: 'zh',
  ja: 'ja',
  ko: 'ko',
  id: 'id',
  fr: 'fr',
  de: 'de'
};

// Check if TTS is supported
export function isTTSSupported() {
  return 'speechSynthesis' in window;
}

// Find best voice for target language
function findVoiceForLanguage(voices, langCode) {
  const locale = langToLocale[langCode] || 'en';
  console.log("locale", locale)
  // Prefer Google or high-quality voices for the target language
  const preferredVoice = voices.find(v => 
    v.lang.startsWith(locale) && (v.name.includes('Google') || v.name.includes('Premium') || v.name.includes('Enhanced'))
  ) || voices.find(v => v.lang.startsWith(locale));
  
  return preferredVoice;
}

// Speak text with voice matching target language
export function speak(text, onEnd = null) {
  if (!isTTSSupported()) {
    console.warn('Text-to-speech not supported');
    if (onEnd) onEnd();
    return;
  }

  // Cancel any ongoing speech
  stop();

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Configure voice settings
  utterance.rate = 1.0;      // Speed (0.1 to 10)
  utterance.pitch = 1.1;     // Pitch (0 to 2)
  utterance.volume = 1.0;    // Volume (0 to 1)
  
  // Find voice for target language
  const voices = speechSynthesis.getVoices();
  const targetLang = languageSettings.targetLanguage;
  const preferredVoice = findVoiceForLanguage(voices, targetLang) || voices[0];
  
  if (preferredVoice) {
    utterance.voice = preferredVoice;
    console.log(`TTS using voice: ${preferredVoice.name} (${preferredVoice.lang}) for target: ${targetLang}`);
  }

  utterance.onstart = () => {
    isSpeaking = true;
    console.log('TTS started:', text.substring(0, 50) + '...');
  };

  utterance.onend = () => {
    isSpeaking = false;
    currentUtterance = null;
    console.log('TTS ended');
    if (onEnd) onEnd();
  };

  utterance.onerror = (event) => {
    console.error('TTS error:', event.error);
    isSpeaking = false;
    currentUtterance = null;
    if (onEnd) onEnd();
  };

  currentUtterance = utterance;
  speechSynthesis.speak(utterance);
}

// Stop speaking
export function stop() {
  if (speechSynthesis) {
    speechSynthesis.cancel();
  }
  isSpeaking = false;
  currentUtterance = null;
}

// Check if currently speaking
export function getIsSpeaking() {
  return isSpeaking;
}

// Initialize voices (needed for some browsers)
export function initVoices() {
  if (isTTSSupported()) {
    // Voices may load asynchronously
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => {
      console.log('TTS voices loaded:', speechSynthesis.getVoices().length);
    };
  }
}
