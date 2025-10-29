// Background script for handling keyboard shortcuts and storage
chrome.commands.onCommand.addListener((command) => {
  if (command === 'highlight-word') {
    // Send message to active tab
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {action: 'highlightWord'});
      }
    });
  }
});

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
        // Initialize default settings
        chrome.storage.local.set({
          highlightedWords: [],
          highlightMode: false, // Mặc định tắt highlight mode
          highlightColor: '#FFEB3B',
          sheetUrl: 'https://docs.google.com/spreadsheets/d/1esJJVzgowqyY8YXeps4fN3acToqpMuETkdP1JsJbQeI/edit?usp=sharing', // Default Google Sheets URL
          sheetName: 'Newword', // Default sheet name
          shortcutSettings: {modifier: 'alt', key: 'h'}, // Default shortcut Alt+H
          reviewStats: {
            totalReviewed: 0,
            lastReviewDate: null,
            todayReviewed: 0
          }
        });
        
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getHighlightedWords') {
    chrome.storage.local.get(['highlightedWords'], (result) => {
      sendResponse({words: result.highlightedWords || []});
    });
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'deleteAllWords') {
    chrome.storage.local.get(['highlightedWords', 'sheetUrl', 'sheetName'], async (result) => {
      const words = result.highlightedWords || [];
      const currentUrl = request.currentUrl || 'Unknown';
      
      // Filter words to only delete those from current URL
      const wordsFromCurrentUrl = words.filter(w => w.url === currentUrl);
      const remainingWords = words.filter(w => w.url !== currentUrl);
      
      chrome.storage.local.set({highlightedWords: remainingWords}, () => {
        sendResponse({
          success: true, 
          deletedCount: wordsFromCurrentUrl.length,
          remainingCount: remainingWords.length
        });
      });
      
      // Also log deletion of words from current URL to Google Sheets if configured
      if (result.sheetUrl && result.sheetName && wordsFromCurrentUrl.length > 0) {
        try {
          await logToGoogleSheetsDirectly(result.sheetUrl, result.sheetName, {
            action: 'delete_all',
            word: `ALL_WORDS_FROM_URL (${wordsFromCurrentUrl.length} words from ${currentUrl})`,
            timestamp: new Date().toLocaleString(),
            url: currentUrl
          });
          console.log('Successfully logged delete all words from current URL to Google Sheets');
        } catch (error) {
          console.error('Error logging delete all words from current URL to Google Sheets:', error);
        }
      }
    });
    return true;
  }
  
  if (request.action === 'deleteWord') {
    console.log('Received deleteWord request for word:', request.word);
    chrome.storage.local.get(['highlightedWords', 'sheetUrl', 'sheetName'], async (result) => {
      const words = result.highlightedWords || [];
      console.log('Current words before deletion:', words.map(w => w.word));
      
      const filteredWords = words.filter(w => w.word !== request.word);
      console.log('Words after filtering:', filteredWords.map(w => w.word));
      
      chrome.storage.local.set({highlightedWords: filteredWords}, () => {
        console.log('Updated storage with filtered words');
        sendResponse({success: true});
      });
      
      // Also delete from Google Sheets if configured
      if (result.sheetUrl && result.sheetName) {
        console.log('Deleting word from Google Sheets:', request.word);
        try {
          await logToGoogleSheetsDirectly(result.sheetUrl, result.sheetName, {
            action: 'delete',
            word: request.word,
            timestamp: new Date().toLocaleString(),
            url: 'Extension'
          });
          console.log('Successfully deleted word from Google Sheets');
        } catch (error) {
          console.error('Error deleting word from Google Sheets:', error);
        }
      } else {
        console.log('Google Sheets not configured, skipping deletion');
      }
    });
    return true;
  }
  
        if (request.action === 'getRandomWords') {
          chrome.storage.local.get(['highlightedWords'], (result) => {
            const words = result.highlightedWords || [];
            const count = request.count || 5;
            const randomWords = getRandomWordsForReview(words, count);
            sendResponse({words: randomWords});
          });
          return true;
        }
  
  if (request.action === 'updateReviewStats') {
    chrome.storage.local.get(['reviewStats'], (result) => {
      const stats = result.reviewStats || {totalReviewed: 0, lastReviewDate: null, todayReviewed: 0};
      const today = new Date().toDateString();
      
      if (stats.lastReviewDate !== today) {
        stats.todayReviewed = 0;
        stats.lastReviewDate = today;
      }
      
      stats.todayReviewed += 1;
      stats.totalReviewed += 1;
      
      chrome.storage.local.set({reviewStats: stats}, () => {
        sendResponse({success: true, stats: stats});
      });
    });
    return true;
  }
  
        // Handle new word added - log for Google Sheets integration
        if (request.action === 'wordAdded') {
          const word = request.word;
          chrome.storage.local.get(['sheetUrl'], (result) => {
            if (result.sheetUrl) {
              // Log word for manual Google Sheets integration
              console.log('New word added:', word);
              console.log('Google Sheets URL:', result.sheetUrl);
              console.log('To integrate with Google Sheets, you need to set up Google Sheets API');
            }
          });
          sendResponse({success: true});
          return true;
        }
        
        // Handle logging to Google Sheets
        if (request.action === 'logToSheets') {
          console.log('Received logToSheets request:', request.logData);
          
          chrome.storage.local.get(['sheetUrl', 'sheetName'], async (result) => {
            console.log('Storage result:', result);
            
            if (!result.sheetUrl || !result.sheetName) {
              console.log('Google Sheets not configured, skipping log');
              console.log('sheetUrl:', result.sheetUrl);
              console.log('sheetName:', result.sheetName);
              
              sendResponse({
                success: false, 
                error: 'Google Sheets not configured',
                showNotification: true,
                notificationMessage: 'Chưa cấu hình Google Sheets! Vào Cài Đặt để thiết lập.'
              });
              return;
            }
            
            try {
              // Call GoogleSheetsAPI directly using fetch to the API
              await logToGoogleSheetsDirectly(result.sheetUrl, result.sheetName, request.logData);
              console.log('Successfully logged to Google Sheets:', request.logData);
              sendResponse({success: true});
            } catch (error) {
              console.error('Error logging to Google Sheets:', error);
              
              sendResponse({
                success: false, 
                error: error.message,
                showNotification: true,
                notificationMessage: `Không thể lưu vào Google Sheets: ${error.message}`
              });
            }
          });
          return true;
        }
        
        // Handle word reviewed with spaced repetition
        if (request.action === 'markWordReviewed') {
          chrome.storage.local.get(['highlightedWords'], (result) => {
            const words = result.highlightedWords || [];
            const wordIndex = words.findIndex(w => w.word === request.word);
            
            if (wordIndex !== -1) {
              const now = Date.now();
              const word = words[wordIndex];
              
              // Update review data
              word.lastReviewed = now;
              word.reviewCount = (word.reviewCount || 0) + 1;
              word.knewIt = request.knew;
              
              // Spaced repetition algorithm
              if (request.knew) {
                // If knew it, increase interval
                const currentInterval = word.reviewInterval || 1; // days
                word.reviewInterval = Math.min(currentInterval * 2, 30); // max 30 days
                word.nextReview = now + (word.reviewInterval * 24 * 60 * 60 * 1000);
              } else {
                // If didn't know, reset interval
                word.reviewInterval = 1;
                word.nextReview = now + (24 * 60 * 60 * 1000); // 1 day
              }
              
              chrome.storage.local.set({highlightedWords: words});
            }
          });
          sendResponse({success: true});
          return true;
        }
});

