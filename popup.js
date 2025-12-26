// Popup script for handling UI interactions
// Constants and logger are loaded via script tags in popup.html

let currentTab = 'highlights';
let highlightedWords = [];
let reviewWords = [];
let currentReviewIndex = 0;
let wordFilterMode = 'current'; // 'all' or 'current' - default is 'current'
let currentPageUrl = null;

// Load wordFilterMode from storage
function loadWordFilterMode() {
  chrome.storage.local.get(['wordFilterMode'], (result) => {
    if (result.wordFilterMode) {
      wordFilterMode = result.wordFilterMode;
    }
    updateFilterButtons();
  });
}

// Save wordFilterMode to storage
function saveWordFilterMode(mode) {
  wordFilterMode = mode;
  chrome.storage.local.set({wordFilterMode: mode});
  updateFilterButtons();
}

// Flashcard variables
let flashcardWords = [];
let currentFlashcardIndex = 0;
let flashcardMode = FLASHCARD_MODES.WORD; // Use constant instead of 'word'
let flashcardStats = { total: 0, current: 0, knew: 0 };
let isPlayingWordAudio = false;
let isPlayingExampleAudio = false;
let currentWordAudioElement = null;
let currentExampleAudioElement = null;

// State persistence functions
function saveReviewState() {
  chrome.storage.local.set({
    reviewState: {
      words: reviewWords,
      currentIndex: currentReviewIndex,
      timestamp: Date.now()
    }
  });
}

function loadReviewState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['reviewState'], (result) => {
      if (result.reviewState && result.reviewState.words && result.reviewState.words.length > 0) {
        // Check if state is not too old (within 1 day)
        const stateAge = Date.now() - (result.reviewState.timestamp || 0);
        const maxAge = 24 * 60 * 60 * 1000; // 1 day
        
        if (stateAge < maxAge) {
          reviewWords = result.reviewState.words;
          currentReviewIndex = result.reviewState.currentIndex || 0;
          resolve(true); // State restored
          return;
        }
      }
      resolve(false); // No valid state
    });
  });
}

function clearReviewState() {
  chrome.storage.local.remove(['reviewState']);
}

function saveFlashcardState() {
  chrome.storage.local.set({
    flashcardState: {
      words: flashcardWords,
      currentIndex: currentFlashcardIndex,
      mode: flashcardMode,
      stats: flashcardStats,
      timestamp: Date.now()
    }
  });
}

function loadFlashcardState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['flashcardState'], (result) => {
      if (result.flashcardState && result.flashcardState.words && result.flashcardState.words.length > 0) {
        // Check if state is not too old (within 1 day)
        const stateAge = Date.now() - (result.flashcardState.timestamp || 0);
        const maxAge = 24 * 60 * 60 * 1000; // 1 day
        
        if (stateAge < maxAge) {
          flashcardWords = result.flashcardState.words;
          currentFlashcardIndex = result.flashcardState.currentIndex || 0;
          flashcardMode = result.flashcardState.mode || FLASHCARD_MODES.WORD;
          flashcardStats = result.flashcardState.stats || { total: 0, current: 0, knew: 0 };
          resolve(true); // State restored
          return;
        }
      }
      resolve(false); // No valid state
    });
  });
}

function clearFlashcardState() {
  chrome.storage.local.remove(['flashcardState']);
}

