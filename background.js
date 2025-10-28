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
          sheetUrl: '', // URL Google Sheets
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
    chrome.storage.local.set({highlightedWords: []}, () => {
      sendResponse({success: true});
    });
    return true;
  }
  
  if (request.action === 'deleteWord') {
    chrome.storage.local.get(['highlightedWords'], (result) => {
      const words = result.highlightedWords || [];
      const filteredWords = words.filter(w => w.word !== request.word);
      chrome.storage.local.set({highlightedWords: filteredWords}, () => {
        sendResponse({success: true});
      });
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
