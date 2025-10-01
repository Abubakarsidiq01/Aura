#!/usr/bin/env python3
"""
Voice Manager for Aura Vision Assistant

Handles:
- Text-to-Speech via Google Cloud TTS
- Voice query processing
- Session management for voice interactions
"""

import os
import base64
import json
import uuid
import asyncio
import aiohttp
from datetime import datetime
from typing import Dict, Any, Optional
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class GoogleCloudTTSManager:
    """Manages Google Cloud Text-to-Speech."""
    
    def __init__(self):
        # Get API key from environment variable
        self.api_key = os.getenv('GOOGLE_CLOUD_TTS_API_KEY')
        
        if not self.api_key:
            print("⚠️  GOOGLE_CLOUD_TTS_API_KEY not found in environment variables")
            print("📝 Please add GOOGLE_CLOUD_TTS_API_KEY to your .env file")
        else:
            print("✅ Google Cloud TTS API key available")
        
        # Check for service account credentials
        self.credentials_file = "google-credentials.json"
        if os.path.exists(self.credentials_file):
            print(f"✅ Google Cloud credentials found: {self.credentials_file}")
        else:
            print(f"⚠️  Google Cloud credentials not found: {self.credentials_file}")
            print("📝 Please download your service account key from Google Cloud Console")
            print("   and save it as 'google-credentials.json' in the project root")
    
    def is_voice_enabled(self) -> bool:
        """Check if voice functionality is enabled."""
        return bool(self.api_key)
    
    async def generate_tts(self, text: str, voice_name: str = "en-US-Standard-A") -> Optional[str]:
        """Generate TTS audio from text."""
        if not self.is_voice_enabled():
            print("🔇 Voice disabled - no Google Cloud credentials")
            return None
            
        try:
            # Try using Google Cloud TTS with service account
            from google.cloud import texttospeech
            
            # Set up credentials
            os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = self.credentials_file
            
            # Initialize TTS client
            client = texttospeech.TextToSpeechClient()
            
            # Configure the request
            synthesis_input = texttospeech.SynthesisInput(text=text)
            
            voice = texttospeech.VoiceSelectionParams(
                language_code="en-US",
                name=voice_name,
                ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL
            )
            
            audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3
            )
            
            # Perform TTS
            response = client.synthesize_speech(
                input=synthesis_input, voice=voice, audio_config=audio_config
            )
            
            # Save audio file
            audio_filename = f"tts_{uuid.uuid4().hex[:8]}.mp3"
            audio_path = f"static/audio/{audio_filename}"
            
            # Ensure directory exists
            os.makedirs("static/audio", exist_ok=True)
            
            with open(audio_path, "wb") as out:
                out.write(response.audio_content)
            
            print(f"🎵 TTS generated: {audio_filename}")
            return f"/static/audio/{audio_filename}"
            
        except Exception as e:
            print(f"❌ TTS generation failed: {e}")
            return None
    
    async def generate_tts_fallback(self, text: str) -> Optional[str]:
        """Fallback TTS using Google's TTS API with API key."""
        try:
            # Use Google Cloud TTS API with API key as query parameter
            print("🔄 Using Google Cloud TTS API fallback...")
            
            url = "https://texttospeech.googleapis.com/v1/text:synthesize"
            
            # API key as query parameter (not Bearer token)
            params = {
                "key": self.api_key
            }
            
            # Request body according to Google Cloud TTS API schema
            data = {
                "input": {
                    "text": text
                },
                "voice": {
                    "languageCode": "en-US",
                    "name": "en-US-Standard-A"
                },
                "audioConfig": {
                    "audioEncoding": "MP3",
                    "speakingRate": 1.0,
                    "pitch": 0.0
                }
            }
            
            print("📡 Making TTS API request to Google Cloud...")
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, params=params, json=data) as response:
                    print(f"📊 TTS API Response Status: {response.status}")
                    print(f"📊 TTS API Response Headers: {dict(response.headers)}")
                    
                    if response.status == 200:
                        response_data = await response.json()
                        
                        if "audioContent" in response_data:
                            # Decode base64 audio content
                            audio_content = base64.b64decode(response_data["audioContent"])
                            
                            # Save audio file
                            filename = f"tts_{uuid.uuid4().hex[:8]}.mp3"
                            audio_path = os.path.join("static", "audio", filename)
                            
                            # Ensure directory exists
                            os.makedirs(os.path.dirname(audio_path), exist_ok=True)
                            
                            with open(audio_path, "wb") as f:
                                f.write(audio_content)
                            
                            print(f"🎵 TTS generated successfully: {filename}")
                            return f"/static/audio/{filename}"
                        else:
                            print("❌ TTS API response missing audioContent")
                            return None
                    else:
                        print(f"❌ TTS API failed with status {response.status}")
                        error_text = await response.text()
                        print(f"❌ Error response: {error_text}")
                        return None
                        
        except Exception as e:
            print(f"❌ TTS fallback failed: {str(e)}")
            return None
    
    async def process_voice_query(self, session_id: str, query: str, image_analyzer_func) -> Dict[str, Any]:
        """Process a voice query and return response with audio."""
        try:
            # This will be called with the image analyzer function from main.py
            # For now, return a placeholder
            response_text = f"I received your voice query: '{query}' for session {session_id}. Image analysis will be integrated."
            
            # Generate audio response
            audio_url = await self.generate_tts(response_text)
            
            return {
                "response": response_text,
                "audio_url": audio_url,
                "session_id": session_id,
                "image_id": None
            }
            
        except Exception as e:
            print(f"❌ Voice query processing error: {e}")
            return {
                "response": "I'm sorry, I encountered an error processing your voice query. Please try again.",
                "audio_url": None,
                "session_id": session_id,
                "image_id": None
            }

# Initialize voice manager
voice_manager = GoogleCloudTTSManager() 