// Loading indicator helper functions
function showLoadingIndicator(containerId, message = 'Đang tải...') {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <div class="loading-text">${message}</div>
      </div>
    `;
  }
}

function hideLoadingIndicator(containerId) {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = '';
  }
}

function showProgressBar(containerId, current, total, message = 'Đang xử lý...') {
  const container = document.getElementById(containerId);
  if (container) {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    container.innerHTML = `
      <div class="loading-container">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${percent}%"></div>
        </div>
        <div class="loading-text">${message} ${percent}% (${current}/${total})</div>
      </div>
    `;
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  // Wait a bit to ensure all elements are loaded
  setTimeout(() => {
  initializeTabs();
  initializeColorPicker();
  initializeControls();
  initializeWordList();
  initializeReview();
  initializeFlashcard();
  loadWords();
    
    // Listen for word deletion from content script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'wordDeleted') {
        loadWords(); // Refresh word list
      } else if (request.action === 'logToGoogleSheets') {
        // Handle Google Sheets logging from background script
        handleGoogleSheetsLogging(request, sendResponse);
        return true; // Keep message channel open for async response
      }
    });
  }, 50);
});

function initializeTabs() {
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      
      tab.classList.add('active');
      document.getElementById(tabName).classList.add('active');
      
      currentTab = tabName;
      
      if (tabName === 'highlights') {
        // Get current page URL and load words when switching to highlights tab
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs[0]) {
            currentPageUrl = tabs[0].url;
          }
          loadWords();
        });
      } else if (tabName === 'review') {
        // Try to restore state first
        loadReviewState().then((restored) => {
          if (restored) {
            // State restored, display all words (same as when first loaded)
            displayReviewWords(reviewWords);
          } else {
            // No state, load new words
            loadReviewWords();
          }
        });
      } else if (tabName === 'flashcard') {
        initializeFlashcard();
        // Try to restore state first
        loadFlashcardState().then((restored) => {
          if (restored) {
            // State restored, update mode buttons first
            updateFlashcardModeButtons();
            // Then show current card
            displayFlashcard();
            const knewBtn = document.getElementById('flashcardKnew');
            const didntKnowBtn = document.getElementById('flashcardDidntKnow');
            if (knewBtn) knewBtn.style.display = 'inline-block';
            if (didntKnowBtn) didntKnowBtn.style.display = 'inline-block';
            const startBtn = document.getElementById('startFlashcard');
            if (startBtn) startBtn.style.display = 'none';
          } else {
            // No state, load new words
            loadFlashcardWords();
          }
        });
      } else if (tabName === 'settings') {
        // Load settings when switching to settings tab
        loadSettings();
      }
    });
  });
  
  // Close button
  document.getElementById('closeBtn').addEventListener('click', () => {
    window.close();
  });
}

function initializeColorPicker() {
  const currentColor = document.getElementById('currentColor');
  const colorOptions = document.querySelectorAll('.color-option');
  
  colorOptions.forEach(option => {
    option.addEventListener('click', () => {
      const color = option.dataset.color;
      
      // Update current color display
      currentColor.style.backgroundColor = color;
      
      // Update selected option
      colorOptions.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      
      // Send color to content script
      sendMessageToContentScript({
            action: 'setHighlightColor',
            color: color
      }, (response, error) => {
        if (error) {
          logger.log('Content script not available for color update');
        }
      });
    });
  });
  
  // Load saved color
  chrome.storage.local.get(['highlightColor'], (result) => {
    if (result.highlightColor) {
      currentColor.style.backgroundColor = result.highlightColor;
      colorOptions.forEach(option => {
        if (option.dataset.color === result.highlightColor) {
          option.classList.add('selected');
        } else {
          option.classList.remove('selected');
        }
      });
    }
  });
}

function initializeControls() {
  // Initialize default settings only if not already set
  initializeDefaultSettingsIfNeeded();
  
  // Then load current settings
  loadSettings();
  
  
  // Save shortcut button
  const saveShortcutBtn = document.getElementById('saveShortcut');
  if (saveShortcutBtn) {
    saveShortcutBtn.addEventListener('click', () => {
      const modifier = document.getElementById('modifierKey').value;
      const key = document.getElementById('shortcutKey').value.toLowerCase();
      
      if (!key) {
        showNotification('Vui lòng nhập phím tắt', 'error');
        return;
      }
      
      const settings = {modifier: modifier, key: key};
      chrome.storage.local.set({shortcutSettings: settings}, () => {
        updateShortcutStatus(modifier, key);
        showNotification('Đã lưu phím tắt mới!');
        
        // Send new shortcut to content script
        sendMessageToContentScript({
          action: 'updateShortcut',
          shortcut: settings
        }, (response, error) => {
          if (error) {
            logger.log('Content script not available for shortcut update');
          }
        });
      });
    });
  }
  
  // Save word count button
  const saveWordCountBtn = document.getElementById('saveWordCount');
  if (saveWordCountBtn) {
    saveWordCountBtn.addEventListener('click', () => {
      const count = parseInt(document.getElementById('wordCount').value);
      
      if (count < 1 || count > 100) {
        showNotification('Số từ phải từ 1 đến 100', 'error');
        return;
      }
      
      chrome.storage.local.set({wordCount: count}, () => {
        showNotification(`Đã lưu cài đặt: ${count} từ mỗi lần ôn tập!`);
      });
    });
  }
  
  // Roll words button
  document.getElementById('rollWords').addEventListener('click', () => {
    loadReviewWords();
  });
  
  // Save VoiceRSS API Key button
  // Reload MP3 button
  const reloadMP3Btn = document.getElementById('reloadMP3');
  const reloadMP3Status = document.getElementById('reloadMP3Status');
  if (reloadMP3Btn) {
    reloadMP3Btn.addEventListener('click', () => {
      chrome.storage.local.get(['sheetUrl', 'sheetName', 'voicerssApiKey'], (result) => {
        if (!result.sheetUrl || !result.sheetName) {
          showNotification('Vui lòng cấu hình Google Sheets trước!', 'error');
          return;
        }
        if (!result.voicerssApiKey) {
          showNotification('Vui lòng nhập VoiceRSS API Key trước!', 'error');
          return;
        }
        
        // Disable button and show status
        reloadMP3Btn.disabled = true;
        reloadMP3Btn.textContent = '⏳ Đang xử lý...';
        reloadMP3Status.style.display = 'block';
        reloadMP3Status.textContent = '⏳ Đang quét sheet và tạo audio...';
        reloadMP3Status.style.color = '#666';
        
        // Send message to background script
        chrome.runtime.sendMessage({
          action: 'reloadMP3ForAllWords',
          sheetUrl: result.sheetUrl,
          sheetName: result.sheetName,
          voicerssApiKey: result.voicerssApiKey
        }, (response) => {
          if (chrome.runtime.lastError) {
            reloadMP3Btn.disabled = false;
            reloadMP3Btn.textContent = '🔄 Reload MP3 (Quét & Tạo Audio)';
            reloadMP3Status.textContent = '❌ Lỗi: ' + chrome.runtime.lastError.message;
            reloadMP3Status.style.color = '#f44336';
            return;
          }
          
          if (response && response.success) {
            reloadMP3Btn.disabled = false;
            reloadMP3Btn.textContent = '🔄 Reload MP3 (Quét & Tạo Audio)';
            reloadMP3Status.textContent = `✅ Hoàn thành! Đã xử lý ${response.processed || 0} từ, tạo ${response.generated || 0} audio.`;
            reloadMP3Status.style.color = '#4CAF50';
            showNotification(`Đã reload MP3: ${response.processed || 0} từ, ${response.generated || 0} audio mới.`);
          } else {
            reloadMP3Btn.disabled = false;
            reloadMP3Btn.textContent = '🔄 Reload MP3 (Quét & Tạo Audio)';
            reloadMP3Status.textContent = '❌ Lỗi: ' + (response?.error || 'Không thể reload MP3');
            reloadMP3Status.style.color = '#f44336';
          }
        });
      });
    });
  }
  
  const saveVoicerssApiKeyBtn = document.getElementById('saveVoicerssApiKey');
  if (saveVoicerssApiKeyBtn) {
    saveVoicerssApiKeyBtn.addEventListener('click', () => {
      const apiKey = document.getElementById('voicerssApiKey').value.trim();
      
      if (!apiKey) {
        showNotification('Vui lòng nhập VoiceRSS API Key', 'error');
        return;
      }
      
      chrome.storage.local.set({voicerssApiKey: apiKey}, () => {
        showNotification('Đã lưu VoiceRSS API Key!');
      });
    });
  }
  
  // Reload from Sheet button
  const reloadFromSheetBtn = document.getElementById('reloadFromSheet');
  if (reloadFromSheetBtn) {
    reloadFromSheetBtn.addEventListener('click', () => {
      reloadWordsFromSheet();
    });
  }
        
        // Fetch sheets button
        const fetchSheetsBtn = document.getElementById('fetchSheets');
        if (fetchSheetsBtn) {
          fetchSheetsBtn.addEventListener('click', async () => {
    const sheetUrl = document.getElementById('sheetUrl').value.trim();
            
            if (!sheetUrl) {
              showNotification('Vui lòng nhập URL Google Sheets trước', 'error');
              return;
            }
            
            // Show loading
            fetchSheetsBtn.textContent = '⏳ Đang tải...';
            fetchSheetsBtn.disabled = true;
            
            try {
              if (!googleSheetsAPI) {
                showNotification('Google Sheets API chưa sẵn sàng, vui lòng thử lại sau', 'error');
                return;
              }
              
              logger.log('Starting to fetch sheets...');
              logger.log('Google Sheets API instance:', googleSheetsAPI);
              logger.log('Fetching sheets for URL:', sheetUrl);
              
              const sheets = await googleSheetsAPI.fetchSheets(sheetUrl);
              logger.log('Fetched sheets successfully:', sheets);
              
              if (sheets.length > 0) {
                // Populate dropdown
                const sheetSelect = document.getElementById('sheetSelect');
                sheetSelect.innerHTML = '<option value="">-- Chọn trang tính --</option>';
                
                sheets.forEach(sheet => {
                  const option = document.createElement('option');
                  option.value = sheet.name;
                  option.textContent = sheet.name;
                  sheetSelect.appendChild(option);
                });
                
                // Show dropdown
                document.getElementById('sheetsDropdown').style.display = 'block';
                showNotification(`Tìm thấy ${sheets.length} trang tính!`);
    } else {
                showNotification('Không tìm thấy trang tính nào', 'error');
              }
            } catch (error) {
              logger.error('Error fetching sheets:', error);
              logger.error('Error stack:', error.stack);
              showNotification('Lỗi khi tải trang tính: ' + error.message, 'error');
            } finally {
              fetchSheetsBtn.textContent = '🔍 Tải Danh Sách Trang Tính';
              fetchSheetsBtn.disabled = false;
            }
          });
        }
        
        // Save sheets config button
        const saveSheetsConfigBtn = document.getElementById('saveSheetsConfig');
        if (saveSheetsConfigBtn) {
          saveSheetsConfigBtn.addEventListener('click', () => {
            const sheetUrl = document.getElementById('sheetUrl').value.trim();
            const selectedSheetName = document.getElementById('sheetSelect').value;
            
            if (!sheetUrl || !selectedSheetName) {
              showNotification('Vui lòng điền đầy đủ thông tin', 'error');
              return;
            }
            
            // Extract sheet ID from URL
            const sheetId = extractSheetId(sheetUrl);
            if (!sheetId) {
              showNotification('URL Google Sheets không hợp lệ', 'error');
              return;
            }
            
            // Lưu cấu hình vào storage
            // Đánh dấu rằng user đã cấu hình sheetUrl (để không bị reset về mặc định)
            chrome.storage.local.set({
              sheetUrl: sheetUrl,
              sheetName: selectedSheetName,
              selectedSheetId: sheetId,
              sheetUrlConfigured: true // Flag để đánh dấu đã được user cấu hình
            }, () => {
              showNotification('Đã lưu cấu hình Google Sheets!');
            });
          });
        }
        
        // Export settings button
        const exportSettingsBtn = document.getElementById('exportSettings');
        if (exportSettingsBtn) {
          exportSettingsBtn.addEventListener('click', () => {
            exportSettingsToFile();
          });
        }
        
        // Import settings button
        const importSettingsBtn = document.getElementById('importSettings');
        if (importSettingsBtn) {
          importSettingsBtn.addEventListener('click', () => {
            document.getElementById('settingsFile').click();
          });
        }
        
        // Reset to default button
        const resetToDefaultBtn = document.getElementById('resetToDefault');
        if (resetToDefaultBtn) {
          resetToDefaultBtn.addEventListener('click', () => {
            if (confirm('Bạn có chắc muốn reset về mặc định từ file settings.json? Tất cả cài đặt hiện tại sẽ bị ghi đè.')) {
              loadDefaultSettingsFromFile();
            }
          });
        }
        
        // File input for import
        const settingsFileInput = document.getElementById('settingsFile');
        if (settingsFileInput) {
          settingsFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
              importSettingsFromFile(file);
            }
          });
        }
}

function initializeWordList() {
  // Get current page URL and load words when initializing
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      currentPageUrl = tabs[0].url;
    }
    
    // Initialize filter mode buttons
    const filterModeAll = document.getElementById('filterModeAll');
    const filterModeCurrent = document.getElementById('filterModeCurrent');
    
    if (filterModeAll && filterModeCurrent) {
      filterModeAll.addEventListener('click', () => {
        saveWordFilterMode('all');
        loadWords();
      });
      
      filterModeCurrent.addEventListener('click', () => {
        saveWordFilterMode('current');
        loadWords();
      });
      
      loadWordFilterMode();
    }
    
    loadWords();
  });
}

function updateFilterButtons() {
  const filterModeAll = document.getElementById('filterModeAll');
  const filterModeCurrent = document.getElementById('filterModeCurrent');
  
  if (filterModeAll && filterModeCurrent) {
    if (wordFilterMode === 'all') {
      filterModeAll.style.background = '#4CAF50';
      filterModeAll.style.color = 'white';
      filterModeAll.style.fontWeight = 'bold';
      filterModeCurrent.style.background = '#e0e0e0';
      filterModeCurrent.style.color = '#666';
      filterModeCurrent.style.fontWeight = 'normal';
    } else {
      filterModeAll.style.background = '#e0e0e0';
      filterModeAll.style.color = '#666';
      filterModeAll.style.fontWeight = 'normal';
      filterModeCurrent.style.background = '#4CAF50';
      filterModeCurrent.style.color = 'white';
      filterModeCurrent.style.fontWeight = 'bold';
    }
  }
}

function initializeReview() {
  const knewBtn = document.getElementById('knewBtn');
  const didntKnowBtn = document.getElementById('didntKnowBtn');
  
  knewBtn.addEventListener('click', () => {
    handleReviewResponse(true);
  });
  
  didntKnowBtn.addEventListener('click', () => {
    handleReviewResponse(false);
  });
}

function initializeFlashcard() {
  const modeWordBtn = document.getElementById('flashcardModeWord');
  const modeAudioBtn = document.getElementById('flashcardModeAudio');
  const startBtn = document.getElementById('startFlashcard');
  const knewBtn = document.getElementById('flashcardKnew');
  
  if (modeWordBtn) {
    modeWordBtn.addEventListener('click', () => {
      flashcardMode = FLASHCARD_MODES.WORD;
      updateFlashcardModeButtons();
      // Save state when switching mode
      if (flashcardWords.length > 0) {
        saveFlashcardState();
      }
      // Reload current card with new mode (keep same word)
      if (flashcardWords.length > 0 && currentFlashcardIndex < flashcardWords.length) {
        displayFlashcard();
      }
    });
  }
  
  if (modeAudioBtn) {
    modeAudioBtn.addEventListener('click', () => {
      flashcardMode = FLASHCARD_MODES.AUDIO;
      updateFlashcardModeButtons();
      // Save state when switching mode
      if (flashcardWords.length > 0) {
        saveFlashcardState();
      }
      // Reload current card with new mode (keep same word)
      if (flashcardWords.length > 0 && currentFlashcardIndex < flashcardWords.length) {
        displayFlashcard();
      }
    });
  }
  
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      loadFlashcardWords();
    });
  }
  
  const didntKnowBtn = document.getElementById('flashcardDidntKnow');
  
  if (knewBtn) {
    knewBtn.addEventListener('click', () => {
      handleFlashcardKnew();
    });
  }
  
  if (didntKnowBtn) {
    didntKnowBtn.addEventListener('click', () => {
      handleFlashcardDidntKnow();
    });
  }
  
  updateFlashcardModeButtons();
}

function updateFlashcardModeButtons() {
  const modeWordBtn = document.getElementById('flashcardModeWord');
  const modeAudioBtn = document.getElementById('flashcardModeAudio');
  
  if (modeWordBtn && modeAudioBtn) {
    if (flashcardMode === FLASHCARD_MODES.WORD) {
      modeWordBtn.style.background = '#4CAF50';
      modeWordBtn.style.color = 'white';
      modeWordBtn.style.fontWeight = 'bold';
      modeAudioBtn.style.background = '#e0e0e0';
      modeAudioBtn.style.color = '#666';
      modeAudioBtn.style.fontWeight = 'normal';
    } else {
      modeWordBtn.style.background = '#e0e0e0';
      modeWordBtn.style.color = '#666';
      modeWordBtn.style.fontWeight = 'normal';
      modeAudioBtn.style.background = '#4CAF50';
      modeAudioBtn.style.color = 'white';
      modeAudioBtn.style.fontWeight = 'bold';
    }
  }
}

function loadFlashcardWords() {
  const container = document.getElementById('flashcardContainer');
  const startBtn = document.getElementById('startFlashcard');
  const knewBtn = document.getElementById('flashcardKnew');
  const nextBtn = document.getElementById('flashcardNext');
  
  // Show loading indicator
  if (container) {
    showLoadingIndicator('flashcardContainer', 'Đang tải từ vựng...');
  }
  
  // Get wordCount from settings
  chrome.storage.local.get(['wordCount'], (result) => {
    const wordCount = result.wordCount || 5;
    
    chrome.runtime.sendMessage({
      action: 'getRandomWordsForFlashcard',
      count: wordCount,
      mode: flashcardMode
    }, (response) => {
      try {
        if (chrome.runtime.lastError) {
          logger.error('Error getting flashcard words:', chrome.runtime.lastError);
          showFlashcardNotification('⚠️ ' + ERROR_MESSAGES.NETWORK_ERROR);
          if (container) {
            container.innerHTML = `
              <div style="font-size: 14px; color: #666; margin-bottom: 20px;">
                ${ERROR_MESSAGES.NETWORK_ERROR}
              </div>
              <button id="startFlashcard" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px;">▶️ Thử Lại</button>
            `;
            document.getElementById('startFlashcard').addEventListener('click', () => {
              loadFlashcardWords();
            });
          }
          return;
        }
        
        if (response && response.words && response.words.length > 0) {
      flashcardWords = response.words;
      currentFlashcardIndex = 0;
      flashcardStats = {
        total: flashcardWords.length,
        current: 0,
        knew: 0
      };
      
      displayFlashcard();
      
          if (startBtn) startBtn.style.display = 'none';
          if (knewBtn) knewBtn.style.display = 'inline-block';
          const didntKnowBtn = document.getElementById('flashcardDidntKnow');
          if (didntKnowBtn) didntKnowBtn.style.display = 'inline-block';
        } else {
          if (container) {
            container.innerHTML = `
              <div style="font-size: 14px; color: #666; margin-bottom: 20px;">
                ${flashcardMode === FLASHCARD_MODES.AUDIO ? ERROR_MESSAGES.NO_AUDIO_WORDS : ERROR_MESSAGES.NO_WORDS}
              </div>
              <button id="startFlashcard" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px;">▶️ Bắt Đầu</button>
            `;
            document.getElementById('startFlashcard').addEventListener('click', () => {
              loadFlashcardWords();
            });
          }
        }
      } catch (error) {
        logger.error('Error in loadFlashcardWords callback:', error);
        showFlashcardNotification('⚠️ ' + ERROR_MESSAGES.UNKNOWN_ERROR);
        if (container) {
          container.innerHTML = `
            <div style="font-size: 14px; color: #f44336; margin-bottom: 20px;">
              ${ERROR_MESSAGES.UNKNOWN_ERROR}
            </div>
            <button id="startFlashcard" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px;">▶️ Thử Lại</button>
          `;
          document.getElementById('startFlashcard').addEventListener('click', () => {
            loadFlashcardWords();
          });
        }
      }
    });
  });
}

function displayFlashcard() {
  const container = document.getElementById('flashcardContainer');
  const statsDiv = document.getElementById('flashcardStats');
  
  // Stop any playing audio when switching cards
  if (isPlayingWordAudio && currentWordAudioElement) {
    currentWordAudioElement.pause();
    currentWordAudioElement = null;
    isPlayingWordAudio = false;
    updateWordButtonState(false);
  }
  if (isPlayingExampleAudio && currentExampleAudioElement) {
    currentExampleAudioElement.pause();
    currentExampleAudioElement = null;
    isPlayingExampleAudio = false;
    updateExampleButtonState(false);
  }
  
  if (currentFlashcardIndex >= flashcardWords.length) {
    // Finished all cards
    if (container) {
      container.innerHTML = `
        <div style="font-size: 18px; color: #4CAF50; margin-bottom: 10px; font-weight: bold;">🎉 Hoàn Thành!</div>
        <div style="font-size: 14px; color: #666; margin-bottom: 20px;">
          Đã học: ${flashcardStats.total} từ<br>
          Đã thuộc: ${flashcardStats.knew} từ
        </div>
        <button id="startFlashcard" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px;">🔄 Bắt Đầu Lại</button>
      `;
      document.getElementById('startFlashcard').addEventListener('click', () => {
        loadFlashcardWords();
      });
    }
    
    const knewBtn = document.getElementById('flashcardKnew');
    const didntKnowBtn = document.getElementById('flashcardDidntKnow');
    if (knewBtn) knewBtn.style.display = 'none';
    if (didntKnowBtn) didntKnowBtn.style.display = 'none';
    
    return;
  }
  
  const currentWord = flashcardWords[currentFlashcardIndex];
  
  // Check if audio is ready (for audio mode) or word is ready (for word mode)
  if (flashcardMode === 'audio') {
    // Check for non-empty strings (handle empty strings from sheet)
    const hasAudio = (currentWord.wordAudioUrlUS && currentWord.wordAudioUrlUS.trim()) || (currentWord.wordAudioUrlUK && currentWord.wordAudioUrlUK.trim());
    if (!hasAudio) {
      // Show loading indicator while generating audio
      if (container) {
        container.innerHTML = `
          <div style="position: relative;">
            <div id="flashcardCard" style="padding: 40px 20px; border: 2px solid #e0e0e0; border-radius: 12px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 20px;">⏳</div>
              <div style="font-size: 16px; color: #666;">Đang tạo audio...</div>
            </div>
          </div>
        `;
      }
      
      // Generate audio and then display
      generateAudioForWord(currentWord).then((generatedAudio) => {
        if (generatedAudio && (generatedAudio.wordAudioUrlUS || generatedAudio.wordAudioUrlUK)) {
          // Update word object
          currentWord.wordAudioUrlUS = generatedAudio.wordAudioUrlUS;
          currentWord.wordAudioUrlUK = generatedAudio.wordAudioUrlUK;
          // Display the card now that audio is ready
          displayFlashcard();
        } else {
          // Failed to generate audio, show error
          if (container) {
            container.innerHTML = `
              <div style="position: relative;">
                <div id="flashcardCard" style="padding: 40px 20px; border: 2px solid #e0e0e0; border-radius: 12px; text-align: center;">
                  <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
                  <div style="font-size: 16px; color: #f44336;">Không thể tạo audio. Vui lòng kiểm tra VoiceRSS API Key.</div>
                  <button id="skipWordBtn" style="margin-top: 20px; padding: 10px 20px; background: #2196F3; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">➡️ Bỏ qua</button>
                </div>
              </div>
            `;
            const skipBtn = document.getElementById('skipWordBtn');
            if (skipBtn) {
              skipBtn.addEventListener('click', () => {
                handleFlashcardNext();
              });
            }
          }
        }
      });
      return;
    }
  }
  
  const translation = currentWord.translation || currentWord.meaning || 'Chưa có nghĩa';
  const example = currentWord.example || '';
  
  if (flashcardMode === 'word') {
    // Word mode: Show word, user guesses meaning
    if (container) {
      container.innerHTML = `
        <div style="position: relative;">
          <button id="showMeaningBtn" style="position: absolute; top: -10px; right: -10px; width: 28px; height: 28px; background: #2196F3; color: white; border: none; border-radius: 50%; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.2);" title="Xem nghĩa">👁️</button>
          <div id="flashcardCard" style="padding: 20px; border: 2px solid #e0e0e0; border-radius: 12px; transition: all 0.3s;">
            <div style="font-size: 32px; font-weight: bold; color: #333; text-align: center;">${currentWord.word}</div>
            <div id="flashcardAnswer" style="display: none; font-size: 16px; color: #4CAF50; margin-top: 20px; padding: 15px; background: #f0f8f0; border-radius: 8px;">
              <div style="font-weight: bold; margin-bottom: 5px;">Nghĩa:</div>
              <div>${translation}</div>
              ${example ? `<div style="margin-top: 10px; font-style: italic; color: #666;">${example}</div>` : ''}
            </div>
          </div>
        </div>
      `;
      
      // Add click event to show meaning icon
      const showBtn = document.getElementById('showMeaningBtn');
      if (showBtn) {
        showBtn.addEventListener('click', () => {
          const answerDiv = document.getElementById('flashcardAnswer');
          if (answerDiv) {
            if (answerDiv.style.display === 'none') {
              answerDiv.style.display = 'block';
              showBtn.style.background = '#4CAF50';
              // Play audio when showing meaning
              playFlashcardWordAudio(currentWord);
            } else {
              answerDiv.style.display = 'none';
              showBtn.style.background = '#2196F3';
            }
          }
        });
        
        // Add hover effect
        showBtn.addEventListener('mouseenter', () => {
          showBtn.style.transform = 'scale(1.1)';
        });
        showBtn.addEventListener('mouseleave', () => {
          showBtn.style.transform = 'scale(1)';
        });
      }
    }
  } else {
    // Audio mode: Play audio, user guesses meaning
    if (container) {
      container.innerHTML = `
        <div style="position: relative;">
          <button id="showMeaningBtn" style="position: absolute; top: -10px; right: -10px; width: 28px; height: 28px; background: #2196F3; color: white; border: none; border-radius: 50%; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.2);" title="Xem nghĩa">👁️</button>
          <div id="flashcardCard" style="padding: 40px 20px; border: 2px solid #e0e0e0; border-radius: 12px; transition: all 0.3s; text-align: center;">
            <div style="display: flex; gap: 20px; justify-content: center; align-items: center; margin-bottom: 20px;">
              <button id="playWordAudioBtn" style="width: 80px; height: 80px; background: #2196F3; color: white; border: none; border-radius: 50%; cursor: pointer; font-size: 36px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; box-shadow: 0 4px 12px rgba(33, 150, 243, 0.4);" title="Nghe từ">🔊</button>
              ${example ? `<button id="playExampleAudioBtn" style="width: 80px; height: 80px; background: #4CAF50; color: white; border: none; border-radius: 50%; cursor: pointer; font-size: 36px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);" title="Nghe câu">📝</button>` : ''}
            </div>
            <div id="flashcardAnswer" style="display: none; font-size: 16px; color: #4CAF50; margin-top: 20px; padding: 15px; background: #f0f8f0; border-radius: 8px;">
              <div style="font-weight: bold; margin-bottom: 5px;">Từ:</div>
              <div style="font-size: 20px; margin-bottom: 10px;">${currentWord.word}</div>
              <div style="font-weight: bold; margin-bottom: 5px;">Nghĩa:</div>
              <div>${translation}</div>
              ${example ? `<div style="margin-top: 10px; font-style: italic; color: #666;">${example}</div>` : ''}
            </div>
          </div>
        </div>
      `;
      
      // Play word audio button
      const playWordBtn = document.getElementById('playWordAudioBtn');
      if (playWordBtn) {
        playWordBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!isPlayingWordAudio) {
            playFlashcardWordAudio(currentWord);
          }
        });
        
        // Add hover effect
        playWordBtn.addEventListener('mouseenter', () => {
          if (!isPlayingWordAudio) {
            playWordBtn.style.transform = 'scale(1.1)';
            playWordBtn.style.boxShadow = '0 6px 16px rgba(33, 150, 243, 0.5)';
          }
        });
        playWordBtn.addEventListener('mouseleave', () => {
          if (!isPlayingWordAudio) {
            playWordBtn.style.transform = 'scale(1)';
            playWordBtn.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.4)';
          }
        });
      }
      
      // Play example audio button
      const playExampleBtn = document.getElementById('playExampleAudioBtn');
      if (playExampleBtn) {
        playExampleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!isPlayingExampleAudio) {
            playFlashcardExampleAudio(currentWord);
          }
        });
        
        // Add hover effect
        playExampleBtn.addEventListener('mouseenter', () => {
          if (!isPlayingExampleAudio) {
            playExampleBtn.style.transform = 'scale(1.1)';
            playExampleBtn.style.boxShadow = '0 6px 16px rgba(76, 175, 80, 0.5)';
          }
        });
        playExampleBtn.addEventListener('mouseleave', () => {
          if (!isPlayingExampleAudio) {
            playExampleBtn.style.transform = 'scale(1)';
            playExampleBtn.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.4)';
          }
        });
      }
      
      // Show meaning button for audio mode
      const showBtn = document.getElementById('showMeaningBtn');
      if (showBtn) {
        showBtn.addEventListener('click', () => {
          const answerDiv = document.getElementById('flashcardAnswer');
          if (answerDiv) {
            if (answerDiv.style.display === 'none') {
              answerDiv.style.display = 'block';
              showBtn.style.background = '#4CAF50';
              // Play audio when showing meaning
              playFlashcardWordAudio(currentWord);
            } else {
              answerDiv.style.display = 'none';
              showBtn.style.background = '#2196F3';
            }
          }
        });
        
        // Add hover effect
        showBtn.addEventListener('mouseenter', () => {
          showBtn.style.transform = 'scale(1.1)';
        });
        showBtn.addEventListener('mouseleave', () => {
          showBtn.style.transform = 'scale(1)';
        });
      }
      
      // Auto-play word audio when card is shown (only in audio mode)
      // Use currentWord from currentFlashcardIndex to ensure sync
      if (flashcardMode === FLASHCARD_MODES.AUDIO) {
        setTimeout(() => {
          // Get current word again to ensure it's the correct one
          const wordToPlay = flashcardWords[currentFlashcardIndex];
          if (wordToPlay && wordToPlay.word === currentWord.word) {
            playFlashcardWordAudio(wordToPlay);
          }
        }, TIMEOUTS.AUDIO_AUTO_PLAY_DELAY);
      }
    }
  }
  
  // Update stats
  if (statsDiv) {
    statsDiv.textContent = `Tiến độ: ${currentFlashcardIndex + 1}/${flashcardStats.total} | Đã thuộc: ${flashcardStats.knew}`;
  }
}

function playFlashcardWordAudio(word) {
  // Prevent duplicate playback
  if (isPlayingWordAudio) {
    return;
  }
  
  // Stop example audio if playing
  if (isPlayingExampleAudio && currentExampleAudioElement) {
    currentExampleAudioElement.pause();
    currentExampleAudioElement = null;
    isPlayingExampleAudio = false;
    updateExampleButtonState(false);
  }
  
  // Priority: US audio > UK audio
  // Check for non-empty strings (handle empty strings from sheet)
  let audioUrl = (word.wordAudioUrlUS && word.wordAudioUrlUS.trim()) || (word.wordAudioUrlUK && word.wordAudioUrlUK.trim());
  
  if (!audioUrl) {
    // Generate audio immediately if not available
    showFlashcardNotification('⏳ Đang tạo audio...');
    generateAudioForWord(word).then((generatedAudio) => {
      if (generatedAudio && (generatedAudio.wordAudioUrlUS || generatedAudio.wordAudioUrlUK)) {
        audioUrl = generatedAudio.wordAudioUrlUS || generatedAudio.wordAudioUrlUK;
        playAudioFromUrl(audioUrl, AUDIO_TYPES.WORD);
        showFlashcardNotification('✅ Đã tạo audio!');
      } else {
        showFlashcardNotification('⚠️ Không thể tạo audio. Vui lòng kiểm tra VoiceRSS API Key.');
      }
    }).catch((error) => {
      logger.error('Error generating audio:', error);
      showFlashcardNotification('⚠️ Lỗi khi tạo audio. Vui lòng thử lại.');
    });
    return;
  }
  
  playAudioFromUrl(audioUrl, 'word');
}

// Generate audio for a word immediately
async function generateAudioForWord(word) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['voicerssApiKey', 'sheetUrl', 'sheetName'], (result) => {
      if (!result.voicerssApiKey) {
        resolve(null);
        return;
      }
      
      // Call fetchDictionary which will handle audio generation
      chrome.runtime.sendMessage({
        action: 'fetchDictionary',
        word: word.word,
        url: word.url || ''
      }, async (dictResponse) => {
        let wordAudioUrlUS = null;
        let wordAudioUrlUK = null;
        
        // Check if dictionary API returned audio
        if (dictResponse && dictResponse.success && dictResponse.meaning) {
          wordAudioUrlUS = dictResponse.meaning.wordAudioUrlUS || null;
          wordAudioUrlUK = dictResponse.meaning.wordAudioUrlUK || null;
        }
        
        // If still no audio, use VoiceRSS
        if (!wordAudioUrlUS && result.voicerssApiKey) {
          chrome.runtime.sendMessage({
            action: 'generateAudio',
            text: word.word,
            apiKey: result.voicerssApiKey
          }, (audioResponse) => {
            if (audioResponse && audioResponse.success && audioResponse.audioUrl) {
              wordAudioUrlUS = audioResponse.audioUrl;
              wordAudioUrlUK = audioResponse.audioUrl; // Use same for UK
            }
            
            // Update word object immediately
            word.wordAudioUrlUS = wordAudioUrlUS;
            word.wordAudioUrlUK = wordAudioUrlUK;
            
            // Update in storage
            chrome.storage.local.get(['highlightedWords'], (storageResult) => {
              const wordsInStorage = storageResult.highlightedWords || [];
              const wordIndex = wordsInStorage.findIndex(w => w.word === word.word && (w.url === word.url || !word.url));
              if (wordIndex !== -1) {
                if (wordAudioUrlUS) wordsInStorage[wordIndex].wordAudioUrlUS = wordAudioUrlUS;
                if (wordAudioUrlUK) wordsInStorage[wordIndex].wordAudioUrlUK = wordAudioUrlUK;
                chrome.storage.local.set({highlightedWords: wordsInStorage});
              }
            });
            
            // Update in Google Sheets if word is from sheet
            if (word.fromSheet && result.sheetUrl && result.sheetName && (wordAudioUrlUS || wordAudioUrlUK)) {
              chrome.runtime.sendMessage({
                action: 'updateAudioInSheet',
                sheetUrl: result.sheetUrl,
                sheetName: result.sheetName,
                word: word.word,
                url: word.url || '',
                wordAudioUrlUS: wordAudioUrlUS,
                wordAudioUrlUK: wordAudioUrlUK
              });
            }
            
            resolve({
              wordAudioUrlUS: wordAudioUrlUS,
              wordAudioUrlUK: wordAudioUrlUK
            });
          });
        } else {
          // Update word object immediately
          word.wordAudioUrlUS = wordAudioUrlUS;
          word.wordAudioUrlUK = wordAudioUrlUK;
          
          // Update in storage
          chrome.storage.local.get(['highlightedWords'], (storageResult) => {
            const wordsInStorage = storageResult.highlightedWords || [];
            const wordIndex = wordsInStorage.findIndex(w => w.word === word.word && (w.url === word.url || !word.url));
            if (wordIndex !== -1) {
              if (wordAudioUrlUS) wordsInStorage[wordIndex].wordAudioUrlUS = wordAudioUrlUS;
              if (wordAudioUrlUK) wordsInStorage[wordIndex].wordAudioUrlUK = wordAudioUrlUK;
              chrome.storage.local.set({highlightedWords: wordsInStorage});
            }
          });
          
          // Update in Google Sheets if word is from sheet
          if (word.fromSheet && result.sheetUrl && result.sheetName && (wordAudioUrlUS || wordAudioUrlUK)) {
            chrome.runtime.sendMessage({
              action: 'updateAudioInSheet',
              sheetUrl: result.sheetUrl,
              sheetName: result.sheetName,
              word: word.word,
              url: word.url || '',
              wordAudioUrlUS: wordAudioUrlUS,
              wordAudioUrlUK: wordAudioUrlUK
            });
          }
          
          resolve({
            wordAudioUrlUS: wordAudioUrlUS,
            wordAudioUrlUK: wordAudioUrlUK
          });
        }
      });
    });
  });
}

function playFlashcardExampleAudio(word) {
  // Prevent duplicate playback
  if (isPlayingExampleAudio) {
    return;
  }
  
  // Generate example audio from example text
  if (!word.example || !word.example.trim()) {
    showFlashcardNotification('⚠️ Từ này chưa có câu ví dụ.');
    return;
  }
  
  // Stop word audio if playing
  if (isPlayingWordAudio && currentWordAudioElement) {
    currentWordAudioElement.pause();
    currentWordAudioElement = null;
    isPlayingWordAudio = false;
    updateWordButtonState(false);
  }
  
  chrome.storage.local.get(['voicerssApiKey'], (result) => {
    if (result.voicerssApiKey) {
      const params = new URLSearchParams({
        key: result.voicerssApiKey,
        hl: 'en-us',
        src: word.example.trim(),
        c: 'MP3',
        f: '44khz_16bit_stereo',
        ssml: 'false',
        b64: 'false'
      });
      const audioUrl = `https://api.voicerss.org/?${params.toString()}`;
      playAudioFromUrl(audioUrl, 'example');
    } else {
      logger.warn('No VoiceRSS API key for example audio');
      showFlashcardNotification('⚠️ Chưa có VoiceRSS API Key. Vào Cài Đặt để thêm API Key.');
    }
  });
}

