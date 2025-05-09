// TTS state
let ttsState = {
  isPlaying: false,
  isProcessing: false,
  processingMessage: '',
  text: '',
  chunks: [],
  currentChunk: 0,
  totalChunks: 0,
  lastSelectedText: '',
  lastError: '',
  serverConnected: false,
  offscreenDocumentReady: false,
  keepAliveInterval: null, // Keep alive interval reference
  documentCreationInProgress: false, // Flag to track document creation
  closeDocumentOnStop: true, // Flag to control document closure on stop
  // Added maximum size for cache
  maxCacheSize: 10 // Maximum number of audio chunks to keep in cache
};

// Create context menu item
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'read-selected-text',
    title: 'Read with Kokoro TTS',
    contexts: ['selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'read-selected-text' && info.selectionText) {
    ttsState.lastSelectedText = info.selectionText.trim();
    startTtsPlayback(ttsState.lastSelectedText);
  }
});

// Safe message sender that catches errors
function sendMessageSafely(message, callback) {
  try {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.log("Message error (handled):", chrome.runtime.lastError.message);
        if (callback) callback(null);
      } else {
        if (callback) callback(response);
      }
    });
  } catch (e) {
    console.log("Message sending error (handled):", e);
    if (callback) callback(null);
  }
}

// Promise version of sendMessageSafely for better async handling
function sendMessageAsync(message, timeout = 3000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.log("Message timeout");
      resolve(null);
    }, timeout);
    
    sendMessageSafely(message, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    // Handle messages targeted specifically to the background script
    if (message.target === 'background') {
      switch (message.action) {
        case 'statusUpdate':
          // Update our state based on the offscreen document's status
          ttsState.isPlaying = message.isPlaying;
          ttsState.currentChunk = message.currentChunk;
          ttsState.totalChunks = message.totalChunks;
          
          // If playback started, we're no longer processing
          if (message.isPlaying) {
            ttsState.isProcessing = false;
            ttsState.processingMessage = '';
          }
          
          // If playback stopped completely, consider closing the document
          if (!message.isPlaying && ttsState.closeDocumentOnStop) {
            console.log('Playback stopped, closing document');
            safeCloseDocument();
          }
          
          // Broadcast the status update to the popup
          broadcastStatus();
          sendResponse({success: true});
          break;
          
        case 'error':
          // More user-friendly error message
          const userMessage = getUserFriendlyErrorMessage(message.message);
          ttsState.lastError = userMessage;
          
          console.error("Original error:", message.message);
          
          ttsState.isProcessing = false;
          ttsState.processingMessage = '';
          broadcastStatus();
          sendResponse({success: true});
          break;
          
        case 'processingUpdate':
          // Processing update from offscreen document
          ttsState.isProcessing = true;
          ttsState.processingMessage = message.message || 'Processing...';
          broadcastStatus();
          sendResponse({success: true});
          break;
          
        case 'keepAlive':
          // Keep alive ping from offscreen document
          console.log('Received keep alive from offscreen document');
          ttsState.isPlaying = message.isPlaying;
          ttsState.currentChunk = message.currentChunk;
          ttsState.totalChunks = message.totalChunks;
          sendResponse({success: true});
          break;
          
        case 'offscreenReady':
          // The offscreen document has loaded and is ready
          console.log('Offscreen document is ready');
          ttsState.offscreenDocumentReady = true;
          ttsState.documentCreationInProgress = false;
          
          // If we have text waiting to be processed, send it to the offscreen document
          if (ttsState.lastSelectedText) {
            sendTextToOffscreen(ttsState.lastSelectedText);
          }
          sendResponse({success: true});
          break;
          
        default:
          // Always send a response, even for unhandled messages
          sendResponse({success: false, error: "Unhandled action"});
          break;
      }
      return true;
    }
    
    // Handle general messages
    switch (message.action) {
      case 'readText':
        ttsState.lastSelectedText = message.text;
        
        // Set processing state immediately for UI responsiveness
        ttsState.isProcessing = true;
        ttsState.processingMessage = 'Initializing TTS engine...';
        broadcastStatus();
        
        startTtsPlayback(message.text);
        sendResponse({success: true});
        break;
        
      case 'updateSelectedText':
        ttsState.lastSelectedText = message.text;
        sendResponse({success: true});
        break;
        
      case 'getLastSelectedText':
        sendResponse({text: ttsState.lastSelectedText});
        break;
        
      case 'checkServer':
        checkServerConnection().then(result => {
          try {
            sendResponse(result);
          } catch (e) {
            console.log("Error sending server connection response:", e);
          }
        });
        return true; // Keep the messaging channel open for the async response
        
      case 'getStatus':
        sendResponse({
          lastSelectedText: ttsState.lastSelectedText,
          lastError: ttsState.lastError,
          serverConnected: ttsState.serverConnected,
          isPlaying: ttsState.isPlaying,
          currentChunk: ttsState.currentChunk,
          totalChunks: ttsState.totalChunks,
          isProcessing: ttsState.isProcessing,
          processingMessage: ttsState.processingMessage
        });
        break;
        
      case 'stopPlayback':
        // Stop playback with async handling
        handleStopPlayback().then(() => {
          sendResponse({success: true});
        }).catch(e => {
          console.error("Error in stop playback:", e);
          sendResponse({success: false, error: getUserFriendlyErrorMessage(e.message)});
        });
        return true; // Keep channel open for async response
                
      default:
        // Always send a response, even for unhandled messages
        sendResponse({success: false, error: "Unhandled action"});
        break;
    }
  } catch (e) {
    console.error("Error processing message:", e);
    // Always send a response, even in case of errors
    sendResponse({success: false, error: getUserFriendlyErrorMessage(e.message)});
  }
  return true; // Keep the messaging channel open
});

