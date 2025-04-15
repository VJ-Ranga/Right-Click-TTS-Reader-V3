// TTS Player state for offscreen document
const playerState = {
  text: '',
  chunks: [],
  currentChunk: 0,
  totalChunks: 0,
  isPlaying: false,
  currentAudio: null,
  audioCache: {},     // Cache for preloaded audio
  preloadingChunk: -1, // Currently preloading chunk index
  keepAliveInterval: null, // Keep alive timer
  audioContext: null,  // Web Audio API context
  audioSource: null,   // Audio source node
  settings: {
    apiUrl: 'http://localhost:8880',
    apiKey: 'not-needed',
    voice: 'af_bella',
    chunkSize: 1000,  // Default to 1000 characters
    preloadThreshold: 0.3  // Start loading next chunk when current is 30% complete
  }
};

// Initialize Web Audio API context
function initAudioContext() {
  if (!playerState.audioContext) {
    try {
      playerState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log('Audio context initialized');
    } catch (e) {
      console.error('Failed to create audio context:', e);
    }
  }
}

// Keep the offscreen document alive
function startKeepAlive() {
  // Clear any existing interval
  if (playerState.keepAliveInterval) {
    clearInterval(playerState.keepAliveInterval);
  }
  
  // Set up a new interval
  playerState.keepAliveInterval = setInterval(() => {
    if (playerState.isPlaying) {
      console.log('Keep alive ping - currently playing chunk', playerState.currentChunk + 1, 'of', playerState.totalChunks);
      
      // Send a keep alive message to the background script
      chrome.runtime.sendMessage({
        target: 'background',
        action: 'keepAlive',
        isPlaying: playerState.isPlaying,
        currentChunk: playerState.currentChunk,
        totalChunks: playerState.totalChunks
      });
    }
  }, 5000); // Ping every 5 seconds
}

// Stop the keep alive interval
function stopKeepAlive() {
  if (playerState.keepAliveInterval) {
    clearInterval(playerState.keepAliveInterval);
    playerState.keepAliveInterval = null;
  }
}

// Send processing update to background
function sendProcessingUpdate(message) {
  chrome.runtime.sendMessage({
    target: 'background',
    action: 'processingUpdate',
    message: message
  });
}

// Initialize the offscreen document
document.addEventListener('DOMContentLoaded', function() {
  console.log('Offscreen document loaded');
  
  // Initialize Web Audio API
  initAudioContext();
  
  // Start the keep alive mechanism
  startKeepAlive();
  
  // Notify the background script that the offscreen document is ready
  chrome.runtime.sendMessage({
    target: 'background',
    action: 'offscreenReady'
  });
  
  // Listen for messages from the background script
  chrome.runtime.onMessage.addListener(handleMessages);
  
  // Add a visibility change listener to ensure we keep playing when the page is hidden
  document.addEventListener('visibilitychange', function() {
    console.log('Visibility changed:', document.visibilityState);
    if (document.visibilityState === 'hidden' && playerState.isPlaying) {
      // Make sure we keep playing in the background
      updateBackgroundStatus();
    }
  });
  
  // Add a before unload listener
  window.addEventListener('beforeunload', function(event) {
    if (playerState.isPlaying) {
      // Try to prevent unloading while playing
      console.log('Attempting to prevent unload while playing');
      
      // Send a final status update
      updateBackgroundStatus();
    }
  });
});

// Message handler for offscreen document
function handleMessages(message, sender, sendResponse) {
  // Only handle messages targeting the offscreen document
  if (message.target !== 'offscreen') {
    return false;
  }
  
  console.log('Offscreen received message:', message.action);
  
  switch (message.action) {
    case 'processText':
      // Update text and settings
      if (message.text) {
        playerState.text = message.text;
        
        // Update settings if provided
        if (message.settings) {
          playerState.settings = { ...playerState.settings, ...message.settings };
        }
        
        // Send processing update
        sendProcessingUpdate('Analyzing text and splitting into chunks...');
        
        // Process the text and start playback
        processText();
        startPlayback();
      }
      break;
      
    case 'stopPlayback':
      stopPlayback();
      break;
      
    case 'heartbeat':
      // Respond to heartbeat to let background know we're still alive
      sendResponse({ 
        alive: true,
        isPlaying: playerState.isPlaying,
        currentChunk: playerState.currentChunk,
        totalChunks: playerState.totalChunks
      });
      break;
  }
  
  sendResponse({ success: true });
  return true; // Keep messaging channel open
}

// Process text into chunks
function processText() {
  if (!playerState.text) {
    showError('No text provided');
    return;
  }
  
  try {
    // Send processing update
    sendProcessingUpdate('Splitting text into manageable chunks...');
    
    playerState.chunks = splitTextIntoChunks(playerState.text, playerState.settings.chunkSize);
    playerState.totalChunks = playerState.chunks.length;
    playerState.currentChunk = 0;
    
    if (playerState.chunks.length === 0) {
      showError('Failed to process text into chunks');
      return;
    }
    
    const wordCount = countWords(playerState.text);
    console.log(`Text split into ${playerState.chunks.length} chunks (${wordCount} words total)`);
    
    // Send processing update with chunk info
    sendProcessingUpdate(`Preparing to process ${playerState.chunks.length} audio chunks...`);
  } catch (error) {
    showError(`Error processing text: ${error.message}`);
  }
}