function showFlashcardNotification(message) {
  const container = document.getElementById('flashcardContainer');
  if (container) {
    // Remove existing notification
    const existing = container.querySelector('.flashcard-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = 'flashcard-notification';
    notification.style.cssText = 'font-size: 12px; color: #f44336; margin-top: 10px; padding: 8px; background: #ffebee; border-radius: 4px; text-align: center;';
    notification.textContent = message;
    container.appendChild(notification);
      setTimeout(() => notification.remove(), TIMEOUTS.NOTIFICATION_DISPLAY);
  }
}

function playAudioFromUrl(audioUrl, type = AUDIO_TYPES.WORD) {
  if (!audioUrl || !audioUrl.trim()) {
    logger.error('Invalid audio URL:', audioUrl);
    showFlashcardNotification('⚠️ URL audio không hợp lệ');
    return;
  }
  
  logger.log('Playing audio from URL:', audioUrl, 'Type:', type);
  
  // Check if URL is from VoiceRSS (no CORS issue) or Cambridge (CORS issue)
  const isVoiceRSS = audioUrl.includes('api.voicerss.org');
  const isCambridge = audioUrl.includes('dictionary.cambridge.org');
  
  if (isVoiceRSS) {
    // VoiceRSS URLs can be played directly
    playAudioDirectly(audioUrl, type);
  } else if (isCambridge) {
    // Cambridge URLs need to be fetched via background script to avoid CORS
    fetchAudioViaBackground(audioUrl, type);
  } else {
    // Try direct first, fallback to background fetch if fails
    playAudioDirectly(audioUrl, type).catch(() => {
      logger.log('Direct play failed, trying background fetch...');
      fetchAudioViaBackground(audioUrl, type);
    });
  }
}

function playAudioDirectly(audioUrl, type = AUDIO_TYPES.WORD) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(audioUrl);
    
    // Store audio element and set playing state
    if (type === AUDIO_TYPES.WORD) {
      currentWordAudioElement = audio;
      isPlayingWordAudio = true;
      updateWordButtonState(true);
    } else if (type === AUDIO_TYPES.EXAMPLE) {
      currentExampleAudioElement = audio;
      isPlayingExampleAudio = true;
      updateExampleButtonState(true);
    }
    
    // Add event listeners for debugging
    audio.addEventListener('loadstart', () => {
      logger.log('Audio loading started');
    });
    
    audio.addEventListener('canplay', () => {
      logger.log('Audio can play');
    });
    
    audio.addEventListener('error', (e) => {
      logger.error('Audio error:', e);
      logger.error('Audio error details:', {
        code: audio.error?.code,
        message: audio.error?.message,
        url: audioUrl
      });
      
      // Reset state on error
      if (type === AUDIO_TYPES.WORD) {
        currentWordAudioElement = null;
        isPlayingWordAudio = false;
        updateWordButtonState(false);
      } else if (type === AUDIO_TYPES.EXAMPLE) {
        currentExampleAudioElement = null;
        isPlayingExampleAudio = false;
        updateExampleButtonState(false);
      }
      
      reject(new Error('Audio playback error'));
    });
    
    audio.addEventListener('ended', () => {
      console.log('Audio playback ended');
      
      // Reset state when ended
      if (type === AUDIO_TYPES.WORD) {
        currentWordAudioElement = null;
        isPlayingWordAudio = false;
        updateWordButtonState(false);
      } else if (type === AUDIO_TYPES.EXAMPLE) {
        currentExampleAudioElement = null;
        isPlayingExampleAudio = false;
        updateExampleButtonState(false);
      }
      
      resolve();
    });
    
    // Try to play audio
    audio.play().then(() => {
      logger.log('Audio playback started successfully');
      resolve();
    }).catch((error) => {
      logger.error('Error playing audio:', error);
      logger.error('Error details:', {
        name: error.name,
        message: error.message,
        url: audioUrl
      });
      
      // Reset state on error
      if (type === AUDIO_TYPES.WORD) {
        currentWordAudioElement = null;
        isPlayingWordAudio = false;
        updateWordButtonState(false);
      } else if (type === AUDIO_TYPES.EXAMPLE) {
        currentExampleAudioElement = null;
        isPlayingExampleAudio = false;
        updateExampleButtonState(false);
      }
      
      reject(error);
    });
  });
}

