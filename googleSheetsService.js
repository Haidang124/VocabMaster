// Google Sheets Service
class GoogleSheetsService {
  constructor() {
    this.sheetId = null;
    this.isAuthenticated = false;
  }

  // Set Google Sheet ID
  setSheetId(sheetId) {
    this.sheetId = sheetId;
  }

  // Authenticate with Google (simplified version)
  async authenticate() {
    try {
      // For Chrome extension, we'll use a simplified approach
      // In production, you'd need proper OAuth2 flow
      this.isAuthenticated = true;
      return true;
    } catch (error) {
      console.error('Authentication failed:', error);
      return false;
    }
  }

  // Fetch sheets from Google Sheets
  async fetchSheets(sheetName) {
    try {
      const result = await chrome.storage.local.get(['appsScriptUrl']);
      const appsScriptUrl = result.appsScriptUrl;
      
      if (!appsScriptUrl) {
        console.log('Google Apps Script URL not configured');
        return [];
      }

      const response = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'fetchSheets',
          sheetName: sheetName
        })
      });

      const result_data = await response.json();

      if (result_data.success) {
        return result_data.sheets || [];
      } else {
        console.error('Failed to fetch sheets:', result_data.error);
        return [];
      }
    } catch (error) {
      console.error('Error fetching sheets:', error);
      return [];
    }
  }

  // Log action to Google Sheets
  async logAction(action, word, details = {}) {
    if (!this.sheetId) {
      console.log('Google Sheets not configured');
      return false;
    }

    try {
      const timestamp = new Date().toLocaleString();
      const url = window.location?.href || 'Unknown';
      
      const rowData = [
        timestamp,
        action,
        word,
        url,
        JSON.stringify(details)
      ];

      // Write to Google Sheets using public API
      await this.appendToSheet(rowData);
      
      return true;
    } catch (error) {
      console.error('Failed to log to Google Sheets:', error);
      return false;
    }
  }

  // Append row to Google Sheet using Google Apps Script
  async appendToSheet(rowData) {
    try {
      // Get the Apps Script web app URL from storage
      const result = await chrome.storage.local.get(['appsScriptUrl']);
      const appsScriptUrl = result.appsScriptUrl;
      
      if (!appsScriptUrl) {
        console.log('Google Apps Script URL not configured');
        return false;
      }

      const data = {
        timestamp: rowData[0],
        action: rowData[1],
        word: rowData[2],
        url: rowData[3],
        details: rowData[4]
      };

      const response = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });

      const result_data = await response.json();
      
      if (result_data.success) {
        console.log('Successfully logged to Google Sheets:', data);
        return true;
      } else {
        console.error('Failed to write to Google Sheets:', result_data.error);
        return false;
      }
    } catch (error) {
      console.error('Error writing to Google Sheets:', error);
      return false;
    }
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GoogleSheetsService;
} else {
  window.GoogleSheetsService = GoogleSheetsService;
}
