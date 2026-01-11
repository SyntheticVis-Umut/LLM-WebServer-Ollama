import express from 'express';
import { Ollama } from 'ollama';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Determine Ollama host and mode
const ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
let apiKey = process.env.OLLAMA_API_KEY?.trim(); // Trim whitespace
const isCloudMode = ollamaHost.includes('ollama.com') || ollamaHost.includes('api.ollama.com');

// Validate API key if it's set
if (apiKey) {
  // Check if it's still the placeholder value
  if (apiKey === 'OLLAMA_API_KEY' || apiKey === 'your_api_key_here' || apiKey.length < 10) {
    console.error('❌ ERROR: OLLAMA_API_KEY appears to be a placeholder value.');
    console.error('   Please replace it with your actual API key from https://ollama.com/settings/keys');
    apiKey = null; // Don't use invalid key
  }
}

// Initialize Ollama client
const ollamaConfig = {
  host: ollamaHost
};

// Only add API key for cloud mode
if (isCloudMode && apiKey) {
  ollamaConfig.headers = {
    'Authorization': `Bearer ${apiKey}`
  };
  console.log('✅ API key found and configured');
} else if (isCloudMode && !apiKey) {
  console.error('❌ ERROR: OLLAMA_HOST is set to cloud but OLLAMA_API_KEY is not set or invalid.');
  console.error('   Please set OLLAMA_API_KEY in your .env file');
  console.error('   Get your API key from: https://ollama.com/settings/keys');
  console.error('   Example: OLLAMA_API_KEY=ollama_xxxxxxxxxxxxxxxxxxxx');
}

const ollama = new Ollama(ollamaConfig);

// Serve static files
app.use(express.static('public'));
app.use(express.json());

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, model, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Validate model is provided
    if (!model) {
      return res.status(400).json({ error: 'Model is required. Please select a model.' });
    }

    // Prepare messages array with conversation history
    const messages = [
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    // Stream the response
    const stream = await ollama.chat({
      model: model,
      messages: messages,
      stream: true,
    });

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Stream the response chunks
    for await (const chunk of stream) {
      if (chunk.message?.content) {
        res.write(`data: ${JSON.stringify({ content: chunk.message.content, done: false })}\n\n`);
      }
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({ content: '', done: true })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Error in /api/chat:', error);
    
    // Provide more helpful error messages
    let errorMessage = error.message || 'An error occurred';
    let statusCode = 500;
    
    if (error.status_code === 401 || errorMessage.includes('unauthorized')) {
      statusCode = 401;
      errorMessage = 'Authentication failed. Please check your OLLAMA_API_KEY in the .env file.';
      if (isCloudMode && !apiKey) {
        errorMessage += ' API key is missing.';
      } else if (isCloudMode && apiKey) {
        errorMessage += ' The API key may be invalid or expired.';
      }
    }
    
    res.status(statusCode).json({ error: errorMessage });
  }
});

// Get server configuration (mode and default model)
app.get('/api/config', async (req, res) => {
  try {
    // For cloud mode, use a default model
    // For local mode, try to get the first available model from Ollama
    let defaultModel = null;
    
    if (isCloudMode) {
      defaultModel = 'gpt-oss:120b-cloud';
    } else {
      // For local mode, try to get the first available model
      try {
        const response = await ollama.list();
        if (response.models && response.models.length > 0) {
          // Use the first available model as default
          defaultModel = response.models[0].name;
        }
        // If no models found, defaultModel remains null
      } catch (error) {
        // If Ollama is not running or not accessible, defaultModel stays null
        console.log('Could not fetch models for default (Ollama may not be running):', error.message);
      }
    }
    
    res.json({
      mode: isCloudMode ? 'cloud' : 'local',
      host: ollamaHost,
      defaultModel: defaultModel
    });
  } catch (error) {
    console.error('Error in /api/config:', error);
    res.json({
      mode: isCloudMode ? 'cloud' : 'local',
      host: ollamaHost,
      defaultModel: isCloudMode ? 'gpt-oss:120b-cloud' : null
    });
  }
});

// Get available models
app.get('/api/models', async (req, res) => {
  try {
    const response = await ollama.list();
    res.json({ models: response.models || [] });
  } catch (error) {
    console.error('Error fetching models:', error);
    
    // Provide more helpful error messages
    let errorMessage = error.message || 'Failed to fetch models';
    let statusCode = 500;
    
    if (error.status_code === 401 || errorMessage.includes('unauthorized')) {
      statusCode = 401;
      errorMessage = 'Authentication failed. Please check your OLLAMA_API_KEY in the .env file.';
      if (isCloudMode && !apiKey) {
        errorMessage += ' API key is missing.';
      } else if (isCloudMode && apiKey) {
        errorMessage += ' The API key may be invalid or expired.';
      }
    }
    
    res.status(statusCode).json({ error: errorMessage });
  }
});

app.listen(port, () => {
  console.log(`🚀 Chatbot server running at http://localhost:${port}`);
  console.log(`📍 Ollama Host: ${ollamaHost}`);
  
  if (isCloudMode) {
    if (apiKey) {
      console.log('☁️  Mode: Ollama Cloud');
      console.log('📦 Default model: gpt-oss:120b-cloud');
      console.log(`🔑 API Key: Set (${apiKey.substring(0, 8)}...)`);
    } else {
      console.log('❌ Mode: Ollama Cloud (API key missing or invalid)');
      console.log('   ERROR: OLLAMA_API_KEY is required for cloud mode!');
      console.log('   Steps to fix:');
      console.log('   1. Get your API key from: https://ollama.com/settings/keys');
      console.log('   2. Open your .env file');
      console.log('   3. Set: OLLAMA_API_KEY=your_actual_api_key_here');
      console.log('   4. Restart the server');
      console.log('');
      console.log('   ⚠️  Requests will fail with 401 Unauthorized until API key is set!');
    }
  } else {
    console.log('💻 Mode: Local Ollama');
    console.log('📦 Default model: llama3.2');
    console.log('   Make sure Ollama is running locally!');
  }
});
