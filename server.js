import express from 'express';
import { Ollama } from 'ollama';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ override: true });

// Google Custom Search API configuration
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;

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

// Helper function to get current date in ISO-8601 format with day of week
function getCurrentDate() {
  const now = new Date();
  
  // Get ISO-8601 date (YYYY-MM-DD)
  const isoDate = now.toISOString().split('T')[0];
  
  // Get day of week
  const options = { weekday: 'long' };
  const dayOfWeek = now.toLocaleDateString('en-US', options);
  
  // Get current year for grounding instructions
  const currentYear = now.getFullYear();
  const previousYear = currentYear - 1;
  
  return {
    iso: isoDate,
    dayOfWeek: dayOfWeek,
    currentYear: currentYear,
    previousYear: previousYear,
    formatted: `${isoDate} (${dayOfWeek})`
  };
}

// Web search function using Google Custom Search API
async function performWebSearch(query) {
  console.log(`[TOOL] 🔍 Web search called with query: "${query}"`);
  
  if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) {
    console.error('[TOOL] ❌ Web search failed: Google API credentials not configured');
    throw new Error('Google API credentials not configured. Please set GOOGLE_API_KEY and GOOGLE_CSE_ID in .env file');
  }

  try {
    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CSE_ID}&q=${encodeURIComponent(query)}&num=5`;
    console.log(`[TOOL] 📡 Sending request to Google Custom Search API...`);
    
    const response = await fetch(searchUrl);
    
    if (!response.ok) {
      console.error(`[TOOL] ❌ Google Search API error: ${response.status} ${response.statusText}`);
      throw new Error(`Google Search API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      console.error(`[TOOL] ❌ Google Search API error: ${data.error.message}`);
      throw new Error(`Google Search API error: ${data.error.message}`);
    }
    
    // Format search results
    const results = (data.items || []).map(item => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet
    }));
    
    console.log(`[TOOL] ✅ Web search completed: Found ${results.length} result(s)`);
    if (results.length > 0) {
      results.forEach((result, idx) => {
        console.log(`[TOOL]   [${idx + 1}] ${result.title}`);
        console.log(`[TOOL]       URL: ${result.link}`);
      });
    }
    
    return results;
  } catch (error) {
    console.error('[TOOL] ❌ Web search error:', error);
    throw error;
  }
}

// Function to confirm if response was adequate without web search
async function confirmResponseAdequacy(userMessage, response, model) {
  console.log(`[CONFIRMATION] 🔍 Checking if response was adequate without web search...`);
  
  const currentDate = getCurrentDate();
  const confirmationPrompt = `You are a helpful assistant. Review the following question and response to determine if the response adequately answers the question without needing current, real-time, or specific web information.

IMPORTANT DATE CONTEXT:
- The current date is ${currentDate.iso}
- Today is ${currentDate.dayOfWeek}
- Use the provided current date (${currentDate.iso}) as your anchor for all relative time references (e.g., "tomorrow", "last week", "3 months ago", "next Friday").
- When the user asks about "today", "now", "current", "recent", or similar time-sensitive terms, they are referring to ${currentDate.iso} (${currentDate.dayOfWeek}).
- If a user asks for "the latest news" or "recent events," prioritize information from late ${currentDate.previousYear} or early ${currentDate.currentYear}.

Original question: "${userMessage}"

Generated response: "${response}"

Respond with ONLY a valid JSON object in this exact format (no markdown, no code blocks, just the JSON):
{
  "is_adequate": true or false,
  "needs_search": true or false (opposite of is_adequate),
  "search_query": "the search query if needs_search is true, otherwise empty string",
  "reasoning": "brief explanation of why the response is or isn't adequate"
}

The response is adequate if:
- It fully answers the question with general knowledge
- It doesn't require current and recent events, recent news, real-time data, or specific information not in training data
- The answer is complete and accurate based on available knowledge

The response is NOT adequate if:
- It mentions uncertainty about current information
- It says "I don't have information about..." for current events
- The question clearly asks for recent/current information that wasn't provided
- The answer is incomplete or vague due to missing current data

Remember: Only respond with the JSON object, nothing else.`;

  try {
    console.log(`[CONFIRMATION] 📤 Sending confirmation request to LLM...`);
    console.log(`[CONFIRMATION] 📅 Current date context: ${currentDate.formatted}`);
    const response_check = await ollama.chat({
      model: model,
      messages: [
        { role: 'system', content: `You are a confirmation assistant that validates if responses are adequate. The current date is ${currentDate.iso}. Today is ${currentDate.dayOfWeek}. Use this date as your anchor for all relative time references. Always respond with valid JSON only.` },
        { role: 'user', content: confirmationPrompt }
      ],
      stream: false,
    });

    const content = response_check.message.content.trim();
    console.log(`[CONFIRMATION] 📥 Received LLM confirmation response (raw): ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`);
    
    // Try to extract JSON from the response
    let jsonStr = content;
    if (content.includes('```json')) {
      jsonStr = content.split('```json')[1].split('```')[0].trim();
    } else if (content.includes('```')) {
      jsonStr = content.split('```')[1].split('```')[0].trim();
    }
    
    // Remove any leading/trailing whitespace and parse
    jsonStr = jsonStr.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
    if (!jsonStr.startsWith('{')) {
      jsonStr = '{' + jsonStr;
    }
    if (!jsonStr.endsWith('}')) {
      jsonStr = jsonStr + '}';
    }
    
    const confirmation = JSON.parse(jsonStr);
    
    // Log the confirmation result
    if (confirmation.is_adequate) {
      console.log(`[CONFIRMATION] ✅ Response confirmed as ADEQUATE`);
      console.log(`[CONFIRMATION]    Reasoning: ${confirmation.reasoning}`);
    } else {
      console.log(`[CONFIRMATION] ❌ Response NOT confirmed - SEARCH NEEDED`);
      console.log(`[CONFIRMATION]    Query: "${confirmation.search_query}"`);
      console.log(`[CONFIRMATION]    Reasoning: ${confirmation.reasoning}`);
    }
    
    return confirmation;
  } catch (error) {
    console.error('[CONFIRMATION] ❌ Error in confirmation check:', error);
    console.error('[CONFIRMATION]    Defaulting to: ADEQUATE (no retry)');
    // Fallback: if confirmation fails, assume adequate to avoid loops
    return { is_adequate: true, needs_search: false, search_query: '', reasoning: 'Confirmation check failed, defaulting to adequate' };
  }
}

