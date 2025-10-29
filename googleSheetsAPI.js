// Google Sheets API using Service Account - Load credentials from file
class GoogleSheetsAPI {
  constructor() {
    this.credentials = null;
    this.accessToken = null;
    this.accessTokenExpiry = 0;
    this.initialized = false;
  }

  // Load credentials from vocabmaster.json file
  async loadCredentials() {
    if (this.initialized) return;
    
    try {
      const response = await fetch(chrome.runtime.getURL('vocabmaster.json'));
      this.credentials = await response.json();
      this.initialized = true;
      console.log('Credentials loaded successfully');
    } catch (error) {
      console.error('Error loading credentials:', error);
      throw new Error('Failed to load service account credentials');
    }
  }

  // Get access token using JWT
  async getAccessToken() {
    if (this.accessToken && Date.now() < this.accessTokenExpiry) {
      return this.accessToken;
    }

    try {
      // Load credentials if not already loaded
      await this.loadCredentials();
      
      console.log('Creating JWT token...');
      const jwt = await this.createJWT();
      console.log('JWT created, exchanging for access token...');
      
      const response = await fetch(this.credentials.token_uri, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
      });

      const data = await response.json();
      console.log('Token response:', data);
      
      if (data.error) {
        throw new Error(data.error_description || data.error);
      }
      
      this.accessToken = data.access_token;
      this.accessTokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
      console.log('Access token obtained successfully');
      return this.accessToken;
    } catch (error) {
      console.error('Error getting access token:', error);
      throw error;
    }
  }

  // Create JWT token using Web Crypto API
  async createJWT() {
    try {
      const header = {
        "alg": "RS256",
        "typ": "JWT"
      };

      const now = Math.floor(Date.now() / 1000);
      const payload = {
        "iss": this.credentials.client_email,
        "scope": "https://www.googleapis.com/auth/spreadsheets",
        "aud": this.credentials.token_uri,
        "exp": now + 3600,
        "iat": now
      };

      const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
      const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
      
      console.log('Signing JWT...');
      const signature = await this.sign(`${encodedHeader}.${encodedPayload}`);
      const encodedSignature = this.base64UrlEncodeBytes(signature);
      
      return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
    } catch (error) {
      console.error('Error creating JWT:', error);
      throw error;
    }
  }

  // Base64 URL encode - properly handles UTF-8 strings
  base64UrlEncode(str) {
    // Convert string to UTF-8 bytes using TextEncoder
    const utf8Bytes = new TextEncoder().encode(str);
    
    // Convert bytes to binary string that btoa can handle
    let binaryString = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binaryString += String.fromCharCode(utf8Bytes[i]);
    }
    
    // Encode to base64
    const base64 = btoa(binaryString);
    
    // Apply URL-safe encoding
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  // Base64 URL encode for Uint8Array (binary data like signatures)
  base64UrlEncodeBytes(bytes) {
    // Convert Uint8Array to binary string
    let binaryString = '';
    for (let i = 0; i < bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i]);
    }
    
    // Encode to base64
    const base64 = btoa(binaryString);
    
    // Apply URL-safe encoding
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  // Sign with private key using Web Crypto API
  async sign(data) {
    try {
      const privateKey = this.credentials.private_key.replace(/\\n/g, '\n');
      const keyData = this.pemToArrayBuffer(privateKey);
      
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
    } catch (error) {
      console.error('Error signing JWT:', error);
      throw error;
    }
  }

  // Convert PEM to ArrayBuffer
  pemToArrayBuffer(pem) {
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

  // Extract sheet ID from URL
  extractSheetId(url) {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  }

  // Fetch sheets from Google Sheets
  async fetchSheets(sheetUrl) {
    try {
      console.log('Extracting sheet ID from URL:', sheetUrl);
      const sheetId = this.extractSheetId(sheetUrl);
      if (!sheetId) {
        throw new Error('Invalid Google Sheets URL');
      }
      console.log('Sheet ID:', sheetId);

      console.log('Getting access token...');
      const accessToken = await this.getAccessToken();
      console.log('Access token obtained, fetching sheets...');
      
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error response:', errorData);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      console.log('Sheets data received:', data);
      
      return data.sheets.map(sheet => ({
        id: sheetId,
        name: sheet.properties.title,
        url: sheetUrl
      }));
    } catch (error) {
      console.error('Error fetching sheets:', error);
      throw error;
    }
  }

  // Log action to Google Sheets
  async logAction(sheetUrl, sheetName, action, word, details = {}) {
    try {
      const sheetId = this.extractSheetId(sheetUrl);
      if (!sheetId) {
        throw new Error('Invalid Google Sheets URL');
      }

      const accessToken = await this.getAccessToken();
      const timestamp = new Date().toLocaleString();
      const url = window.location?.href || 'Unknown';

      const values = [
        [timestamp, action, word, url, JSON.stringify(details)]
      ];

      // URL encode the sheet name to handle special characters
      const encodedSheetName = encodeURIComponent(sheetName);
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodedSheetName}!A:E:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: values
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error?.message || 'Unknown error'}`);
      }

      return true;
    } catch (error) {
      console.error('Error logging to Google Sheets:', error);
      throw error;
    }
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GoogleSheetsAPI;
} else {
  window.GoogleSheetsAPI = GoogleSheetsAPI;
}