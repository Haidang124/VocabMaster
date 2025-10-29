// Popup script for handling UI interactions
let currentTab = 'highlights';
let highlightedWords = [];
let reviewWords = [];
let currentReviewIndex = 0;

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  // Wait a bit to ensure all elements are loaded
  setTimeout(() => {
  initializeTabs();
  initializeColorPicker();
  initializeControls();
  initializeWordList();
  initializeReview();
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
  }, 100);
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
        // Load words when switching to highlights tab
        loadWords();
      } else if (tabName === 'review') {
        loadReviewWords();
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
          console.log('Content script not available for color update');
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
  // Load default settings from file first
  loadDefaultSettings();
  
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
            console.log('Content script not available for shortcut update');
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
      
      if (count < 1 || count > 20) {
        showNotification('Số từ phải từ 1 đến 20', 'error');
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
  
  // Delete all button
  document.getElementById('deleteAll').addEventListener('click', () => {
    // Get current tab URL
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const currentUrl = tabs[0]?.url || 'Unknown';
      
      if (confirm(`Bạn có chắc muốn xóa tất cả từ đã highlight từ trang này?\n\nURL: ${currentUrl}`)) {
        chrome.runtime.sendMessage({
          action: 'deleteAllWords',
          currentUrl: currentUrl
        }, (response) => {
          if (response.success) {
            loadWords();
            showNotification(`Đã xóa ${response.deletedCount} từ từ trang này! Còn lại ${response.remainingCount} từ từ các trang khác.`);
          }
        });
      }
    });
  });
  
  // Copy all button
  document.getElementById('copyAll').addEventListener('click', () => {
    const wordsText = highlightedWords.map(w => `${w.word} - ${w.meaning || 'Chưa có nghĩa'}`).join('\n');
    navigator.clipboard.writeText(wordsText).then(() => {
      showNotification('Đã sao chép tất cả từ vào clipboard!');
    });
  });
  
        
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
              
              console.log('Starting to fetch sheets...');
              console.log('Google Sheets API instance:', googleSheetsAPI);
              console.log('Fetching sheets for URL:', sheetUrl);
              
              const sheets = await googleSheetsAPI.fetchSheets(sheetUrl);
              console.log('Fetched sheets successfully:', sheets);
              
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
              console.error('Error fetching sheets:', error);
              console.error('Error stack:', error.stack);
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
            chrome.storage.local.set({
              sheetUrl: sheetUrl,
              sheetName: selectedSheetName,
              selectedSheetId: sheetId
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
  // Load words when initializing
  loadWords();
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

function loadWords() {
  chrome.runtime.sendMessage({action: 'getHighlightedWords'}, (response) => {
    highlightedWords = response.words || [];
    console.log('Loaded words:', highlightedWords.length, highlightedWords);
    updateWordList();
  });
}

function updateWordList() {
  const wordList = document.getElementById('wordList');
  console.log('updateWordList called, highlightedWords:', highlightedWords.length);
  
  if (highlightedWords.length === 0) {
    wordList.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Chưa có từ nào được highlight</div>';
    return;
  }
  
  wordList.innerHTML = highlightedWords.map(word => `
    <div class="word-item">
      <div>
        <div class="word-text">${word.word}</div>
        <div class="word-meaning">${word.meaning || 'Chưa có nghĩa'}</div>
      </div>
      <button class="delete-btn" onclick="deleteWord('${word.word}')">🗑️</button>
    </div>
  `).join('');
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
            <div style="font-size: 18px; font-weight: bold; color: #333; margin-bottom: 4px;">${word.word}</div>
            <div style="font-size: 14px; color: #666;">${word.meaning || 'Chưa có nghĩa'}</div>
          </div>
        </div>
        <div style="display: flex; gap: 4px;">
          <button class="review-btn knew" data-word="${word.word}" style="
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
          <button class="review-btn didnt-know" data-word="${word.word}" style="
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
      
      // Log to Google Sheets
      logToGoogleSheets('review', word, {knew: isKnew});
      
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
  if (currentReviewIndex >= reviewWords.length) {
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
    'sheetUrl',
    'sheetName',
    'selectedSheetId'
  ], (result) => {
    const settings = {
      shortcutSettings: result.shortcutSettings || {modifier: 'alt', key: 'h'},
      highlightColor: result.highlightColor || '#FFEB3B',
      wordCount: result.wordCount || 5,
      sheetUrl: result.sheetUrl || 'https://docs.google.com/spreadsheets/d/1LTnXrNzm-MM6a5ElqhwUqNa70wsOVNJI2Wr7zGwZwb0/edit',
      sheetName: result.sheetName || '',
      selectedSheetId: result.selectedSheetId || '',
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
          sheetUrl: settings.sheetUrl || 'https://docs.google.com/spreadsheets/d/1LTnXrNzm-MM6a5ElqhwUqNa70wsOVNJI2Wr7zGwZwb0/edit',
          sheetName: settings.sheetName || '',
          selectedSheetId: settings.selectedSheetId || ''
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

// Load settings from settings.json file
function loadDefaultSettings() {
  fetch(chrome.runtime.getURL('settings.json'))
    .then(response => response.json())
    .then(fileSettings => {
      // Always load settings from file (override existing)
      chrome.storage.local.set({
        shortcutSettings: fileSettings.shortcutSettings,
        highlightColor: fileSettings.highlightColor,
        wordCount: fileSettings.wordCount,
        sheetUrl: fileSettings.sheetUrl || 'https://docs.google.com/spreadsheets/d/1LTnXrNzm-MM6a5ElqhwUqNa70wsOVNJI2Wr7zGwZwb0/edit',
        sheetName: fileSettings.sheetName || '',
        selectedSheetId: fileSettings.selectedSheetId || ''
      }, () => {
        // Settings loaded from file - send to content script
        sendMessageToContentScript({
          action: 'updateShortcut',
          shortcut: fileSettings.shortcutSettings
        });
      });
    })
    .catch(error => {
      // If file doesn't exist, use hardcoded defaults
      chrome.storage.local.set({
        shortcutSettings: {modifier: 'alt', key: 'h'},
        highlightColor: '#FFEB3B',
        wordCount: 5,
        sheetUrl: 'https://docs.google.com/spreadsheets/d/1LTnXrNzm-MM6a5ElqhwUqNa70wsOVNJI2Wr7zGwZwb0/edit',
        sheetName: '',
        selectedSheetId: ''
      });
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
  chrome.storage.local.get(['shortcutSettings', 'highlightColor', 'wordCount', 'sheetUrl', 'sheetName'], (result) => {
    // Load shortcut settings
    const settings = result.shortcutSettings || {modifier: 'alt', key: 'h'};
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
