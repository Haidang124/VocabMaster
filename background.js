// Background script for handling keyboard shortcuts and storage
chrome.commands.onCommand.addListener((command) => {
  if (command === 'highlight-word') {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {action: 'highlightWord'});
      }
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
        chrome.storage.local.set({
          highlightedWords: [],
          highlightMode: false,
          highlightColor: '#FFEB3B',
          sheetUrl: 'https://docs.google.com/spreadsheets/d/1esJJVzgowqyY8YXeps4fN3acToqpMuETkdP1JsJbQeI/edit?usp=sharing',
          sheetName: 'Newword',
          shortcutSettings: {modifier: 'alt', key: 'f'},
          reviewStats: {
            totalReviewed: 0,
            lastReviewDate: null,
            todayReviewed: 0
          }
        });
        
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getHighlightedWords') {
    chrome.storage.local.get(['highlightedWords'], (result) => {
      sendResponse({words: result.highlightedWords || []});
    });
    return true;
  }
  
  if (request.action === 'deleteAllWords') {
    chrome.storage.local.get(['highlightedWords', 'sheetUrl', 'sheetName'], async (result) => {
      const words = result.highlightedWords || [];
      const currentUrl = request.currentUrl || 'Unknown';
      
      const wordsFromCurrentUrl = words.filter(w => w.url === currentUrl);
      const remainingWords = words.filter(w => w.url !== currentUrl);
      
      chrome.storage.local.set({highlightedWords: remainingWords}, () => {
        sendResponse({
          success: true, 
          deletedCount: wordsFromCurrentUrl.length,
          remainingCount: remainingWords.length
        });
      });
      
      if (result.sheetUrl && result.sheetName && wordsFromCurrentUrl.length > 0) {
        try {
          await logToGoogleSheetsDirectly(result.sheetUrl, result.sheetName, {
            action: 'delete_all',
            word: `ALL_WORDS_FROM_URL (${wordsFromCurrentUrl.length} words from ${currentUrl})`,
            timestamp: new Date().toLocaleString(),
            url: currentUrl
          });
        } catch (error) {
          console.error('Error logging delete all words from current URL to Google Sheets:', error);
        }
      }
    });
    return true;
  }
  
  if (request.action === 'deleteWord') {
    chrome.storage.local.get(['highlightedWords', 'sheetUrl', 'sheetName'], async (result) => {
      const words = result.highlightedWords || [];
      const filteredWords = words.filter(w => !(w.word === request.word && w.url === request.url));
      
      chrome.storage.local.set({highlightedWords: filteredWords}, () => {
        sendResponse({success: true});
      });
      
      if (result.sheetUrl && result.sheetName) {
        try {
          await logToGoogleSheetsDirectly(result.sheetUrl, result.sheetName, {
            action: 'delete',
            word: request.word,
            url: request.url,
            timestamp: new Date().toLocaleString()
          });
        } catch (error) {
          console.error('Error deleting word from Google Sheets:', error);
        }
      }
    });
    return true;
  }
  
        if (request.action === 'getRandomWords') {
          (async () => {
            const wordsFromSheet = await loadWordsFromSheet();
            chrome.storage.local.get(['highlightedWords'], (result) => {
              const words = [...(result.highlightedWords || []), ...wordsFromSheet];
              const count = request.count || 5;
              const randomWords = getRandomWordsForReview(words, count);
              sendResponse({words: randomWords});
            });
          })();
          return true;
        }
        
        if (request.action === 'loadWordsFromSheet') {
          (async () => {
            const words = await loadWordsFromSheet();
            sendResponse({words: words});
          })();
          return true;
        }
  
  if (request.action === 'updateReviewStats') {
    chrome.storage.local.get(['reviewStats'], (result) => {
      const stats = result.reviewStats || {
        totalReviewed: 0,
        lastReviewDate: null,
        todayReviewed: 0
      };
      
      const today = new Date().toDateString();
      const lastDate = stats.lastReviewDate ? new Date(stats.lastReviewDate).toDateString() : null;
      
      if (lastDate !== today) {
        stats.todayReviewed = 0;
      }
      
      stats.totalReviewed += 1;
      stats.todayReviewed += 1;
      stats.lastReviewDate = new Date().toISOString();
      
      chrome.storage.local.set({reviewStats: stats}, () => {
        sendResponse({stats: stats});
      });
    });
    return true;
  }
  
        if (request.action === 'wordAdded') {
          const word = request.word;
          chrome.storage.local.get(['sheetUrl'], (result) => {
            if (result.sheetUrl) {
            }
          });
          sendResponse({success: true});
          return true;
        }
        
        if (request.action === 'logToSheets') {
          chrome.storage.local.get(['sheetUrl', 'sheetName'], async (result) => {
            if (!result.sheetUrl || !result.sheetName) {
              sendResponse({
                success: false, 
                error: 'Google Sheets not configured',
                showNotification: true,
                notificationMessage: 'Chưa cấu hình Google Sheets! Vào Cài Đặt để thiết lập.'
              });
              return;
            }
            
            try {
              await logToGoogleSheetsDirectly(result.sheetUrl, result.sheetName, request.logData);
              sendResponse({success: true});
            } catch (error) {
              console.error('Error logging to Google Sheets:', error);
              
              sendResponse({
                success: false, 
                error: error.message,
                showNotification: true,
                notificationMessage: `Không thể lưu vào Google Sheets: ${error.message}`
              });
              return;
            }
          });
          return true;
        }
        
        if (request.action === 'markWordReviewed') {
          chrome.storage.local.get(['highlightedWords'], (result) => {
            const words = result.highlightedWords || [];
            const wordIndex = words.findIndex(w => w.word === request.word);
            
            if (wordIndex !== -1) {
              const now = Date.now();
              const word = words[wordIndex];
              
              word.lastReviewed = now;
              word.reviewCount = (word.reviewCount || 0) + 1;
              word.knewIt = request.knew;
              
              if (request.knew) {
                const currentInterval = word.reviewInterval || 1;
                word.reviewInterval = Math.min(currentInterval * 2, 30);
                word.nextReview = now + (word.reviewInterval * 24 * 60 * 60 * 1000);
              } else {
                word.reviewInterval = 1;
                word.nextReview = now + (24 * 60 * 60 * 1000);
              }
              
              chrome.storage.local.set({highlightedWords: words});
            }
          });
          sendResponse({success: true});
          return true;
        }
        
        if (request.action === 'fetchDictionary') {
          (async () => {
            if (!request.word || typeof request.word !== 'string') {
              sendResponse({success: false, error: 'Invalid word parameter'});
              return;
            }
            
            const dictResult = await fetchDictionaryDefinition(request.word);
            
            chrome.storage.local.get(['highlightedWords', 'sheetUrl', 'sheetName', 'voicerssApiKey'], async (result) => {
              const words = result.highlightedWords || [];
              const wordIndex = words.findIndex(w => w.word === request.word && w.url === request.url);
              
              // Generate audio URLs for word
              // Priority: 1. Dictionary API audio (US/UK), 2. VoiceRSS
              // Column I: US audio, Column J: UK audio
              // Note: Example audio URL không lưu, sẽ generate khi cần
              let wordAudioUrlUS = null;
              let wordAudioUrlUK = null;
              
              if (dictResult) {
                // First, try to get audio from dictionary API
                if (dictResult.wordAudioUrlUS) {
                  wordAudioUrlUS = dictResult.wordAudioUrlUS;
                }
                if (dictResult.wordAudioUrlUK) {
                  wordAudioUrlUK = dictResult.wordAudioUrlUK;
                }
              }
              
              // If no US audio from dictionary API, use VoiceRSS as fallback
              if (!wordAudioUrlUS && result.voicerssApiKey && request.word) {
                try {
                  wordAudioUrlUS = await generateAudioUrl(request.word, result.voicerssApiKey);
                } catch (error) {
                  console.error('Error generating US audio with VoiceRSS:', error);
                }
              }
              
              // If no UK audio from dictionary API, use VoiceRSS as fallback
              if (!wordAudioUrlUK && result.voicerssApiKey && request.word) {
                try {
                  wordAudioUrlUK = await generateAudioUrl(request.word, result.voicerssApiKey);
                } catch (error) {
                  console.error('Error generating UK audio with VoiceRSS:', error);
                }
              }
              
              // Note: Example audio URL không lưu vào storage/sheet
              // Sẽ generate từ example text khi cần play (vì VoiceRSS URL có thể generate lại)
              
              // Update storage with dictionary data if available
              if (dictResult && wordIndex !== -1) {
                if (!words[wordIndex].meaning) words[wordIndex].meaning = dictResult.meaning;
                if (!words[wordIndex].pronunciation && dictResult.pronunciation) words[wordIndex].pronunciation = dictResult.pronunciation;
                if (!words[wordIndex].pos && dictResult.pos) words[wordIndex].pos = dictResult.pos;
                if (!words[wordIndex].translation && dictResult.translation) words[wordIndex].translation = dictResult.translation;
                if (!words[wordIndex].example && dictResult.example) words[wordIndex].example = dictResult.example;
                if (wordAudioUrlUS) words[wordIndex].wordAudioUrlUS = wordAudioUrlUS;
                if (wordAudioUrlUK) words[wordIndex].wordAudioUrlUK = wordAudioUrlUK;
                // exampleAudioUrl không lưu vào storage, sẽ generate khi cần
                chrome.storage.local.set({highlightedWords: words});
              }
              
              // Update sheet: if word exists, only update audio (columns I, J); otherwise add new row
              if (result.sheetUrl && result.sheetName) {
                // Check if word already exists in sheet
                const wordExists = wordIndex !== -1;
                
                if (wordExists && (wordAudioUrlUS || wordAudioUrlUK)) {
                  // Word exists, only update audio columns I and J
                  try {
                    await updateAudioInSheet(result.sheetUrl, result.sheetName, request.word, request.url, wordAudioUrlUS, wordAudioUrlUK);
                  } catch (err) {
                    console.error('Error updating audio in Google Sheet:', err);
                  }
                } else if (!wordExists) {
                  // Word doesn't exist, add new row
                  const wordInStorage = wordIndex !== -1 ? words[wordIndex] : null;
                  const sheetData = {
                    action: 'add',
                    word: request.word,
                    pronunciation: dictResult?.pronunciation || '',
                    pos: dictResult?.pos || '',
                    translation: dictResult?.translation || '',
                    example: dictResult?.example || '',
                    url: request.url,
                    timestamp: new Date().toLocaleString(),
                    domPath: wordInStorage?.domPath || '',
                    startOffset: wordInStorage?.startOffset != null ? wordInStorage.startOffset : null,
                    endOffset: wordInStorage?.endOffset != null ? wordInStorage.endOffset : null,
                    wordAudioUrlUS: wordAudioUrlUS || '', // Column I: US audio
                    wordAudioUrlUK: wordAudioUrlUK || '' // Column J: UK audio
                    // Note: Example audio URL không lưu vào sheet, sẽ generate khi cần
                  };
                  try {
                    await logToGoogleSheetsDirectly(result.sheetUrl, result.sheetName, sheetData);
                  } catch (err) {
                    console.error('Error adding word to Google Sheet:', err);
                  }
                }
              }
            });
            
            sendResponse({success: true, meaning: dictResult});
          })();
          return true;
        }
        
        if (request.action === 'generateAudio') {
          (async () => {
            try {
              const { text, apiKey } = request;
              if (!text || !apiKey) {
                sendResponse({success: false, error: 'Text and API key required'});
                return;
              }
              const audioUrl = await generateAudioUrl(text, apiKey);
              sendResponse({success: true, audioUrl: audioUrl});
            } catch (error) {
              sendResponse({success: false, error: error.message});
            }
          })();
          return true;
        }
        
        if (request.action === 'updateAudioInSheet') {
          (async () => {
            try {
              const { sheetUrl, sheetName, word, url, wordAudioUrlUS, wordAudioUrlUK } = request;
              await updateAudioInSheet(sheetUrl, sheetName, word, url, wordAudioUrlUS, wordAudioUrlUK);
              sendResponse({success: true});
            } catch (error) {
              sendResponse({success: false, error: error.message});
            }
          })();
          return true;
        }
        
        if (request.action === 'fetchAudioAsBlob') {
          (async () => {
            try {
              const { audioUrl } = request;
              if (!audioUrl) {
                sendResponse({success: false, error: 'No audio URL provided'});
                return;
              }
              
              // Fetch audio data with headers to avoid 403 error
              // Add headers to mimic browser request
              const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://dictionary.cambridge.org/',
                'Origin': 'https://dictionary.cambridge.org'
              };
              
              const response = await fetch(audioUrl, {
                method: 'GET',
                headers: headers,
                mode: 'cors',
                credentials: 'omit'
              });
              
              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
              }
              
              // Get audio data as blob
              const blob = await response.blob();
              
              // Convert blob to base64
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64data = reader.result;
                sendResponse({
                  success: true,
                  blobUrl: base64data,
                  mimeType: blob.type || 'audio/mpeg'
                });
              };
              reader.onerror = () => {
                sendResponse({success: false, error: 'Failed to read audio blob'});
              };
              reader.readAsDataURL(blob);
            } catch (error) {
              console.error('Error fetching audio:', error);
              sendResponse({success: false, error: error.message});
            }
          })();
          return true; // Keep channel open for async response
        }
        
        if (request.action === 'playAudio') {
          // Play audio in hidden tab to avoid CORS issues
          playAudioInTab(request.url);
          sendResponse({success: true});
          return true;
        }
        
        if (request.action === 'reloadMP3ForAllWords') {
          (async () => {
            try {
              const { sheetUrl, sheetName, voicerssApiKey } = request;
              
              if (!sheetUrl || !sheetName || !voicerssApiKey) {
                sendResponse({success: false, error: 'Missing required parameters'});
                return;
              }
              
              // Load all words from sheet
              const wordsFromSheet = await loadWordsFromSheet();
              
              let processed = 0;
              let generated = 0;
              
              // Process each word
              for (const word of wordsFromSheet) {
                processed++;
                
                // Check if word needs audio (missing US or UK audio)
                const hasUSAudio = word.wordAudioUrlUS && word.wordAudioUrlUS.trim();
                const hasUKAudio = word.wordAudioUrlUK && word.wordAudioUrlUK.trim();
                
                if (!hasUSAudio || !hasUKAudio) {
                  try {
                    // First, try to get audio from dictionary API
                    const dictResult = await fetchDictionaryDefinition(word.word);
                    let wordAudioUrlUS = null;
                    let wordAudioUrlUK = null;
                    
                    if (dictResult) {
                      if (dictResult.wordAudioUrlUS) {
                        wordAudioUrlUS = dictResult.wordAudioUrlUS;
                      }
                      if (dictResult.wordAudioUrlUK) {
                        wordAudioUrlUK = dictResult.wordAudioUrlUK;
                      }
                    }
                    
                    // If no US audio from dictionary API, use VoiceRSS as fallback
                    if (!wordAudioUrlUS && voicerssApiKey) {
                      try {
                        wordAudioUrlUS = await generateAudioUrl(word.word, voicerssApiKey);
                      } catch (error) {
                        console.error('Error generating US audio with VoiceRSS:', error);
                      }
                    }
                    
                    // If no UK audio from dictionary API, use VoiceRSS as fallback
                    if (!wordAudioUrlUK && voicerssApiKey) {
                      try {
                        wordAudioUrlUK = await generateAudioUrl(word.word, voicerssApiKey);
                      } catch (error) {
                        console.error('Error generating UK audio with VoiceRSS:', error);
                      }
                    }
                    
                    // Only update if we have new audio URLs
                    if (wordAudioUrlUS || wordAudioUrlUK) {
                      // Update in Google Sheets
                      try {
                        await updateAudioInSheet(sheetUrl, sheetName, word.word, word.url || '', wordAudioUrlUS, wordAudioUrlUK);
                        generated++;
                      } catch (error) {
                        console.error('Error updating audio in sheet for word:', word.word, error);
                      }
                    }
                    
                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));
                  } catch (error) {
                    console.error('Error processing word:', word.word, error);
                  }
                }
              }
              
              sendResponse({
                success: true,
                processed: processed,
                generated: generated
              });
            } catch (error) {
              console.error('Error in reloadMP3ForAllWords:', error);
              sendResponse({
                success: false,
                error: error.message
              });
            }
          })();
          return true;
        }
        
        if (request.action === 'getRandomWordsForFlashcard') {
          (async () => {
            // Load words from sheet
            const wordsFromSheet = await loadWordsFromSheet();
            
            chrome.storage.local.get(['highlightedWords'], (result) => {
              const words = [...(result.highlightedWords || []), ...wordsFromSheet];
              const count = request.count || 5;
              const mode = request.mode || 'word'; // 'word' or 'audio'
              
              // Filter words based on mode
              let filteredWords = words;
              if (mode === 'audio') {
                // Only words with audio (US or UK) - check for non-empty strings
                filteredWords = words.filter(w => {
                  const hasUSAudio = w.wordAudioUrlUS && w.wordAudioUrlUS.trim();
                  const hasUKAudio = w.wordAudioUrlUK && w.wordAudioUrlUK.trim();
                  return hasUSAudio || hasUKAudio || w.example;
                });
              }
              
              // Get random words FIRST (only selected words)
              const randomWords = getRandomWordsForReview(filteredWords, count);
              
              // Then generate audio ONLY for selected words that don't have audio
              // This is much faster than generating for all words
              chrome.storage.local.get(['voicerssApiKey', 'sheetUrl', 'sheetName'], async (result) => {
                if (result.voicerssApiKey && result.sheetUrl && result.sheetName) {
                  // Generate audio for selected words only (async, don't block response)
                  (async () => {
                    for (const word of randomWords) {
                      // Only generate if word doesn't have US or UK audio
                      if (!word.wordAudioUrlUS && !word.wordAudioUrlUK && word.word) {
                        try {
                          // Try to get audio from dictionary API first
                          const dictResult = await fetchDictionaryDefinition(word.word);
                          let wordAudioUrlUS = null;
                          let wordAudioUrlUK = null;
                          
                          if (dictResult) {
                            if (dictResult.wordAudioUrlUS) {
                              wordAudioUrlUS = dictResult.wordAudioUrlUS;
                            }
                            if (dictResult.wordAudioUrlUK) {
                              wordAudioUrlUK = dictResult.wordAudioUrlUK;
                            }
                          }
                          
                          // If no audio from dictionary API, use VoiceRSS
                          if (!wordAudioUrlUS && result.voicerssApiKey) {
                            wordAudioUrlUS = await generateAudioUrl(word.word, result.voicerssApiKey);
                          }
                          if (!wordAudioUrlUK && result.voicerssApiKey) {
                            wordAudioUrlUK = await generateAudioUrl(word.word, result.voicerssApiKey);
                          }
                          
                          // Update word object in randomWords array
                          if (wordAudioUrlUS) word.wordAudioUrlUS = wordAudioUrlUS;
                          if (wordAudioUrlUK) word.wordAudioUrlUK = wordAudioUrlUK;
                          
                          // Update in storage
                          const wordsInStorage = result.highlightedWords || [];
                          const wordIndex = wordsInStorage.findIndex(w => w.word === word.word && w.url === word.url);
                          if (wordIndex !== -1) {
                            if (wordAudioUrlUS) wordsInStorage[wordIndex].wordAudioUrlUS = wordAudioUrlUS;
                            if (wordAudioUrlUK) wordsInStorage[wordIndex].wordAudioUrlUK = wordAudioUrlUK;
                            chrome.storage.local.set({highlightedWords: wordsInStorage});
                          }
                          
                          // Update in Google Sheets if word is from sheet
                          if (word.fromSheet && (wordAudioUrlUS || wordAudioUrlUK)) {
                            try {
                              await updateAudioInSheet(result.sheetUrl, result.sheetName, word.word, word.url, wordAudioUrlUS, wordAudioUrlUK);
                            } catch (error) {
                              console.error('Error updating audio in sheet:', error);
                            }
                          }
                        } catch (error) {
                          console.error('Error generating audio for word:', word.word, error);
                        }
                      }
                    }
                  })(); // Run async, don't wait
                }
                
                // Return words immediately (audio will be generated in background)
                sendResponse({words: randomWords});
              });
            });
          })();
          return true;
        }
});

