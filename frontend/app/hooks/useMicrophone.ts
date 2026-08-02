"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export default function useMicrophone() {
  const [isRecording, setIsRecording] = useState(false);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioStream = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async (
    onChunk: (chunk: Blob) => void
  ) => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Microphone access is unavailable. If you're on a mobile device or network IP, use HTTPS or switch to 'Mode B - Demo'.");
        setIsRecording(false);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      audioStream.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });

      mediaRecorder.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          onChunk(event.data);
        }
      };

      recorder.start(500); // 500 ms slices
      setIsRecording(true);
    } catch (error) {
      console.error("[VoiceLock] Microphone access denied or unavailable:", error);
      setIsRecording(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorder.current?.stop();
    mediaRecorder.current = null;
    audioStream.current?.getTracks().forEach((track) => track.stop());
    audioStream.current = null;
    setIsRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      mediaRecorder.current?.stop();
      audioStream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return useMemo(() => ({
    isRecording,
    startRecording,
    stopRecording,
  }), [isRecording, startRecording, stopRecording]);
}