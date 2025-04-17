document.addEventListener('DOMContentLoaded', function() {
  // Check server connection when popup opens
  testServerConnection();
  
  // Get the last selected text when popup opens
  loadSelectedText();
  
  // Get current playback status
  updatePlaybackStatus();
  
  // Initialize word counter
  const textArea = document.getElementById('selected-text');
  const wordCounter = document.getElementById('word-counter');
  const performanceTips = document.getElementById('performance-tips');
  const processingIndicator = document.getElementById('processing-indicator');
  
  // Listen for input in the text area to update word count
  textArea.addEventListener('input', function() {
    updateWordCount(this.value);
  });
  
  // Play button
  document.getElementById('play-btn').addEventListener('click', function() {
    const text = textArea.value.trim();
    
    if (text) {
      // Show processing indicator
      showProcessingIndicator('Connecting to TTS server...');
      
      // Send text to background script for playback
      chrome.runtime.sendMessage({ action: 'readText', text: text }, function(response) {
        // Update UI based on response
        if (response && response.success) {
          // Keep processing indicator visible until we get status update
          showProcessingIndicator('Processing text into speech...');
        } else {
          // Hide processing indicator if failed
          hideProcessingIndicator();
        }
      });
    } else {
      showError("No text to read. Please select text on a webpage first.");
    }
  });
  
  // Stop button
  document.getElementById('stop-btn').addEventListener('click', function() {
    // Send stop command to background script
    chrome.runtime.sendMessage({ action: 'stopPlayback' }, function(response) {
      // Status will be updated via message listener
      hideProcessingIndicator();
    });
  });

  // Tab navigation
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      button.classList.add('active');
      document.getElementById(tabName).classList.add('active');
    });
  });

  // Load saved settings
  chrome.storage.local.get({
    apiUrl: 'http://localhost:8880',
    apiKey: 'not-needed',
    voice: 'af_bella',
    chunkSize: '1000'
  }, function(items) {
    document.getElementById('api-url').value = items.apiUrl;
    document.getElementById('api-key').value = items.apiKey;
    document.getElementById('voice').value = items.voice;
    document.getElementById('chunk-size').value = items.chunkSize;
  });

  // Save settings
  document.getElementById('save-settings').addEventListener('click', function() {
    const apiUrl = document.getElementById('api-url').value.trim();
    const apiKey = document.getElementById('api-key').value.trim();
    const voice = document.getElementById('voice').value.trim();
    const chunkSize = document.getElementById('chunk-size').value;
    
    chrome.storage.local.set({
      apiUrl: apiUrl,
      apiKey: apiKey,
      voice: voice,
      chunkSize: chunkSize
    }, function() {
      const successElement = document.getElementById('save-success');
      successElement.style.display = 'block';
      setTimeout(() => {
        successElement.style.display = 'none';
      }, 2000);
      
      // Test connection with new settings
      testServerConnection();
    });
  });
  
  // Test connection button
  document.getElementById('test-connection').addEventListener('click', function() {
    testServerConnection();
  });

  // Check if we have any saved text
  chrome.runtime.sendMessage({ action: 'getStatus' }, function(response) {
    if (response && response.lastSelectedText) {
      document.getElementById('selected-text').value = response.lastSelectedText;
      updateWordCount(response.lastSelectedText);
    }
    
    if (response && response.lastError) {
      showError(response.lastError);
    }
    
    // Update playback controls based on current status
    if (response) {
      updatePlaybackControls(response.isPlaying, response.currentChunk, response.totalChunks, response.isProcessing);
    }
  });

  // Listen for status updates from background script
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === 'statusUpdate') {
      // Hide processing indicator when we get a status update with isPlaying=true or explicit isProcessing=false
      if (message.isPlaying || message.isProcessing === false) {
        hideProcessingIndicator();
      } else if (message.isProcessing) {
        showProcessingIndicator(message.processingMessage || 'Processing...');
      }
      
      // Update playback controls based on status update
      updatePlaybackControls(message.isPlaying, message.currentChunk, message.totalChunks, message.isProcessing);
      
      // Show error if there is one
      if (message.lastError) {
        showError(message.lastError);
        hideProcessingIndicator();
      }
    } else if (message.action === 'connectionError') {
      // Show server connection error
      showError(`Connection error: ${message.message}`);
      hideProcessingIndicator();
      
      const serverStatus = document.getElementById('server-status');
      if (serverStatus) {
        serverStatus.textContent = `Connection failed: ${message.message}`;
        serverStatus.style.color = '#ea4335';
        serverStatus.style.borderLeftColor = '#ea4335';
      }
    } else if (message.action === 'processingUpdate') {
      // Show processing update
      showProcessingIndicator(message.message || 'Processing...');
    }
    return true;
  });
  
  // Function to show processing indicator
  function showProcessingIndicator(message) {
    processingIndicator.style.display = 'flex';
    document.getElementById('processing-text').textContent = message;
    
    // Also update player status to show processing
    const playerStatus = document.getElementById('player-status');
    const statusText = playerStatus.querySelector('.status-text');
    const statusBadge = playerStatus.querySelector('.status-badge');
    
    playerStatus.className = 'player-status processing';
    statusBadge.className = 'status-badge processing';
    statusText.textContent = 'Processing request';
    statusBadge.textContent = 'Processing';
  }
  
  // Function to hide processing indicator
  function hideProcessingIndicator() {
    processingIndicator.style.display = 'none';
  }
  
  // Function to update word count
  function updateWordCount(text) {
    if (!text) text = '';
    
    // Count words (split by whitespace)
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    const wordCount = words.length;
    
    // Count characters
    const charCount = text.length;
    
    // Update the counter display
    const counterElement = wordCounter.querySelector('span:first-child');
    counterElement.textContent = `${wordCount} words (${charCount} characters)`;
    
    // Apply styling based on word count
    wordCounter.className = 'word-counter';
    performanceTips.style.display = 'none';
    
    if (wordCount > 1000 && wordCount <= 2000) {
      // Warning level
      wordCounter.classList.add('warning');
    } else if (wordCount > 2000) {
      // Danger level
      wordCounter.classList.add('danger');
      performanceTips.style.display = 'block';
    }
    
    return wordCount;
  }
  
  // Function to update playback controls
  function updatePlaybackControls(isPlaying, currentChunk, totalChunks, isProcessing) {
    const playBtn = document.getElementById('play-btn');
    const stopBtn = document.getElementById('stop-btn');
    const statusMessage = document.getElementById('status-message');
    const playerStatus = document.getElementById('player-status');
    const statusText = playerStatus.querySelector('.status-text');
    const statusBadge = playerStatus.querySelector('.status-badge');
    const progressBar = document.getElementById('progress-bar');
    
    // Hide processing indicator if we're playing or explicitly not processing
    if (isPlaying || isProcessing === false) {
      hideProcessingIndicator();
    }
    
    // Update buttons
    playBtn.disabled = isPlaying || isProcessing;
    stopBtn.disabled = (!isPlaying && !isProcessing);
    
    // Update player status
    playerStatus.className = 'player-status';
    statusBadge.className = 'status-badge';
    
    if (isProcessing) {
      // Processing
      playerStatus.classList.add('processing');
      statusBadge.classList.add('processing');
      statusText.textContent = 'Processing request';
      statusBadge.textContent = 'Processing';
      progressBar.style.width = '0%';
      
      // Update status message
      statusMessage.textContent = 'Processing your text-to-speech request...';
    } else if (isPlaying) {
      // Playing
      playerStatus.classList.add('playing');
      statusBadge.classList.add('playing');
      statusText.textContent = `Playing (${currentChunk + 1}/${totalChunks})`;
      statusBadge.textContent = 'Playing';
      
      // Update progress - we don't know exact progress within chunk, so estimate
      if (totalChunks > 0) {
        const progress = Math.floor(((currentChunk + 0.5) / totalChunks) * 100);
        progressBar.style.width = `${progress}%`;
      }
      
      // Update status message
      statusMessage.textContent = `Text is being read aloud in the background.`;
    } else {
      // Stopped
      playerStatus.classList.add('stopped');
      statusBadge.classList.add('stopped');
      statusText.textContent = 'No active playback';
      statusBadge.textContent = 'Stopped';
      progressBar.style.width = '0%';
      
      // Update status message
      statusMessage.textContent = 'Select text on a webpage and click "Play" to read it aloud.';
    }
  }
  
  // Function to update playback status
  function updatePlaybackStatus() {
    chrome.runtime.sendMessage({ action: 'getStatus' }, function(response) {
      if (response) {
        updatePlaybackControls(response.isPlaying, response.currentChunk, response.totalChunks, response.isProcessing);
      }
    });
  }
  
  // Function to show error message
  function showError(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    
    // Hide error after 5 seconds
    setTimeout(() => {
      errorDiv.style.display = 'none';
    }, 5000);
  }
  
  // Function to load the last selected text
  function loadSelectedText() {
    chrome.runtime.sendMessage({ action: 'getLastSelectedText' }, function(response) {
      if (response && response.text) {
        document.getElementById('selected-text').value = response.text;
        updateWordCount(response.text);
      }
    });
    
    // Also try to get the current selection from active tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getSelectedText' }, function(response) {
          if (chrome.runtime.lastError) {
            // Content script might not be loaded on this page, ignore error
            return;
          }
          if (response && response.text) {
            document.getElementById('selected-text').value = response.text;
            updateWordCount(response.text);
          }
        });
      }
    });
  }
  
  // Function to test server connection
  function testServerConnection() {
    const serverStatus = document.getElementById('server-status');
    serverStatus.textContent = 'Checking server connection...';
    serverStatus.style.color = '#666';
    serverStatus.style.borderLeftColor = '#ccc';
    
    chrome.runtime.sendMessage({ action: 'checkServer' }, function(response) {
      if (response && response.connected) {
        serverStatus.textContent = 'Server connection: Success \u2713';
        serverStatus.style.color = '#34a853';
        serverStatus.style.borderLeftColor = '#34a853';
      } else {
        serverStatus.textContent = `Server connection failed: ${response ? response.message : 'Unknown error'}`;
        serverStatus.style.color = '#ea4335';
        serverStatus.style.borderLeftColor = '#ea4335';
      }
    });
  }
});