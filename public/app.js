// Chatbot application
class Chatbot {
    constructor() {
        this.conversationHistory = [];
        this.currentModel = 'llama3.2'; // Will be updated from server config
        this.isStreaming = false;
        this.mode = 'local'; // Will be updated from server config
        
        this.initializeElements();
        this.attachEventListeners();
        this.loadConfig();
    }

    initializeElements() {
        this.chatContainer = document.getElementById('chatContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.modelSelect = document.getElementById('modelSelect');
        this.refreshButton = document.getElementById('refreshModels');
        this.status = document.getElementById('status');
    }

    attachEventListeners() {
        this.sendButton.addEventListener('click', () => this.sendMessage());
        
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.messageInput.addEventListener('input', () => {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
        });

        this.modelSelect.addEventListener('change', (e) => {
            this.currentModel = e.target.value;
            console.log('Model changed to:', this.currentModel);
            this.setStatus(`Model set to: ${this.currentModel}`, 'info');
            setTimeout(() => {
                if (this.status.textContent.includes('Model set to:')) {
                    this.status.textContent = '';
                    this.status.className = 'status';
                }
            }, 2000);
        });

        this.refreshButton.addEventListener('click', () => this.loadModels());
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            const data = await response.json();
            
            this.mode = data.mode || 'local';
            
            // Only set default model if provided (cloud mode) or if we have one from server
            // For local mode, we'll get the model from the models list
            if (data.defaultModel) {
                this.currentModel = data.defaultModel;
            } else if (this.mode === 'cloud') {
                // Fallback for cloud mode
                this.currentModel = 'gpt-oss:120b-cloud';
            }
            // For local mode, don't set a default - wait for models list
            
            console.log('Loaded config:', { mode: this.mode, defaultModel: data.defaultModel });
            
            // Update welcome message based on mode
            const welcomeMessage = this.chatContainer.querySelector('.welcome-message');
            if (welcomeMessage) {
                const hint = welcomeMessage.querySelector('.hint');
                if (hint) {
                    hint.textContent = this.mode === 'cloud' 
                        ? 'Using Ollama Cloud - no local installation required!'
                        : 'Using local Ollama - make sure Ollama is running!';
                }
            }
            
            // For cloud mode, set the default model in dropdown
            // For local mode, wait for models list to load
            if (this.mode === 'cloud' && this.currentModel) {
                const hasPlaceholder = this.modelSelect.options.length === 1 && 
                                       (this.modelSelect.options[0].value === '' || 
                                        this.modelSelect.options[0].textContent === 'Loading...');
                
                if (hasPlaceholder || this.modelSelect.options.length === 0) {
                    this.modelSelect.innerHTML = '';
                    const defaultOption = document.createElement('option');
                    defaultOption.value = this.currentModel;
                    defaultOption.textContent = this.currentModel;
                    defaultOption.selected = true;
                    this.modelSelect.appendChild(defaultOption);
                }
            }
            
            // Load models after config is loaded (this will populate the dropdown with available models)
            this.loadModels();
        } catch (error) {
            console.error('Error loading config:', error);
            // Continue and try to load models anyway
            this.loadModels();
        }
    }

    async loadModels() {
        try {
            this.setStatus('Loading models...', 'info');
            const response = await fetch('/api/models');
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Failed to fetch models' }));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.models && data.models.length > 0) {
                this.modelSelect.innerHTML = '';
                let foundCurrentModel = false;
                
                // For cloud mode, always prefer gpt-oss:120b-cloud
                const cloudDefaultModel = 'gpt-oss:120b-cloud';
                const targetModel = this.mode === 'cloud' ? cloudDefaultModel : this.currentModel;
                
                data.models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.name;
                    option.textContent = model.name;
                    
                    // For cloud mode, prioritize gpt-oss:120b-cloud
                    if (this.mode === 'cloud' && model.name === cloudDefaultModel) {
                        option.selected = true;
                        this.currentModel = cloudDefaultModel;
                        foundCurrentModel = true;
                    }
                    // For local mode, select first model if no currentModel is set
                    else if (this.mode === 'local' && !this.currentModel && !foundCurrentModel) {
                        option.selected = true;
                        this.currentModel = model.name;
                        foundCurrentModel = true;
                    }
                    // If we have a currentModel and it matches, select it
                    else if (this.currentModel && model.name === this.currentModel) {
                        option.selected = true;
                        foundCurrentModel = true;
                    }
                    
                    this.modelSelect.appendChild(option);
                });
                
