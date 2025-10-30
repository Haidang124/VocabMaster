// Content script for handling word selection and highlighting
let isHighlightMode = false; // Mặc định tắt highlight mode để không làm phiền
let selectedWord = null;
let selectedRange = null;
let highlightColor = '#FFEB3B';
let shortcutSettings = {modifier: 'alt', key: 'h'}; // Default shortcut

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleHighlightMode') {
    isHighlightMode = !isHighlightMode;
    document.body.style.cursor = isHighlightMode ? 'crosshair' : 'default';
    sendResponse({highlightMode: isHighlightMode});
  } else if (request.action === 'getHighlightMode') {
    sendResponse({highlightMode: isHighlightMode});
  } else if (request.action === 'setHighlightColor') {
    highlightColor = request.color;
    sendResponse({success: true});
  } else if (request.action === 'highlightWord') {
    highlightSelectedWord();
    sendResponse({success: true});
  } else if (request.action === 'updateShortcut') {
    shortcutSettings = request.shortcut;
    sendResponse({success: true});
  }
});

// Handle text selection - lưu selection để dùng phím tắt
document.addEventListener('mouseup', (e) => {
  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (text && text.length > 0 && text.length < 100) {
      // Normalize text - replace multiple spaces with single space
      selectedWord = text.toLowerCase().replace(/\s+/g, ' ');
      selectedRange = selection.getRangeAt(0);
    }
  }, 10);
});

// Handle double-click on words - chỉ chọn từ, không hiện menu
document.addEventListener('dblclick', (e) => {
  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (text && text.length > 0 && text.length < 100) {
      // Normalize text - replace multiple spaces with single space
      selectedWord = text.toLowerCase().replace(/\s+/g, ' ');
      selectedRange = selection.getRangeAt(0);
    }
  }, 10);
  
  // Prevent default selection behavior
  e.preventDefault();
});

// Handle keyboard shortcut - tùy chỉnh phím tắt để highlight từ đã chọn
document.addEventListener('keydown', (e) => {
  if (!selectedWord) return;
  
  const modifier = shortcutSettings.modifier;
  const key = shortcutSettings.key.toLowerCase();
  
  let modifierPressed = false;
  if (modifier === 'alt') modifierPressed = e.altKey;
  else if (modifier === 'ctrl') modifierPressed = e.ctrlKey;
  else if (modifier === 'shift') modifierPressed = e.shiftKey;
  else if (modifier === 'meta') modifierPressed = e.metaKey;
  
  if (modifierPressed && e.key.toLowerCase() === key) {
    e.preventDefault();
    highlightSelectedWord();
  }
});

function getDomPath(node) {
  let path = [];
  while (node && node !== document.body) {
    let index = 0;
    let sibling = node;
    while ((sibling = sibling.previousSibling) != null) {
      if (sibling.nodeType === node.nodeType && sibling.nodeName === node.nodeName) index++;
    }
    path.unshift(node.nodeName.toLowerCase() + ':' + index);
    node = node.parentNode;
  }
  return path.join('/') || null;
}

function getNodeByDomPath(path) {
  if (!path) return null;
  let segments = path.split('/');
  let node = document.body;
  for (let seg of segments) {
    let [tag, idx] = seg.split(':');
    idx = Number(idx);
    let matches = [];
    for (let i = 0; i < node.childNodes.length; i++) {
      let c = node.childNodes[i];
      if (c.nodeName.toLowerCase() === tag) matches.push(c);
    }
    node = matches[idx];
    if (!node) return null;
  }
  return node;
}

function highlightSelectedWord() {
  if (!selectedWord || !selectedRange) return;
  try {
    // Đoạn lấy domPath + offset
    let anchorNode = selectedRange.startContainer;
    let domPath = null;
    let startOffset = selectedRange.startOffset;
    let endOffset = selectedRange.endOffset;
    if (anchorNode.nodeType === 3) { // TEXT_NODE
      domPath = getDomPath(anchorNode);
    } else if (anchorNode.childNodes.length > 0) {
      // Nếu là element node, thử lấy con đầu tiên có text
      let txt = Array.from(anchorNode.childNodes).find(x => x.nodeType === 3);
      if (txt) domPath = getDomPath(txt);
    }

    // Tạo highlight bình thường
    const span = document.createElement('span');
    span.style.backgroundColor = highlightColor;
    span.style.padding = '2px 4px';
    span.style.borderRadius = '3px';
    span.style.fontWeight = 'normal';
    span.className = 'vocabulary-highlight';
    span.setAttribute('data-word', selectedWord);
    span.setAttribute('data-timestamp', Date.now());
    const range = selectedRange.cloneRange();
    try { range.surroundContents(span); } catch (e) {
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
    }
    span.addEventListener('mouseenter', (e) => {
      const wordText = span.getAttribute('data-word') || span.textContent.trim().toLowerCase();
      showActionMenu(e.pageX, e.pageY, wordText, span);
    });

    saveWordToStorage(selectedWord, domPath, startOffset, endOffset);

    // Gửi về background để log lên Google Sheet
    chrome.runtime.sendMessage({
      action: 'logToSheets',
      logData: {
        action: 'add',
        word: selectedWord,
        timestamp: new Date().toLocaleString(),
        url: window.location.href
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message to background:', chrome.runtime.lastError);
      } else {
        console.log('Response from background:', response);
      }
    });
    // Google Sheets ... giữ code cũ
    window.getSelection().removeAllRanges();
    selectedWord = null; selectedRange = null;
  } catch {}
}