function fetchAudioViaBackground(audioUrl, type = AUDIO_TYPES.WORD) {
  logger.log('Fetching audio via background script to avoid CORS...');
  
  // Set playing state
  if (type === AUDIO_TYPES.WORD) {
    isPlayingWordAudio = true;
    updateWordButtonState(true);
  } else if (type === 'example') {
    isPlayingExampleAudio = true;
    updateExampleButtonState(true);
  }
  
  // First try to fetch as blob
  chrome.runtime.sendMessage({
    action: 'fetchAudioAsBlob',
    audioUrl: audioUrl
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error fetching audio:', chrome.runtime.lastError);
      // Fallback to playing in hidden tab
      playAudioInHiddenTab(audioUrl, type);
      return;
    }
    
    if (response && response.success && response.blobUrl) {
      // Play audio from blob URL (base64 data URL)
      const audio = new Audio(response.blobUrl);
      
      // Store audio element
      if (type === AUDIO_TYPES.WORD) {
        currentWordAudioElement = audio;
      } else if (type === AUDIO_TYPES.EXAMPLE) {
        currentExampleAudioElement = audio;
      }
      
      audio.addEventListener('error', (e) => {
        console.error('Audio playback error:', e);
        // Reset state
        if (type === AUDIO_TYPES.WORD) {
          currentWordAudioElement = null;
          isPlayingWordAudio = false;
          updateWordButtonState(false);
        } else if (type === AUDIO_TYPES.EXAMPLE) {
          currentExampleAudioElement = null;
          isPlayingExampleAudio = false;
          updateExampleButtonState(false);
        }
        // Fallback to playing in hidden tab
        playAudioInHiddenTab(audioUrl, type);
      });
      
      audio.addEventListener('ended', () => {
        console.log('Audio playback ended');
        // Reset state
        if (type === AUDIO_TYPES.WORD) {
          currentWordAudioElement = null;
          isPlayingWordAudio = false;
          updateWordButtonState(false);
        } else if (type === AUDIO_TYPES.EXAMPLE) {
          currentExampleAudioElement = null;
          isPlayingExampleAudio = false;
          updateExampleButtonState(false);
        }
      });
      
      audio.play().then(() => {
        console.log('Audio playback started successfully from blob');
      }).catch((error) => {
        console.error('Error playing audio from blob:', error);
        // Reset state
        if (type === AUDIO_TYPES.WORD) {
          currentWordAudioElement = null;
          isPlayingWordAudio = false;
          updateWordButtonState(false);
        } else if (type === AUDIO_TYPES.EXAMPLE) {
          currentExampleAudioElement = null;
          isPlayingExampleAudio = false;
          updateExampleButtonState(false);
        }
        // Fallback to playing in hidden tab
        playAudioInHiddenTab(audioUrl, type);
      });
    } else {
      console.error('Failed to fetch audio:', response?.error);
      // Reset state
      if (type === AUDIO_TYPES.WORD) {
        isPlayingWordAudio = false;
        updateWordButtonState(false);
      } else if (type === AUDIO_TYPES.EXAMPLE) {
        isPlayingExampleAudio = false;
        updateExampleButtonState(false);
      }
      // Fallback to playing in hidden tab
      playAudioInHiddenTab(audioUrl, type);
    }
  });
}