function getRandomWordsForReview(words, count = 5) {
  if (words.length === 0) return [];
  
  const now = Date.now();
  
  const wordsNeedingReview = words.filter(word => {
    if (!word.nextReview) return true;
    return now >= word.nextReview;
  });
  
  let wordsToReview = [...wordsNeedingReview];
  if (wordsToReview.length < count) {
    const otherWords = words.filter(word => !wordsNeedingReview.includes(word));
    const shuffledOthers = otherWords.sort(() => 0.5 - Math.random());
    wordsToReview = [...wordsToReview, ...shuffledOthers];
  }
  
  const shuffled = wordsToReview.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

async function logToGoogleSheetsDirectly(sheetUrl, sheetName, logData) {
  try {
    const response = await fetch(chrome.runtime.getURL('vocabmaster.json'));
    const credentials = await response.json();
    
    const jwt = await createJWT(credentials);
    
    const tokenResponse = await fetch(credentials.token_uri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }
    
    const accessToken = tokenData.access_token;
    
    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) {
      throw new Error('Invalid Google Sheets URL');
    }
    
    const encodedSheetName = encodeURIComponent(sheetName);
    
    if (logData.action === 'delete') {
      await deleteWordFromSheet(sheetId, encodedSheetName, accessToken, logData.word, logData.url);
    } else if (logData.action === 'delete_all') {
      await deleteWordsFromUrl(sheetId, encodedSheetName, accessToken, logData.url);
    } else if (logData.action === 'review') {
      // Update review count in column H instead of creating new row
      await updateReviewCountInSheet(sheetId, sheetName, encodedSheetName, accessToken, logData.word, logData.url);
    } else {
      // First append main data to columns A-J (H = review count, I = US audio URL, J = UK audio URL)
      // Note: Example audio URL không lưu vào sheet vì có thể generate lại từ example text
      const rowData = [
        logData.word || '',
        logData.pronunciation || '',
        logData.pos || '',
        logData.translation || '',
        logData.example || '',
        logData.url || '',
        logData.timestamp || '',
        0, // Column H: review count, default = 0 for new words
        logData.wordAudioUrlUS || '', // Column I: US audio URL (MP3)
        logData.wordAudioUrlUK || '' // Column J: UK audio URL (MP3)
      ];
      
      const values = [rowData];
      const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodedSheetName}!A:J:append?valueInputOption=USER_ENTERED`;
      
      const sheetsResponse = await fetch(appendUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: values
        })
      });
      
      // Get the appended row number from response
      let appendResult;
      if (!sheetsResponse.ok) {
        const errorText = await sheetsResponse.text();
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(`HTTP error! status: ${sheetsResponse.status}, message: ${errorData.error?.message || 'Unknown error'}`);
        } catch (parseError) {
          throw new Error(`HTTP error! status: ${sheetsResponse.status}, response: ${errorText}`);
        }
      } else {
        appendResult = await sheetsResponse.json();
      }
      
      // Try to get row number from updatedRange - this is the fastest way
      let rowNumber = null;
      if (appendResult.updates?.updatedRange) {
        const updatedRange = appendResult.updates.updatedRange;
        // Extract row number from range like "SheetName!A123:G123" or "'SheetName'!A123:G123"
        const match = updatedRange.match(/!A(\d+):/i);
        if (match) {
          rowNumber = parseInt(match[1]);
        }
      }
      
      // Update column Z with domPath data asynchronously (don't block)
      // This allows the main append to complete quickly
      if (rowNumber && (logData.domPath || logData.startOffset != null || logData.endOffset != null)) {
        // Update column Z asynchronously without blocking
        (async () => {
          try {
            const sheetIdForUpdate = await getSheetIdByName(sheetId, sheetName, accessToken);
            if (sheetIdForUpdate != null) {
              const domPathData = {
                domPath: logData.domPath || '',
                startOffset: logData.startOffset != null ? logData.startOffset : null,
                endOffset: logData.endOffset != null ? logData.endOffset : null
              };
              
              const batchUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`;
              const updateRequestBody = {
                requests: [{
                  updateCells: {
                    range: {
                      sheetId: sheetIdForUpdate,
                      startRowIndex: rowNumber - 1,
                      endRowIndex: rowNumber,
                      startColumnIndex: 25,
                      endColumnIndex: 26
                    },
                    rows: [{
                      values: [{
                        userEnteredValue: {
                          stringValue: JSON.stringify(domPathData)
                        }
                      }]
                    }],
                    fields: 'userEnteredValue'
                  }
                }]
              };
              
              await fetch(batchUpdateUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateRequestBody)
              });
            }
          } catch (error) {
            // Silent fail - updating column Z is not critical
            console.error('Error updating column Z:', error);
          }
        })();
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error in logToGoogleSheetsDirectly:', error);
    throw error;
  }
}