function saveWordToStorage(word, domPath, startOffset, endOffset) {
  try {
    chrome.storage.local.get(['highlightedWords'], (result) => {
      if (chrome.runtime.lastError) return;
      try {
        const words = result.highlightedWords || [];
        // Nếu đã có cùng word + domPath + startOffset thì không lưu trùng
        const exists = words.find(w => w.word === word && w.domPath === domPath && w.startOffset === startOffset);
        if (!exists) {
          const newWord = {
            word, meaning: '', count: 1,
            firstHighlighted: Date.now(), lastHighlighted: Date.now(),
            color: highlightColor, url: window.location.href,
            title: document.title,
            domPath, startOffset, endOffset
          };
          words.push(newWord);
        }
        chrome.storage.local.set({highlightedWords: words});
      } catch {}
    });
  } catch {}
}

function showActionMenu(x, y, text, spanElement) {
  // Remove existing tooltip
  const existingTooltip = document.getElementById('vocab-tooltip');
  if (existingTooltip) {
    existingTooltip.remove();
  }
  
  const tooltip = document.createElement('div');
  tooltip.id = 'vocab-tooltip';
  tooltip.style.position = 'absolute';
  tooltip.style.zIndex = '2147483647';
  tooltip.innerHTML = `
          <div style="
            position: relative;
            background: white;
            border: none;
            border-radius: 8px;
            padding: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            display: flex;
            gap: 4px;
            align-items: center;
            min-width: 60px;
            min-height: 30px;
          ">
            <button id="highlightBtn" style="
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              border: none;
              cursor: pointer;
              padding: 3px;
              border-radius: 3px;
              display: flex;
              align-items: center;
              justify-content: center;
              width: 20px;
              height: 20px;
              transition: all 0.2s ease;
              box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
            " title="Đổi màu">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1"/>
              </svg>
            </button>
            
            <button id="deleteBtn" style="
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%);
              border: none;
              cursor: pointer;
              padding: 3px;
              border-radius: 3px;
              display: flex;
              align-items: center;
              justify-content: center;
              width: 20px;
              height: 20px;
              transition: all 0.2s ease;
              box-shadow: 0 2px 8px rgba(255, 107, 107, 0.3);
            " title="Xóa highlight">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
                <polyline points="3,6 5,6 21,6"/>
                <path d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </button>
          </div>
        `;
  
  tooltip.style.position = 'absolute';
  tooltip.style.left = (x - 30) + 'px';
  tooltip.style.top = (y - 60) + 'px';
  tooltip.style.zIndex = '2147483647';
  tooltip.style.pointerEvents = 'auto';
  tooltip.style.backgroundColor = 'white';
  tooltip.style.border = 'none';
  tooltip.style.borderRadius = '8px';
  tooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  tooltip.style.display = 'block';
  
  document.body.appendChild(tooltip);
  
  // Add event listeners
  const highlightBtn = document.getElementById('highlightBtn');
  const deleteBtn = document.getElementById('deleteBtn');
  
  // Add hover effects
  [highlightBtn, deleteBtn].forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.05)';
      btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = btn.id === 'highlightBtn' ? '0 2px 8px rgba(102, 126, 234, 0.3)' :
                           '0 2px 8px rgba(255, 107, 107, 0.3)';
    });
  });
  
  highlightBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showColorPicker(x, y, text, spanElement);
    tooltip.remove();
  });
  
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    console.log('Delete button clicked for word:', text);
    try {
      // Remove highlight
      const parent = spanElement.parentNode;
      parent.replaceChild(document.createTextNode(spanElement.textContent), spanElement);
      parent.normalize();
      console.log('Highlight removed from DOM');
      
      // Remove from storage and log to Google Sheets
      console.log('Sending deleteWord message for word:', text.toLowerCase());
      chrome.runtime.sendMessage({
        action: 'deleteWord',
        word: text.toLowerCase(),
        url: window.location.href
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error deleting word:', chrome.runtime.lastError);
        } else {
          console.log('Word deleted successfully:', response);
        }
      });
      
    } catch (error) {
      console.error('Error in delete button click:', error);
    }
    tooltip.remove();
  });
  
  // Remove tooltip when clicking outside
  document.addEventListener('click', () => {
    if (tooltip.parentNode) {
      tooltip.remove();
    }
  }, { once: true });
}

