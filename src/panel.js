import { createSystem, PanelUI, PanelDocument, eq, VisibilityState } from '@iwsdk/core';
import { searchYouTube, popularKaraokeSongs, getEmbedUrl } from './youtube-search.js';
import {
  addCardToDeck,
  getDueCards,
  reviewCard,
  saveReviewSession,
  getDeckStats,
  loadDecks
} from './deck-service.js';

// Load language settings from localStorage or use defaults
function loadLanguageSettings() {
  try {
    const saved = localStorage.getItem('languageSettings');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Failed to load language settings:', e);
  }
  return { nativeLanguage: 'en', targetLanguage: 'ja' };
}

// Save language settings to localStorage
function saveLanguageSettings() {
  try {
    localStorage.setItem('languageSettings', JSON.stringify(languageSettings));
  } catch (e) {
    console.warn('Failed to save language settings:', e);
  }
}

// Language settings - exported for use in translation
export const languageSettings = loadLanguageSettings();

// Language data
const languages = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'zh', name: 'Chinese', native: '中文' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' }
];

export class PanelSystem extends createSystem({
  welcomePanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/welcome.json')]
  },
  ktvPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/ktv-menu.json')]
  },
  translationPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/word-translation.json')]
  },
  settingsPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/settings.json')]
  },
  reviewPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/review-session.json')]
  }
}) {
  init() {
    // Welcome panel - shown before entering XR
    this.queries.welcomePanel.subscribe('qualify', (entity) => {
      const document = PanelDocument.data.document[entity.index];
      if (!document) return;

      const xrButton = document.getElementById('xr-button');
      xrButton.addEventListener('click', () => {
        if (this.world.visibilityState.value === VisibilityState.NonImmersive) {
          this.world.launchXR();
        } else {
          this.world.exitXR();
        }
      });


      this.world.visibilityState.subscribe((visibilityState) => {
        if (visibilityState === VisibilityState.NonImmersive) {
          xrButton.setProperties({ text: 'Enter XR' });
        } else {
          xrButton.setProperties({ text: 'Exit to Browser' });
        }
      });
    });

    // KTV Menu panel - shown when in XR
    this.queries.ktvPanel.subscribe('qualify', (entity) => {
      const document = PanelDocument.data.document[entity.index];
      if (!document) return;

      this.setupKTVPanel(document);
    });

    // Translation panel - shown when word is clicked
    this.queries.translationPanel.subscribe('qualify', (entity) => {
      const document = PanelDocument.data.document[entity.index];
      if (!document) return;

      this.setupTranslationPanel(document, entity);
    });

    // Settings panel - language selection
    this.queries.settingsPanel.subscribe('qualify', (entity) => {
      const document = PanelDocument.data.document[entity.index];
      if (!document) return;

      this.setupSettingsPanel(document, entity);
    });

    // Review session panel - spaced repetition
    this.queries.reviewPanel.subscribe('qualify', (entity) => {
      const document = PanelDocument.data.document[entity.index];
      if (!document) return;

      this.setupReviewPanel(document, entity);
    });
  }

  setupTranslationPanel(document, entity) {
    const closeBtn = document.getElementById('close-btn');
    const wordText = document.getElementById('word-text');
    const translationText = document.getElementById('translation-text');
    const phoneticText = document.getElementById('phonetic-text');
    const definitionText = document.getElementById('definition-text');
    const addDeckBtn = document.getElementById('add-deck-btn');
    const addedText = document.getElementById('added-text');

    // Current word data for adding to deck
    let currentWordData = null;

    // Close button
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        entity.object3D.visible = false;
      });
    }

    // Add to Deck button
    if (addDeckBtn) {
      addDeckBtn.addEventListener('click', () => {
        if (currentWordData && currentWordData.word && currentWordData.translation) {
          // Check if card already exists before adding
          const decks = loadDecks();
          const existingCard = decks.default?.cards?.find(c => c.word === currentWordData.word);
          
          if (existingCard) {
            // Card already exists
            addDeckBtn.setProperties({ text: '✓ Already Added' });
            addDeckBtn.setProperties({ class: 'add-deck-btn add-deck-btn-disabled' });
            
            // Reset after 3 seconds
            setTimeout(() => {
              addDeckBtn.setProperties({ text: 'Add to Deck' });
              addDeckBtn.setProperties({ class: 'add-deck-btn' });
            }, 3000);
          } else {
            // Add new card
            addCardToDeck('default', {
              word: currentWordData.word,
              translation: currentWordData.translation,
              phonetic: currentWordData.phonetic || '',
              targetLanguage: languageSettings.targetLanguage,
              nativeLanguage: languageSettings.nativeLanguage
            });

            // Update button to show added state
            addDeckBtn.setProperties({ text: '✓ Added' });
            addDeckBtn.setProperties({ class: 'add-deck-btn add-deck-btn-disabled' });

            // Reset after 3 seconds
            setTimeout(() => {
              addDeckBtn.setProperties({ text: 'Add to Deck' });
              addDeckBtn.setProperties({ class: 'add-deck-btn' });
            }, 3000);

            // Get updated deck stats
            const stats = getDeckStats('default');
            const cardCount = stats ? stats.total : 1;

            // Dispatch event for other systems to react
            this.world.scene.dispatchEvent({
              type: 'cardAddedToDeck',
              word: currentWordData.word,
              deckSize: cardCount
            });

            console.log('Card added to deck:', currentWordData.word, '- Total cards:', cardCount);
          }
        } else {
          if (addedText) {
            addedText.setProperties({ text: 'No word to add' });
            setTimeout(() => {
              addedText.setProperties({ text: '' });
            }, 2000);
          }
        }
      });
    }

    // Listen for translation events
    this.world.scene.addEventListener('translateWord', (event) => {
      // Show panel
      entity.object3D.visible = true;

      if (event.loading) {
        currentWordData = null;
        if (wordText) wordText.setProperties({ text: event.word });
        if (translationText) translationText.setProperties({ text: 'Translating...' });
        if (phoneticText) phoneticText.setProperties({ text: '' });
        if (definitionText) definitionText.setProperties({ text: `${languageSettings.targetLanguage} → ${languageSettings.nativeLanguage}` });
        if (addedText) addedText.setProperties({ text: '' });
      } else {
        currentWordData = {
          word: event.word,
          translation: event.translation || event.word,
          phonetic: event.phonetic || ''
        };
        if (wordText) wordText.setProperties({ text: event.word });
        if (translationText) translationText.setProperties({ text: event.translation || event.word });
        if (phoneticText) phoneticText.setProperties({ text: event.phonetic || '' });
        if (definitionText) definitionText.setProperties({ text: event.definition || 'No definition found' });
      }
    });
  }

  setupKTVPanel(document) {
    const videoBtn = document.getElementById('video-btn');
    const exitBtn = document.getElementById('exit-btn');
    const searchPanel = document.getElementById('search-panel');
    const menuContainer = document.getElementById('menu-container');
    const backBtn = document.getElementById('back-btn');
    const searchBtn = document.getElementById('search-btn');
    const searchInput = document.getElementById('search-input');
    const resultsLabel = document.getElementById('results-label');
    const resultsCount = document.getElementById('results-count');
    const nowPlaying = document.getElementById('now-playing');
    const nowPlayingTitle = document.getElementById('now-playing-title');
    const stopBtn = document.getElementById('stop-btn');

    // Store video data for click handlers
    this.videoData = [...popularKaraokeSongs];

    // Setup click handlers for video items
    this.setupVideoItems(document, nowPlaying, nowPlayingTitle);

    // Pick a Song button - show search panel
    if (videoBtn) {
      videoBtn.addEventListener('click', () => {
        if (searchPanel) searchPanel.setProperties({ display: 'flex' });
        if (menuContainer) menuContainer.setProperties({ display: 'none' });
      });
    }

    // Settings button - dispatch event to show settings panel
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        this.world.scene.dispatchEvent({ type: 'showSettings' });
      });
    }

    // Back button - return to main menu
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (searchPanel) searchPanel.setProperties({ display: 'none' });
        if (menuContainer) menuContainer.setProperties({ display: 'flex' });
      });
    }

    // Search button
    if (searchBtn && searchInput) {
      console.log('Search button and input found, setting up click handler');
      searchBtn.addEventListener('click', async () => {
        console.log('Search button clicked!');
        
        // Blur the input field to remove focus
        if (searchInput.element && searchInput.element.blur) {
          searchInput.element.blur();
        } else if (searchInput.blur) {
          searchInput.blur();
        }
        
        // Access the input value from the underlying HTML element or currentSignal
        let query = '';
        if (searchInput.element) {
          query = searchInput.element.value || '';
        } else if (searchInput.currentSignal) {
          query = searchInput.currentSignal.value || '';
        } else if (searchInput.properties?.value) {
          query = searchInput.properties.value;
        } else {
          query = searchInput.value || '';
        }
        
        console.log('Search query:', query);
        
        if (query.trim()) {
          if (resultsLabel) resultsLabel.setProperties({ text: 'Searching...' });
          if (resultsCount) resultsCount.setProperties({ text: '' });

          try {
            console.log('Calling searchYouTube with query:', query.trim());
            const results = await searchYouTube(query.trim());
            console.log('Search results:', results);
            
            this.videoData = results;
            if (resultsLabel) resultsLabel.setProperties({ text: `Results for "${query}"` });
            if (resultsCount) resultsCount.setProperties({ text: `${results.length} found` });
            this.updateVideoItems(document, results);
          } catch (error) {
            console.error('Search failed:', error);
            if (resultsLabel) resultsLabel.setProperties({ text: 'Search failed - check console' });
            if (resultsCount) resultsCount.setProperties({ text: error.message });
          }
        } else {
          console.log('Empty search query');
          if (resultsLabel) resultsLabel.setProperties({ text: 'Please enter a search term' });
        }
      });
    } else {
      console.error('Search button or input not found!', { searchBtn, searchInput });
    }

    // Stop button
    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        if (nowPlaying) nowPlaying.setProperties({ display: 'none' });
        this.world.scene.dispatchEvent({ type: 'videoStop' });
      });
    }

    // Exit to browser button
    if (exitBtn) {
      exitBtn.addEventListener('click', () => {
        this.world.exitXR();
      });
    }
  }

  setupVideoItems(document, nowPlaying, nowPlayingTitle) {
    for (let i = 1; i <= 4; i++) {
      const videoItem = document.getElementById(`video-${i}`);
      if (videoItem) {
        videoItem.addEventListener('click', () => {
          const video = this.videoData[i - 1];
          if (video) {
            this.playVideo(video, nowPlaying, nowPlayingTitle);
          }
        });
      }
    }
  }

  updateVideoItems(document, videos) {
    console.log('Updating video items with', videos.length, 'videos');
    
    for (let i = 1; i <= 4; i++) {
      const videoItem = document.getElementById(`video-${i}`);
      if (videoItem && videos[i - 1]) {
        const video = videos[i - 1];
        console.log(`Updating video-${i}:`, video.title);
        
        // Update the video item text - find child spans
        // Structure: video-item > video-title (span with icon + text) > [svg, text]
        const titleSpan = videoItem.children?.[0];
        const metaSpan = videoItem.children?.[1];
        if (titleSpan) {
          // The title span contains an inline icon and text
          // We need to update just the text portion after the icon
          const textChild = titleSpan.children?.[1];
          if (textChild) {
            textChild.setProperties({ text: ` ${video.title}` });
          } else {
            // Fallback: update the whole span text (icon will be lost)
            titleSpan.setProperties({ text: video.title });
          }
        }
        if (metaSpan) {
          metaSpan.setProperties({ text: `${video.channel} • ${video.duration}` });
        }
      }
    }

    // Dispatch event with all results
    this.world.scene.dispatchEvent({
      type: 'videoSearchResults',
      videos: videos
    });
  }

  playVideo(video, nowPlaying, nowPlayingTitle) {
    console.log('Playing video:', video);

    // Skip placeholder items (popular songs prompts)
    if (!video || video.id === 'search') {
      console.log('Placeholder item clicked - please search for a song');
      return;
    }

    if (nowPlaying) nowPlaying.setProperties({ display: 'flex' });
    if (nowPlayingTitle) nowPlayingTitle.setProperties({ text: video.title });

    this.world.scene.dispatchEvent({
      type: 'videoPlay',
      video: video,
      embedUrl: getEmbedUrl(video.id)
    });
  }

  setupSettingsPanel(document, entity) {
    const closeBtn = document.getElementById('close-btn');
    const backBtn = document.getElementById('back-btn');

    // Native language elements
    const nativeName = document.getElementById('native-name');
    const nativeNative = document.getElementById('native-native');
    const nativePrev = document.getElementById('native-prev');
    const nativeNext = document.getElementById('native-next');

    // Target language elements
    const targetName = document.getElementById('target-name');
    const targetNative = document.getElementById('target-native');
    const targetPrev = document.getElementById('target-prev');
    const targetNext = document.getElementById('target-next');

    // Track current indices (from saved settings)
    let nativeIndex = languages.findIndex((l) => l.code === languageSettings.nativeLanguage);
    let targetIndex = languages.findIndex((l) => l.code === languageSettings.targetLanguage);
    if (nativeIndex < 0) nativeIndex = 0;
    if (targetIndex < 0) targetIndex = 3; // default to Japanese

    // Initialize display with saved settings
    this.updateLanguageDisplay(nativeName, nativeNative, languages[nativeIndex]);
    this.updateLanguageDisplay(targetName, targetNative, languages[targetIndex]);

    // Close/back buttons
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        entity.object3D.visible = false;
      });
    }
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        entity.object3D.visible = false;
      });
    }

    // Listen for show settings event
    this.world.scene.addEventListener('showSettings', () => {
      entity.object3D.visible = true;
    });

    // Native language navigation
    if (nativePrev) {
      nativePrev.addEventListener('click', () => {
        nativeIndex = (nativeIndex - 1 + languages.length) % languages.length;
        this.updateLanguageDisplay(nativeName, nativeNative, languages[nativeIndex]);
        languageSettings.nativeLanguage = languages[nativeIndex].code;
        this.dispatchLanguageChange();
      });
    }
    if (nativeNext) {
      nativeNext.addEventListener('click', () => {
        nativeIndex = (nativeIndex + 1) % languages.length;
        this.updateLanguageDisplay(nativeName, nativeNative, languages[nativeIndex]);
        languageSettings.nativeLanguage = languages[nativeIndex].code;
        this.dispatchLanguageChange();
      });
    }

    // Target language navigation
    if (targetPrev) {
      targetPrev.addEventListener('click', () => {
        targetIndex = (targetIndex - 1 + languages.length) % languages.length;
        this.updateLanguageDisplay(targetName, targetNative, languages[targetIndex]);
        languageSettings.targetLanguage = languages[targetIndex].code;
        this.dispatchLanguageChange();
      });
    }
    if (targetNext) {
      targetNext.addEventListener('click', () => {
        targetIndex = (targetIndex + 1) % languages.length;
        this.updateLanguageDisplay(targetName, targetNative, languages[targetIndex]);
        languageSettings.targetLanguage = languages[targetIndex].code;
        this.dispatchLanguageChange();
      });
    }
  }

  updateLanguageDisplay(nameEl, nativeEl, lang) {
    if (nameEl) nameEl.setProperties({ text: lang.name });
    if (nativeEl) nativeEl.setProperties({ text: lang.native });
  }

  dispatchLanguageChange() {
    saveLanguageSettings();
    this.world.scene.dispatchEvent({
      type: 'languageChanged',
      nativeLanguage: languageSettings.nativeLanguage,
      targetLanguage: languageSettings.targetLanguage
    });
    console.log('Language settings saved:', languageSettings);
  }

  setupReviewPanel(document, entity) {
    const closeBtn = document.getElementById('close-btn');
    const startBtn = document.getElementById('start-btn');
    const showBtn = document.getElementById('show-btn');
    const startContainer = document.getElementById('start-container');
    const cardContainer = document.getElementById('card-container');
    const showContainer = document.getElementById('show-container');
    const ratingContainer = document.getElementById('rating-container');
    const completeContainer = document.getElementById('complete-container');
    const progressText = document.getElementById('progress-text');
    const emptyText = document.getElementById('empty-text');

    // Stats elements
    const statDue = document.getElementById('stat-due');
    const statReviewed = document.getElementById('stat-reviewed');
    const statCorrect = document.getElementById('stat-correct');

    // Card elements
    const cardWord = document.getElementById('card-word');
    const cardTranslation = document.getElementById('card-translation');
    const cardPhonetic = document.getElementById('card-phonetic');
    const cardHint = document.getElementById('card-hint');
    const completeStats = document.getElementById('complete-stats');

    // Rating buttons
    const btnAgain = document.getElementById('btn-again');
    const btnHard = document.getElementById('btn-hard');
    const btnGood = document.getElementById('btn-good');
    const btnEasy = document.getElementById('btn-easy');

    // Session state
    let dueCards = [];
    let currentIndex = 0;
    let reviewed = 0;
    let correct = 0;
    let sessionStartTime = 0;

    const updateStats = () => {
      if (statDue) statDue.setProperties({ text: String(dueCards.length - currentIndex) });
      if (statReviewed) statReviewed.setProperties({ text: String(reviewed) });
      if (statCorrect) statCorrect.setProperties({ text: String(correct) });
    };

    const showCard = () => {
      if (currentIndex >= dueCards.length) {
        // Session complete
        if (cardContainer) cardContainer.setProperties({ display: 'none' });
        if (showContainer) showContainer.setProperties({ display: 'none' });
        if (ratingContainer) ratingContainer.setProperties({ display: 'none' });
        if (progressText) progressText.setProperties({ display: 'none' });
        if (completeContainer) completeContainer.setProperties({ display: 'flex' });
        if (completeStats) completeStats.setProperties({ text: `You reviewed ${reviewed} cards with ${correct} correct` });

        // Save session
        saveReviewSession({
          deckId: 'default',
          cardsReviewed: reviewed,
          correctCount: correct,
          duration: Date.now() - sessionStartTime
        });

        return;
      }

      const card = dueCards[currentIndex];
      if (cardWord) cardWord.setProperties({ text: card.word });
      if (cardTranslation) cardTranslation.setProperties({ display: 'none' });
      if (cardPhonetic) cardPhonetic.setProperties({ display: 'none' });
      if (cardHint) cardHint.setProperties({ display: 'flex', text: 'Tap to reveal answer' });
      if (showContainer) showContainer.setProperties({ display: 'flex' });
      if (ratingContainer) ratingContainer.setProperties({ display: 'none' });
      if (progressText) progressText.setProperties({ display: 'flex', text: `Card ${currentIndex + 1} of ${dueCards.length}` });

      updateStats();
    };

    const revealAnswer = () => {
      const card = dueCards[currentIndex];
      if (cardTranslation) cardTranslation.setProperties({ display: 'flex', text: card.translation });
      if (cardPhonetic && card.phonetic) cardPhonetic.setProperties({ display: 'flex', text: card.phonetic });
      if (cardHint) cardHint.setProperties({ display: 'none' });
      if (showContainer) showContainer.setProperties({ display: 'none' });
      if (ratingContainer) ratingContainer.setProperties({ display: 'flex' });
    };

    const rateCard = (quality) => {
      const card = dueCards[currentIndex];
      reviewCard('default', card.id, quality);
      reviewed++;
      if (quality >= 3) correct++;
      currentIndex++;
      showCard();
    };

    // Close button
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        entity.object3D.visible = false;
      });
    }

    // Start button
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        dueCards = getDueCards('default');
        currentIndex = 0;
        reviewed = 0;
        correct = 0;
        sessionStartTime = Date.now();

        if (dueCards.length === 0) {
          if (emptyText) emptyText.setProperties({ display: 'flex' });
          return;
        }

        if (emptyText) emptyText.setProperties({ display: 'none' });
        if (startContainer) startContainer.setProperties({ display: 'none' });
        if (cardContainer) cardContainer.setProperties({ display: 'flex' });
        if (completeContainer) completeContainer.setProperties({ display: 'none' });

        showCard();
      });
    }

    // Show answer button
    if (showBtn) {
      showBtn.addEventListener('click', revealAnswer);
    }

    // Rating buttons (SM-2 quality: 0=Again, 2=Hard, 3=Good, 5=Easy)
    if (btnAgain) btnAgain.addEventListener('click', () => rateCard(0));
    if (btnHard) btnHard.addEventListener('click', () => rateCard(2));
    if (btnGood) btnGood.addEventListener('click', () => rateCard(3));
    if (btnEasy) btnEasy.addEventListener('click', () => rateCard(5));

    // Listen for show review panel event
    this.world.scene.addEventListener('showReview', () => {
      entity.object3D.visible = true;
      // Reset to start state
      if (startContainer) startContainer.setProperties({ display: 'flex' });
      if (cardContainer) cardContainer.setProperties({ display: 'none' });
      if (completeContainer) completeContainer.setProperties({ display: 'none' });
      if (emptyText) emptyText.setProperties({ display: 'none' });

      // Update initial stats
      const stats = getDeckStats('default');
      if (stats && statDue) statDue.setProperties({ text: String(stats.due) });
    });

    // Initialize stats
    const stats = getDeckStats('default');
    if (stats && statDue) statDue.setProperties({ text: String(stats.due) });
  }

}
