const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const PromptEngine = require('./prompt-engine');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize the Prompt Engineering System
const promptEngine = new PromptEngine();

// Available Gemini models
const AVAILABLE_MODELS = {
    'gemini-1.5-flash': {
        name: 'Gemini 1.5 Flash',
        description: 'Fast, efficient model for quick analysis',
        maxTokens: 8192,
        strengths: ['Speed', 'General Analysis', 'Cost Effective']
    },
    'gemini-1.5-pro': {
        name: 'Gemini 1.5 Pro',
        description: 'Advanced model for complex analysis',
        maxTokens: 32768,
        strengths: ['Detailed Analysis', 'Complex Reasoning', 'Professional Use']
    },
    'gemini-1.0-pro-vision': {
        name: 'Gemini 1.0 Pro Vision',
        description: 'Legacy model (deprecated)',
        maxTokens: 4096,
        strengths: ['Basic Vision Tasks'],
        deprecated: true
    }
};

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from React build
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d', // Cache static files for 1 day
  etag: true,
  lastModified: true
}));
app.use('/static', express.static(path.join(__dirname, 'static'), {
  maxAge: '1h', // Cache audio files for 1 hour
  etag: true
}));

// Create directories if they don't exist
const uploadsDir = path.join(__dirname, 'uploads');
const staticDir = path.join(__dirname, 'static');
const audioDir = path.join(__dirname, 'static', 'audio');