// Convert technical errors to user-friendly messages
function getUserFriendlyErrorMessage(technicalMessage) {
  // Log the original message for debugging
  console.log("Original error message:", technicalMessage);
  
  // Map common error messages to user-friendly versions
  if (technicalMessage.includes("Failed to fetch") || technicalMessage.includes("NetworkError")) {
    return "Could not connect to the TTS server. Please check your server settings and connection.";
  }
  
  if (technicalMessage.includes("only a single offscreen document")) {
    return "There was an issue with the audio playback. Please try again.";
  }
  
  if (technicalMessage.includes("API request failed")) {
    return "The TTS server reported an error. Please check your server settings.";
  }
  
  if (technicalMessage.includes("no document to close") || 
      technicalMessage.includes("Failed to create offscreen document")) {
    return "Could not initialize audio playback. Please try again.";
  }
  
  if (technicalMessage.includes("not available")) {
    return "This feature requires Chrome 116 or newer. Please update your browser.";
  }
  
  // For any other errors, provide a generic message
  return "An error occurred. Please try again.";
}

// Handle stop playback with proper cleanup
async function handleStopPlayback() {
  // Update our state immediately for responsive UI
  ttsState.isPlaying = false;
  ttsState.isProcessing = false;
  
  // First send stop message to offscreen document
  await sendMessageAsync({
    target: 'offscreen',
    action: 'stopPlayback'
  });
  
  // Wait a moment to ensure the stop message is processed
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Now try to close the document to ensure clean state
  await safeCloseDocument();
  
  // Update UI
  broadcastStatus();
}

