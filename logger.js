// Logger utility for VocabMaster Extension
// Replaces console.log with configurable logging

// Set DEBUG to false in production
const DEBUG = false; // Change to true for debugging

const logger = {
  /**
   * Log debug messages (only in DEBUG mode)
   */
  log: (...args) => {
    if (DEBUG) {
      console.log('[VocabMaster]', ...args);
    }
  },

  /**
   * Log warnings (only in DEBUG mode)
   */
  warn: (...args) => {
    if (DEBUG) {
      console.warn('[VocabMaster]', ...args);
    }
  },

  /**
   * Log errors (always logged, even in production)
   */
  error: (...args) => {
    console.error('[VocabMaster ERROR]', ...args);
  },

  /**
   * Log info messages (only in DEBUG mode)
   */
  info: (...args) => {
    if (DEBUG) {
      console.info('[VocabMaster]', ...args);
    }
  },

  /**
   * Log with context (useful for tracking operations)
   */
  logWithContext: (context, ...args) => {
    if (DEBUG) {
      console.log(`[VocabMaster ${context}]`, ...args);
    }
  }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = logger;
}

// Make available globally for popup and background scripts
if (typeof window !== 'undefined') {
  window.logger = logger;
}

// For service worker (background.js)
if (typeof self !== 'undefined') {
  self.logger = logger;
}

