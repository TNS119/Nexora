"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import useMicrophone from "./hooks/useMicrophone";
import useWebSocket from "./hooks/useWebSocket";
import CallScreen from "../components/CallScreen";

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i += 1) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function createSampleSegment(
  sourceBuffer: AudioBuffer,
  startSample: number,
  endSample: number,
  context: AudioContext
) {
  const numberOfChannels = sourceBuffer.numberOfChannels;
  const segmentLength = endSample - startSample;
  const segment = context.createBuffer(
    numberOfChannels,
    segmentLength,
    sourceBuffer.sampleRate
  );

  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    const channelData = sourceBuffer.getChannelData(channel).slice(
      startSample,
      endSample
    );
    segment.copyToChannel(channelData, channel, 0);
  }

  return segment;
}

function encodeWav(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const sampleLength = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteLength = 44 + sampleLength * blockAlign;
  const arrayBuffer = new ArrayBuffer(byteLength);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleLength * blockAlign, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, sampleLength * blockAlign, true);

  let offset = 44;
  for (let i = 0; i < sampleLength; i += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(
        -1,
        Math.min(1, buffer.getChannelData(channel)[i])
      );
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      );
      offset += 2;
    }
  }

  return arrayBuffer;
}

export default function Home() {
  const ws = useWebSocket("ws://localhost:8000/ws/audio");
  const mic = useMicrophone();
  const [isAnswered, setIsAnswered] = useState(false);
  const [demoMode, setDemoMode] = useState<"live" | "scam">("live");
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [duration, setDuration] = useState("00:00");
  const [transcriptFeed, setTranscriptFeed] = useState<string[]>([]);
  const [sampleActive, setSampleActive] = useState(false);
  const [recognitionActive, setRecognitionActive] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sampleBufferRef = useRef<AudioBuffer | null>(null);
  const sampleIntervalRef = useRef<number | null>(null);
  const sampleIndexRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const loadSampleAudio = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    if (sampleBufferRef.current) {
      return sampleBufferRef.current;
    }

    const response = await fetch("/sample_ai_scam.wav");
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
    sampleBufferRef.current = audioBuffer;
    return audioBuffer;
  }, []);

  const stopSampleStreaming = useCallback(() => {
    if (sampleIntervalRef.current !== null) {
      window.clearInterval(sampleIntervalRef.current);
      sampleIntervalRef.current = null;
    }
    sampleIndexRef.current = 0;
    setSampleActive(false);
  }, []);

  const startSampleStreaming = useCallback(async () => {
    if (!ws.connected) {
      return;
    }

    const buffer = await loadSampleAudio();
    const chunkSize = Math.floor(buffer.sampleRate * 0.5);
    const totalChunks = Math.ceil(buffer.length / chunkSize);

    setSampleActive(true);
    sampleIndexRef.current = 0;

    const sendNextChunk = () => {
      if (sampleIndexRef.current >= totalChunks) {
        stopSampleStreaming();
        return;
      }

      const start = sampleIndexRef.current * chunkSize;
      const end = Math.min(buffer.length, start + chunkSize);
      const segment = createSampleSegment(
        buffer,
        start,
        end,
        audioContextRef.current!
      );
      const wavBytes = encodeWav(segment);
      ws.send(wavBytes);
      sampleIndexRef.current += 1;
    };

    sendNextChunk();
    sampleIntervalRef.current = window.setInterval(sendNextChunk, 500);
  }, [loadSampleAudio, stopSampleStreaming, ws]);

  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      transcript = transcript.trim();
      if (!transcript) return;

      setTranscriptFeed((current) => {
        const lastTranscript = current[current.length - 1];
        if (lastTranscript === transcript) {
          return current;
        }
        return [...current, transcript].slice(-6);
      });
    };

    recognition.onerror = () => {
      setRecognitionActive(false);
    };

    recognition.onend = () => {
      setRecognitionActive(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setRecognitionActive(true);
  }, []);

  const stopSpeechRecognition = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setRecognitionActive(false);
  }, []);

  useEffect(() => {
    const tearDownStreaming = () => {
      window.setTimeout(() => {
        stopSampleStreaming();
        mic.stopRecording();
        stopSpeechRecognition();
      }, 0);
    };

    if (!isAnswered || !ws.connected) {
      tearDownStreaming();
      return;
    }

    if (demoMode === "live") {
      tearDownStreaming();
      window.setTimeout(() => {
        mic.startRecording((chunk) => {
          ws.send(chunk);
        });
        startSpeechRecognition();
      }, 0);
    } else {
      window.setTimeout(() => {
        mic.stopRecording();
        stopSpeechRecognition();
        void startSampleStreaming();
      }, 0);
    }

    return () => {
      tearDownStreaming();
    };
  }, [demoMode, isAnswered, mic, startSampleStreaming, startSpeechRecognition, stopSampleStreaming, stopSpeechRecognition, ws]);

  useEffect(() => {
    if (!isAnswered || callStartTime === null) {
      window.setTimeout(() => {
        setDuration("00:00");
      }, 0);
      return;
    }

    const interval = window.setInterval(() => {
      setDuration(formatDuration((Date.now() - callStartTime) / 1000));
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isAnswered, callStartTime]);

  useEffect(() => {
    const transcript = ws.lastMessage?.transcript?.trim();
    if (!transcript || !isAnswered) return;

    window.setTimeout(() => {
      setTranscriptFeed((current) => {
        const lastTranscript = current[current.length - 1];
        if (lastTranscript === transcript) {
          return current;
        }
        return [...current, transcript].slice(-6);
      });
    }, 0);
  }, [ws.lastMessage?.transcript, isAnswered]);

  const handleAnswerCall = () => {
    setIsAnswered(true);
    setCallStartTime(Date.now());
    if (demoMode === "live") {
      startSpeechRecognition();
    }
  };

  const handleRejectCall = () => {
    mic.stopRecording();
    stopSpeechRecognition();
    stopSampleStreaming();
    setIsAnswered(false);
    setCallStartTime(null);
    setDuration("00:00");
    setTranscriptFeed([]);
  };

  const isStreaming =
    isAnswered &&
    ws.connected &&
    (demoMode === "live" ? (mic.isRecording || recognitionActive) : sampleActive);

  const transcript = transcriptFeed.length
    ? transcriptFeed.join("\n\n")
    : ws.lastMessage?.transcript ?? "";

  return (
    <CallScreen
      ws={ws}
      isAnswered={isAnswered}
      duration={duration}
      transcript={transcript}
      isLive={isStreaming}
      mode={demoMode}
      onModeChange={setDemoMode}
      onAnswerCall={handleAnswerCall}
      onRejectCall={handleRejectCall}
    />
  );
}
