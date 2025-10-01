using NativeWebSocket;
using UnityEngine;

public class AuraWebSocket : MonoBehaviour
{
    private WebSocket websocket;

    async void Start()
    {
        websocket = new WebSocket("ws://<YOUR-IP>:8000/ws");

        websocket.OnOpen += () =>
        {
            Debug.Log("✅ WebSocket Connection Opened");
            // Send wake word after connection opens
            websocket.SendText("Aura");
            Debug.Log("📤 Sent 'Aura' to backend");
        };

        websocket.OnError += (e) =>
        {
            Debug.LogError("❌ WebSocket Error: " + e);
        };

        websocket.OnClose += (e) =>
        {
            Debug.Log("🔌 WebSocket Closed with code: " + e);
        };

        websocket.OnMessage += (bytes) =>
        {
            var message = System.Text.Encoding.UTF8.GetString(bytes);
            Debug.Log("📩 Message from server: " + message);
        };

        await websocket.Connect();
    }

    void Update()
    {
        websocket.DispatchMessageQueue();  // Required in Unity for receiving messages
    }

    private async void OnApplicationQuit()
    {
        await websocket.Close();
    }
}