// Update audio URLs in Google Sheets for a specific word
async function updateAudioInSheet(sheetUrl, sheetName, wordToFind, urlToFind, wordAudioUrlUS, wordAudioUrlUK) {
  try {
    const response = await fetch(chrome.runtime.getURL('vocabmaster.json'));
    const credentials = await response.json();
    
    const jwt = await createJWT(credentials);
    
    const tokenResponse = await fetch(credentials.token_uri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }
    
    const accessToken = tokenData.access_token;
    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) {
      throw new Error('Invalid Google Sheets URL');
    }
    
    const encodedSheetName = encodeURIComponent(sheetName);
    
    // Read all data from sheet to find the row
    const readResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodedSheetName}!A:J`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!readResponse.ok) {
      throw new Error('Failed to read sheet data');
    }
    
    const readData = await readResponse.json();
    const rows = readData.values || [];
    
    if (rows.length === 0) {
      return;
    }
    
    // Check if first row is header row
    let startIdx = 0;
    if (rows.length > 0 && rows[0][0]) {
      const firstCell = rows[0][0].toLowerCase().trim();
      if (firstCell === 'new word' || firstCell === 'từ' || firstCell === 'word' || firstCell === 'từ mới') {
        startIdx = 1;
      }
    }
    
    // Find the row containing the word
    let rowIndex = -1;
    const wordToFindLower = wordToFind.toLowerCase().trim();
    const urlToFindTrimmed = urlToFind ? urlToFind.trim() : '';
    
    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      const sheetWord = row[0] ? row[0].toLowerCase().trim() : '';
      const sheetUrl = row[5] ? row[5].trim() : '';
      
      if (sheetWord === wordToFindLower && sheetUrl === urlToFindTrimmed) {
        rowIndex = i;
        break;
      }
    }
    
    if (rowIndex === -1) {
      return; // Word not found in sheet
    }
    
    // Get sheet ID for batch update
    const sheetIdForUpdate = await getSheetIdByName(sheetId, sheetName, accessToken);
    if (sheetIdForUpdate == null) {
      throw new Error('Không tìm thấy sheetId cho sheetName: ' + sheetName);
    }
    
    // Update columns I (US audio) and J (UK audio)
    const batchUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`;
    const updateRequestBody = {
      requests: []
    };
    
    // Update column I (US audio) if provided
    if (wordAudioUrlUS) {
      updateRequestBody.requests.push({
        updateCells: {
          range: {
            sheetId: sheetIdForUpdate,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: 8, // Column I
            endColumnIndex: 9
          },
          rows: [{
            values: [{
              userEnteredValue: {
                stringValue: wordAudioUrlUS
              }
            }]
          }],
          fields: 'userEnteredValue'
        }
      });
    }
    
    // Update column J (UK audio) if provided
    if (wordAudioUrlUK) {
      updateRequestBody.requests.push({
        updateCells: {
          range: {
            sheetId: sheetIdForUpdate,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: 9, // Column J
            endColumnIndex: 10
          },
          rows: [{
            values: [{
              userEnteredValue: {
                stringValue: wordAudioUrlUK
              }
            }]
          }],
          fields: 'userEnteredValue'
        }
      });
    }
    
    if (updateRequestBody.requests.length > 0) {
      const updateResponse = await fetch(batchUpdateUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateRequestBody)
      });
      
      if (!updateResponse.ok) {
        const errorData = await updateResponse.json();
        throw new Error(`Failed to update audio: ${errorData.error?.message || 'Unknown error'}`);
      }
    }
  } catch (error) {
    console.error('Error updating audio in sheet:', error);
    throw error;
  }
}

