using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.Networking;
using WebSocketSharp;

public class AuraCameraHandlerWithWebSocket : MonoBehaviour
{
    [Header("Camera Settings")]
    public Camera captureCamera;
    public int resolutionWidth = 1280;
    public int resolutionHeight = 720;

    [Header("Backend Settings")]
    [SerializeField] private string backendURL = "http://10.56.138.85:8000/analyze_image"; // Configurable URL
    [SerializeField] private string websocketURL = "ws://10.56.138.85:8000/ws"; // Configurable WebSocket URL
    [SerializeField] private string speechToTextURL = "http://10.56.138.85:8000/transcribe"; // Configurable URL

    [Header("Audio Settings")]
    public AudioSource audioSource; // Reference to AudioSource component

    private OVRPassthroughLayer passthroughLayer;
    private WebSocket ws;
    private bool isRecording = false;
    private AudioClip recordedClip;
    private string microphoneDevice;
    private string currentSessionId;
    private bool isConnected = false;

    void Start()
    {
        // Initialize passthrough
        passthroughLayer = FindFirstObjectByType<OVRPassthroughLayer>();
        if (passthroughLayer != null)
        {
            passthroughLayer.enabled = true;
            Debug.Log("✅ Passthrough enabled.");
        }
        else
        {
            Debug.LogWarning("⚠️ OVRPassthroughLayer not found.");
        }

        // Initialize microphone
        if (Microphone.devices.Length > 0)
        {
            microphoneDevice = Microphone.devices[0];
            Debug.Log("🎤 Microphone found: " + microphoneDevice);
        }
        else
        {
            Debug.LogError("❌ No microphone devices found!");
        }

        // Initialize audio source
        if (audioSource == null)
        {
            audioSource = GetComponent<AudioSource>();
            if (audioSource == null)
            {
                audioSource = gameObject.AddComponent<AudioSource>();
            }
        }

        // Connect to WebSocket
        ConnectWebSocket();
    }

    private void ConnectWebSocket()
    {
        try
        {
            ws = new WebSocket(websocketURL);

            ws.OnMessage += (sender, e) =>
            {
                Debug.Log("📡 WebSocket message received: " + e.Data);

                try
                {
                    var payload = JsonUtility.FromJson<CaptureTrigger>(e.Data);
                    if (payload.command.ToLower() == "capture")
                    {
                        if (!isRecording)
                        {
                            isRecording = true;
                            StartCoroutine(StartVoiceCaptureAndImage(payload.prompt));
                        }
                    }
                }
                catch (Exception ex)
                {
                    Debug.LogError("❌ Failed to parse WebSocket message: " + ex.Message);
                }
            };

            ws.OnOpen += (sender, e) => 
            {
                Debug.Log("✅ WebSocket connected.");
                isConnected = true;
            };
            
            ws.OnError += (sender, e) => 
            {
                Debug.LogError("❌ WebSocket error: " + e.Message);
                isConnected = false;
            };
            
            ws.OnClose += (sender, e) => 
            {
                Debug.Log("🛑 WebSocket closed.");
                isConnected = false;
            };

            ws.ConnectAsync();
        }
        catch (Exception ex)
        {
            Debug.LogError("❌ Failed to connect WebSocket: " + ex.Message);
        }
    }

    private IEnumerator StartVoiceCaptureAndImage(string prompt)
    {
        Debug.Log("🎙️ Starting voice capture...");

        // Start microphone recording
        recordedClip = Microphone.Start(microphoneDevice, false, 5, 16000);
        yield return new WaitForSeconds(5);
        Microphone.End(microphoneDevice);

        // Save audio to file
        string filePath = Path.Combine(Application.persistentDataPath, "recorded.wav");
        SaveWav(filePath, recordedClip);

        // Read audio file and convert to base64
        byte[] audioBytes = File.ReadAllBytes(filePath);
        string audioBase64 = Convert.ToBase64String(audioBytes);
        string audioJson = JsonUtility.ToJson(new AudioRequest { audio = audioBase64 });

        // Send to speech-to-text service
        using (UnityWebRequest req = new UnityWebRequest(speechToTextURL, "POST"))
        {
            byte[] bodyRaw = System.Text.Encoding.UTF8.GetBytes(audioJson);
            req.uploadHandler = new UploadHandlerRaw(bodyRaw);
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");

            yield return req.SendWebRequest();

            if (req.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError("❌ Speech-to-text failed: " + req.error);
                // Continue with default prompt if transcription fails
                StartCoroutine(CaptureAndSend(prompt));
            }
            else
            {
                try
                {
                    var response = JsonUtility.FromJson<TranscriptionResponse>(req.downloadHandler.text);
                    string recognizedText = response.transcript;
                    Debug.Log("🎤 Transcribed text: " + recognizedText);
                    StartCoroutine(CaptureAndSend(recognizedText));
                }
                catch (Exception ex)
                {
                    Debug.LogError("❌ Failed to parse transcription response: " + ex.Message);
                    StartCoroutine(CaptureAndSend(prompt));
                }
            }
        }

        isRecording = false;
    }

