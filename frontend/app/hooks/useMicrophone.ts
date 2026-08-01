"use client";

import { useEffect, useRef, useState } from "react";

export default function useMicrophone() {
  const [isRecording, setIsRecording] = useState(false);

  const mediaRecorder = useRef<MediaRecorder | null>(null);

  const startRecording = async (
    onChunk: (chunk: Blob) => void
  ) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

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
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    setIsRecording(false);
  };

  useEffect(() => {
    return () => {
      mediaRecorder.current?.stop();
    };
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
  };
}