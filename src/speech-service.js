// Speech-to-Text Service using Web Speech API

let recognition = null;
let isListening = false;
let onResultCallback = null;
let onStatusCallback = null;
let lastInterimTranscript = '';
let hasReceivedFinalResult = false;
let retryCount = 0;
const MAX_RETRIES = 2;

// Check if speech recognition is supported
export function isSpeechSupported() {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
}

// Initialize speech recognition
function initRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Speech recognition not supported');
    return null;
  }

  const rec = new SpeechRecognition();
  rec.continuous = false;
  rec.interimResults = true;
  rec.lang = 'en-US';
  rec.maxAlternatives = 1;

  rec.onstart = () => {
    isListening = true;
    lastInterimTranscript = '';
    hasReceivedFinalResult = false;
    retryCount = 0;
    console.log('Speech recognition started');
    if (onStatusCallback) {
      onStatusCallback({ type: 'start', message: '🎤 Listening...' });
    }
  };

  rec.onresult = (event) => {
    console.log('=== SPEECH ONRESULT EVENT ===');
    console.log('event.resultIndex:', event.resultIndex);
    console.log('event.results.length:', event.results.length);
    
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript;
      const confidence = result[0].confidence;
      const isFinal = result.isFinal;
      
      console.log(`Result[${i}]: "${transcript}" (final: ${isFinal}, confidence: ${confidence})`);
      
      if (isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    console.log('interimTranscript:', interimTranscript);
    console.log('finalTranscript:', finalTranscript);

    // Store interim for fallback
    if (interimTranscript) {
      lastInterimTranscript = interimTranscript;
      console.log('Stored lastInterimTranscript:', lastInterimTranscript);
      if (onStatusCallback) {
        onStatusCallback({ type: 'interim', message: `"${interimTranscript}"` });
      }
    }

    // Send final result immediately
    if (finalTranscript) {
      hasReceivedFinalResult = true;
      console.log('=== SENDING FINAL RESULT TO CALLBACK ===');
      console.log('finalTranscript:', finalTranscript);
      console.log('onResultCallback exists:', !!onResultCallback);
      if (onResultCallback) {
        onResultCallback(finalTranscript);
      }
    }
  };

  rec.onerror = (event) => {
    console.error('Speech recognition error:', event.error);

    let errorMessage = 'Speech error';
    let shouldRetry = false;

    switch (event.error) {
      case 'no-speech':
        errorMessage = 'No speech detected. Tap mic to try again!';
        break;
      case 'audio-capture':
        errorMessage = 'No microphone found';
        break;
      case 'not-allowed':
        errorMessage = 'Microphone access denied';
        break;
      case 'network':
        // Network error - try to retry
        if (retryCount < MAX_RETRIES) {
          shouldRetry = true;
          retryCount++;
          errorMessage = `Network issue, retrying... (${retryCount}/${MAX_RETRIES})`;
        } else {
          errorMessage = 'Network error. Check your connection and try again.';
        }
        break;
      case 'aborted':
        // User cancelled, not an error
        errorMessage = '';
        break;
      default:
        errorMessage = `Error: ${event.error}`;
    }

    if (errorMessage && onStatusCallback) {
      onStatusCallback({ type: shouldRetry ? 'interim' : 'error', message: errorMessage });
    }

    // Retry on network error
    if (shouldRetry) {
      isListening = false;
      setTimeout(() => {
        try {
          recognition = initRecognition();
          if (recognition) {
            recognition.start();
          }
        } catch (e) {
          console.error('Retry failed:', e);
          if (onStatusCallback) {
            onStatusCallback({ type: 'error', message: 'Failed to retry. Tap mic to try again.' });
          }
        }
      }, 500);
    } else {
      isListening = false;
    }
  };

  rec.onend = () => {
    // Only process if we're not retrying
    if (isListening || retryCount > 0) {
      isListening = false;
      console.log('Speech recognition ended, hasReceivedFinalResult:', hasReceivedFinalResult, 'lastInterim:', lastInterimTranscript);
      
      // If we have interim transcript but no final result, use the interim as final
      if (!hasReceivedFinalResult && lastInterimTranscript && onResultCallback) {
        console.log('Using interim transcript as final:', lastInterimTranscript);
        onResultCallback(lastInterimTranscript);
      }
      
      if (onStatusCallback) {
        onStatusCallback({ type: 'end', message: '' });
      }
      
      // Reset for next session
      lastInterimTranscript = '';
      hasReceivedFinalResult = false;
    }
  };

  return rec;
}

// Start listening
export function startListening(onResult, onStatus) {
  // Reset recognition
  if (recognition) {
    try {
      recognition.abort();
    } catch (e) {
      // Ignore
    }
    recognition = null;
  }
  
  onResultCallback = onResult;
  onStatusCallback = onStatus;
  lastInterimTranscript = '';
  hasReceivedFinalResult = false;
  retryCount = 0;
  isListening = false;

  recognition = initRecognition();
  if (!recognition) {
    if (onStatus) {
      onStatus({ type: 'error', message: 'Speech not supported in this browser' });
    }
    return false;
  }

  try {
    recognition.start();
    return true;
  } catch (error) {
    console.error('Failed to start speech recognition:', error);
    if (onStatus) {
      onStatus({ type: 'error', message: 'Failed to start listening. Tap mic to try again.' });
    }
    return false;
  }
}

// Stop listening
export function stopListening() {
  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {
      // Ignore
    }
  }
}

// Check if currently listening
export function getIsListening() {
  return isListening;
}
