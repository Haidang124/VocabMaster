// Constants for VocabMaster Extension
// Centralized constants to avoid magic strings/numbers

// Flashcard modes
const FLASHCARD_MODES = {
  WORD: 'word',
  AUDIO: 'audio'
};

// Audio types
const AUDIO_TYPES = {
  WORD: 'word',
  EXAMPLE: 'example'
};

// Timeouts (milliseconds)
const TIMEOUTS = {
  AUDIO_AUTO_PLAY_DELAY: 500,        // Delay before auto-playing audio in flashcard
  TAB_CLOSE_DELAY: 1000,             // Delay before closing audio tab
  NOTIFICATION_DISPLAY: 3000,         // How long to show notifications
  RETRY_DELAY: 100,                  // Delay between retries
  HIDDEN_TAB_AUDIO_TIMEOUT: 5000     // Timeout for audio in hidden tab
};

// Spaced repetition constants
const SPACED_REPETITION = {
  MAX_INTERVAL: 30,                  // Maximum days between reviews
  INITIAL_INTERVAL: 1,               // Initial interval in days
  MULTIPLIER: 2,                     // Interval multiplier when word is known
  MILLISECONDS_PER_DAY: 24 * 60 * 60 * 1000  // Milliseconds in a day
};

// Default values
const DEFAULTS = {
  WORD_COUNT: 5,                     // Default number of words for review
  HIGHLIGHT_COLOR: '#FFEB3B',        // Default highlight color
  FLASHCARD_MODE: FLASHCARD_MODES.WORD,
  AUDIO_TYPE: AUDIO_TYPES.WORD
};

// Google Sheets column indices (0-based)
const SHEET_COLUMNS = {
  WORD: 0,           // Column A
  PRONUNCIATION: 1,  // Column B
  POS: 2,            // Column C
  TRANSLATION: 3,    // Column D
  EXAMPLE: 4,        // Column E
  URL: 5,            // Column F
  TIMESTAMP: 6,      // Column G
  REVIEW_COUNT: 7,   // Column H
  AUDIO_US: 8,       // Column I
  AUDIO_UK: 9        // Column J
};

// Sheet header keywords (for detecting header row)
const SHEET_HEADERS = {
  NEW_WORD: ['new word', 'từ', 'word', 'từ mới'],
  ENGLISH: ['word', 'từ']
};

// API endpoints
const API_ENDPOINTS = {
  DICTIONARY: 'https://dictionary-api.eliaschen.dev/api/dictionary/en',
  VOICERSS: 'https://api.voicerss.org/',
  GOOGLE_SHEETS: 'https://sheets.googleapis.com/v4/spreadsheets'
};

// Action types for messages
const ACTIONS = {
  GET_HIGHLIGHTED_WORDS: 'getHighlightedWords',
  DELETE_ALL_WORDS: 'deleteAllWords',
  FETCH_DICTIONARY: 'fetchDictionary',
  LOAD_WORDS_FROM_SHEET: 'loadWordsFromSheet',
  GET_RANDOM_WORDS_FOR_FLASHCARD: 'getRandomWordsForFlashcard',
  RELOAD_MP3_FOR_ALL_WORDS: 'reloadMP3ForAllWords',
  LOG_TO_SHEETS: 'logToSheets',
  MARK_WORD_REVIEWED: 'markWordReviewed',
  UPDATE_REVIEW_STATS: 'updateReviewStats',
  FETCH_AUDIO_AS_BLOB: 'fetchAudioAsBlob',
  PLAY_AUDIO: 'playAudio'
};

// Error messages (user-friendly Vietnamese)
const ERROR_MESSAGES = {
  NO_SHEET_CONFIG: 'Vui lòng cấu hình Google Sheets trước!',
  NO_API_KEY: 'Vui lòng nhập VoiceRSS API Key trước!',
  NO_WORDS: 'Chưa có từ để học. Hãy highlight một số từ trước!',
  NO_AUDIO_WORDS: 'Không có từ nào có audio. Hãy highlight một số từ trước!',
  AUDIO_GENERATION_FAILED: 'Không thể tạo audio. Vui lòng thử lại sau.',
  AUDIO_PLAYBACK_FAILED: 'Không thể phát audio. Có thể do CORS hoặc URL không hợp lệ.',
  SHEET_SYNC_FAILED: 'Không thể đồng bộ với Google Sheets. Vui lòng kiểm tra kết nối.',
  DICTIONARY_FETCH_FAILED: 'Không thể lấy nghĩa từ. Vui lòng thử lại sau.',
  NETWORK_ERROR: 'Lỗi kết nối mạng. Vui lòng kiểm tra internet.',
  UNKNOWN_ERROR: 'Đã xảy ra lỗi không xác định. Vui lòng thử lại.'
};

// Success messages
const SUCCESS_MESSAGES = {
  WORDS_LOADED: 'Đã tải từ thành công!',
  AUDIO_GENERATED: 'Đã tạo audio thành công!',
  SHEET_SYNCED: 'Đã đồng bộ với Google Sheets!',
  SETTINGS_SAVED: 'Đã lưu cài đặt!'
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FLASHCARD_MODES,
    AUDIO_TYPES,
    TIMEOUTS,
    SPACED_REPETITION,
    DEFAULTS,
    SHEET_COLUMNS,
    SHEET_HEADERS,
    API_ENDPOINTS,
    ACTIONS,
    ERROR_MESSAGES,
    SUCCESS_MESSAGES
  };
}

