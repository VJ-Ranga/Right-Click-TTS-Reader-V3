// Store the last selected text
let lastSelectedText = '';

// Update the selected text whenever the user selects something
document.addEventListener('mouseup', function() {
  try {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText && selectedText !== lastSelectedText) {
      lastSelectedText = selectedText;

      // Send the selected text to the background script to store
      // Use a try-catch to handle potential extension context invalidation
      try {
        chrome.runtime.sendMessage({ 
          action: 'updateSelectedText', 
          text: selectedText 
        }, function(response) {
          // Check for runtime error
          if (chrome.runtime.lastError) {
            // Silently handle error - this is expected sometimes
            console.log("Message sending error (handled):", chrome.runtime.lastError.message);
            return;
          }
          // Handle response if needed
        });
      } catch (e) {
        // Silently handle error if extension context is invalidated
        // This is not a critical operation, so we can just log it and continue
        console.log("Failed to send message:", e);
      }
    }
  } catch (e) {
    // Catch any other errors that might occur
    console.log("Error in mouseup handler:", e);
  }
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  try {
    if (message.action === 'getSelectedText') {
      const selectedText = window.getSelection().toString().trim() || lastSelectedText;
      sendResponse({ text: selectedText });
    }
  } catch (e) {
    // Handle errors and always send a response if possible
    console.log("Error handling message:", e);
    sendResponse({ text: '', error: e.message });
  }
  return true;  // Keep the messaging channel open
});