    private IEnumerator CaptureAndSend(string prompt)
    {
        yield return new WaitForEndOfFrame();

        // Capture image from camera
        RenderTexture rt = new RenderTexture(resolutionWidth, resolutionHeight, 24);
        captureCamera.targetTexture = rt;
        Texture2D screenshot = new Texture2D(resolutionWidth, resolutionHeight, TextureFormat.RGB24, false);
        captureCamera.Render();
        RenderTexture.active = rt;
        screenshot.ReadPixels(new Rect(0, 0, resolutionWidth, resolutionHeight), 0, 0);
        screenshot.Apply();

        captureCamera.targetTexture = null;
        RenderTexture.active = null;
        Destroy(rt);

        // Convert to base64
        byte[] jpgBytes = screenshot.EncodeToJPG();
        string base64Image = Convert.ToBase64String(jpgBytes);

        ImageRequest data = new ImageRequest
        {
            image = base64Image,
            prompt = prompt
        };

        string jsonPayload = JsonUtility.ToJson(data);

        // Send to backend
        using (UnityWebRequest req = new UnityWebRequest(backendURL, "POST"))
        {
            byte[] bodyRaw = System.Text.Encoding.UTF8.GetBytes(jsonPayload);
            req.uploadHandler = new UploadHandlerRaw(bodyRaw);
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");

            yield return req.SendWebRequest();

            if (req.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError("❌ Failed to send image/prompt: " + req.error);
            }
            else
            {
                try
                {
                    var response = JsonUtility.FromJson<AnalysisResponse>(req.downloadHandler.text);
                    Debug.Log("✅ Image analysis complete!");
                    Debug.Log("📝 Description: " + response.description);
                    Debug.Log("🆔 Session ID: " + response.session_id);
                    Debug.Log("🆔 Image ID: " + response.image_id);
                    
                    currentSessionId = response.session_id;
                    
                    // Play audio response if available
                    if (!string.IsNullOrEmpty(response.audio_url))
                    {
                        Debug.Log("🔊 Audio URL: " + response.audio_url);
                        StartCoroutine(PlayAudioResponse(response.audio_url));
                    }
                }
                catch (Exception ex)
                {
                    Debug.LogError("❌ Failed to parse analysis response: " + ex.Message);
                    Debug.Log("Raw response: " + req.downloadHandler.text);
                }
            }
        }
    }

    private IEnumerator PlayAudioResponse(string audioUrl)
    {
        // Construct full URL if it's a relative path
        string fullUrl = audioUrl;
        if (audioUrl.StartsWith("/"))
        {
            fullUrl = backendURL.Replace("/analyze_image", "") + audioUrl;
        }

        Debug.Log("🎵 Playing audio from: " + fullUrl);

        using (UnityWebRequest audioRequest = UnityWebRequestMultimedia.GetAudioClip(fullUrl, AudioType.MPEG))
        {
            yield return audioRequest.SendWebRequest();

            if (audioRequest.result == UnityWebRequest.Result.Success)
            {
                AudioClip clip = DownloadHandlerAudioClip.GetContent(audioRequest);
                if (clip != null)
                {
                    audioSource.clip = clip;
                    audioSource.Play();
                    Debug.Log("✅ Audio playback started");
                }
                else
                {
                    Debug.LogError("❌ Failed to load audio clip");
                }
            }
            else
            {
                Debug.LogError("❌ Failed to download audio: " + audioRequest.error);
            }
        }
    }

    private void SaveWav(string filePath, AudioClip clip)
    {
        try
        {
            byte[] wavData = WavUtility.FromAudioClip(clip);
            File.WriteAllBytes(filePath, wavData);
            Debug.Log("💾 Audio saved to: " + filePath);
        }
        catch (Exception ex)
        {
            Debug.LogError("❌ Failed to save audio: " + ex.Message);
        }
    }

    void OnDestroy()
    {
        if (ws != null && ws.ReadyState == WebSocketState.Open)
        {
            ws.Close();
        }
    }

    // Public method to manually trigger capture (for testing)
    public void ManualCapture()
    {
        if (!isRecording)
        {
            StartCoroutine(CaptureAndSend("What do you see in this image?"));
        }
    }

    // Public method to check connection status
    public bool IsConnected()
    {
        return isConnected;
    }

    [Serializable]
    public class CaptureTrigger
    {
        public string command;
        public string prompt;
    }

    [Serializable]
    public class ImageRequest
    {
        public string image;
        public string prompt;
    }

    [Serializable]
    public class AudioRequest
    {
        public string audio;
    }

    [Serializable]
    public class TranscriptionResponse
    {
        public string transcript;
    }

    [Serializable]
    public class AnalysisResponse
    {
        public string description;
        public string image_id;
        public string session_id;
        public string audio_url;
        public string status;
    }
}