async function updateReviewCountInSheet(spreadsheetId, sheetName, encodedSheetName, accessToken, wordToFind, urlToFind) {
  try {
    // Read all data from sheet to find the row
    const readResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedSheetName}!A:H`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!readResponse.ok) {
      throw new Error('Failed to read sheet data');
    }
    
    const readData = await readResponse.json();
    const rows = readData.values || [];
    
    if (rows.length === 0) {
      console.log('Sheet is empty, cannot update review count');
      return;
    }
    
    // Check if first row is header row
    let startIdx = 0;
    if (rows.length > 0 && rows[0][0]) {
      const firstCell = rows[0][0].toLowerCase().trim();
      if (firstCell === 'new word' || firstCell === 'từ' || firstCell === 'word' || firstCell === 'từ mới') {
        startIdx = 1;
      }
    }
    
    // Find the row containing the word (column A = index 0, column F = index 5 for URL)
    let rowIndex = -1;
    const wordToFindLower = wordToFind.toLowerCase().trim();
    const urlToFindTrimmed = urlToFind ? urlToFind.trim() : '';
    
    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      const sheetWord = row[0] ? row[0].toLowerCase().trim() : '';
      const sheetUrl = row[5] ? row[5].trim() : '';
      
      if (sheetWord === wordToFindLower && sheetUrl === urlToFindTrimmed) {
        rowIndex = i;
        break;
      }
    }
    
    if (rowIndex === -1) {
      console.log(`Word "${wordToFind}" with URL "${urlToFind}" not found in sheet, cannot update review count`);
      return;
    }
    
    // Get current review count from column H (index 7)
    // Default to 0 if column H is empty or not a valid number
    let currentCount = 0;
    if (rows[rowIndex][7] !== undefined && rows[rowIndex][7] !== null && rows[rowIndex][7] !== '') {
      const countValue = rows[rowIndex][7];
      // Try to parse as number, if it's a string number
      const parsedCount = parseInt(countValue);
      if (!isNaN(parsedCount)) {
        currentCount = parsedCount;
      }
      // If parsing fails, default to 0
    }
    // If column H is empty/null/undefined, currentCount stays 0 (default)
    
    // Increment review count
    const newCount = currentCount + 1;
    
    // Get sheet ID for batch update
    const sheetIdForUpdate = await getSheetIdByName(spreadsheetId, sheetName, accessToken);
    if (sheetIdForUpdate == null) {
      throw new Error('Không tìm thấy sheetId cho sheetName: ' + sheetName);
    }
    
    // Update column H (index 7) with new review count
    const batchUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    const updateRequestBody = {
      requests: [{
        updateCells: {
          range: {
            sheetId: sheetIdForUpdate,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: 7, // Column H
            endColumnIndex: 8
          },
          rows: [{
            values: [{
              userEnteredValue: {
                numberValue: newCount
              }
            }]
          }],
          fields: 'userEnteredValue'
        }
      }]
    };
    
    const updateResponse = await fetch(batchUpdateUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateRequestBody)
    });
    
    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      throw new Error(`Failed to update review count: ${errorData.error?.message || 'Unknown error'}`);
    }
    
    console.log(`Updated review count for word "${wordToFind}" to ${newCount}`);
  } catch (error) {
    console.error('Error updating review count in sheet:', error);
    throw error;
  }
}

async function getSheetIdByName(spreadsheetId, sheetName, accessToken) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await res.json();
  const sheet = data.sheets.find(s => s.properties.title === sheetName);
  return sheet ? sheet.properties.sheetId : null;
}

async function deleteWordFromSheet(spreadsheetId, sheetName, accessToken, wordToDelete, urlToDelete) {
  try {
    const sheetId = await getSheetIdByName(spreadsheetId, sheetName, accessToken);
    if (sheetId == null) throw new Error('Không tìm thấy sheetId cho sheetName: ' + sheetName);
    const encodedSheetName = encodeURIComponent(sheetName);
    const readResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedSheetName}!A:G`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (!readResponse.ok) throw new Error('Failed to read sheet data');
    const readData = await readResponse.json();
    const rows = readData.values || [];
    const startIdx = (rows.length > 0 && rows[0][0] && (rows[0][0].toLowerCase().trim() === 'từ' || rows[0][0].toLowerCase().trim() === 'new word' || rows[0][0].toLowerCase().trim() === 'word')) ? 1 : 0;
    let rowsToDelete = [];
    const cmpWord = wordToDelete.toLowerCase().trim();
    const cmpUrl = urlToDelete.trim();
    for (let i = startIdx; i < rows.length; i++) {
      const sheetWord = rows[i][0] ? rows[i][0].toLowerCase().trim() : '';
      const sheetUrl = rows[i][5] ? rows[i][5].trim() : '';
      if (sheetWord === cmpWord && sheetUrl === cmpUrl) rowsToDelete.push(i);
    }
    if (rowsToDelete.length === 0) {
      return;
    }
    rowsToDelete.sort((a, b) => b - a);
    const batchDeleteRequest = {
      requests: rowsToDelete.map(rowIndex => ({
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: rowIndex,
            endIndex: rowIndex + 1
          }
        }
      }))
    };
    const deleteResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(batchDeleteRequest)
    });
    if (!deleteResponse.ok) {
      const errorData = await deleteResponse.json();
      throw new Error(`Failed to delete row(s): ${errorData.error?.message || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Lỗi khi xoá từ khỏi sheet:', error);
    throw error;
  }
}

async function deleteWordsFromUrl(sheetId, encodedSheetName, accessToken, urlToDelete) {
  try {
    const readResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodedSheetName}!A:G`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!readResponse.ok) {
      throw new Error('Failed to read sheet data');
    }
    
    const readData = await readResponse.json();
    const rows = readData.values || [];
    
    const rowsToDelete = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][5] && rows[i][5] === urlToDelete) {
        rowsToDelete.push(i);
      }
    }
    
    if (rowsToDelete.length === 0) {
      return;
    }
    
    for (let i = rowsToDelete.length - 1; i >= 0; i--) {
      const rowIndex = rowsToDelete[i];
      
      const deleteRequest = {
        requests: [{
          deleteDimension: {
            range: {
              sheetId, 
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1
            }
          }
        }]
      };
      
      const deleteResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(deleteRequest)
      });
      
      if (!deleteResponse.ok) {
        const errorData = await deleteResponse.json();
        throw new Error(`Failed to delete row: ${errorData.error?.message || 'Unknown error'}`);
      }
    }
    
  } catch (error) {
    console.error('Error deleting words from URL:', error);
    throw error;
  }
}

