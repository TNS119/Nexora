"use client";

import { useEffect, useRef, useState } from "react";

export default function useMicrophone() {
  const [isRecording, setIsRecording] = useState(false);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioStream = useRef<MediaStream | null>(null);

  const startRecording = async (
    onChunk: (chunk: Blob) => void
  ) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      audioStream.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      mediaRecorder.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          onChunk(event.data);
        }
      };

      recorder.start(500);
      setIsRecording(true);
    } catch (error) {
      console.error("Microphone access denied", error);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    mediaRecorder.current = null;
    audioStream.current?.getTracks().forEach((track) => track.stop());
    audioStream.current = null;
    setIsRecording(false);
  };

  useEffect(() => {
    return () => {
      mediaRecorder.current?.stop();
      audioStream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
  };
}