// Fallback: Play audio in hidden tab to avoid CORS issues
function playAudioInHiddenTab(audioUrl, type = AUDIO_TYPES.WORD) {
  logger.log('Playing audio in hidden tab to avoid CORS...');
  
  // Set playing state (will be reset when tab closes, but we can't track it)
  if (type === AUDIO_TYPES.WORD) {
    isPlayingWordAudio = true;
    updateWordButtonState(true);
    // Reset after estimated duration (5 seconds for word)
    setTimeout(() => {
      isPlayingWordAudio = false;
      updateWordButtonState(false);
    }, TIMEOUTS.HIDDEN_TAB_AUDIO_TIMEOUT);
  } else if (type === 'example') {
    isPlayingExampleAudio = true;
    updateExampleButtonState(true);
    // Reset after estimated duration (10 seconds for example)
    setTimeout(() => {
      isPlayingExampleAudio = false;
      updateExampleButtonState(false);
    }, 10000);
  }
  
  chrome.runtime.sendMessage({
    action: 'playAudio',
    url: audioUrl
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error playing audio in tab:', chrome.runtime.lastError);
      showFlashcardNotification('⚠️ Không thể phát audio.');
      // Reset state on error
      if (type === AUDIO_TYPES.WORD) {
        isPlayingWordAudio = false;
        updateWordButtonState(false);
      } else if (type === AUDIO_TYPES.EXAMPLE) {
        isPlayingExampleAudio = false;
        updateExampleButtonState(false);
      }
    } else if (response && response.success) {
      console.log('Audio playing in hidden tab');
    }
  });
}

// Update button state based on playing status
function updateWordButtonState(isPlaying) {
  const playWordBtn = document.getElementById('playWordAudioBtn');
  if (playWordBtn) {
    if (isPlaying) {
      playWordBtn.disabled = true;
      playWordBtn.style.opacity = '0.6';
      playWordBtn.style.cursor = 'not-allowed';
    } else {
      playWordBtn.disabled = false;
      playWordBtn.style.opacity = '1';
      playWordBtn.style.cursor = 'pointer';
    }
  }
}

function updateExampleButtonState(isPlaying) {
  const playExampleBtn = document.getElementById('playExampleAudioBtn');
  if (playExampleBtn) {
    if (isPlaying) {
      playExampleBtn.disabled = true;
      playExampleBtn.style.opacity = '0.6';
      playExampleBtn.style.cursor = 'not-allowed';
    } else {
      playExampleBtn.disabled = false;
      playExampleBtn.style.opacity = '1';
      playExampleBtn.style.cursor = 'pointer';
    }
  }
}

function handleFlashcardKnew() {
  flashcardStats.knew++;
  flashcardStats.current++;
  
  // Save state
  saveFlashcardState();
  
  // Get current word
  const currentWord = flashcardWords[currentFlashcardIndex];
  if (!currentWord) return;
  
  // Update word's review status in storage
  chrome.storage.local.get(['highlightedWords'], (result) => {
    const words = result.highlightedWords || [];
    const wordIndex = words.findIndex(w => w.word === currentWord.word && (w.url === currentWord.url || !currentWord.url));
    
    if (wordIndex !== -1) {
      const now = Date.now();
      words[wordIndex].lastReviewed = now;
      words[wordIndex].reviewCount = (words[wordIndex].reviewCount || 0) + 1;
      words[wordIndex].knewIt = true;
      
      // Update spaced repetition
      const currentInterval = words[wordIndex].reviewInterval || 1;
      words[wordIndex].reviewInterval = Math.min(
        currentInterval * SPACED_REPETITION.MULTIPLIER,
        SPACED_REPETITION.MAX_INTERVAL
      );
      words[wordIndex].nextReview = now + (words[wordIndex].reviewInterval * SPACED_REPETITION.MILLISECONDS_PER_DAY);
      
      chrome.storage.local.set({highlightedWords: words});
    }
  });
  
  // Update review count in Google Sheets (column H)
  chrome.runtime.sendMessage({
    action: 'logToSheets',
    logData: {
      action: 'review',
      word: currentWord.word,
      url: currentWord.url || '',
      knew: true
    }
  });
  
  // Show answer
  const answerDiv = document.getElementById('flashcardAnswer');
  if (answerDiv) {
    answerDiv.style.display = 'block';
  }
  
  // Update card border color
  const card = document.getElementById('flashcardCard');
  if (card) {
    card.style.borderColor = '#4CAF50';
  }
  
  // Auto move to next card after a short delay
  setTimeout(() => {
    handleFlashcardNext();
  }, 800); // 800ms delay to show the answer
}