[uploadsDir, staticDir, audioDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// In-memory storage for images and sessions
const imageStorage = new Map();
const userSessions = new Map();

// Session management
function getOrCreateSession(sessionId) {
  if (!sessionId) {
    sessionId = uuidv4();
  }
  
  if (!userSessions.has(sessionId)) {
    userSessions.set(sessionId, {
      id: sessionId,
      created: new Date(),
      lastActivity: new Date(),
      preferredModel: 'gemini-1.5-flash',
      conversationState: 'idle', // idle, listening, processing, speaking
      imagesAnalyzed: 0
    });
  }
  
  const session = userSessions.get(sessionId);
  session.lastActivity = new Date();
  return session;
}

// Enhanced AI Analysis function with prompt engineering
async function analyzeImageWithGemini(imageData, query, sessionId, selectedModel = 'gemini-1.5-flash') {
  try {
    // Use prompt engineering system
    const promptResult = promptEngine.generatePrompt(query, sessionId);
    const engineeredQuery = promptResult.engineeredPrompt;
    
    console.log(`🔍 Analysis Request: Model=${selectedModel}, UseCase=${promptResult.metadata.useCase}, Query="${query}"`);
    
    const modelConfig = AVAILABLE_MODELS[selectedModel];
    if (!modelConfig) {
      throw new Error(`Model ${selectedModel} not available`);
    }
    
    if (modelConfig.deprecated) {
      throw new Error(`Model ${selectedModel} is deprecated. Please use gemini-1.5-flash or gemini-1.5-pro instead.`);
    }
    
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
      {
        contents: [{
          parts: [
            { text: engineeredQuery },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: imageData
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.3,
          topK: 10,
          topP: 0.7,
          maxOutputTokens: 75, // Even shorter for voice
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000 // 30 second timeout
      }
    );

    const aiResponse = response.data.candidates[0].content.parts[0].text;
    
    // Update conversation history
    promptEngine.updateConversationHistory(sessionId, query, aiResponse, promptResult.metadata);
    
    return {
      response: aiResponse,
      metadata: promptResult.metadata,
      model: selectedModel
    };
  } catch (error) {
    console.error('Gemini API error:', error.response?.data || error.message);
    throw new Error(`AI Analysis failed: ${error.response?.data?.error?.message || error.message}`);
  }
}

// Text-to-Speech function using Google Cloud TTS
async function generateTTS(text) {
  try {
    // Strip HTML tags for clean audio
    const cleanText = stripHTMLTags(text);
    
    const response = await axios.post(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_CLOUD_API_KEY}`,
      {
        input: { text: cleanText },
        voice: {
          languageCode: 'en-US',
          name: 'en-US-Neural2-F',
          ssmlGender: 'FEMALE'
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: 1.0,
          pitch: 0.0,
          volumeGainDb: 0.0
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );

    const audioContent = response.data.audioContent;
    const filename = `tts_${uuidv4().substring(0, 8)}.mp3`;
    const filepath = path.join(audioDir, filename);
    
    fs.writeFileSync(filepath, audioContent, 'base64');
    
    return `/static/audio/${filename}`;
  } catch (error) {
    console.error('TTS error:', error.response?.data || error.message);
    return null;
  }
}

// Helper function to strip HTML tags from text
function stripHTMLTags(html) {
  if (!html) return '';
  
  let cleanText = html
    // Remove all HTML tags (including nested ones)
    .replace(/<[^>]*>/g, '')
    // Remove HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Remove any remaining HTML-like patterns
    .replace(/&[a-zA-Z0-9#]+;/g, ' ')
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
  
  // Debug logging to see what's being sent to TTS
  console.log('Original text:', html);
  console.log('Cleaned text for TTS:', cleanText);
  
  return cleanText;
}

// API Routes

// Get available models
app.get('/api/models', (req, res) => {
  const models = Object.entries(AVAILABLE_MODELS)
    .filter(([key, model]) => !model.deprecated)
    .map(([key, model]) => ({
      id: key,
      ...model
    }));
  
  res.json({ models });
});

// Get global statistics
app.get('/api/stats', (req, res) => {
  const stats = promptEngine.getGlobalStats();
  res.json({
    ...stats,
    activeSessions: userSessions.size,
    availableModels: Object.keys(AVAILABLE_MODELS).filter(key => !AVAILABLE_MODELS[key].deprecated).length
  });
});

// Upload image endpoint
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const sessionId = req.headers['x-session-id'] || uuidv4();
    const session = getOrCreateSession(sessionId);
    
    const imageId = uuidv4();
    const imagePath = req.file.path;
    const imageData = fs.readFileSync(imagePath, { encoding: 'base64' });
    
    // Store image data in memory
    imageStorage.set(imageId, {
      data: imageData,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: imagePath,
      sessionId: sessionId,
      uploadedAt: new Date()
    });

    // Update global statistics
    const totalImages = promptEngine.incrementImageCount();
    session.imagesAnalyzed++;

    res.json({
      image_id: imageId,
      session_id: sessionId,
      message: 'Image uploaded successfully',
      size_bytes: req.file.size,
      total_images_global: totalImages
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Analyze image endpoint with enhanced features
app.post('/api/analyze-image', async (req, res) => {
  try {
    const { image_id, query, voice_response = false, model = 'gemini-1.5-flash', session_id } = req.body;
    
    if (!image_id || !imageStorage.has(image_id)) {
      return res.status(404).json({ error: 'Image not found' });
    }

    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const sessionId = session_id || imageStorage.get(image_id).sessionId;
    const session = getOrCreateSession(sessionId);
    
    // Update session state
    session.conversationState = 'processing';
    session.preferredModel = model;

    const imageInfo = imageStorage.get(image_id);
    
    // Analyze with Gemini AI using prompt engineering
    const analysisResult = await analyzeImageWithGemini(imageInfo.data, query.trim(), sessionId, model);
    
    let audioUrl = null;
    if (voice_response) {
      session.conversationState = 'speaking';
      audioUrl = await generateTTS(analysisResult.response);
    }
    
    session.conversationState = 'idle';

    res.json({
      description: analysisResult.response,
      audio_url: audioUrl,
      image_id: image_id,
      session_id: sessionId,
      analysis_type: 'ai_powered',
      model_used: analysisResult.model,
      use_case_detected: analysisResult.metadata.useCase,
      confidence: analysisResult.metadata.confidence,
      global_stats: promptEngine.getGlobalStats()
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze image' });
  }
});

// Session management endpoint
app.post('/api/session', (req, res) => {
  const { action, session_id } = req.body;
  
  if (action === 'create') {
    const session = getOrCreateSession();
    res.json({ session_id: session.id, session });
  } else if (action === 'get' && session_id) {
    const session = getOrCreateSession(session_id);
    res.json({ session_id: session.id, session });
  } else {
    res.status(400).json({ error: 'Invalid session action' });
  }
});

// Update session state (for voice interaction)
app.post('/api/session/state', (req, res) => {
  const { session_id, state } = req.body;
  
  if (!session_id || !userSessions.has(session_id)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const session = userSessions.get(session_id);
  session.conversationState = state;
  session.lastActivity = new Date();
  
  res.json({ session_id, state, session });
});

// Generate TTS for casual responses
app.post('/api/generate-tts', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    const audioUrl = await generateTTS(text.trim());
    
    if (audioUrl) {
      res.json({ audio_url: audioUrl, text: text.trim() });
    } else {
      res.status(500).json({ error: 'Failed to generate audio' });
    }
  } catch (error) {
    console.error('TTS generation error:', error);
    res.status(500).json({ error: 'Failed to generate audio' });
  }
});

// Enhanced health endpoint with performance metrics
app.get('/api/health', (req, res) => {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '3.1.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
        memory: {
            rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
            heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
            heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
            external: `${Math.round(memUsage.external / 1024 / 1024)} MB`
        },
        stats: promptEngine.getGlobalStats(),
        models: Object.keys(AVAILABLE_MODELS).filter(key => !AVAILABLE_MODELS[key].deprecated),
        features: ['voice_recognition', 'text_to_speech', 'image_analysis', 'prompt_engineering']
    });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
  }
  res.status(500).json({ error: 'Internal server error' });
});

// Cleanup old files and sessions periodically
setInterval(() => {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour
  
  // Clean up uploaded images
  fs.readdir(uploadsDir, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const filePath = path.join(uploadsDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
  
  // Clean up audio files
  fs.readdir(audioDir, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const filePath = path.join(audioDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
  
  // Clean up inactive sessions
  for (const [sessionId, session] of userSessions.entries()) {
    if (now - session.lastActivity.getTime() > maxAge) {
      userSessions.delete(sessionId);
    }
  }
}, 30 * 60 * 1000); // Run every 30 minutes

app.listen(PORT, () => {
  console.log('🚀 AURA Advanced Vision Assistant starting...');
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`🔗 Access at: http://localhost:${PORT}`);
  console.log(`🤖 Features: Prompt Engineering, Model Switching, Voice Interaction`);
  console.log(`📊 Available Models: ${Object.keys(AVAILABLE_MODELS).filter(key => !AVAILABLE_MODELS[key].deprecated).join(', ')}`);
  console.log(`💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB used`);
  console.log(`🎯 Ready for voice commands: "Hey AURA"`);
}); 