function showColorPicker(x, y, text, spanElement) {
  // Remove existing color picker
  const existingPicker = document.getElementById('vocab-color-picker');
  if (existingPicker) {
    existingPicker.remove();
  }
  
  const colors = ['#FFEB3B', '#4CAF50', '#03DAC6', '#E91E63', '#9C27B0'];
  
        const picker = document.createElement('div');
        picker.id = 'vocab-color-picker';
        picker.innerHTML = `
          <div style="
            position: absolute;
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 16px;
            padding: 16px;
            z-index: 10001;
            box-shadow: 0 8px 24px rgba(0,0,0,0.15);
            display: flex;
            gap: 12px;
            align-items: center;
          ">
            ${colors.map(color => `
              <button class="color-option" data-color="${color}" style="
                width: 32px;
                height: 32px;
                border-radius: 50%;
                border: 3px solid ${color === highlightColor ? '#4CAF50' : 'transparent'};
                background-color: ${color};
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: ${color === highlightColor ? '0 4px 12px rgba(76, 175, 80, 0.4)' : '0 2px 8px rgba(0,0,0,0.1)'};
                transform: ${color === highlightColor ? 'scale(1.1)' : 'scale(1)'};
              " title="Màu ${color}"></button>
            `).join('')}
          </div>
        `;
  
  picker.style.position = 'absolute';
  picker.style.left = x + 'px';
  picker.style.top = (y - 80) + 'px';
  picker.style.zIndex = '10001';
  
  document.body.appendChild(picker);
  
        // Add event listeners for color buttons
        picker.querySelectorAll('.color-option').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            try {
              const selectedColor = btn.dataset.color;
              highlightColor = selectedColor;
              
              // Update color in storage
              try {
                chrome.storage.local.set({highlightColor: selectedColor});
              } catch (storageError) {
                // Silent error handling
              }
              
              // Update the existing span color
              if (spanElement) {
                spanElement.style.backgroundColor = selectedColor;
              }
            } catch (error) {
              // Silent error handling
            }
            picker.remove();
          });
          
          btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'scale(1.1)';
            btn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
          });
          
          btn.addEventListener('mouseleave', () => {
            const isSelected = btn.dataset.color === highlightColor;
            btn.style.transform = isSelected ? 'scale(1.05)' : 'scale(1)';
            btn.style.boxShadow = isSelected ? '0 4px 12px rgba(76, 175, 80, 0.4)' : '0 2px 8px rgba(0,0,0,0.1)';
          });
        });
  
  // Remove picker when clicking outside
  document.addEventListener('click', () => {
    if (picker.parentNode) {
      picker.remove();
    }
  }, { once: true });
}


// Show notification popup
function showNotification(message, type = 'success') {
  // Remove existing notification
  const existingNotification = document.getElementById('vocab-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  const notification = document.createElement('div');
  notification.id = 'vocab-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'error' ? '#f44336' : type === 'info' ? '#2196F3' : '#4CAF50'};
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 2147483647;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    max-width: 300px;
    word-wrap: break-word;
    animation: slideIn 0.3s ease-out;
  `;
  
  // Add CSS animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // Auto remove after 4 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    }
  }, 4000);
}

// ====== TỰ ĐỘNG HIỂN THỊ HIGHLIGHT KHI LOAD LẠI TRANG ======
function autoHighlightSavedWords() {
  chrome.storage.local.get(['highlightedWords'], (result) => {
    const words = (result.highlightedWords || []).filter(w => w.url === window.location.href);
    for (let obj of words) {
      if (!obj.domPath || obj.startOffset == null || obj.endOffset == null) continue;
      const node = getNodeByDomPath(obj.domPath);
      if (node && node.nodeType === 3) { // TEXT_NODE
        try {
          const range = document.createRange();
          range.setStart(node, obj.startOffset);
          range.setEnd(node, obj.endOffset);
          const span = document.createElement('span');
          span.className = 'vocabulary-highlight';
          span.style.backgroundColor = obj.color || '#FFEB3B';
          span.textContent = range.toString();
          range.deleteContents();
          range.insertNode(span);
        } catch (e) {}
      }
    }
  });
}

function highlightWordOnPage(word, color) {
  if (!word) return;
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        if (!node.parentNode) return NodeFilter.FILTER_REJECT;
        const tag = node.parentNode.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'INPUT' || tag === 'TEXTAREA') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );
  const regex = new RegExp(`\\b${word}\\b`, 'gi');
  let node;
  while (node = walker.nextNode()) {
    if (regex.test(node.nodeValue)) {
      const span = document.createElement('span');
      span.className = 'vocabulary-highlight';
      span.style.backgroundColor = color;
      span.textContent = word;
      const parts = node.nodeValue.split(regex);
      if (parts.length > 1) {
        const before = document.createTextNode(parts[0]);
        const after = document.createTextNode(parts.slice(1).join(word));
        const fragment = document.createDocumentFragment();
        fragment.appendChild(before);
        fragment.appendChild(span.cloneNode(true));
        if (after.textContent) fragment.appendChild(after);
        node.parentNode.replaceChild(fragment, node);
      }
    }
  }
}

window.addEventListener('load', () => setTimeout(autoHighlightSavedWords, 800));

// Initialize - load settings without changing cursor
chrome.storage.local.get(['highlightColor', 'shortcutSettings'], (result) => {
  highlightColor = result.highlightColor || '#FFEB3B';
  shortcutSettings = result.shortcutSettings || {modifier: 'alt', key: 'f'};
  // Không thay đổi cursor mặc định để không làm phiền người dùng
});
