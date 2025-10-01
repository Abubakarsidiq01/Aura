#!/usr/bin/env python3
"""
Aura Vision Assistant - Simplified Voice Version

A streamlined FastAPI server for image analysis with voice integration.
Simplified interface: Upload image → Voice analysis → Voice response

How to run:
$ uvicorn main_voice_simple:app --reload --port 8001

Visit http://127.0.0.1:8001/ to use the web interface.
"""

import os
import uuid
import base64
import requests
from datetime import datetime
from typing import Dict, Any, Optional
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables from .env file
load_dotenv()

# Import our custom modules
from voice_manager import voice_manager

# Initialize FastAPI app
app = FastAPI(title="Aura Simplified Voice Vision Assistant", version="3.0.0")

# Add CORS middleware to allow frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Pydantic models for request/response
class VapiWebhookRequest(BaseModel):
    message: Dict[str, Any]

class VapiWebhookResponse(BaseModel):
    result: str

class VoiceQueryRequest(BaseModel):
    query: str
    image_id: Optional[str] = None

class VoiceQueryResponse(BaseModel):
    response: str
    audio_url: Optional[str] = None

class ImageUploadResponse(BaseModel):
    image_id: str
    message: str
    filename: str

class AnalyzeImageRequest(BaseModel):
    image_id: str
    query: str
    voice_response: bool = True

class AnalyzeImageResponse(BaseModel):
    description: str
    image_id: str
    audio_url: Optional[str] = None

# Global storage (in production, use Redis/database)
image_storage = {}

# API Keys from environment variables
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
VAPI_API_KEY = os.getenv('VAPI_API_KEY')

if not GEMINI_API_KEY:
    raise Exception("GEMINI_API_KEY not found in environment variables or .env file")

async def analyze_image_with_gemini(image_data: bytes, query: str) -> str:
    """
    Send image and query to Google Gemini API for analysis.
    Optimized for voice responses.
    """
    try:
        if not GEMINI_API_KEY:
            raise Exception("GEMINI_API_KEY not found in environment variables")
        
        # Encode image to base64
        image_base64 = base64.b64encode(image_data).decode('utf-8')
        
        # Prepare the request payload for Gemini
        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": f"Please describe what you see in this image. The user is asking: '{query}'. Provide a clear, conversational description that would be helpful when spoken aloud. Keep it concise but informative, as this will be converted to speech."
                        },
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": image_base64
                            }
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.4,
                "topK": 32,
                "topP": 1,
                "maxOutputTokens": 1024,
            }
        }
        
        headers = {
            "Content-Type": "application/json",
        }
        
        params = {
            "key": GEMINI_API_KEY
        }
        
        print(f"🔍 Analyzing image with voice query: '{query}'")
        response = requests.post(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
            headers=headers, params=params, json=payload, timeout=30
        )
        
        if response.status_code != 200:
            print(f"⚠️  Gemini API returned status {response.status_code}: {response.text}")
            return f"I can see you're asking about your surroundings. The image analysis service is currently having some issues, but I can help you with other questions. Your query was: '{query}'"
        
        data = response.json()
        
        # Extract the description from Gemini's response
        if 'candidates' in data and len(data['candidates']) > 0:
            candidate = data['candidates'][0]
            if 'content' in candidate and 'parts' in candidate['content']:
                parts = candidate['content']['parts']
                if len(parts) > 0 and 'text' in parts[0]:
                    description = parts[0]['text']
                    print(f"✅ Voice-optimized analysis complete: {len(description)} characters")
                    return description
        
        # Fallback if response structure is unexpected
        print(f"⚠️  Unexpected Gemini response structure: {data}")
        return "I can see the image, but I'm having trouble providing a detailed description right now."
        
    except Exception as e:
        print(f"❌ Error analyzing image with Gemini: {e}")
        return f"I can see you're asking about your surroundings. There was a temporary issue with the image analysis service. Your query was: '{query}'. Please try again in a moment."

