using System;
using System.IO;
using UnityEngine;

public static class WavUtility
{
    public static byte[] FromAudioClip(AudioClip clip)
    {
        if (clip == null)
            throw new ArgumentNullException("clip");

        float[] samples = new float[clip.samples * clip.channels];
        clip.GetData(samples, 0);

        return ConvertToWav(samples, clip.channels, clip.frequency);
    }

    private static byte[] ConvertToWav(float[] samples, int channels, int sampleRate)
    {
        using (MemoryStream stream = new MemoryStream())
        {
            int byteRate = sampleRate * channels * 2; // 16-bit audio
            int subChunk2Size = samples.Length * 2;
            int chunkSize = 36 + subChunk2Size;

            // Write WAV header
            WriteString(stream, "RIFF");
            WriteInt(stream, chunkSize);
            WriteString(stream, "WAVE");

            // fmt subchunk
            WriteString(stream, "fmt ");
            WriteInt(stream, 16); // Subchunk1Size (16 for PCM)
            WriteShort(stream, 1); // AudioFormat (1 = PCM)
            WriteShort(stream, (short)channels);
            WriteInt(stream, sampleRate);
            WriteInt(stream, byteRate);
            WriteShort(stream, (short)(channels * 2)); // BlockAlign
            WriteShort(stream, 16); // BitsPerSample

            // data subchunk
            WriteString(stream, "data");
            WriteInt(stream, subChunk2Size);

            // Write sample data
            foreach (float sample in samples)
            {
                short intSample = (short)(Mathf.Clamp(sample, -1f, 1f) * short.MaxValue);
                byte[] byteData = BitConverter.GetBytes(intSample);
                stream.Write(byteData, 0, byteData.Length);
            }

            return stream.ToArray();
        }
    }

    private static void WriteString(Stream stream, string s)
    {
        byte[] bytes = System.Text.Encoding.ASCII.GetBytes(s);
        stream.Write(bytes, 0, bytes.Length);
    }

    private static void WriteInt(Stream stream, int value)
    {
        byte[] bytes = BitConverter.GetBytes(value);
        stream.Write(bytes, 0, bytes.Length);
    }

    private static void WriteShort(Stream stream, short value)
    {
        byte[] bytes = BitConverter.GetBytes(value);
        stream.Write(bytes, 0, bytes.Length);
    }
}
