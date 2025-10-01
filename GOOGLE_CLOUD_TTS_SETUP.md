# Google Cloud Text-to-Speech Setup Guide

This guide will help you set up Google Cloud Text-to-Speech (TTS) for your Aura Voice-First Vision Assistant.

## 🎯 Overview

Google Cloud TTS provides high-quality, natural-sounding speech synthesis with support for multiple voices, languages, and speech styles. This replaces the Vapi TTS functionality that wasn't working.

## 📋 Prerequisites

1. **Google Cloud Account**: You need a Google Cloud account
2. **Google Cloud Project**: Create or use an existing project
3. **Billing Enabled**: Enable billing on your project (TTS has usage costs)
4. **Python Environment**: Your existing Python environment

## 🚀 Step-by-Step Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your **Project ID** (you'll need this later)

### 2. Enable Text-to-Speech API

1. In Google Cloud Console, go to **APIs & Services** > **Library**
2. Search for "Cloud Text-to-Speech API"
3. Click on it and press **Enable**

### 3. Create Service Account

1. Go to **IAM & Admin** > **Service Accounts**
2. Click **Create Service Account**
3. Fill in:
   - **Name**: `aura-tts-service`
   - **Description**: `Service account for Aura TTS functionality`
4. Click **Create and Continue**
5. For **Role**, select:
   - **Cloud Text-to-Speech User**
   - **Cloud Text-to-Speech Admin** (if you need to manage voices)
6. Click **Continue** and then **Done**

### 4. Generate Service Account Key

1. Click on your newly created service account
2. Go to **Keys** tab
3. Click **Add Key** > **Create New Key**
4. Choose **JSON** format
5. Click **Create**
6. The JSON file will download automatically

### 5. Set Up Credentials

1. **Rename** the downloaded JSON file to `google-credentials.json`
2. **Move** it to your project root directory (`C:\Users\HP\aura-backend\`)
3. **Important**: Add `google-credentials.json` to your `.gitignore` file to keep it secure

### 6. Install Dependencies

Run this command to install Google Cloud TTS dependencies:

```bash
pip install google-cloud-texttospeech google-auth google-auth-oauthlib google-auth-httplib2
```

Or install all requirements:

```bash
pip install -r requirements.txt
```

### 7. Update Configuration

Edit `voice_manager.py` and update the project ID:

```python
def __init__(self):
    # Google Cloud TTS configuration
    self.project_id = "your-actual-project-id"  # Replace with your real project ID
    self.credentials_path = "google-credentials.json"
    self.voice_enabled = self._check_credentials()
```

## 🔧 Implementation Details

### Current Implementation

The current implementation includes:

1. **Credential Check**: Automatically detects if credentials are available
2. **Fallback TTS**: Creates demo files when Google Cloud TTS isn't configured
3. **Error Handling**: Graceful fallbacks when TTS fails
4. **Voice Options**: Support for different voices and languages

### Production Implementation

To use actual Google Cloud TTS, replace the `_generate_tts_fallback` method with:

```python
async def _generate_tts_google_cloud(self, text: str, voice: str) -> Optional[str]:
    """Generate TTS using Google Cloud TTS API."""
    try:
        from google.cloud import texttospeech
        from google.oauth2 import service_account
        
        # Load credentials
        credentials = service_account.Credentials.from_service_account_file(
            self.credentials_path
        )
        
        # Create TTS client
        client = texttospeech.TextToSpeechClient(credentials=credentials)
        
        # Configure synthesis input
        synthesis_input = texttospeech.SynthesisInput(text=text)
        
        # Configure voice
        voice_config = texttospeech.VoiceSelectionParams(
            language_code="en-US",
            name=voice,
            ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL
        )
        
        # Configure audio
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3
        )
        
        # Perform TTS
        response = client.synthesize_speech(
            input=synthesis_input,
            voice=voice_config,
            audio_config=audio_config
        )
        
        # Save audio file
        audio_id = str(uuid.uuid4())
        audio_filename = f"static/audio/{audio_id}.mp3"
        os.makedirs("static/audio", exist_ok=True)
        
        with open(audio_filename, "wb") as f:
            f.write(response.audio_content)
        
        audio_url = f"/static/audio/{audio_id}.mp3"
        return audio_url
        
    except Exception as e:
        print(f"❌ Google Cloud TTS error: {e}")
        return None
```

## 💰 Pricing

Google Cloud TTS pricing (as of 2024):
- **Standard voices**: $4.00 per 1 million characters
- **Neural2 voices**: $16.00 per 1 million characters
- **Studio voices**: $160.00 per 1 million characters

**Example**: 1000 characters ≈ $0.004 (Standard) or $0.016 (Neural2)

## 🎵 Available Voices

Google Cloud TTS offers many voices. Popular options:

### English (US)
- `en-US-Standard-A` (Female)
- `en-US-Standard-B` (Male)
- `en-US-Standard-C` (Female)
- `en-US-Standard-D` (Male)
- `en-US-Neural2-A` (Female, Neural)
- `en-US-Neural2-B` (Male, Neural)
- `en-US-Neural2-C` (Female, Neural)
- `en-US-Neural2-D` (Male, Neural)

### Other Languages
- `es-ES-Standard-A` (Spanish)
- `fr-FR-Standard-A` (French)
- `de-DE-Standard-A` (German)
- `ja-JP-Standard-A` (Japanese)
- And many more...

## 🧪 Testing

1. **Start your server**:
   ```bash
   python -m uvicorn main_voice:app --reload
   ```

2. **Test TTS**:
   - Upload an image
   - Ask a question
   - Check if audio is generated

3. **Check logs** for TTS status messages

## 🔒 Security Notes

- **Never commit** `google-credentials.json` to version control
- **Rotate keys** regularly
- **Use least privilege** - only grant necessary permissions
- **Monitor usage** to avoid unexpected charges

## 🆘 Troubleshooting

### Common Issues

1. **"Credentials not found"**
   - Ensure `google-credentials.json` is in the project root
   - Check file permissions

2. **"API not enabled"**
   - Enable Cloud Text-to-Speech API in Google Cloud Console

3. **"Billing not enabled"**
   - Enable billing on your Google Cloud project

4. **"Permission denied"**
   - Check service account roles
   - Ensure proper IAM permissions

### Getting Help

- [Google Cloud TTS Documentation](https://cloud.google.com/text-to-speech/docs)
- [Google Cloud Console](https://console.cloud.google.com/)
- [Google Cloud Support](https://cloud.google.com/support)

## 🎉 Next Steps

Once Google Cloud TTS is working:

1. **Customize voices** for different use cases
2. **Add language support** for international users
3. **Optimize costs** by choosing appropriate voice types
4. **Monitor usage** and set up billing alerts
5. **Add voice caching** to reduce API calls

---

**Happy TTS-ing! 🎤✨** 