async def process_voice_query(request: VoiceQueryRequest) -> VoiceQueryResponse:
    """
    Process a voice query with Gemini AI.
    If image_id is provided, analyze that specific image.
    Otherwise, provide a general response.
    """
    try:
        if request.image_id and request.image_id in image_storage:
            # Analyze specific image
            image_info = image_storage[request.image_id]
            response_text = await analyze_image_with_gemini(image_info["data"], request.query)
        else:
            # General response without image
            response_text = f"I understand you're asking: '{request.query}'. To help you with image analysis, please upload an image first and then ask your question."
        
        # Generate voice response if voice is enabled
        audio_url = None
        if voice_manager.is_voice_enabled():
            try:
                # Try main TTS method
                audio_url = await voice_manager.generate_tts(response_text)
                if not audio_url:
                    # Try fallback TTS method
                    print("🔄 Main TTS failed, trying fallback...")
                    audio_url = await voice_manager.generate_tts_fallback(response_text)
                print(f"🎤 Voice response generated: {audio_url}")
            except Exception as e:
                print(f"⚠️  Voice generation failed: {e}")
        
        return VoiceQueryResponse(
            response=response_text,
            audio_url=audio_url
        )
        
    except Exception as e:
        print(f"❌ Error processing voice query: {e}")
        return VoiceQueryResponse(
            response=f"Sorry, I encountered an error processing your request: {str(e)}",
            audio_url=None
        )

@app.get("/ping")
def ping():
    """Health check endpoint."""
    return JSONResponse(content={
        "message": "pong",
        "voice_enabled": voice_manager.is_voice_enabled(),
        "gemini_enabled": bool(GEMINI_API_KEY),
        "version": "3.0.0 (simplified)"
    })

@app.post("/voice/query", response_model=VoiceQueryResponse)
async def voice_query(request: VoiceQueryRequest):
    """Process voice queries with optional image analysis."""
    return await process_voice_query(request)

@app.post("/webhook/vapi", response_model=VapiWebhookResponse)
async def vapi_webhook(request: VapiWebhookRequest):
    """
    Handle Vapi webhook for voice interactions.
    Simplified to work without session management.
    """
    try:
        print(f"🎤 Received Vapi webhook: {request.message}")
        
        # Extract the latest message from Vapi
        message = request.message
        if "type" in message and message["type"] == "function-call":
            # Handle function call from Vapi
            function_call = message.get("functionCall", {})
            function_name = function_call.get("name", "")
            
            if function_name == "analyze_image":
                # Extract parameters
                parameters = function_call.get("parameters", {})
                query = parameters.get("query", "What do you see in this image?")
                image_id = parameters.get("image_id")
                
                # Process the query
                voice_response = await process_voice_query(VoiceQueryRequest(
                    query=query,
                    image_id=image_id
                ))
                
                return VapiWebhookResponse(result=voice_response.response)
            
            elif function_name == "upload_image":
                # Handle image upload via voice
                parameters = function_call.get("parameters", {})
                image_url = parameters.get("image_url")
                
                if image_url:
                    # Download and store image
                    response = requests.get(image_url)
                    if response.status_code == 200:
                        image_id = str(uuid.uuid4())
                        image_storage[image_id] = {
                            "data": response.content,
                            "filename": f"voice_upload_{image_id}.jpg",
                            "content_type": "image/jpeg",
                            "size": len(response.content),
                            "uploaded_at": datetime.now()
                        }
                        return VapiWebhookResponse(result=f"Image uploaded successfully with ID: {image_id}")
                    else:
                        return VapiWebhookResponse(result="Sorry, I couldn't download the image. Please try again.")
                else:
                    return VapiWebhookResponse(result="Please provide an image URL to upload.")
        
        elif "type" in message and message["type"] == "transcript":
            # Handle voice transcript
            transcript = message.get("transcript", "")
            if transcript:
                # Simple response for voice input
                response = f"I heard you say: '{transcript}'. To analyze an image, please upload one first and then ask your question."
                return VapiWebhookResponse(result=response)
        
        # Default response
        return VapiWebhookResponse(result="I'm here to help you analyze images. Please upload an image and ask your question.")
        
    except Exception as e:
        print(f"❌ Error in Vapi webhook: {e}")
        return VapiWebhookResponse(result="Sorry, I encountered an error processing your request.")

