# Kokoro TTS Reader - Chrome Extension

A Chrome extension for text-to-speech using the Kokoro TTS API, allowing you to listen to selected text from any webpage with background audio playback.

![Kokoro TTS Reader](koko-tts.png)

## 🔥 Important Notice

**This extension is designed for local network use only:**
- Requires a Kokoro TTS server running on your localhost or local network
- Not intended for use with remote/public TTS servers
- No data is sent to external services beyond your local Kokoro server

**Server Performance Requirements:**
- **GPU-accelerated server** is strongly recommended for smooth performance
- CPU-only servers will experience significant delays with longer texts
- Lower-powered servers may struggle with texts over 500 words

## Overview

Kokoro TTS Reader is a Chrome extension that converts selected text from any webpage into speech using the Kokoro TTS API. Unlike typical TTS extensions, this one uses Chrome's Offscreen API to play audio in the background - meaning you can close the popup and continue browsing while listening.

## Features

- **Background Audio Playback**: Continue browsing while listening to text
- **Context Menu Integration**: Right-click on any selected text to start reading
- **Word Counter**: Shows word count with recommendations for optimal performance
- **Progress Tracking**: Visual progress bar shows reading progress
- **Server Connection Testing**: Verify your Kokoro TTS server connection
- **Voice Customization**: Configure voice settings
- **Simple Controls**: Just Play and Stop - no complex controls

## How It Works

This extension uses Chrome's Offscreen Document API (introduced in Chrome 116) to play audio in the background without requiring a visible tab:

1. When you select text and press "Play" (or use the context menu), the extension:
   - Creates an invisible offscreen document
   - Analyzes and splits the text into manageable chunks
   - Sends chunks to the Kokoro TTS server
   - Plays the audio in the background

2. The extension includes a robust architecture:
   - **Background Script**: Manages the extension lifecycle and coordinates between UI and audio
   - **Offscreen Document**: Handles audio processing and playback in the background
   - **Content Script**: Captures selected text from webpages
   - **Popup UI**: Provides controls and displays status

## Requirements

- Chrome browser (version 116+) - required for offscreen document API
- Kokoro TTS server running on your localhost or local network
- Server hardware recommendations:
  - **Minimum**: Dual-core CPU, 4GB RAM
  - **Recommended**: Quad-core CPU, 8GB RAM, NVIDIA GPU (at least 4GB VRAM)
  - **Optimal**: 8-core CPU, 16GB RAM, NVIDIA GPU with 8GB+ VRAM

## Installation

### From Source (Developer Mode)
1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the directory containing this extension
5. The extension icon should appear in your Chrome toolbar

## Usage

### Method 1: Context Menu
1. Select text on any webpage
2. Right-click the selected text
3. Choose "Read with Kokoro TTS" from the context menu
4. Text will be read aloud in the background

### Method 2: Popup Interface
1. Select text on any webpage
2. Click the Kokoro TTS Reader icon in your toolbar
3. The selected text will appear in the popup
4. Click "Play" to start reading
5. Click "Stop" to stop playback at any time

## Configuration

1. Click the extension icon to open the popup
2. Go to the "Settings" tab
3. Configure the following settings:
   - API URL: The URL of your Kokoro TTS server (default: http://localhost:8880)
   - API Key: Your API key if required (default: not-needed)
   - Voice: The voice ID to use (default: af_bella)
   - Chunk Size: The size of text chunks to process (options: 500, 1000, or 1500 characters)
4. Click "Save Settings" to apply your changes
5. Use "Test Connection" to verify the server connection

## Performance Guidelines

### Server Capability
| Server Type | Max Recommended Text Length | Expected Performance |
|-------------|----------------------------|---------------------|
| CPU-only (laptop) | 300 words | Slow, high latency |
| CPU-only (desktop) | 500 words | Moderate latency |
| GPU-accelerated (consumer) | 2000 words | Good performance |
| GPU-accelerated (high-end) | 5000+ words | Excellent performance |

### Chunk Size Settings
- **200 characters**: Use for CPU-only laptops
- **500 characters**: Use for low-end systems or CPU-only servers
- **1000 characters**: Balanced option for most setups (default)
- **1500 characters**: Best for powerful systems with GPU acceleration

### Best Practices
- For optimal performance, keep text selections under the recommended limits for your hardware
- Consider splitting very long texts into smaller sections
- Close other resource-intensive applications when using CPU-only servers
- Expect higher latency for the first chunk as the TTS model loads

## Troubleshooting

### Audio Issues
- If audio stops unexpectedly, click stop and try playing again
- Make sure your Kokoro TTS server is running and accessible
- Check the server URL in settings

### Connection Issues
- Verify the server URL and API key in settings
- Use the "Test Connection" button to check connectivity
- Ensure your Kokoro TTS server is running and accessible

### Browser Compatibility
- The extension requires Chrome 116 or newer due to use of the Offscreen Document API
- If you receive a browser compatibility message, update your Chrome to the latest version

### Server Performance Issues
- If playback is extremely slow, reduce your chunk size setting
- Consider upgrading your server hardware or using GPU acceleration
- For CPU-only servers, reduce the length of text being processed

## Known Limitations

- Maximum recommended text length varies based on server capability (see Performance Guidelines)
- Only one audio playback instance can be active at a time
- Some websites with strict Content Security Policy may block content script
- Performance heavily depends on your local Kokoro TTS server's capabilities

## Setting Up a Kokoro TTS Server

This extension requires a working Kokoro TTS server. For information on setting up your own Kokoro TTS server, please refer to the [Kokoro TTS GitHub repository](https://github.com/kokoro).

Basic server setup steps:
1. Install the required dependencies for Kokoro TTS
2. Download the Kokoro TTS model files
3. Start the Kokoro TTS server on your local machine or network
4. Configure the extension to point to your server URL

## Technical Details

This extension uses:
- Chrome's Offscreen Document API for background audio playback
- Web Audio API for audio processing and playback
- JavaScript for core functionality
- Fetch API for server communication
- HTML/CSS for the user interface

## Credits

- Extension developed by [Your Name]
- Significant improvements and code enhancements by [Claude AI](https://claude.ai)
- Kokoro TTS model and server by [remsky](https://github.com/remsky)

## License

[MIT License](LICENSE)

---

*This extension is not affiliated with Kokoro TTS. It is designed to work with any Kokoro TTS server running on your local machine or network.*