function getRandomWordsForReview(words, count = 5) {
  if (words.length === 0) return [];
  
  const now = Date.now();
  
  // Prioritize words that need review based on spaced repetition
  const wordsNeedingReview = words.filter(word => {
    if (!word.nextReview) return true; // Never reviewed
    return now >= word.nextReview; // Time for review
  });
  
  // If not enough words need review, add some random ones
  let wordsToReview = [...wordsNeedingReview];
  if (wordsToReview.length < count) {
    const otherWords = words.filter(word => !wordsNeedingReview.includes(word));
    const shuffledOthers = otherWords.sort(() => 0.5 - Math.random());
    wordsToReview = [...wordsToReview, ...shuffledOthers];
  }
  
  // Shuffle and return requested count
  const shuffled = wordsToReview.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// Direct Google Sheets logging function
async function logToGoogleSheetsDirectly(sheetUrl, sheetName, logData) {
  try {
    console.log('Loading credentials...');
    
    // Load credentials from vocabmaster.json
    const response = await fetch(chrome.runtime.getURL('vocabmaster.json'));
    const credentials = await response.json();
    console.log('Credentials loaded');
    
    // Create JWT token
    const jwt = await createJWT(credentials);
    console.log('JWT created');
    
    // Exchange JWT for access token
    const tokenResponse = await fetch(credentials.token_uri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });
    
    const tokenData = await tokenResponse.json();
    console.log('Token response:', tokenData);
    
    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }
    
    const accessToken = tokenData.access_token;
    console.log('Access token obtained');
    
    // Extract sheet ID from URL
    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) {
      throw new Error('Invalid Google Sheets URL');
    }
    
    // URL encode the sheet name
    const encodedSheetName = encodeURIComponent(sheetName);
    
    // Handle different actions
    if (logData.action === 'delete') {
      // Delete specific word from sheet
      await deleteWordFromSheet(sheetId, encodedSheetName, accessToken, logData.word);
      console.log('Successfully deleted word from Google Sheets');
    } else if (logData.action === 'delete_all') {
      // Delete all words from specific URL
      await deleteWordsFromUrl(sheetId, encodedSheetName, accessToken, logData.url);
      console.log('Successfully deleted words from URL in Google Sheets');
    } else {
      // Add new word to sheet
      const values = [
        [logData.word, '', '', '', '', logData.url, logData.timestamp]
      ];
      
      const sheetsResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodedSheetName}!A:G:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: values
        })
      });
      
      if (!sheetsResponse.ok) {
        const errorData = await sheetsResponse.json();
        throw new Error(`HTTP error! status: ${sheetsResponse.status}, message: ${errorData.error?.message || 'Unknown error'}`);
      }
      
      console.log('Successfully added word to Google Sheets');
    }
    
    return true;
  } catch (error) {
    console.error('Error in logToGoogleSheetsDirectly:', error);
    throw error;
  }
}