@app.post("/upload-image", response_model=ImageUploadResponse)
async def upload_image(image: UploadFile = File(...)):
    """
    Upload an image for analysis.
    Simplified - no session management required.
    """
    try:
        # Validate file type
        if not image.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Read image data
        image_data = await image.read()
        
        # Generate unique ID
        image_id = str(uuid.uuid4())
        
        # Store image
        image_storage[image_id] = {
            "data": image_data,
            "filename": image.filename,
            "content_type": image.content_type,
            "size": len(image_data),
            "uploaded_at": datetime.now()
        }
        
        print(f"📸 Image uploaded: {image_id} ({image.filename}, {len(image_data)} bytes)")
        
        return ImageUploadResponse(
            image_id=image_id,
            message="Image uploaded successfully",
            filename=image.filename
        )
        
    except Exception as e:
        print(f"❌ Error uploading image: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze-image", response_model=AnalyzeImageResponse)
async def analyze_image(request: AnalyzeImageRequest):
    """
    Analyze an uploaded image with optional voice response.
    Simplified - no session management required.
    """
    try:
        # Check if image exists
        if request.image_id not in image_storage:
            raise HTTPException(status_code=404, detail="Image not found")
        
        image_info = image_storage[request.image_id]
        
        # Analyze with Gemini
        description = await analyze_image_with_gemini(image_info["data"], request.query)
        
        # Generate voice response if requested
        audio_url = None
        if request.voice_response and voice_manager.is_voice_enabled():
            try:
                # Try main TTS method
                audio_url = await voice_manager.generate_tts(description)
                if not audio_url:
                    # Try fallback TTS method
                    print("🔄 Main TTS failed, trying fallback...")
                    audio_url = await voice_manager.generate_tts_fallback(description)
                print(f"🎤 Voice response generated: {audio_url}")
            except Exception as e:
                print(f"⚠️  Voice generation failed: {e}")
        
        return AnalyzeImageResponse(
            description=description,
            image_id=request.image_id,
            audio_url=audio_url
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error analyzing image: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/image/{image_id}")
async def get_image(image_id: str):
    """Get image information."""
    image_info = image_storage.get(image_id)
    if not image_info:
        raise HTTPException(status_code=404, detail="Image not found")
    return JSONResponse(content={
        "image_id": image_id,
        "filename": image_info["filename"],
        "content_type": image_info["content_type"],
        "size": image_info["size"],
        "uploaded_at": image_info["uploaded_at"].isoformat()
    })

@app.get("/", response_class=HTMLResponse)
async def web_interface():
    """Simplified web interface focused on image upload and voice analysis."""
    return HTMLResponse(content="""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Aura Simplified Voice Vision Assistant</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * { box-sizing: border-box; }
            body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                max-width: 800px; 
                margin: 0 auto; 
                padding: 20px; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
            }
            .container { 
                background: white; 
                padding: 30px; 
                border-radius: 15px; 
                box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            }
            h1 { 
                text-align: center; 
                color: #333; 
                margin-bottom: 30px;
                font-size: 2.5em;
            }
            .section { 
                background: #f8f9fa; 
                padding: 25px; 
                border-radius: 10px; 
                margin: 25px 0; 
                border-left: 4px solid #667eea;
            }
            .section h2 { 
                color: #333; 
                margin-top: 0;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            button { 
                background: linear-gradient(45deg, #667eea, #764ba2); 
                color: white; 
                border: none; 
                padding: 12px 25px; 
                border-radius: 8px; 
                cursor: pointer; 
                font-size: 16px;
                font-weight: 500;
                transition: transform 0.2s;
            }
            button:hover { 
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(0,0,0,0.2);
            }
            button:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none;
            }
            input, textarea { 
                width: 100%; 
                padding: 12px; 
                margin: 8px 0; 
                border: 2px solid #e9ecef; 
                border-radius: 8px; 
                font-size: 16px;
                transition: border-color 0.3s;
            }
            input:focus, textarea:focus {
                outline: none;
                border-color: #667eea;
            }
            .status { 
                padding: 15px; 
                margin: 15px 0; 
                border-radius: 8px; 
                font-weight: 500;
            }
            .success { 
                background: #d4edda; 
                color: #155724; 
                border: 1px solid #c3e6cb;
            }
            .error { 
                background: #f8d7da; 
                color: #721c24; 
                border: 1px solid #f5c6cb;
            }
            .info {
                background: #d1ecf1;
                color: #0c5460;
                border: 1px solid #bee5eb;
            }
            .voice-toggle {
                display: flex;
                align-items: center;
                gap: 10px;
                margin: 15px 0;
            }
            .toggle-switch {
                position: relative;
                display: inline-block;
                width: 60px;
                height: 34px;
            }
            .toggle-switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: #ccc;
                transition: .4s;
                border-radius: 34px;
            }
            .slider:before {
                position: absolute;
                content: "";
                height: 26px;
                width: 26px;
                left: 4px;
                bottom: 4px;
                background-color: white;
                transition: .4s;
                border-radius: 50%;
            }
            input:checked + .slider {
                background-color: #667eea;
            }
            input:checked + .slider:before {
                transform: translateX(26px);
            }
            .upload-area {
                border: 2px dashed #667eea;
                border-radius: 10px;
                padding: 40px;
                text-align: center;
                margin: 15px 0;
                transition: all 0.3s;
                cursor: pointer;
            }
            .upload-area:hover {
                background: #f8f9fa;
                border-color: #764ba2;
            }
            .upload-area.dragover {
                background: #e3f2fd;
                border-color: #2196f3;
            }
            .hidden {
                display: none;
            }
            .audio-player {
                margin: 15px 0;
                width: 100%;
            }
            .loading {
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 3px solid #f3f3f3;
                border-top: 3px solid #667eea;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🎤 Aura Voice Vision Assistant</h1>
            <p style="text-align: center; color: #666; margin-bottom: 30px;">
                Upload an image and ask questions with voice responses
            </p>
            
            <div class="section">
                <h2>📸 Upload Image</h2>
                <div class="upload-area" onclick="document.getElementById('imageFile').click()">
                    <p>Click to select an image or drag and drop</p>
                    <input type="file" id="imageFile" accept="image/*" class="hidden">
                </div>
                <button onclick="uploadImage()" id="uploadBtn">Upload Image</button>
                <div id="uploadStatus"></div>
            </div>
            
            <div class="section">
                <h2>🔍 Analyze Image</h2>
                <textarea id="query" placeholder="Ask about the image..." rows="3"></textarea>
                
                <div class="voice-toggle">
                    <label class="toggle-switch">
                        <input type="checkbox" id="voiceToggle" checked>
                        <span class="slider"></span>
                    </label>
                    <span>🎤 Voice Response</span>
                </div>
                
                <button onclick="analyzeImage()" id="analyzeBtn">Analyze Image</button>
                <div id="analysisStatus"></div>
            </div>
        </div>
        
        <script>
            let currentImageId = null;
            
            // Drag and drop functionality
            const uploadArea = document.querySelector('.upload-area');
            const imageFile = document.getElementById('imageFile');
            
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('dragover');
            });
            
            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('dragover');
            });
            
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    imageFile.files = files;
                    updateUploadArea();
                }
            });
            
            imageFile.addEventListener('change', updateUploadArea);
            
            function updateUploadArea() {
                const file = imageFile.files[0];
                if (file) {
                    uploadArea.innerHTML = `<p>Selected: ${file.name}</p>`;
                } else {
                    uploadArea.innerHTML = `<p>Click to select an image or drag and drop</p>`;
                }
            }
            
            async function uploadImage() {
                const file = imageFile.files[0];
                if (!file) {
                    showStatus('uploadStatus', 'Please select an image first', 'error');
                    return;
                }
                
                const uploadBtn = document.getElementById('uploadBtn');
                uploadBtn.disabled = true;
                uploadBtn.innerHTML = '<span class="loading"></span> Uploading...';
                
                const formData = new FormData();
                formData.append('image', file);
                
                try {
                    const response = await fetch('/upload-image', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    const data = await response.json();
                    currentImageId = data.image_id;
                    
                    showStatus('uploadStatus', `✅ Image uploaded successfully! Ready to analyze.`, 'success');
                    
                    // Auto-focus on query input
                    document.getElementById('query').focus();
                    
                } catch (error) {
                    showStatus('uploadStatus', `❌ Upload failed: ${error.message}`, 'error');
                } finally {
                    uploadBtn.disabled = false;
                    uploadBtn.innerHTML = 'Upload Image';
                }
            }
            
            async function analyzeImage() {
                const imageId = currentImageId;
                const query = document.getElementById('query').value;
                const voiceResponse = document.getElementById('voiceToggle').checked;
                
                if (!imageId) {
                    showStatus('analysisStatus', 'Please upload an image first', 'error');
                    return;
                }
                
                if (!query.trim()) {
                    showStatus('analysisStatus', 'Please enter a question about the image', 'error');
                    return;
                }
                
                const analyzeBtn = document.getElementById('analyzeBtn');
                analyzeBtn.disabled = true;
                analyzeBtn.innerHTML = '<span class="loading"></span> Analyzing...';
                
                try {
                    const response = await fetch('/analyze-image', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            image_id: imageId,
                            query: query,
                            voice_response: voiceResponse
                        })
                    });
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    const data = await response.json();
                    
                    let result = `<div class="status success"><strong>Analysis:</strong> ${data.description}</div>`;
                    
                    if (data.audio_url && voiceResponse) {
                        result += `<audio controls class="audio-player"><source src="${data.audio_url}" type="audio/mpeg">Your browser does not support audio.</audio>`;
                    }
                    
                    showStatus('analysisStatus', result, 'success');
                    
                } catch (error) {
                    showStatus('analysisStatus', `❌ Analysis failed: ${error.message}`, 'error');
                } finally {
                    analyzeBtn.disabled = false;
                    analyzeBtn.innerHTML = 'Analyze Image';
                }
            }
            
            function showStatus(elementId, message, type) {
                const element = document.getElementById(elementId);
                if (type === 'success' || type === 'error' || type === 'info') {
                    element.innerHTML = `<div class="status ${type}">${message}</div>`;
                } else {
                    element.innerHTML = message;
                }
            }
            
            // Enter key to analyze
            document.getElementById('query').addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    analyzeImage();
                }
            });
        </script>
    </body>
    </html>
    """)

@app.get("/api-info")
def api_info():
    """Get API information."""
    return JSONResponse(content={
        "name": "Aura Simplified Voice Vision Assistant",
        "version": "3.0.0",
        "description": "Streamlined voice-powered image analysis",
        "features": {
            "voice_input": voice_manager.is_voice_enabled(),
            "voice_output": voice_manager.is_voice_enabled(),
            "image_analysis": bool(GEMINI_API_KEY),
            "simplified_interface": True
        },
        "endpoints": {
            "images": [
                "POST /upload-image - Upload image",
                "POST /analyze-image - Analyze image with voice response",
                "GET /image/{image_id} - Get image info"
            ],
            "voice": [
                "POST /voice/query - Process voice queries",
                "POST /webhook/vapi - Vapi webhook handler"
            ],
            "web": [
                "GET / - Simplified web interface",
                "GET /ping - Health check"
            ]
        },
        "voice_enabled": voice_manager.is_voice_enabled(),
        "gemini_enabled": bool(GEMINI_API_KEY)
    })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001) 