                // Handle fallback cases
                if (!foundCurrentModel) {
                    if (this.mode === 'cloud') {
                        // For cloud mode, always use gpt-oss:120b-cloud even if not in list
                        // Add it to the dropdown and select it
                        const cloudOption = document.createElement('option');
                        cloudOption.value = cloudDefaultModel;
                        cloudOption.textContent = cloudDefaultModel;
                        cloudOption.selected = true;
                        this.modelSelect.insertBefore(cloudOption, this.modelSelect.firstChild);
                        this.currentModel = cloudDefaultModel;
                        console.log('Using cloud default model:', cloudDefaultModel);
                    } else if (data.models.length > 0) {
                        // For local mode, use first available model
                        this.modelSelect.value = data.models[0].name;
                        this.currentModel = data.models[0].name;
                        console.log('Using first available model:', this.currentModel);
                    }
                } else {
                    // Ensure currentModel matches the selected value
                    this.currentModel = this.modelSelect.value;
                }
                
                this.setStatus(`Loaded ${data.models.length} model(s)`, 'success');
            } else {
                // No models found - clear dropdown and show error
                this.modelSelect.innerHTML = '';
                this.currentModel = null; // Clear current model
                
                const errorMsg = this.mode === 'cloud'
                    ? 'No models found. Make sure you have access to cloud models.'
                    : 'Failed to load models. Make sure Ollama is running locally.';
                this.setStatus(errorMsg, 'error');
            }
        } catch (error) {
            console.error('Error loading models:', error);
            
            // Clear dropdown on error
            this.modelSelect.innerHTML = '';
            this.currentModel = null; // Clear current model
            
            // Show appropriate error message
            let errorMsg;
            if (this.mode === 'cloud') {
                errorMsg = 'Failed to load models. Make sure your API key is valid.';
            } else {
                // For local mode, check if it's a connection error
                if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
                    errorMsg = 'Failed to load models. Make sure Ollama is running locally.';
                } else {
                    errorMsg = 'Failed to load models. Make sure Ollama is running locally.';
                }
            }
            this.setStatus(errorMsg, 'error');
        }
    }

    async sendMessage() {
        const message = this.messageInput.value.trim();
        
        if (!message || this.isStreaming) {
            return;
        }
        
        // Check if a model is selected
        if (!this.currentModel || !this.modelSelect.value) {
            this.setStatus('Please select a model first.', 'error');
            return;
        }

        // Add user message to UI
        this.addMessage('user', message);
        this.messageInput.value = '';
        this.messageInput.style.height = 'auto';
        
        // Disable input while streaming
        this.setStreaming(true);
        this.setStatus('Thinking...', 'info');

        try {
            // Ensure we're using the currently selected model
            const selectedModel = this.modelSelect.value || this.currentModel;
            this.currentModel = selectedModel;
            
            console.log('Sending message with model:', this.currentModel);
            
            // Create typing indicator
            const typingId = this.addTypingIndicator();

            // Stream the response
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    model: this.currentModel,
                    conversationHistory: this.conversationHistory
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Remove typing indicator
            this.removeTypingIndicator(typingId);

            // Create assistant message element
            const assistantMessageId = this.addMessage('assistant', '');

            // Read the stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullResponse = '';
            let statusMessageId = null;

            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            
                            if (data.done) {
                                // Remove status message if it exists
                                if (statusMessageId) {
                                    const statusMsg = document.getElementById(statusMessageId);
                                    if (statusMsg) statusMsg.remove();
                                }
                                
                                // Add to conversation history
                                this.conversationHistory.push(
                                    { role: 'user', content: message },
                                    { role: 'assistant', content: fullResponse }
                                );
                                this.setStatus('Ready', 'success');
                                break;
                            }
                            
                            // Handle status messages (reasoning, search, thinking)
                            if (data.type && data.message) {
                                // Remove previous status message if exists
                                if (statusMessageId) {
                                    const prevStatus = document.getElementById(statusMessageId);
                                    if (prevStatus) prevStatus.remove();
                                }
                                
                                // Create new status message
                                const statusDiv = document.createElement('div');
                                statusDiv.className = 'message assistant status-message';
                                statusMessageId = 'status-' + Date.now();
                                statusDiv.id = statusMessageId;
                                
                                const icon = data.type === 'search' ? '🔍' : data.type === 'reasoning' ? '🤔' : '💭';
                                statusDiv.innerHTML = `<div class="message-content">${icon} ${data.message}</div>`;
                                
                                const assistantMsg = document.getElementById(assistantMessageId);
                                if (assistantMsg && assistantMsg.parentNode) {
                                    assistantMsg.parentNode.insertBefore(statusDiv, assistantMsg);
                                } else {
                                    this.chatContainer.appendChild(statusDiv);
                                }
                                
                                this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
                            }
                            
                            // Handle error messages
                            if (data.type === 'error' && data.message) {
                                this.setStatus(data.message, 'error');
                            }
                            
                            // Handle actual content
                            if (data.content) {
                                // Remove status message when content starts
                                if (statusMessageId) {
                                    const statusMsg = document.getElementById(statusMessageId);
                                    if (statusMsg) {
                                        statusMsg.remove();
                                        statusMessageId = null;
                                    }
                                }
                                
                                fullResponse += data.content;
                                this.updateMessage(assistantMessageId, fullResponse);
                            }
                        } catch (e) {
                            console.error('Error parsing SSE data:', e);
                        }
                    }
                }
            }

        } catch (error) {
            console.error('Error sending message:', error);
            const errorMsg = this.mode === 'cloud' 
                ? `Error: ${error.message}. Make sure your API key is valid and you have access to Ollama Cloud.`
                : `Error: ${error.message}. Make sure Ollama is running locally on http://127.0.0.1:11434`;
            this.addMessage('assistant', errorMsg);
            this.setStatus('Error: ' + error.message, 'error');
        } finally {
            this.setStreaming(false);
        }
    }

    addMessage(role, content) {
        // Remove welcome message if it exists
        const welcomeMessage = this.chatContainer.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        const messageId = 'msg-' + Date.now() + '-' + Math.random();
        messageDiv.id = messageId;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString();

        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(timeDiv);
        this.chatContainer.appendChild(messageDiv);
        
        // Scroll to bottom
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;

        return messageId;
    }

    updateMessage(messageId, content) {
        const messageDiv = document.getElementById(messageId);
        if (messageDiv) {
            const contentDiv = messageDiv.querySelector('.message-content');
            if (contentDiv) {
                contentDiv.textContent = content;
                // Scroll to bottom as content updates
                this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
            }
        }
    }

    addTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message assistant';
        const typingId = 'typing-' + Date.now();
        typingDiv.id = typingId;

        const indicatorDiv = document.createElement('div');
        indicatorDiv.className = 'typing-indicator';
        indicatorDiv.innerHTML = '<span></span><span></span><span></span>';

        typingDiv.appendChild(indicatorDiv);
        this.chatContainer.appendChild(typingDiv);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;

        return typingId;
    }

    removeTypingIndicator(typingId) {
        const typingDiv = document.getElementById(typingId);
        if (typingDiv) {
            typingDiv.remove();
        }
    }

    setStreaming(streaming) {
        this.isStreaming = streaming;
        this.sendButton.disabled = streaming;
        this.messageInput.disabled = streaming;
        if (streaming) {
            this.sendButton.textContent = 'Sending...';
        } else {
            this.sendButton.textContent = 'Send';
        }
    }

    setStatus(message, type = 'info') {
        this.status.textContent = message;
        this.status.className = 'status ' + type;
        
        if (type === 'success' && message === 'Ready') {
            setTimeout(() => {
                this.status.textContent = '';
                this.status.className = 'status';
            }, 2000);
        }
    }
}

// Initialize chatbot when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Chatbot();
});
