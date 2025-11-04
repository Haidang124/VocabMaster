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
          shortcutSettings: {modifier: 'alt', key: 'h'},
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
            
            if (dictResult) {
              chrome.storage.local.get(['highlightedWords', 'sheetUrl', 'sheetName'], async (result) => {
                const words = result.highlightedWords || [];
                const wordIndex = words.findIndex(w => w.word === request.word && w.url === request.url);
                
                if (wordIndex !== -1) {
                  if (!words[wordIndex].meaning) words[wordIndex].meaning = dictResult.meaning;
                  if (!words[wordIndex].pronunciation && dictResult.pronunciation) words[wordIndex].pronunciation = dictResult.pronunciation;
                  if (!words[wordIndex].pos && dictResult.pos) words[wordIndex].pos = dictResult.pos;
                  if (!words[wordIndex].translation && dictResult.translation) words[wordIndex].translation = dictResult.translation;
                  if (!words[wordIndex].example && dictResult.example) words[wordIndex].example = dictResult.example;
                  chrome.storage.local.set({highlightedWords: words});
                }
                
                if (result.sheetUrl && result.sheetName) {
                  const wordInStorage = words[wordIndex];
                  const sheetData = {
                    action: 'add',
                    word: request.word,
                    pronunciation: dictResult.pronunciation || '',
                    pos: dictResult.pos || '',
                    translation: dictResult.translation || '',
                    example: dictResult.example || '',
                    url: request.url,
                    timestamp: new Date().toLocaleString(),
                    domPath: wordInStorage?.domPath || '',
                    startOffset: wordInStorage?.startOffset != null ? wordInStorage.startOffset : null,
                    endOffset: wordInStorage?.endOffset != null ? wordInStorage.endOffset : null
                  };
                  try {
                    await logToGoogleSheetsDirectly(result.sheetUrl, result.sheetName, sheetData);
                  } catch (err) {
                    console.error('Error updating Google Sheet with dictionary data:', err);
                  }
                }
              });
            }
            sendResponse({success: true, meaning: dictResult});
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
    } else {
      // First append main data to columns A-G
      const rowData = [
        logData.word || '',
        logData.pronunciation || '',
        logData.pos || '',
        logData.translation || '',
        logData.example || '',
        logData.url || '',
        logData.timestamp || ''
      ];
      
      const values = [rowData];
      const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodedSheetName}!A:G:append?valueInputOption=USER_ENTERED`;
      
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
      
      // Cấu trúc: A=New word, B=IPA, C=Type, D=Meaning, E=Example, F=URL, G=Timestamp, Z=domPath data (JSON)
      const word = row[0].trim();
      const pronunciation = row[1] || '';
      const pos = row[2] || '';
      const translation = row[3] || '';
      const example = row[4] || '';
      const url = row[5] || '';
      const timestamp = row[6] || '';
      
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
    if (data.pronunciation && Array.isArray(data.pronunciation) && data.pronunciation.length > 0) {
      const usPron = data.pronunciation.find(p => p.lang === 'us');
      if (usPron && usPron.pron) {
        pronunciation = usPron.pron;
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
      example: example
    };
  } catch (error) {
    console.error('Error fetching dictionary definition:', error);
    return null;
  }
}