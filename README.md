# Ollama Chatbot

A simple, beautiful chatbot interface built with JavaScript and the Ollama JavaScript library. Supports both **Local Ollama** and **Ollama Cloud**!

## Features

- 🤖 Interactive chatbot interface
- 💬 Real-time streaming responses
- 🎨 Modern, responsive UI
- 🔄 Model selection and refresh
- 📱 Mobile-friendly design
- 💾 Conversation history
- 🔀 Switch between Local and Cloud modes
- ☁️ Ollama Cloud support (no local installation required)
- 💻 Local Ollama support (use your own models)

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the root directory:
   ```bash
   cp .env.example .env
   ```

## Configuration

### Local Mode (Default)

To use local Ollama, you can either:
- Leave `OLLAMA_HOST` unset (defaults to `http://127.0.0.1:11434`)
- Or explicitly set it:
  ```
  OLLAMA_HOST=http://127.0.0.1:11434
  ```

**No API key needed for local mode!**

Make sure Ollama is installed and running locally:
- Download from [ollama.com](https://ollama.com)
- Install at least one model: `ollama pull llama3.2`

### Cloud Mode

To use Ollama Cloud, set these in your `.env` file:
```
OLLAMA_HOST=https://ollama.com
OLLAMA_API_KEY=your_api_key_here
```

**Prerequisites for Cloud Mode:**
1. Sign up for a free account at [ollama.com](https://ollama.com)
2. Get your API key from [ollama.com/settings/keys](https://ollama.com/settings/keys)

## Running the Application

1. **For Local Mode**: Make sure Ollama is running locally, then start the server:
   ```bash
   npm start
   ```

2. **For Cloud Mode**: Make sure your `.env` file has `OLLAMA_HOST` and `OLLAMA_API_KEY` set, then:
   ```bash
   npm start
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

The server will automatically detect which mode to use based on your `.env` configuration!

## Usage

1. **Local Mode**: The app will automatically load and display all models from your local Ollama installation. The first available model will be selected by default.
2. **Cloud Mode**: The app will use `gpt-oss:120b-cloud` as the default model. You can select other cloud models from the dropdown.
3. Select a model from the dropdown (or click the refresh button to reload available models)
4. Type your message in the input field
5. Press Enter or click Send to send your message
6. The AI response will stream in real-time

## Project Structure

```
JS-ollama/
├── server.js          # Express server with Ollama Cloud integration
├── package.json       # Project dependencies
├── .env               # Environment variables (API key) - create from .env.example
├── .env.example       # Example environment file
├── public/
│   ├── index.html     # Main HTML interface
│   ├── styles.css     # Styling
│   └── app.js         # Frontend JavaScript
└── README.md          # This file
```

## API Endpoints

- `GET /api/config` - Get server configuration (mode, host, default model)
- `GET /api/models` - Get list of available Ollama models
- `POST /api/chat` - Send a message and get streaming response
  - Requires: `message` (string), `model` (string), optional `conversationHistory` (array)

## Customization

- **Default Models**:
  - **Local Mode**: Automatically loads the first available model from your local Ollama installation. No hardcoded default - it uses whatever models you have installed.
  - **Cloud Mode**: Always defaults to `gpt-oss:120b-cloud`. You can change this in `server.js` (line 126) if needed.
- **Change the port**: Set the `PORT` environment variable in your `.env` file (default: 3000)
- **Switch between modes**: Simply update `OLLAMA_HOST` in your `.env` file and restart the server:
  - Local: `OLLAMA_HOST=http://127.0.0.1:11434` (or leave unset)
  - Cloud: `OLLAMA_HOST=https://ollama.com` (requires `OLLAMA_API_KEY`)

## Troubleshooting

### Local Mode Issues
- **"Failed to load models. Make sure Ollama is running locally."**: 
  - Make sure Ollama is installed and running locally on `http://127.0.0.1:11434`
  - Check that the Ollama service is running: `ollama serve`
  - Verify you can access Ollama: `curl http://127.0.0.1:11434/api/tags`
- **"No models found"**: 
  - Install at least one model: `ollama pull llama3.2` (or any other model)
  - The app will automatically select the first available model from your installation
- **Connection errors**: 
  - Ensure Ollama is running: `ollama serve`
  - Check if Ollama is listening on the correct port (default: 11434)
  - Verify your firewall isn't blocking the connection

### Cloud Mode Issues
- **"OLLAMA_API_KEY not set" or "API key missing or invalid"**: 
  - Make sure you've created a `.env` file with your API key
  - Verify the API key is not a placeholder (like `OLLAMA_API_KEY=OLLAMA_API_KEY`)
  - Get a valid API key from [ollama.com/settings/keys](https://ollama.com/settings/keys)
- **"Failed to load models"**: 
  - Check that your API key is valid and you have access to Ollama Cloud
  - Verify `OLLAMA_HOST=https://ollama.com` is set correctly
- **"401 Unauthorized" errors**: 
  - Your API key may be invalid or expired
  - Make sure there are no extra spaces or quotes around the API key in `.env`
  - Regenerate your API key if needed
- **Connection errors**: 
  - Verify your internet connection
  - Check that Ollama Cloud is accessible: `curl https://ollama.com`
  - Ensure your firewall/proxy allows HTTPS connections

### General
- **Check server logs**: The server console will show which mode is active, the configured host, and any connection issues. Look for messages like:
  - `💻 Mode: Local Ollama` or `☁️ Mode: Ollama Cloud`
  - `📍 Ollama Host: http://127.0.0.1:11434` or `📍 Ollama Host: https://ollama.com`
- **Verify .env file**: 
  - Make sure your `.env` file is in the root directory (same level as `package.json`)
  - Ensure it's properly formatted (no spaces around `=`, no quotes unless needed)
  - Example format: `OLLAMA_HOST=https://ollama.com` (not `OLLAMA_HOST = "https://ollama.com"`)
- **Model selection**: 
  - In Local Mode: The app automatically loads all your installed models and selects the first one
  - In Cloud Mode: The app defaults to `gpt-oss:120b-cloud` but you can select other available cloud models
- **Browser console**: Open browser DevTools (F12) to see detailed error messages and debug information

## License

MIT