function handleFlashcardDidntKnow() {
  flashcardStats.current++;
  
  // Save state
  saveFlashcardState();
  
  // Get current word
  const currentWord = flashcardWords[currentFlashcardIndex];
  if (!currentWord) return;
  
  // Update word's review status in storage
  chrome.storage.local.get(['highlightedWords'], (result) => {
    const words = result.highlightedWords || [];
    const wordIndex = words.findIndex(w => w.word === currentWord.word && (w.url === currentWord.url || !currentWord.url));
    
    if (wordIndex !== -1) {
      const now = Date.now();
      words[wordIndex].lastReviewed = now;
      words[wordIndex].reviewCount = (words[wordIndex].reviewCount || 0) + 1;
      words[wordIndex].knewIt = false;
      
      // Reset spaced repetition (word not known, review sooner)
      words[wordIndex].reviewInterval = SPACED_REPETITION.INITIAL_INTERVAL;
      words[wordIndex].nextReview = now + SPACED_REPETITION.MILLISECONDS_PER_DAY;
      
      chrome.storage.local.set({highlightedWords: words});
    }
  });
  
  // Update review count in Google Sheets (column H)
  chrome.runtime.sendMessage({
    action: 'logToSheets',
    logData: {
      action: 'review',
      word: currentWord.word,
      url: currentWord.url || '',
      knew: false
    }
  });
  
  // Show answer
  const answerDiv = document.getElementById('flashcardAnswer');
  if (answerDiv) {
    answerDiv.style.display = 'block';
  }
  
  // Update card border color (red for didn't know)
  const card = document.getElementById('flashcardCard');
  if (card) {
    card.style.borderColor = '#f44336';
  }
  
  // Auto move to next card after a short delay
  setTimeout(() => {
    handleFlashcardNext();
  }, 800); // 800ms delay to show the answer
}

function handleFlashcardNext() {
  currentFlashcardIndex++;
  flashcardStats.current++;
  
  // Save state
  saveFlashcardState();
  
  // Check if finished
  if (currentFlashcardIndex >= flashcardWords.length) {
    // Finished, clear state and show completion message
    clearFlashcardState();
    const container = document.getElementById('flashcardContainer');
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
          <div style="font-size: 24px; margin-bottom: 15px;">🎉</div>
          <div style="font-size: 18px; color: #4CAF50; margin-bottom: 10px; font-weight: bold;">Hoàn thành!</div>
          <div style="font-size: 14px; color: #666; margin-bottom: 20px;">
            Đã học ${flashcardStats.total} từ | Đã thuộc: ${flashcardStats.knew}
          </div>
          <button id="startFlashcard" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px;">▶️ Bắt Đầu Lại</button>
        </div>
      `;
      document.getElementById('startFlashcard').addEventListener('click', () => {
        loadFlashcardWords();
      });
    }
    const knewBtn = document.getElementById('flashcardKnew');
    const didntKnowBtn = document.getElementById('flashcardDidntKnow');
    if (knewBtn) knewBtn.style.display = 'none';
    if (didntKnowBtn) didntKnowBtn.style.display = 'none';
    return;
  }
  
  // Hide answer
  const answerDiv = document.getElementById('flashcardAnswer');
  if (answerDiv) {
    answerDiv.style.display = 'none';
  }
  
  // Reset card border color
  const card = document.getElementById('flashcardCard');
  if (card) {
    card.style.borderColor = '#e0e0e0';
  }
  
  // Show "Đã Thuộc" and "Chưa Thuộc" buttons
  const knewBtn = document.getElementById('flashcardKnew');
  const didntKnowBtn = document.getElementById('flashcardDidntKnow');
  if (knewBtn) knewBtn.style.display = 'inline-block';
  if (didntKnowBtn) didntKnowBtn.style.display = 'inline-block';
  
  displayFlashcard();
}

function loadWords() {
  // Load from localStorage first (fast)
  chrome.runtime.sendMessage({action: 'getHighlightedWords'}, (response) => {
    const wordsFromStorage = response.words || [];
    
    let allWords = wordsFromStorage;
    
    // Filter by URL if mode is 'current'
    if (wordFilterMode === 'current' && currentPageUrl) {
      allWords = allWords.filter(word => word.url === currentPageUrl);
    }
    
    highlightedWords = allWords;
    updateWordList();
  });
}

function reloadWordsFromSheet() {
  const reloadBtn = document.getElementById('reloadFromSheet');
  if (reloadBtn) {
    reloadBtn.textContent = '⏳ Đang tải...';
    reloadBtn.disabled = true;
  }
  
  chrome.runtime.sendMessage({action: 'loadWordsFromSheet'}, (response) => {
    const wordsFromSheet = response.words || [];
    
    if (wordsFromSheet.length === 0) {
      showNotification('Không có dữ liệu từ Google Sheet', 'error');
      if (reloadBtn) {
        reloadBtn.textContent = '🔄 Reload từ Sheet';
        reloadBtn.disabled = false;
      }
      return;
    }
    
    // Get current words from storage
    chrome.runtime.sendMessage({action: 'getHighlightedWords'}, (response2) => {
      const wordsFromStorage = response2.words || [];
      const wordMap = new Map();
      
      // First add words from storage
      for (const word of wordsFromStorage) {
        const key = `${word.word.toLowerCase()}_${word.url || ''}`;
        wordMap.set(key, word);
      }
      
      // Merge with words from Sheet (Sheet data takes priority, including domPath)
      for (const word of wordsFromSheet) {
        const key = `${word.word.toLowerCase()}_${word.url || ''}`;
        const existingWord = wordMap.get(key);
        
        if (existingWord) {
          // Update existing word with Sheet data (Sheet data takes priority)
          // Always update these fields from Sheet, even if empty (to override old values)
          existingWord.translation = word.translation || '';
          existingWord.pronunciation = word.pronunciation || '';
          existingWord.pos = word.pos || '';
          existingWord.example = word.example || '';
          existingWord.meaning = word.meaning || ''; // Update meaning field too
          existingWord.wordAudioUrlUS = word.wordAudioUrlUS || ''; // Update audio URLs
          existingWord.wordAudioUrlUK = word.wordAudioUrlUK || '';
          
          // Update domPath only if Sheet has it (don't overwrite with empty)
          if (word.domPath) existingWord.domPath = word.domPath;
          if (word.startOffset != null) existingWord.startOffset = word.startOffset;
          if (word.endOffset != null) existingWord.endOffset = word.endOffset;
        } else {
          // New word from Sheet
          wordMap.set(key, word);
        }
      }
      
      // Save all merged words back to storage
      const allWords = Array.from(wordMap.values());
      chrome.storage.local.set({highlightedWords: allWords}, () => {
        // Send message to content script to highlight words with domPath from current page
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs[0]) {
            const wordsToHighlight = allWords.filter(w => 
              w.url === tabs[0].url && 
              w.domPath && 
              w.startOffset != null && 
              w.endOffset != null
            );
            if (wordsToHighlight.length > 0) {
              chrome.tabs.sendMessage(tabs[0].id, {
                action: 'reloadHighlights',
                words: wordsToHighlight
              });
            }
          }
        });
        
        // Reload word list
        loadWords();
        showNotification(`Đã reload ${wordsFromSheet.length} từ từ Google Sheet!`);
        
        if (reloadBtn) {
          reloadBtn.textContent = '🔄 Reload từ Sheet';
          reloadBtn.disabled = false;
        }
      });
    });
  });
}

function updateWordList() {
  const wordList = document.getElementById('wordList');
  console.log('updateWordList called, highlightedWords:', highlightedWords.length);
  
  if (highlightedWords.length === 0) {
    wordList.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Chưa có từ nào được highlight</div>';
    return;
  }
  
  wordList.innerHTML = highlightedWords.map(word => {
    const translation = word.translation || '';
    
    let displayText = '';
    if (translation && translation.trim()) {
      displayText = `${word.word} : ${translation.trim()}`;
    } else {
      displayText = `${word.word} :`;
    }
    
    const example = word.example || '';
    
    return `
    <div class="word-item">
      <div>
        <div class="word-text" style="font-size: 14px; margin-bottom: ${example ? '4px' : '0'};">${displayText}</div>
        ${example ? `<div class="word-meaning" style="font-size: 12px; color: #666; font-style: italic;">${example}</div>` : ''}
      </div>
    </div>
  `;
  }).join('');
}

function deleteWord(word) {
  chrome.runtime.sendMessage({action: 'deleteWord', word: word}, (response) => {
    if (response.success) {
      loadWords();
    }
  });
}

function loadReviewWords() {
  chrome.storage.local.get(['wordCount'], (result) => {
    const wordCount = result.wordCount || 5;
    
    chrome.runtime.sendMessage({action: 'getRandomWords', count: wordCount}, (response) => {
      if (response && response.words && response.words.length > 0) {
        reviewWords = response.words;
        currentReviewIndex = 0;
        // Save state
        saveReviewState();
        displayReviewWords(response.words);
      } else {
        displayNoWords();
      }
    });
  });
}

function displayReviewWords(words) {
  const container = document.getElementById('reviewWordsContainer');
  container.innerHTML = '';
  
  words.forEach((word, index) => {
    const meaning = word.translation || word.meaning || 'Chưa có nghĩa';
    const displayText = `${word.word} : ${meaning}`;
    const example = word.example || '';
    
    const wordDiv = document.createElement('div');
    wordDiv.style.cssText = `
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 10px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      transition: all 0.3s ease;
    `;
    
    wordDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; flex: 1;">
          <div style="font-size: 12px; color: #666; margin-right: 12px; font-weight: bold;">#${index + 1}</div>
          <div style="flex: 1;">
            <div style="font-size: 14px; color: #333; margin-bottom: ${example ? '4px' : '0'};">${displayText}</div>
            ${example ? `<div style="font-size: 12px; color: #666; font-style: italic;">${example}</div>` : ''}
          </div>
        </div>
        <div style="display: flex; gap: 4px;">
          <button class="review-btn knew" data-word="${word.word}" data-url="${word.url || ''}" style="
            width: 28px;
            height: 28px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            transition: all 0.2s ease;
          " title="Tôi Biết">✓</button>
          <button class="review-btn didnt-know" data-word="${word.word}" data-url="${word.url || ''}" style="
            width: 28px;
            height: 28px;
            background: #f44336;
            color: white;
            border: none;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            transition: all 0.2s ease;
          " title="Tôi Không Biết">✗</button>
        </div>
      </div>
    `;
    
    container.appendChild(wordDiv);
  });
  
  // Add event listeners for all review buttons
  container.querySelectorAll('.review-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const word = e.target.dataset.word;
      const wordUrl = e.target.dataset.url || '';
      const isKnew = e.target.classList.contains('knew');
      
      // Update review stats
      chrome.runtime.sendMessage({action: 'updateReviewStats'}, (response) => {
        if (response.success) {
          document.getElementById('reviewStats').textContent = 
            `Tiến độ hôm nay: ${response.stats.todayReviewed}/${response.stats.totalReviewed} từ đã ôn tập`;
        }
      });
      
      // Mark word as reviewed with spaced repetition
      chrome.runtime.sendMessage({
        action: 'markWordReviewed',
        word: word,
        knew: isKnew
      });
      
      // Log to Google Sheets with URL
      chrome.runtime.sendMessage({
        action: 'logToSheets',
        logData: {
          action: 'review',
          word: word,
          url: wordUrl,
          knew: isKnew
        }
      });
      
      // Remove the word from display
      e.target.closest('div[style*="background: white"]').remove();
      
      // If no more words, show roll button
      if (container.children.length === 0) {
        showRollButton();
      }
    });
    
    // Add hover effects
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.1)';
      btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = 'none';
    });
  });
}