// Count words in text
function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

// Split text into chunks
function splitTextIntoChunks(text, chunkSize) {
  const sentences = text.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) || [];
  const chunks = [];
  let currentChunk = '';
  
  for (let sentence of sentences) {
    // Clean the sentence
    sentence = sentence.trim();
    if (!sentence) continue;
    
    // If adding this sentence exceeds the chunk size and we already have content,
    // start a new chunk unless the sentence is too long on its own
    if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
    
    // If current chunk is already over size limit, break it up
    if (currentChunk.length > chunkSize * 1.5) {
      // Try to break at word boundaries
      const words = currentChunk.split(/\s+/);
      let tempChunk = '';
      
      for (let word of words) {
        if (tempChunk.length + word.length + 1 > chunkSize && tempChunk.length > 0) {
          chunks.push(tempChunk.trim());
          tempChunk = word + ' ';
        } else {
          tempChunk += word + ' ';
        }
      }
      
      if (tempChunk.trim().length > 0) {
        currentChunk = tempChunk;
      } else {
        currentChunk = '';
      }
    }
  }
  
  // Add any remaining text as the final chunk
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

// Start playback
function startPlayback() {
  if (playerState.isPlaying) return;
  
  if (playerState.chunks.length === 0) {
    processText();
    if (playerState.chunks.length === 0) {
      showError('No text to play');
      return;
    }
  }
  
  // Send processing update
  sendProcessingUpdate(`Preparing to generate audio for the first chunk...`);
  
  playerState.isPlaying = true;
  
  // Ensure we have a fresh audio context
  initAudioContext();
  
  // Ensure the keep alive mechanism is running
  startKeepAlive();
  
  // Start with the current chunk (or restart)
  processChunk(playerState.currentChunk);
  
  // Update background status
  updateBackgroundStatus();
}