// Delete specific word from Google Sheet
async function deleteWordFromSheet(sheetId, encodedSheetName, accessToken, wordToDelete) {
  try {
    // First, get all data from the sheet
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
    
    // Find rows to delete (matching the word)
    const rowsToDelete = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].toLowerCase() === wordToDelete.toLowerCase()) {
        rowsToDelete.push(i);
      }
    }
    
    if (rowsToDelete.length === 0) {
      console.log(`Word "${wordToDelete}" not found in sheet`);
      return;
    }
    
    // Delete rows from bottom to top to maintain correct indices
    for (let i = rowsToDelete.length - 1; i >= 0; i--) {
      const rowIndex = rowsToDelete[i];
      
      const deleteRequest = {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: 0, // Assuming first sheet
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
    
    console.log(`Successfully deleted ${rowsToDelete.length} row(s) for word "${wordToDelete}"`);
  } catch (error) {
    console.error('Error deleting word from sheet:', error);
    throw error;
  }
}

// Delete all words from specific URL
async function deleteWordsFromUrl(sheetId, encodedSheetName, accessToken, urlToDelete) {
  try {
    // First, get all data from the sheet
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
    
    // Find rows to delete (matching the URL in column F)
    const rowsToDelete = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][5] && rows[i][5] === urlToDelete) {
        rowsToDelete.push(i);
      }
    }
    
    if (rowsToDelete.length === 0) {
      console.log(`No words found for URL "${urlToDelete}"`);
      return;
    }
    
    // Delete rows from bottom to top to maintain correct indices
    for (let i = rowsToDelete.length - 1; i >= 0; i--) {
      const rowIndex = rowsToDelete[i];
      
      const deleteRequest = {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: 0, // Assuming first sheet
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
    
    console.log(`Successfully deleted ${rowsToDelete.length} row(s) for URL "${urlToDelete}"`);
  } catch (error) {
    console.error('Error deleting words from URL:', error);
    throw error;
  }
}

// Extract sheet ID from URL
function extractSheetId(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// Create JWT token
async function createJWT(credentials) {
  const header = {
    "alg": "RS256",
    "typ": "JWT"
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    "iss": credentials.client_email,
    "scope": "https://www.googleapis.com/auth/spreadsheets",
    "aud": credentials.token_uri,
    "exp": now + 3600,
    "iat": now
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  
  const signature = await signJWT(`${encodedHeader}.${encodedPayload}`, credentials.private_key);
  const encodedSignature = base64UrlEncodeBytes(signature);
  
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

// Base64 URL encode for strings
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

// Base64 URL encode for Uint8Array
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

// Sign JWT with private key
async function signJWT(data, privateKey) {
  const privateKeyPem = privateKey.replace(/\\n/g, '\n');
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
    new TextEncoder().encode(data)
  );
  
  return new Uint8Array(signature);
}

// Convert PEM to ArrayBuffer
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