function displayNoWords() {
  const container = document.getElementById('reviewWordsContainer');
  container.innerHTML = `
    <div style="text-align: center; padding: 40px 20px; color: #666;">
      <div style="font-size: 18px; margin-bottom: 10px;">📚 Chưa có từ để ôn tập</div>
      <div style="font-size: 14px;">Hãy thêm một số từ trước!</div>
    </div>
  `;
}

function showRollButton() {
  const container = document.getElementById('reviewWordsContainer');
  container.innerHTML = `
    <div style="text-align: center; padding: 20px;">
      <div style="font-size: 16px; color: #666; margin-bottom: 15px;">🎉 Đã hoàn thành lượt ôn tập!</div>
      <button id="rollAgain" style="
        padding: 10px 20px;
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
        font-size: 14px;
      ">🎲 Roll</button>
    </div>
  `;
  
  document.getElementById('rollAgain').addEventListener('click', () => {
    loadReviewWords();
  });
}

function showNextReviewWord() {
  const reviewWordText = document.getElementById('reviewWordText');
  const reviewWordMeaning = document.getElementById('reviewWordMeaning');
  const reviewButtons = document.getElementById('reviewButtons');
  
  if (reviewWords.length === 0) {
    reviewWordText.textContent = 'Chưa có từ để ôn tập';
    reviewWordMeaning.textContent = 'Hãy thêm một số từ trước!';
    reviewButtons.style.display = 'none';
    return;
  }
  
  const currentWord = reviewWords[currentReviewIndex];
  reviewWordText.textContent = currentWord.word;
  reviewWordMeaning.textContent = currentWord.meaning || 'Chưa có nghĩa';
  reviewButtons.style.display = 'flex';
  
  updateReviewStats();
}

function handleReviewResponse(knewIt) {
  if (reviewWords.length === 0) return;
  
  const currentWord = reviewWords[currentReviewIndex];
  
  // Update word's review status
  chrome.storage.local.get(['highlightedWords'], (result) => {
    const words = result.highlightedWords || [];
    const wordIndex = words.findIndex(w => w.word === currentWord.word);
    
    if (wordIndex !== -1) {
      words[wordIndex].lastReviewed = Date.now();
      words[wordIndex].reviewCount = (words[wordIndex].reviewCount || 0) + 1;
      words[wordIndex].knewIt = knewIt;
      
      chrome.storage.local.set({highlightedWords: words});
    }
  });
  
  // Update review stats
  chrome.runtime.sendMessage({action: 'updateReviewStats'}, (response) => {
    if (response.success) {
      updateReviewStats(response.stats);
    }
  });
  
  // Move to next word
  currentReviewIndex++;
  
  // Save state
  saveReviewState();
  
  if (currentReviewIndex >= reviewWords.length) {
    // Finished, clear state and load new words
    clearReviewState();
    currentReviewIndex = 0;
    loadReviewWords(); // Load new random words
  } else {
    showNextReviewWord();
  }
}

function updateReviewStats(stats) {
  if (!stats) {
    chrome.storage.local.get(['reviewStats'], (result) => {
      stats = result.reviewStats || {todayReviewed: 0, totalReviewed: 0};
      document.getElementById('reviewStats').textContent = 
        `Tiến độ hôm nay: ${stats.todayReviewed} từ đã ôn tập`;
    });
  } else {
    document.getElementById('reviewStats').textContent = 
      `Tiến độ hôm nay: ${stats.todayReviewed} từ đã ôn tập`;
  }
}

function saveToGoogleSheet(sheetUrl) {
  // Extract sheet ID from URL
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) {
    showNotification('Invalid Google Sheets URL', 'error');
    return;
  }
  
  // Prepare data for sheet
  const data = highlightedWords.map(word => [
    word.word,
    word.meaning || '',
    new Date(word.firstHighlighted).toLocaleDateString(),
    word.count,
    word.url
  ]);
  
  // Add headers
  data.unshift(['Word', 'Meaning', 'Date Added', 'Count', 'Source URL']);
  
  // Send to Google Sheets (this would require Google Sheets API setup)
  showNotification('Google Sheets integration requires API setup', 'info');
}

function extractSheetId(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// Helper function to inject content script if needed
function ensureContentScriptInjected(callback) {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      const url = tabs[0].url;
      if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('moz-extension://')) {
        if (callback) callback(false, new Error('Cannot inject into system pages'));
        return;
      }
      
      // Try to inject content script
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['content.js']
      }).then(() => {
        // Also inject CSS
        chrome.scripting.insertCSS({
          target: { tabId: tabs[0].id },
          files: ['content.css']
        }).then(() => {
          if (callback) callback(true, null);
        }).catch((error) => {
          if (callback) callback(false, error);
        });
      }).catch((error) => {
        if (callback) callback(false, error);
      });
    }
  });
}

// Helper function to safely send messages to content script
function sendMessageToContentScript(message, callback) {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      // Check if we can inject into this tab
      const url = tabs[0].url;
      if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('moz-extension://')) {
        if (callback) callback(null, new Error('Cannot inject into system pages'));
        return;
      }
      
      chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Content script not available:', chrome.runtime.lastError.message);
          if (callback) callback(null, chrome.runtime.lastError);
        } else {
          if (callback) callback(response, null);
        }
      });
    }
  });
}


function updateShortcutStatus(modifier, key) {
  const statusDiv = document.getElementById('shortcutStatus');
  const modifierText = {
    'alt': 'Alt',
    'ctrl': 'Ctrl', 
    'shift': 'Shift',
    'meta': 'Cmd'
  };
  statusDiv.textContent = `Hiện tại: ${modifierText[modifier]} + ${key.toUpperCase()}`;
}

function loadSettings() {
  // Load highlight mode status
  sendMessageToContentScript({action: 'getHighlightMode'}, (response, error) => {
    const statusDiv = document.getElementById('connectionStatus');
    if (error) {
      // Try to inject content script
      ensureContentScriptInjected((success, injectError) => {
        if (success) {
          // Retry sending message after injection
          setTimeout(() => {
            sendMessageToContentScript({action: 'getHighlightMode'}, (retryResponse, retryError) => {
              if (retryError) {
                updateToggleButton(false);
                statusDiv.innerHTML = '⚠️ Vẫn không thể kết nối, vui lòng refresh trang';
                statusDiv.style.color = '#f44336';
                statusDiv.style.background = '#ffebee';
              } else {
                updateToggleButton(retryResponse.highlightMode);
                statusDiv.innerHTML = '✅ Kết nối thành công - Sẵn sàng highlight';
                statusDiv.style.color = '#4CAF50';
                statusDiv.style.background = '#e8f5e8';
              }
            });
          }, 100);
        } else {
          // Content script not loaded, set default state
          updateToggleButton(false);
          
          if (injectError.message === 'Cannot inject into system pages') {
            statusDiv.innerHTML = 'ℹ️ Không thể highlight trên trang hệ thống (chrome://, extension pages)';
            statusDiv.style.color = '#2196F3';
            statusDiv.style.background = '#e3f2fd';
          } else {
            statusDiv.innerHTML = '⚠️ Vui lòng refresh trang để sử dụng tính năng highlight';
            statusDiv.style.color = '#f44336';
            statusDiv.style.background = '#ffebee';
            document.getElementById('injectScriptBtn').style.display = 'block';
          }
          console.log('Content script not loaded yet:', injectError.message);
        }
      });
    } else if (response) {
      updateToggleButton(response.highlightMode);
      statusDiv.innerHTML = '✅ Kết nối thành công - Sẵn sàng highlight';
      statusDiv.style.color = '#4CAF50';
      statusDiv.style.background = '#e8f5e8';
    }
  });
}

function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: ${type === 'error' ? '#f44336' : type === 'info' ? '#2196F3' : '#4CAF50'};
    color: white;
    padding: 10px 15px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 1000;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 3000);
}

// Export settings to TXT file
function exportSettingsToFile() {
  chrome.storage.local.get([
    'shortcutSettings', 
    'highlightColor', 
    'wordCount',
    'wordFilterMode',
    'sheetUrl',
    'sheetName',
    'selectedSheetId',
    'voicerssApiKey'
  ], (result) => {
    const settings = {
      shortcutSettings: result.shortcutSettings || {modifier: 'alt', key: 'f'},
      highlightColor: result.highlightColor || '#FFEB3B',
      wordCount: result.wordCount || 5,
      wordFilterMode: result.wordFilterMode || 'current',
      sheetUrl: result.sheetUrl || 'https://docs.google.com/spreadsheets/d/1LTnXrNzm-MM6a5ElqhwUqNa70wsOVNJI2Wr7zGwZwb0/edit',
      sheetName: result.sheetName || '',
      selectedSheetId: result.selectedSheetId || '',
      voicerssApiKey: result.voicerssApiKey || '',
      exportDate: new Date().toISOString(),
      version: '1.0'
    };
    
    // Create and download JSON file
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'settings.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Đã export cài đặt thành công!');
  });
}

// Import settings from JSON file
function importSettingsFromFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const settings = JSON.parse(e.target.result);
      
      // Validate settings
      if (settings.shortcutSettings && settings.highlightColor && settings.wordCount !== undefined) {
        chrome.storage.local.set({
          shortcutSettings: settings.shortcutSettings,
          highlightColor: settings.highlightColor,
          wordCount: settings.wordCount,
          wordFilterMode: settings.wordFilterMode || 'current',
          sheetUrl: settings.sheetUrl || 'https://docs.google.com/spreadsheets/d/1LTnXrNzm-MM6a5ElqhwUqNa70wsOVNJI2Wr7zGwZwb0/edit',
          sheetName: settings.sheetName || '',
          selectedSheetId: settings.selectedSheetId || '',
          voicerssApiKey: settings.voicerssApiKey || ''
        }, () => {
          // Reload settings in UI
          loadSettings();
          showNotification('Đã import cài đặt thành công!');
        });
      } else {
        showNotification('File cài đặt không hợp lệ', 'error');
      }
    } catch (error) {
      showNotification('Lỗi khi đọc file JSON', 'error');
    }
  };
  reader.readAsText(file);
}