function extractSheetId(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

async function createJWT(credentials) {
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };
  
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: credentials.token_uri,
    exp: now + 3600,
    iat: now
  };
  
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  
  const privateKeyPem = credentials.private_key.replace(/\\n/g, '\n');
  const keyData = pemToArrayBuffer(privateKeyPem);
  
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );
  
  const encodedSignature = base64UrlEncodeBytes(new Uint8Array(signature));
  
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

function base64UrlEncode(str) {
  const utf8Bytes = new TextEncoder().encode(str);
  let binaryString = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binaryString += String.fromCharCode(utf8Bytes[i]);
  }
  const base64 = btoa(binaryString);
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64UrlEncodeBytes(bytes) {
  let binaryString = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binaryString);
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function pemToArrayBuffer(pem) {
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = pem.replace(pemHeader, '').replace(pemFooter, '').replace(/\s/g, '');
  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }
  return binaryDer.buffer;
}

// Play audio in hidden tab to avoid CORS issues
function playAudioInTab(audioUrl) {
  // Create hidden tab to play audio with URL parameter
  const playerUrl = chrome.runtime.getURL('player.html?url=' + encodeURIComponent(audioUrl));
  chrome.tabs.create({
    url: playerUrl,
    active: false
  }, (tab) => {
    // Tab will auto-close when audio ends (handled in player.html)
    console.log('Audio tab created:', tab.id);
  });
}

