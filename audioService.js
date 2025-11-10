// Audio Service for generating MP3 audio from text using VoiceRSS API
class AudioService {
  constructor() {
    this.apiKey = null;
    this.baseUrl = 'https://api.voicerss.org/';
    this.loadApiKey();
  }

  async loadApiKey() {
    try {
      const result = await chrome.storage.local.get(['voicerssApiKey']);
      if (result.voicerssApiKey) {
        this.apiKey = result.voicerssApiKey;
      }
    } catch (error) {
      console.error('Error loading VoiceRSS API key:', error);
    }
  }

  async setApiKey(apiKey) {
    this.apiKey = apiKey;
    await chrome.storage.local.set({ voicerssApiKey: apiKey });
  }

  /**
   * Generate audio URL for a word or sentence
   * @param {string} text - Text to convert to speech
   * @param {string} language - Language code (default: 'en-us')
   * @returns {Promise<string>} - Audio URL (MP3)
   */
  async generateAudio(text, language = 'en-us') {
    if (!text || typeof text !== 'string' || text.trim() === '') {
      throw new Error('Text is required');
    }

    // If no API key, return null (will use browser TTS as fallback)
    if (!this.apiKey) {
      console.warn('VoiceRSS API key not set, skipping audio generation');
      return null;
    }

    try {
      // VoiceRSS API parameters
      const params = new URLSearchParams({
        key: this.apiKey,
        hl: language,
        src: text.trim(),
        c: 'MP3', // Audio format
        f: '44khz_16bit_stereo', // Audio quality
        ssml: 'false',
        b64: 'false'
      });

      const url = `${this.baseUrl}?${params.toString()}`;
      
      // VoiceRSS returns audio as binary data, we need to create a blob URL
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`VoiceRSS API error: ${response.status} ${response.statusText}`);
      }

      // Check if response is audio (MP3)
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('audio')) {
        // Create blob URL from audio data
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        return audioUrl;
      } else {
        // If not audio, might be error message
        const text = await response.text();
        console.error('VoiceRSS API error response:', text);
        throw new Error('VoiceRSS API returned non-audio response');
      }
    } catch (error) {
      console.error('Error generating audio with VoiceRSS:', error);
      // Fallback to browser TTS
      return null;
    }
  }

  /**
   * Generate audio for a word
   * @param {string} word - Word to convert to speech
   * @returns {Promise<string|null>} - Audio URL or null
   */
  async generateWordAudio(word) {
    return await this.generateAudio(word, 'en-us');
  }

  /**
   * Generate audio for an example sentence
   * @param {string} sentence - Sentence to convert to speech
   * @returns {Promise<string|null>} - Audio URL or null
   */
  async generateSentenceAudio(sentence) {
    return await this.generateAudio(sentence, 'en-us');
  }

  /**
   * Play audio from URL
   * @param {string} audioUrl - URL of audio to play
   * @returns {Promise<void>}
   */
  async playAudio(audioUrl) {
    if (!audioUrl) {
      console.warn('No audio URL provided');
      return;
    }

    return new Promise((resolve, reject) => {
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        resolve();
      };
      
      audio.onerror = (error) => {
        console.error('Error playing audio:', error);
        reject(error);
      };
      
      audio.play().catch((error) => {
        console.error('Error starting audio playback:', error);
        reject(error);
      });
    });
  }

  /**
   * Clean up blob URLs to free memory
   * @param {string} audioUrl - Blob URL to revoke
   */
  revokeAudioUrl(audioUrl) {
    if (audioUrl && audioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(audioUrl);
    }
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioService;
}