// Function to start TTS playback
async function startTtsPlayback(text) {
  try {
    // If already playing, stop current playback first
    if (ttsState.isPlaying) {
      // Send message to stop current playback
      try {
        await handleStopPlayback();
        
        // Give a small delay to ensure everything is reset
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (e) {
        console.error("Error stopping existing playback:", e);
      }
    }
    
    // Set processing state
    ttsState.isProcessing = true;
    ttsState.processingMessage = 'Preparing offscreen document...';
    broadcastStatus();
    
    // Count words to check if we need to show a warning
    const wordCount = countWords(text);
    if (wordCount > 2000) {
      // Send a warning for very large texts
      ttsState.processingMessage = 'Processing large text (performance may be affected)...';
      broadcastStatus();
    }
    
    // Always close any existing document first to ensure clean state
    await safeCloseDocument();
    
    // Now check if we need to create a new offscreen document
    await ensureOffscreenDocumentExists();
    
    // Reset error state
    ttsState.lastError = '';
    
    // Update processing state
    ttsState.processingMessage = 'Connecting to TTS server...';
    broadcastStatus();
    
    // Send text to offscreen document for processing
    sendTextToOffscreen(text);
    
    // Start keep alive monitoring from the background script side
    startKeepAliveMonitoring();
  } catch (e) {
    console.error("Error in startTtsPlayback:", e);
    ttsState.lastError = getUserFriendlyErrorMessage(e.message);
    ttsState.isProcessing = false;
    broadcastStatus();
  }
}

// Send text to the offscreen document
function sendTextToOffscreen(text) {
  // Get settings to send to the offscreen document
  chrome.storage.local.get({
    apiUrl: 'http://localhost:8880',
    apiKey: 'not-needed',
    voice: 'af_bella',
    chunkSize: '1000',
    maxCacheSize: '10' // Added setting for maximum cache size
  }, function(settings) {
    // Send text and settings to the offscreen document
    sendMessageSafely({
      target: 'offscreen',
      action: 'processText',
      text: text,
      settings: {
        apiUrl: settings.apiUrl,
        apiKey: settings.apiKey,
        voice: settings.voice,
        chunkSize: parseInt(settings.chunkSize),
        maxCacheSize: parseInt(settings.maxCacheSize || 10) // Pass max cache size
      }
    }, (response) => {
      if (!response) {
        console.error('Error sending message to offscreen document or no response received');
        // Try recreating the offscreen document
        recreateOffscreenDocument().then(() => {
          // Try sending again after a short delay
          setTimeout(() => sendTextToOffscreen(text), 500);
        });
      }
    });
  });
}

// Start background-side keep alive monitoring
function startKeepAliveMonitoring() {
  // Clear any existing interval
  if (ttsState.keepAliveInterval) {
    clearInterval(ttsState.keepAliveInterval);
  }
  
  // Set up an interval to check if the offscreen document is still responsive
  ttsState.keepAliveInterval = setInterval(async () => {
    if (ttsState.isPlaying) {
      // Check if the offscreen document is still alive
      try {
        const response = await sendHeartbeat();
        if (!response || !response.alive) {
          console.log('Offscreen document not responding, recreating...');
          await recreateOffscreenDocument();
        }
      } catch (error) {
        console.error('Error checking offscreen document status:', error);
        await recreateOffscreenDocument();
      }
    } else {
      // If not playing, we can stop the monitoring
      clearInterval(ttsState.keepAliveInterval);
      ttsState.keepAliveInterval = null;
    }
  }, 15000); // Check every 15 seconds
}

// Send a heartbeat to the offscreen document with timeout
function sendHeartbeat(timeout = 5000) {
  return new Promise((resolve) => {
    // Set up a timeout
    const timer = setTimeout(() => {
      console.log("Heartbeat timeout");
      resolve(null);
    }, timeout);
    
    sendMessageSafely({
      target: 'offscreen',
      action: 'heartbeat'
    }, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

// Check if offscreen document exists, create if it doesn't
async function ensureOffscreenDocumentExists() {
  try {
    // If creation is already in progress, wait for it to complete
    if (ttsState.documentCreationInProgress) {
      console.log('Document creation already in progress, waiting...');
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (!ttsState.documentCreationInProgress) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
      
      // After waiting, check if document is now available
      if (ttsState.offscreenDocumentReady) {
        console.log('Document is now ready after waiting');
        return;
      }
    }
    
    // Check if the offscreen API is available
    if (!chrome.offscreen) {
      throw new Error('Offscreen API not available in this browser version');
    }
    
    // Set flag to indicate document creation is in progress
    // Do this BEFORE any async operations to prevent race conditions
    ttsState.documentCreationInProgress = true;
    ttsState.offscreenDocumentReady = false;
    
    // Check if we already have an offscreen document
    let hasExistingDocument = false;
    try {
      const existingContexts = await chrome.offscreen.getContexts();
      hasExistingDocument = existingContexts && existingContexts.length > 0;
    } catch (e) {
      console.log('Error checking for existing documents:', e);
    }
    
    // If we have an existing document, close it first
    if (hasExistingDocument) {
      console.log('Existing document found, closing it first');
      try {
        await chrome.offscreen.closeDocument();
        console.log('Successfully closed existing document');
        
        // Add a delay after closing to avoid race conditions
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.log('Error closing existing document:', e);
        // Continue anyway - the document might have been closed already
      }
    }
    
    // Create a new offscreen document with retry logic
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        console.log(`Creating offscreen document (attempt ${attempts + 1}/${maxAttempts})`);
        await chrome.offscreen.createDocument({
          url: 'offscreen.html', 
          reasons: ['AUDIO_PLAYBACK'],
          justification: 'Playing TTS audio in the background'
        });
        
        // Wait for the offscreen document to report ready with a timeout
        const isReady = await waitForOffscreenReady(8000);
        
        if (isReady) {
          console.log('Offscreen document created and ready');
          return;
        } else {
          console.log('Offscreen document failed to become ready, retrying...');
          // Try to close the document before retrying
          await safeCloseDocument();
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (error) {
        console.log(`Error creating document (attempt ${attempts + 1}):`, error);
        
        // If error contains "only a single offscreen document may be created"
        if (error.message && error.message.includes("only a single")) {
          console.log("Single document error detected, trying to close and retry");
          await safeCloseDocument();
          await new Promise(r => setTimeout(r, 1000)); // Longer delay for retry
        }
      }
      
      attempts++;
      
      // Wait before retrying
      if (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 500 * attempts)); // Increasing backoff
      }
    }
    
    if (attempts >= maxAttempts) {
      throw new Error(`Failed to create offscreen document after ${maxAttempts} attempts`);
    }
  } catch (error) {
    console.error('Error ensuring offscreen document exists:', error);
    ttsState.lastError = getUserFriendlyErrorMessage(error.message);
    ttsState.documentCreationInProgress = false;
    broadcastStatus();
    
    // Fallback for older browsers
    if (error.message.includes('not available')) {
      ttsState.lastError = 'This feature requires Chrome 116 or newer. Please update your browser.';
      broadcastStatus();
    }
  } finally {
    // Always make sure to reset the creation flag
    ttsState.documentCreationInProgress = false;
  }
}

// Safely close the offscreen document
async function safeCloseDocument() {
  try {
    console.log('Attempting to close existing offscreen document');
    
    if (!chrome.offscreen) {
      console.log('Offscreen API not available, skipping close');
      return; // Offscreen API not available
    }
    
    // First check if we have any offscreen documents
    let hasDocument = false;
    try {
      const existingContexts = await chrome.offscreen.getContexts();
      hasDocument = existingContexts && existingContexts.length > 0;
      
      if (!hasDocument) {
        console.log('No offscreen document to close');
        // Reset document state
        ttsState.offscreenDocumentReady = false;
        return; // No documents to close
      }
    } catch (e) {
      console.log('Error checking for offscreen documents:', e);
      // Continue anyway - we'll try to close
    }
    
    // If we have a document, send a message to clean up resources before closing
    if (hasDocument) {
      try {
        // Try to send a cleanup message
        await new Promise((resolve) => {
          sendMessageSafely({
            target: 'offscreen',
            action: 'cleanup'
          }, () => {
            // Resolve regardless of response to prevent hanging
            resolve();
          });
          
          // Set a timeout in case the message doesn't get through
          setTimeout(resolve, 300);
        });
      } catch (e) {
        console.log('Error sending cleanup message:', e);
        // Continue with document closing
      }
    }
    
    // Now try to close the document with a retry mechanism
    let closed = false;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (!closed && attempts < maxAttempts) {
      try {
        await chrome.offscreen.closeDocument();
        console.log('Successfully closed offscreen document');
        closed = true;
        
        // Reset document state
        ttsState.offscreenDocumentReady = false;
      } catch (e) {
        attempts++;
        console.log(`Error closing document (attempt ${attempts}/${maxAttempts}):`, e);
        
        // Wait before retrying
        if (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 300));
        }
      }
    }
    
    // Wait a moment after closing to ensure Chrome has time to fully clean up
    await new Promise(r => setTimeout(r, 500));
  } catch (e) {
    console.log('Error in safeCloseDocument:', e);
    // Continue anyway - we've done our best to clean up
  } finally {
    // Ensure state is updated even if there was an error
    ttsState.offscreenDocumentReady = false;
  }
}

// Wait for the offscreen document to report ready
function waitForOffscreenReady(timeout = 5000) {
  return new Promise((resolve) => {
    // If already ready, resolve immediately
    if (ttsState.offscreenDocumentReady) {
      resolve(true);
      return;
    }
    
    // Set up a timeout
    const timer = setTimeout(() => {
      console.log('Timed out waiting for offscreen document ready');
      chrome.runtime.onMessage.removeListener(readyListener);
      resolve(false); // Resolve with false to indicate timeout
    }, timeout);
    
    // Set up a listener for the ready message
    const readyListener = (message) => {
      if (message.target === 'background' && message.action === 'offscreenReady') {
        console.log('Received offscreen ready message');
        clearTimeout(timer);
        chrome.runtime.onMessage.removeListener(readyListener);
        ttsState.offscreenDocumentReady = true;
        resolve(true);
      }
    };
    
    chrome.runtime.onMessage.addListener(readyListener);
  });
}

// Recreate the offscreen document (for recovery)
async function recreateOffscreenDocument() {
  try {
    // If creation is already in progress, wait for it to complete
    if (ttsState.documentCreationInProgress) {
      console.log('Document creation already in progress, waiting...');
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (!ttsState.documentCreationInProgress) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
      return true;
    }
    
    // Set flag to indicate recreation is in progress
    ttsState.documentCreationInProgress = true;
    ttsState.offscreenDocumentReady = false;
    
    // Make sure the offscreen API is available
    if (!chrome.offscreen) {
      throw new Error('Offscreen API not available in this browser version');
    }
    
    // First try to close the existing document
    await safeCloseDocument();
    
    // Try to create a new document
    console.log('Creating new offscreen document');
    
    // Use retry logic for recreation
    let attempts = 0;
    const maxAttempts = 3;
    let success = false;
    
    while (!success && attempts < maxAttempts) {
      try {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html', 
          reasons: ['AUDIO_PLAYBACK'],
          justification: 'Playing TTS audio in the background'
        });
        
        // Wait for ready signal
        const isReady = await waitForOffscreenReady(8000);
        if (isReady) {
          success = true;
          break;
        }
      } catch (error) {
        attempts++;
        console.log(`Error in recreation attempt ${attempts}:`, error);
        
        // If we get a "single document" error, try closing again with longer delay
        if (error.message && error.message.includes("only a single")) {
          console.log("Single document error while recreating, retrying after longer delay");
          await safeCloseDocument();
          await new Promise(r => setTimeout(r, 1000 * attempts)); // Increasing delay
        }
      }
      
      // Wait before retrying
      if (!success && attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 500 * attempts)); // Increasing backoff
      }
    }
    
    if (!success) {
      throw new Error(`Failed to recreate offscreen document after ${maxAttempts} attempts`);
    }
    
    return true;
  } catch (error) {
    console.error('Error recreating offscreen document:', error);
    ttsState.lastError = getUserFriendlyErrorMessage(error.message);
    ttsState.documentCreationInProgress = false;
    broadcastStatus();
    
    // Fallback for older browsers
    if (error.message.includes('not available')) {
      ttsState.lastError = 'This feature requires Chrome 116 or newer. Please update your browser.';
      broadcastStatus();
    }
    
    return false;
  } finally {
    // Always ensure we reset this flag
    ttsState.documentCreationInProgress = false;
  }
}