async function loadWordsFromSheet() {
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['sheetUrl', 'sheetName'], resolve);
    });
    
    if (!result.sheetUrl || !result.sheetName) {
      return [];
    }
    
    const response = await fetch(chrome.runtime.getURL('vocabmaster.json'));
    const credentials = await response.json();
    
    const jwt = await createJWT(credentials);
    
    const tokenResponse = await fetch(credentials.token_uri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }
    
    const accessToken = tokenData.access_token;
    const sheetId = extractSheetId(result.sheetUrl);
    if (!sheetId) {
      return [];
    }
    
    const encodedSheetName = encodeURIComponent(result.sheetName);
    const readResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodedSheetName}!A:Z`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!readResponse.ok) {
      return [];
    }
    
    const readData = await readResponse.json();
    const rows = readData.values || [];
    
    if (rows.length === 0) {
      return [];
    }
    
    const words = [];
    let startIdx = 0;
    
    // Check if first row is header row
    if (rows.length > 0 && rows[0][0]) {
      const firstCell = rows[0][0].toLowerCase().trim();
      if (firstCell === 'new word' || firstCell === 'từ' || firstCell === 'word' || firstCell === 'từ mới') {
        startIdx = 1;
      }
    }
    
    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0] || row[0].trim() === '') continue;
      
      // Cấu trúc: A=New word, B=IPA, C=Type, D=Meaning, E=Example, F=URL, G=Timestamp, H=Review count, I=US audio URL, J=UK audio URL, Z=domPath data (JSON)
      // Note: Example audio URL không lưu vào sheet, sẽ generate từ example text khi cần
      const word = row[0].trim();
      const pronunciation = row[1] || '';
      const pos = row[2] || '';
      const translation = row[3] || '';
      const example = row[4] || '';
      const url = row[5] || '';
      const timestamp = row[6] || '';
      const wordAudioUrlUS = row[8] || ''; // Column I: US audio URL
      const wordAudioUrlUK = row[9] || ''; // Column J: UK audio URL
      
      // Column Z (index 25) - parse JSON containing domPath, startOffset, endOffset
      let domPath = '';
      let startOffset = null;
      let endOffset = null;
      if (row[25]) {
        try {
          const domPathData = JSON.parse(row[25]);
          domPath = domPathData.domPath || '';
          startOffset = domPathData.startOffset != null ? domPathData.startOffset : null;
          endOffset = domPathData.endOffset != null ? domPathData.endOffset : null;
        } catch (e) {
          // If not JSON, treat as plain string (backward compatibility)
          domPath = row[25] || '';
        }
      }
      
      // Build meaning string: [pos] pronunciation translation (if available)
      let meaning = '';
      if (pos || pronunciation || translation) {
        let prefix = '';
        if (pos) prefix = `[${pos}] `;
        if (pronunciation) prefix = `${prefix}${pronunciation} `;
        meaning = prefix + (translation || '');
      }
      
      words.push({
        word: word.toLowerCase(),
        meaning: meaning,
        pronunciation: pronunciation,
        pos: pos,
        translation: translation,
        example: example,
        url: url || '',
        timestamp: timestamp || '',
        domPath: domPath,
        startOffset: startOffset,
        endOffset: endOffset,
        wordAudioUrlUS: wordAudioUrlUS || '',
        wordAudioUrlUK: wordAudioUrlUK || '',
        // exampleAudioUrl sẽ được generate từ example text khi cần
        fromSheet: true,
        firstHighlighted: Date.now(),
        lastHighlighted: Date.now(),
        count: 1
      });
    }
    
    return words;
  } catch (error) {
    console.error('Error loading words from sheet:', error);
    return [];
  }
}

// Generate audio URL using VoiceRSS API
// Returns the API URL that can be used to fetch the audio
async function generateAudioUrl(text, apiKey) {
  if (!text || !apiKey || typeof text !== 'string' || text.trim() === '') {
    return null;
  }

  try {
    const params = new URLSearchParams({
      key: apiKey,
      hl: 'en-us',
      src: text.trim(),
      c: 'MP3',
      f: '44khz_16bit_stereo',
      ssml: 'false',
      b64: 'false'
    });

    // Return the API URL - this can be used directly to play audio
    // VoiceRSS returns MP3 binary data when this URL is fetched
    const apiUrl = `https://api.voicerss.org/?${params.toString()}`;
    
    // Verify the URL works by making a test request
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      console.error(`VoiceRSS API error: ${response.status}`);
      return null;
    }

    // Check if response is audio
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('audio')) {
      // Return the API URL - this can be stored and used later
      return apiUrl;
    } else {
      // If not audio, might be error message
      const errorText = await response.text();
      console.error('VoiceRSS API error response:', errorText);
      return null;
    }
  } catch (error) {
    console.error('Error generating audio with VoiceRSS:', error);
    return null;
  }
}