// Load default settings from settings.json file (force reload)
function loadDefaultSettingsFromFile() {
  fetch(chrome.runtime.getURL('settings.json'))
    .then(response => response.json())
    .then(fileSettings => {
      // Force load settings from file (override existing)
      chrome.storage.local.set({
        shortcutSettings: fileSettings.shortcutSettings,
        highlightColor: fileSettings.highlightColor,
        wordCount: fileSettings.wordCount,
        wordFilterMode: fileSettings.wordFilterMode || 'current',
        sheetUrl: fileSettings.sheetUrl || 'https://docs.google.com/spreadsheets/d/1LTnXrNzm-MM6a5ElqhwUqNa70wsOVNJI2Wr7zGwZwb0/edit',
        sheetName: fileSettings.sheetName || '',
        selectedSheetId: fileSettings.selectedSheetId || '',
        voicerssApiKey: fileSettings.voicerssApiKey || ''
      }, () => {
        // Settings loaded from file - send to content script
        sendMessageToContentScript({
          action: 'updateShortcut',
          shortcut: fileSettings.shortcutSettings
        });
        
        // Reload UI
        loadSettings();
        showNotification('Đã reset về mặc định từ settings.json!');
      });
    })
    .catch(error => {
      console.error('Error loading default settings:', error);
      showNotification('Lỗi khi load settings.json. Sử dụng giá trị mặc định.', 'error');
      // Use hardcoded defaults
      chrome.storage.local.set({
        shortcutSettings: {modifier: 'alt', key: 'f'},
        highlightColor: '#FFEB3B',
        wordCount: 5,
        wordFilterMode: 'current',
        sheetUrl: 'https://docs.google.com/spreadsheets/d/1LTnXrNzm-MM6a5ElqhwUqNa70wsOVNJI2Wr7zGwZwb0/edit',
        sheetName: '',
        selectedSheetId: '',
        voicerssApiKey: ''
      }, () => {
        loadSettings();
      });
    });
}

// Initialize default settings only if not already set in storage
function initializeDefaultSettingsIfNeeded() {
  chrome.storage.local.get(['shortcutSettings', 'highlightColor', 'wordCount', 'wordFilterMode', 'sheetUrl', 'sheetName', 'selectedSheetId', 'voicerssApiKey', 'sheetUrlConfigured'], (result) => {
    // Check if settings already exist
    const hasSettings = result.shortcutSettings && result.highlightColor && result.wordCount !== undefined;
    
    if (!hasSettings) {
      // Only load defaults if settings don't exist
      fetch(chrome.runtime.getURL('settings.json'))
        .then(response => response.json())
        .then(fileSettings => {
          // Set default settings from file only if not already set
          // IMPORTANT: Never override sheetUrl, sheetName if they are already configured by user
          const settingsToSet = {};
          if (!result.shortcutSettings) {
            settingsToSet.shortcutSettings = fileSettings.shortcutSettings;
          }
          if (!result.highlightColor) {
            settingsToSet.highlightColor = fileSettings.highlightColor;
          }
          if (result.wordCount === undefined) {
            settingsToSet.wordCount = fileSettings.wordCount;
          }
          if (!result.wordFilterMode) {
            settingsToSet.wordFilterMode = fileSettings.wordFilterMode || 'current';
          }
          // Only set sheetUrl if it's truly empty/undefined AND user hasn't configured it before
          // Never override if sheetUrlConfigured flag is true
          if (!result.sheetUrlConfigured && (!result.sheetUrl || result.sheetUrl.trim() === '')) {
            settingsToSet.sheetUrl = fileSettings.sheetUrl || 'https://docs.google.com/spreadsheets/d/1LTnXrNzm-MM6a5ElqhwUqNa70wsOVNJI2Wr7zGwZwb0/edit';
          }
          if (!result.sheetUrlConfigured && (!result.sheetName || result.sheetName.trim() === '')) {
            settingsToSet.sheetName = fileSettings.sheetName || '';
          }
          if (!result.sheetUrlConfigured && (!result.selectedSheetId || result.selectedSheetId.trim() === '')) {
            settingsToSet.selectedSheetId = fileSettings.selectedSheetId || '';
          }
          if (!result.voicerssApiKey || result.voicerssApiKey.trim() === '') {
            settingsToSet.voicerssApiKey = fileSettings.voicerssApiKey || '';
          }
          
          if (Object.keys(settingsToSet).length > 0) {
            chrome.storage.local.set(settingsToSet, () => {
              // Send shortcut to content script if it was set
              if (settingsToSet.shortcutSettings) {
                sendMessageToContentScript({
                  action: 'updateShortcut',
                  shortcut: settingsToSet.shortcutSettings
                });
              }
            });
          }
        })
        .catch(error => {
          // If file doesn't exist, use hardcoded defaults only for missing settings
          // IMPORTANT: Never override sheetUrl, sheetName if they are already configured by user
          const settingsToSet = {};
          if (!result.shortcutSettings) {
            settingsToSet.shortcutSettings = {modifier: 'alt', key: 'f'};
          }
          if (!result.highlightColor) {
            settingsToSet.highlightColor = '#FFEB3B';
          }
          if (result.wordCount === undefined) {
            settingsToSet.wordCount = 5;
          }
          if (!result.wordFilterMode) {
            settingsToSet.wordFilterMode = 'current';
          }
          // Only set sheetUrl if it's truly empty/undefined AND user hasn't configured it before
          // Never override if sheetUrlConfigured flag is true
          if (!result.sheetUrlConfigured && (!result.sheetUrl || result.sheetUrl.trim() === '')) {
            settingsToSet.sheetUrl = 'https://docs.google.com/spreadsheets/d/1LTnXrNzm-MM6a5ElqhwUqNa70wsOVNJI2Wr7zGwZwb0/edit';
          }
          if (!result.sheetUrlConfigured && (!result.sheetName || result.sheetName.trim() === '')) {
            settingsToSet.sheetName = '';
          }
          if (!result.sheetUrlConfigured && (!result.selectedSheetId || result.selectedSheetId.trim() === '')) {
            settingsToSet.selectedSheetId = '';
          }
          if (!result.voicerssApiKey || result.voicerssApiKey.trim() === '') {
            settingsToSet.voicerssApiKey = '';
          }
          
          if (Object.keys(settingsToSet).length > 0) {
            chrome.storage.local.set(settingsToSet);
          }
        });
    }
  });
}

// Initialize Google Sheets API
let googleSheetsAPI = null;

// Initialize immediately
function initializeGoogleSheetsAPI() {
  try {
    console.log('Initializing Google Sheets API...');
    googleSheetsAPI = new GoogleSheetsAPI();
    console.log('Google Sheets API initialized successfully');
  } catch (error) {
    console.error('Error initializing Google Sheets API:', error);
  }
}

// Start initialization when page loads
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing Google Sheets API...');
  initializeGoogleSheetsAPI();
});

// Log action to Google Sheets
async function logToGoogleSheets(action, word, details = {}) {
  if (!googleSheetsAPI) {
    console.log('Google Sheets API not ready yet, skipping log');
    return;
  }
  
  chrome.storage.local.get(['sheetUrl', 'sheetName'], async (result) => {
    if (!result.sheetUrl || !result.sheetName) {
      console.log('No sheet URL or name configured, skipping log');
      return;
    }
    
    try {
      console.log('Logging action to Google Sheets:', {action, word, details, sheetUrl: result.sheetUrl, sheetName: result.sheetName});
      await googleSheetsAPI.logAction(result.sheetUrl, result.sheetName, action, word, details);
      console.log('Successfully logged to Google Sheets:', {action, word, details});
    } catch (error) {
      console.error('Error logging to Google Sheets:', error);
      console.error('Error stack:', error.stack);
      // Don't show error to user for logging failures
    }
  });
}

// Extract Google Sheet ID from URL
function extractSheetId(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// Load settings into UI
function loadSettings() {
  chrome.storage.local.get(['shortcutSettings', 'highlightColor', 'wordCount', 'sheetUrl', 'sheetName', 'voicerssApiKey'], (result) => {
    // Load shortcut settings
    const settings = result.shortcutSettings || {modifier: 'alt', key: 'f'};
    document.getElementById('modifierKey').value = settings.modifier;
    document.getElementById('shortcutKey').value = settings.key.toUpperCase();
    updateShortcutStatus(settings.modifier, settings.key);
    
    // Send shortcut to content script
    sendMessageToContentScript({
      action: 'updateShortcut',
      shortcut: settings
    });
    
    // Load highlight color
    const color = result.highlightColor || '#FFEB3B';
    document.getElementById('currentColor').style.backgroundColor = color;
    document.querySelectorAll('.color-option').forEach(option => {
      option.classList.remove('selected');
      if (option.dataset.color === color) {
        option.classList.add('selected');
      }
    });
    
    // Load word count
    const count = result.wordCount || 5;
    document.getElementById('wordCount').value = count;
    
    // Load sheet URL
    const sheetUrl = result.sheetUrl || 'https://docs.google.com/spreadsheets/d/1esJJVzgowqyY8YXeps4fN3acToqpMuETkdP1JsJbQeI/edit?usp=sharing';
    document.getElementById('sheetUrl').value = sheetUrl;
    
    // Load sheet name and show dropdown if configured
    const sheetName = result.sheetName || '';
    if (sheetName) {
      document.getElementById('sheetSelect').value = sheetName;
      document.getElementById('sheetsDropdown').style.display = 'block';
    }
    
    // Load VoiceRSS API Key
    const voicerssApiKey = result.voicerssApiKey || '';
    const voicerssApiKeyInput = document.getElementById('voicerssApiKey');
    if (voicerssApiKeyInput) {
      voicerssApiKeyInput.value = voicerssApiKey;
    }
  });
}

// Handle Google Sheets logging from background script
async function handleGoogleSheetsLogging(request, sendResponse) {
  try {
    console.log('Popup handling Google Sheets logging:', request);
    
    if (!googleSheetsAPI) {
      console.log('GoogleSheetsAPI not initialized, initializing now...');
      initializeGoogleSheetsAPI();
    }
    
    if (!googleSheetsAPI) {
      throw new Error('Failed to initialize GoogleSheetsAPI');
    }
    
    console.log('Calling logAction with:', {
      sheetUrl: request.sheetUrl,
      sheetName: request.sheetName,
      action: request.logData.action,
      word: request.logData.word
    });
    
    await googleSheetsAPI.logAction(
      request.sheetUrl,
      request.sheetName,
      request.logData.action,
      request.logData.word,
      {
        timestamp: request.logData.timestamp,
        url: request.logData.url
      }
    );
    
    console.log('Successfully logged to Google Sheets from popup:', request.logData);
    sendResponse({success: true});
  } catch (error) {
    console.error('Error logging to Google Sheets from popup:', error);
    console.error('Error stack:', error.stack);
    sendResponse({success: false, error: error.message});
  }
}