// Function to check if LLM needs web search
async function checkIfNeedsSearch(userMessage, model) {
  console.log(`[REASONING] 🤔 Checking if web search is needed for question: "${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}"`);
  console.log(`[REASONING] 📦 Using model: ${model}`);
  
  const currentDate = getCurrentDate();
  const reasoningPrompt = `You are a helpful assistant. Analyze the following user question and determine if you need to search the web for current, real-time, or specific information that might not be in your training data.

IMPORTANT DATE CONTEXT:
- The current date is ${currentDate.iso}
- Today is ${currentDate.dayOfWeek}
- Use the provided current date (${currentDate.iso}) as your anchor for all relative time references (e.g., "tomorrow", "last week", "3 months ago", "next Friday").
- When the user asks about "today", "now", "current", "recent", or similar time-sensitive terms, they are referring to ${currentDate.iso} (${currentDate.dayOfWeek}).
- If a user asks for "the latest news" or "recent events," prioritize information from late ${currentDate.previousYear} or early ${currentDate.currentYear}.

User question: "${userMessage}"

Respond with ONLY a valid JSON object in this exact format (no markdown, no code blocks, just the JSON):
{
  "needs_search": true or false,
  "search_query": "the search query if needs_search is true, otherwise empty string",
  "reasoning": "brief explanation of why search is or isn't needed"
}

Examples:
- Question about current events, recent news, current prices, today's weather, recent sports scores → needs_search: true
- Question about general knowledge, math, coding, philosophy, historical facts → needs_search: false
- Question asking "what happened today" or "latest news about X" → needs_search: true
- Question asking "how does photosynthesis work" → needs_search: false

Remember: Only respond with the JSON object, nothing else.`;

  try {
    console.log(`[REASONING] 📤 Sending reasoning request to LLM...`);
    console.log(`[REASONING] 📅 Current date context: ${currentDate.formatted}`);
    const response = await ollama.chat({
      model: model,
      messages: [
        { role: 'system', content: `You are a reasoning assistant that determines if web search is needed. The current date is ${currentDate.iso}. Today is ${currentDate.dayOfWeek}. Use this date as your anchor for all relative time references. Always respond with valid JSON only.` },
        { role: 'user', content: reasoningPrompt }
      ],
      stream: false,
    });

    const content = response.message.content.trim();
    console.log(`[REASONING] 📥 Received LLM response (raw): ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`);
    
    // Try to extract JSON from the response (handle cases where LLM adds markdown)
    let jsonStr = content;
    if (content.includes('```json')) {
      jsonStr = content.split('```json')[1].split('```')[0].trim();
    } else if (content.includes('```')) {
      jsonStr = content.split('```')[1].split('```')[0].trim();
    }
    
    // Remove any leading/trailing whitespace and parse
    jsonStr = jsonStr.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
    if (!jsonStr.startsWith('{')) {
      jsonStr = '{' + jsonStr;
    }
    if (!jsonStr.endsWith('}')) {
      jsonStr = jsonStr + '}';
    }
    
    const decision = JSON.parse(jsonStr);
    
    // Log the decision
    if (decision.needs_search) {
      console.log(`[REASONING] ✅ LLM decided: SEARCH NEEDED`);
      console.log(`[REASONING]    Query: "${decision.search_query}"`);
      console.log(`[REASONING]    Reasoning: ${decision.reasoning}`);
    } else {
      console.log(`[REASONING] ❌ LLM decided: NO SEARCH NEEDED`);
      console.log(`[REASONING]    Reasoning: ${decision.reasoning}`);
    }
    
    return decision;
  } catch (error) {
    console.error('[REASONING] ❌ Error in reasoning check:', error);
    console.error('[REASONING]    Falling back to: NO SEARCH');
    // Fallback: if reasoning fails, default to no search
    return { needs_search: false, search_query: '', reasoning: 'Reasoning check failed, defaulting to no search' };
  }
}

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

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Step 1: Check if web search is needed
    const currentDate = getCurrentDate();
    console.log(`\n[CHAT] 💬 New chat request received`);
    console.log(`[CHAT]    Model: ${model}`);
    console.log(`[CHAT]    Date: ${currentDate.formatted}`);
    console.log(`[CHAT]    Message: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);
    
    res.write(`data: ${JSON.stringify({ content: '', type: 'reasoning', message: 'Analyzing if web search is needed...' })}\n\n`);
    
    const searchDecision = await checkIfNeedsSearch(message, model);
    let searchResults = null;
    
    // Step 2: Perform web search if needed
    if (searchDecision.needs_search && searchDecision.search_query) {
      console.log(`[CHAT] 🔧 Tool will be called: Web Search`);
      try {
        res.write(`data: ${JSON.stringify({ content: '', type: 'search', message: `Searching the web for: "${searchDecision.search_query}"...` })}\n\n`);
        searchResults = await performWebSearch(searchDecision.search_query);
        
        if (searchResults && searchResults.length > 0) {
          console.log(`[CHAT] ✅ Tool execution successful: ${searchResults.length} result(s) will be included in context`);
          res.write(`data: ${JSON.stringify({ content: '', type: 'search', message: `Found ${searchResults.length} search result(s)` })}\n\n`);
        } else {
          console.log(`[CHAT] ⚠️  Tool execution completed but no results found`);
          res.write(`data: ${JSON.stringify({ content: '', type: 'search', message: 'No search results found' })}\n\n`);
        }
      } catch (searchError) {
        console.error('[CHAT] ❌ Tool execution failed:', searchError);
        res.write(`data: ${JSON.stringify({ content: '', type: 'error', message: `Web search failed: ${searchError.message}` })}\n\n`);
        // Continue without search results
      }
    } else {
      console.log(`[CHAT] ⏭️  Tool will NOT be called: LLM determined search is not needed`);
    }

    // Step 3: Generate response (with or without search results)
    // If no search was performed initially, we'll collect the response first for confirmation
    let needsConfirmation = !searchDecision.needs_search && !searchResults;
    let fullResponse = '';
    let retryCount = 0;
    const maxRetries = 1; // Prevent infinite loops

    while (true) {
      // Prepare messages with search results if available
      const systemPrompt = `You are a helpful AI assistant. You have access to web search capabilities when needed.

IMPORTANT DATE CONTEXT:
- The current date is ${currentDate.iso}
- Today is ${currentDate.dayOfWeek}
- Use the provided current date (${currentDate.iso}) as your anchor for all relative time references (e.g., "tomorrow", "last week", "3 months ago", "next Friday").
- When the user asks about "today", "now", "current", "recent", or similar time-sensitive terms, they are referring to ${currentDate.iso} (${currentDate.dayOfWeek}).
- If a user asks for "the latest news" or "recent events," prioritize information from late ${currentDate.previousYear} or early ${currentDate.currentYear}.
- Always use this date as the reference point for temporal questions and date calculations.

${searchResults && searchResults.length > 0 ? `\nWeb search results for "${searchDecision.search_query || 'your query'}":\n${searchResults.map((result, idx) => `\n[${idx + 1}] ${result.title}\nURL: ${result.link}\n${result.snippet}\n`).join('\n')}\n\nUse this information to provide an accurate and up-to-date answer. Cite sources when appropriate.` : searchDecision.needs_search ? '\nNote: Web search was attempted but no results were found. Answer based on your knowledge.' : ''}

Provide a helpful, accurate response to the user's question.`;

      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: message }
      ];

      // Generate response
      if (needsConfirmation && retryCount === 0) {
        // First attempt without search - collect response for confirmation
        console.log(`[CHAT] 📝 Generating initial response without search (will confirm after)`);
        res.write(`data: ${JSON.stringify({ content: '', type: 'thinking', message: 'Generating response...' })}\n\n`);
        
        const response_check = await ollama.chat({
          model: model,
          messages: messages,
          stream: false,
        });

        fullResponse = response_check.message.content || '';
        console.log(`[CHAT] 📄 Initial response generated (${fullResponse.length} characters)`);

        // Step 4: Confirm if response is adequate
        res.write(`data: ${JSON.stringify({ content: '', type: 'reasoning', message: 'Verifying response adequacy...' })}\n\n`);
        const confirmation = await confirmResponseAdequacy(message, fullResponse, model);

        if (confirmation.is_adequate) {
          // Response is adequate, stream it
          console.log(`[CHAT] ✅ Response confirmed - streaming to user`);
          // Stream the response character by character or in chunks to simulate streaming
          const chunkSize = 10;
          for (let i = 0; i < fullResponse.length; i += chunkSize) {
            const chunk = fullResponse.substring(i, i + chunkSize);
            res.write(`data: ${JSON.stringify({ content: chunk, done: false })}\n\n`);
          }
          break; // Exit loop, response is adequate
        } else {
          // Response is not adequate, need to search
          console.log(`[CHAT] ⚠️  Response NOT confirmed - performing web search and regenerating`);
          retryCount++;
          
          if (retryCount > maxRetries) {
            console.log(`[CHAT] ⛔ Max retries reached - using initial response`);
            // Stream the initial response anyway to avoid infinite loop
            const chunkSize = 10;
            for (let i = 0; i < fullResponse.length; i += chunkSize) {
              const chunk = fullResponse.substring(i, i + chunkSize);
              res.write(`data: ${JSON.stringify({ content: chunk, done: false })}\n\n`);
            }
            break;
          }

          // Perform web search
          const searchQuery = confirmation.search_query || searchDecision.search_query || message;
          console.log(`[CHAT] 🔧 Performing web search with query: "${searchQuery}"`);
          res.write(`data: ${JSON.stringify({ content: '', type: 'search', message: `Searching the web for: "${searchQuery}"...` })}\n\n`);
          
          try {
            searchResults = await performWebSearch(searchQuery);
            searchDecision.needs_search = true;
            searchDecision.search_query = searchQuery;
            
            if (searchResults && searchResults.length > 0) {
              console.log(`[CHAT] ✅ Search successful: ${searchResults.length} result(s) found`);
              res.write(`data: ${JSON.stringify({ content: '', type: 'search', message: `Found ${searchResults.length} search result(s)` })}\n\n`);
            } else {
              console.log(`[CHAT] ⚠️  Search completed but no results found`);
              res.write(`data: ${JSON.stringify({ content: '', type: 'search', message: 'No search results found' })}\n\n`);
            }
          } catch (searchError) {
            console.error('[CHAT] ❌ Search failed:', searchError);
            res.write(`data: ${JSON.stringify({ content: '', type: 'error', message: `Web search failed: ${searchError.message}` })}\n\n`);
            // Continue with no search results
            searchResults = null;
          }
          
          // Continue loop to regenerate with search results
          needsConfirmation = false; // Don't confirm again after search
          continue;
        }
      } else {
        // Search was performed or retry after search - stream response normally
        console.log(`[CHAT] 📝 Generating response with ${searchResults ? 'search results included' : 'no search results'}`);
        res.write(`data: ${JSON.stringify({ content: '', type: 'thinking', message: 'Generating response...' })}\n\n`);
        
        const stream = await ollama.chat({
          model: model,
          messages: messages,
          stream: true,
        });

        // Stream the response chunks
        let responseLength = 0;
        for await (const chunk of stream) {
          if (chunk.message?.content) {
            responseLength += chunk.message.content.length;
            res.write(`data: ${JSON.stringify({ content: chunk.message.content, done: false })}\n\n`);
          }
        }

        console.log(`[CHAT] ✅ Response generated successfully (${responseLength} characters)`);
        break; // Exit loop after streaming
      }
    }

    console.log(`[CHAT] ─────────────────────────────────────────────────────────\n`);

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