async function fetchDictionaryDefinition(word) {
  try {
    if (!word || typeof word !== 'string' || word.trim() === '') {
      return null;
    }
    
    const url = `https://dictionary-api.eliaschen.dev/api/dictionary/en/${encodeURIComponent(word.toLowerCase().trim())}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data || !data.definition || !Array.isArray(data.definition) || data.definition.length === 0) {
      return null;
    }
    
    const firstDefinition = data.definition[0];
    let meaning = firstDefinition.text || '';
    let translation = firstDefinition.translation || '';
    let example = '';
    
    if (firstDefinition.example && Array.isArray(firstDefinition.example) && firstDefinition.example.length > 0) {
      example = firstDefinition.example[0].text || '';
    }
    
    let pos = '';
    if (data.pos && Array.isArray(data.pos) && data.pos.length > 0) {
      pos = data.pos[0];
    }
    
    let pronunciation = '';
    let wordAudioUrlUS = null; // US audio URL from dictionary API
    let wordAudioUrlUK = null; // UK audio URL from dictionary API
    
    if (data.pronunciation && Array.isArray(data.pronunciation) && data.pronunciation.length > 0) {
      // Get US pronunciation and audio
      const usPron = data.pronunciation.find(p => p.lang === 'us');
      if (usPron) {
        if (usPron.pron) {
          pronunciation = usPron.pron;
        }
        // Get US audio URL
        if (usPron.url) {
          wordAudioUrlUS = usPron.url;
        }
      }
      
      // Get UK pronunciation and audio
      const ukPron = data.pronunciation.find(p => p.lang === 'uk');
      if (ukPron && ukPron.url) {
        wordAudioUrlUK = ukPron.url;
      }
    }
    
    let displayMeaning = meaning;
    if (translation && translation.trim()) {
      displayMeaning += ` | ${translation.trim()}`;
    }
    if (example) {
      displayMeaning += ` (VD: ${example})`;
    }
    
    let prefix = '';
    if (pos) prefix = `[${pos}] `;
    if (pronunciation) prefix = `${prefix}${pronunciation} `;
    
    return {
      meaning: prefix + displayMeaning,
      pronunciation: pronunciation,
      pos: pos,
      translation: translation.trim(),
      example: example,
      wordAudioUrlUS: wordAudioUrlUS, // US audio URL from dictionary API
      wordAudioUrlUK: wordAudioUrlUK // UK audio URL from dictionary API
    };
  } catch (error) {
    console.error('Error fetching dictionary definition:', error);
    return null;
  }
}