// Process a chunk of text
function processChunk(index) {
  if (index >= playerState.chunks.length || !playerState.isPlaying) {
    return;
  }
  
  playerState.currentChunk = index;
  const chunk = playerState.chunks[index];
  
  // Update background status
  updateBackgroundStatus();
  
  // Check if we already have this chunk cached
  if (playerState.audioCache[index]) {
    console.log(`Using cached audio for chunk ${index + 1}`);
    playAudioFromCache(index);
    return;
  }
  
  // Send processing update
  sendProcessingUpdate(`Generating audio for chunk ${index + 1} of ${playerState.totalChunks}...`);
  
  // Construct API request URL
  const apiUrl = `${playerState.settings.apiUrl}/audio/speech`;
  
  // Create request body
  const requestBody = {
    model: 'kokoro',
    voice: playerState.settings.voice,
    input: chunk,
    response_format: 'mp3'
  };
  
  console.log(`Requesting audio for chunk ${index + 1}/${playerState.totalChunks}`);
  
  // Make API request
  fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${playerState.settings.apiKey}`
    },
    body: JSON.stringify(requestBody)
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    return response.arrayBuffer();
  })
  .then(buffer => {
    if (buffer.byteLength === 0) {
      throw new Error("Received empty audio data from server");
    }
    
    console.log(`Received audio data for chunk ${index + 1}, size: ${buffer.byteLength} bytes`);
    
    // Send processing update
    sendProcessingUpdate(`Processing audio for chunk ${index + 1}...`);
    
    // Make a copy of the buffer to avoid detached buffer issues
    const bufferCopy = buffer.slice(0);
    
    // Cache the audio data
    playerState.audioCache[index] = bufferCopy;
    
    // Play the audio if we're still supposed to be playing this chunk
    if (playerState.isPlaying && playerState.currentChunk === index) {
      playAudioBuffer(bufferCopy, index);
    }
  })
  .catch(error => {
    showError(`Error fetching audio: ${error.message}`);
    
    // Try to continue with next chunk despite error
    if (index < playerState.totalChunks - 1) {
      setTimeout(() => {
        processChunk(index + 1);
      }, 1000);
    } else {
      playerState.isPlaying = false;
      stopKeepAlive();
      updateBackgroundStatus();
    }
  });
}

// Play audio from the buffer using Web Audio API
function playAudioBuffer(buffer, index) {
  try {
    // Make sure we have an audio context
    initAudioContext();
    
    // Make a copy of the buffer to avoid "detached ArrayBuffer" issues
    const bufferToUse = buffer.slice(0);
    
    // Decode the audio data
    playerState.audioContext.decodeAudioData(bufferToUse, (audioBuffer) => {
      if (!playerState.isPlaying || playerState.currentChunk !== index) {
        console.log('Playback state changed while decoding, skipping play');
        return;
      }
      
      // Create a new source node
      const source = playerState.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // Connect the source to the destination (speakers)
      source.connect(playerState.audioContext.destination);
      
      // Store the source for stop
      playerState.audioSource = source;
      
      // Add event listeners
      source.onended = function() {
        console.log(`Finished playing chunk ${index + 1}`);
        
        // Move to next chunk
        if (index < playerState.totalChunks - 1 && playerState.isPlaying) {
          // Send processing update if there are more chunks
          sendProcessingUpdate(`Preparing next audio chunk (${index + 2} of ${playerState.totalChunks})...`);
          
          // Preload next chunk if not already loaded
          if (index + 2 < playerState.totalChunks && !playerState.audioCache[index + 2]) {
            preloadNextChunk(index + 2);
          }
          
          // Process next chunk
          processChunk(index + 1);
        } else if (index >= playerState.totalChunks - 1) {
          // Last chunk finished
          console.log('Playback complete');
          playerState.isPlaying = false;
          playerState.audioSource = null;
          stopKeepAlive();
          updateBackgroundStatus();
        }
      };
      
      // Start the source
      source.start(0);
      console.log(`Started playing chunk ${index + 1}`);
      
      // Preload next chunk
      if (index + 1 < playerState.totalChunks && !playerState.audioCache[index + 1]) {
        preloadNextChunk(index + 1);
      }
      
      updateBackgroundStatus();
    }, (error) => {
      showError(`Error decoding audio: ${error}`);
      
      // Try next chunk
      if (index < playerState.totalChunks - 1) {
        processChunk(index + 1);
      } else {
        playerState.isPlaying = false;
        stopKeepAlive();
        updateBackgroundStatus();
      }
    });
  } catch (error) {
    showError(`Error playing audio: ${error.message}`);
    
    // Try next chunk
    if (index < playerState.totalChunks - 1) {
      processChunk(index + 1);
    } else {
      playerState.isPlaying = false;
      stopKeepAlive();
      updateBackgroundStatus();
    }
  }
}

// Play audio from cache
function playAudioFromCache(index) {
  const buffer = playerState.audioCache[index];
  if (buffer) {
    // Make a copy of the buffer to avoid detached buffer issues
    const bufferCopy = buffer.slice(0);
    playAudioBuffer(bufferCopy, index);
  } else {
    // If somehow the cache entry is invalid, fetch it again
    processChunk(index);
  }
}

// Preload the next chunk
function preloadNextChunk(index) {
  if (index >= playerState.chunks.length || playerState.audioCache[index] || playerState.preloadingChunk === index) {
    return;
  }
  
  playerState.preloadingChunk = index;
  console.log(`Preloading chunk ${index + 1}`);
  
  const chunk = playerState.chunks[index];
  
  // Construct API request URL
  const apiUrl = `${playerState.settings.apiUrl}/audio/speech`;
  
  // Create request body
  const requestBody = {
    model: 'kokoro',
    voice: playerState.settings.voice,
    input: chunk,
    response_format: 'mp3'
  };
  
  // Make API request
  fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${playerState.settings.apiKey}`
    },
    body: JSON.stringify(requestBody)
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    return response.arrayBuffer();
  })
  .then(buffer => {
    if (buffer.byteLength === 0) {
      throw new Error("Received empty audio data from server");
    }
    
    // Make a copy of the buffer to avoid detached buffer issues
    const bufferCopy = buffer.slice(0);
    
    // Cache the audio buffer
    playerState.audioCache[index] = bufferCopy;
    
    console.log(`Successfully preloaded chunk ${index + 1}`);
    playerState.preloadingChunk = -1;
  })
  .catch(error => {
    console.error(`Error preloading chunk ${index + 1}:`, error);
    playerState.preloadingChunk = -1;
  });
}

// Stop playback
function stopPlayback() {
  console.log('Stopping playback');
  
  // Stop any current audio
  if (playerState.audioSource) {
    try {
      playerState.audioSource.stop();
    } catch (e) {
      console.error('Error stopping audio source:', e);
    }
    playerState.audioSource = null;
  }
  
  playerState.isPlaying = false;
  
  // Clear audio cache to free memory
  playerState.audioCache = {};
  
  // Stop the keep alive interval
  stopKeepAlive();
  
  updateBackgroundStatus();
}

// Show error message by sending to background
function showError(message) {
  console.error(message);
  
  // Send error to background script
  chrome.runtime.sendMessage({
    target: 'background',
    action: 'error',
    message: message
  });
}

// Update background script with current status
function updateBackgroundStatus() {
  chrome.runtime.sendMessage({
    target: 'background',
    action: 'statusUpdate',
    isPlaying: playerState.isPlaying,
    currentChunk: playerState.currentChunk,
    totalChunks: playerState.totalChunks
  });
}