// Check if offscreen document exists
async function hasOffscreenDocument() {
  try {
    // Check if offscreen API is fully available
    if (!chrome.offscreen || typeof chrome.offscreen.getContexts !== 'function') {
      console.log('Offscreen API not fully available, assuming no document exists');
      return false;
    }
    
    try {
      const existingContexts = await chrome.offscreen.getContexts();
      return existingContexts && existingContexts.length > 0;
    } catch (e) {
      // If getContexts throws an error, handle it gracefully
      console.log('Error in getContexts, assuming no document exists:', e);
      return false;
    }
  } catch (error) {
    console.error('Error checking for offscreen document:', error);
    // If there's an error, assume we need to create a new document
    return false;
  }
}

// Broadcast status to the popup with error handling
function broadcastStatus() {
  sendMessageSafely({
    action: 'statusUpdate',
    isPlaying: ttsState.isPlaying,
    currentChunk: ttsState.currentChunk,
    totalChunks: ttsState.totalChunks,
    lastError: ttsState.lastError,
    isProcessing: ttsState.isProcessing,
    processingMessage: ttsState.processingMessage
  });
}

// Count words in text
function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

// Function to check server connection
async function checkServerConnection() {
  try {
    const settings = await new Promise(resolve => {
      chrome.storage.local.get({
        apiUrl: 'http://localhost:8880',
        apiKey: 'not-needed'
      }, resolve);
    });
    
    // Reset the error state
    ttsState.lastError = '';
    
    // Check if server is available by making a simple request to the voices endpoint
    try {
      const response = await fetch(`${settings.apiUrl}/audio/voices`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${settings.apiKey}`
        }
      });
      
      if (response.ok) {
        ttsState.serverConnected = true;
        return { connected: true, message: "Successfully connected to Kokoro TTS server" };
      } else {
        ttsState.serverConnected = false;
        const errorMsg = `Server connection failed with status code: ${response.status}`;
        ttsState.lastError = errorMsg;
        return { connected: false, message: errorMsg };
      }
    } catch (error) {
      ttsState.serverConnected = false;
      const errorMsg = `Cannot connect to server: ${getUserFriendlyErrorMessage(error.message)}`;
      ttsState.lastError = errorMsg;
      return { connected: false, message: errorMsg };
    }
  } catch (error) {
    console.error("Error in checkServerConnection:", error);
    return { 
      connected: false, 
      message: "Failed to check server connection. Please try again." 
    };
  }
}