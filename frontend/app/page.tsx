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
    const channelData = sourceBuffer
      .getChannelData(channel)
      .slice(startSample, endSample);
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
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

// ─── WS URL resolution ───────────────────────────────────────────────
// IMPORTANT: never build ws:// against a deployed https:// host — browsers
// block that as mixed content and the socket silently fails to connect.
const FALLBACK_RENDER_WS = "wss://nexora-unf8.onrender.com/ws/audio";
const envWsUrl = process.env.NEXT_PUBLIC_WS_URL || FALLBACK_RENDER_WS;

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const [wsUrl, setWsUrl] = useState(envWsUrl);

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== "undefined") {
      const isLocalhost =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";

      const resolvedUrl = isLocalhost ? "ws://localhost:8000/ws/audio" : envWsUrl;
      console.log("[VoiceLock] Resolved WS URL:", resolvedUrl);
      setWsUrl(resolvedUrl);
    }
  }, []);

  const ws = useWebSocket(wsUrl);
  const mic = useMicrophone();
  const [isAnswered, setIsAnswered] = useState(false);
  const [demoMode, setDemoMode] = useState<"live" | "scam">("live");
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [sampleActive, setSampleActive] = useState(false);
  const [recognitionActive, setRecognitionActive] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sampleBufferRef = useRef<AudioBuffer | null>(null);
  const sampleIntervalRef = useRef<number | null>(null);
  const sampleIndexRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const wsSendRef = useRef(ws.send);
  useEffect(() => {
    wsSendRef.current = ws.send;
  }, [ws.send]);

  const wsConnectedRef = useRef(ws.connected);
  useEffect(() => {
    console.log("[VoiceLock] ws.connected ->", ws.connected);
    wsConnectedRef.current = ws.connected;
  }, [ws.connected]);

  const loadSampleAudio = useCallback(async () => {
    if (!audioContextRef.current) {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextCtor();
    }

    if (sampleBufferRef.current) {
      return sampleBufferRef.current;
    }

    const response = await fetch("/sample_ai_scam.wav");
    if (!response.ok) {
      console.warn(
        "[VoiceLock] Failed to load /sample_ai_scam.wav — check the public directory."
      );
      throw new Error("sample_ai_scam.wav not found");
    }
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
    sampleBufferRef.current = audioBuffer;
    return audioBuffer;
  }, []);

  const audioPlayPromiseRef = useRef<Promise<void> | null>(null);

  const stopSampleStreaming = useCallback(() => {
    if (sampleIntervalRef.current !== null) {
      window.clearInterval(sampleIntervalRef.current);
      sampleIntervalRef.current = null;
    }
    sampleIndexRef.current = 0;
    setSampleActive(false);

    const el = audioElRef.current;
    if (el) {
      const p = audioPlayPromiseRef.current;
      if (p) {
        p.then(() => {
          el.pause();
          el.currentTime = 0;
        }).catch(() => {});
        audioPlayPromiseRef.current = null;
      } else {
        el.pause();
        el.currentTime = 0;
      }
    }
  }, []);

  const startSampleStreaming = useCallback(async () => {
    if (!wsConnectedRef.current) {
      console.warn("[VoiceLock] startSampleStreaming aborted: WS not connected");
      return;
    }

    let buffer: AudioBuffer;
    try {
      buffer = await loadSampleAudio();
    } catch {
      return;
    }

    if (audioElRef.current) {
      audioElRef.current.src = "/sample_ai_scam.wav";
      audioPlayPromiseRef.current = audioElRef.current.play();
      audioPlayPromiseRef.current.catch((err) => {
        console.warn("[VoiceLock] Audio element play() failed:", err);
        audioPlayPromiseRef.current = null;
      });
    }

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
      const segment = createSampleSegment(buffer, start, end, audioContextRef.current!);
      const wavBytes = encodeWav(segment);
      console.log("[VoiceLock] sending WAV chunk", sampleIndexRef.current, wavBytes.byteLength, "bytes");
      wsSendRef.current(wavBytes);
      sampleIndexRef.current += 1;
    };

    sendNextChunk();
    sampleIntervalRef.current = window.setInterval(sendNextChunk, 500);
  }, [loadSampleAudio, stopSampleStreaming]);

  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      console.warn("[VoiceLock] SpeechRecognition API not available in this browser");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;

    // NOTE: this previously discarded every result. Left as a visible log so you
    // can confirm recognition itself is firing. If your backend scores threat
    // from transcript text (not just raw audio), this is where you'd wsSendRef
    // the transcript as JSON, matching whatever message shape the backend expects.
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const latest = event.results[event.resultIndex]?.[0]?.transcript;
      if (latest) {
        console.log("[VoiceLock] speech recognized:", latest);
      }
    };

    recognition.onerror = () => {
      console.warn("[VoiceLock] SpeechRecognition error");
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
    if (isAnswered) {
      ws.resetCounters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnswered]);

  useEffect(() => {
    const tearDownStreaming = () => {
      stopSampleStreaming();
      mic.stopRecording();
      stopSpeechRecognition();
    };

    if (!isAnswered || !ws.connected) {
      tearDownStreaming();
      return;
    }

    if (demoMode === "live") {
      tearDownStreaming();
      mic.startRecording((chunk) => {
        console.log(
          "[VoiceLock] mic chunk ->",
          chunk instanceof Blob ? `${chunk.type}, ${chunk.size} bytes` : chunk
        );
        wsSendRef.current(chunk);
      });
      startSpeechRecognition();
    } else {
      mic.stopRecording();
      stopSpeechRecognition();
      void startSampleStreaming();
    }

    return () => {
      tearDownStreaming();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    demoMode,
    isAnswered,
    ws.connected,
    startSampleStreaming,
    startSpeechRecognition,
    stopSampleStreaming,
    stopSpeechRecognition,
  ]);

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
  };

  const isStreaming =
    isAnswered &&
    ws.connected &&
    (demoMode === "live" ? mic.isRecording || recognitionActive : sampleActive);

  if (!isMounted) {
    return <div className="min-h-screen bg-black" />;
  }

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioElRef}
        style={{ display: "none" }}
        onEnded={() => {
          stopSampleStreaming();
          setIsAnswered(false);
          setCallStartTime(null);
        }}
      />

      <CallScreen
        ws={ws}
        isAnswered={isAnswered}
        isLive={isStreaming}
        mode={demoMode}
        onModeChange={setDemoMode}
        onAnswerCall={handleAnswerCall}
        onRejectCall={handleRejectCall}
      />
    </>
  );
}








// "use client";

// import { useCallback, useEffect, useRef, useState } from "react";

// import useMicrophone from "./hooks/useMicrophone";
// import useWebSocket from "./hooks/useWebSocket";
// import CallScreen from "../components/CallScreen";

// type SpeechRecognitionEventLike = {
//   resultIndex: number;
//   results: ArrayLike<ArrayLike<{ transcript: string }>>;
// };

// type SpeechRecognitionLike = {
//   lang: string;
//   interimResults: boolean;
//   continuous: boolean;
//   onresult: ((event: SpeechRecognitionEventLike) => void) | null;
//   onerror: (() => void) | null;
//   onend: (() => void) | null;
//   start: () => void;
//   stop: () => void;
// };

// declare global {
//   interface Window {
//     SpeechRecognition?: new () => SpeechRecognitionLike;
//     webkitSpeechRecognition?: new () => SpeechRecognitionLike;
//   }
// }

// function writeString(view: DataView, offset: number, string: string) {
//   for (let i = 0; i < string.length; i += 1) {
//     view.setUint8(offset + i, string.charCodeAt(i));
//   }
// }

// function createSampleSegment(
//   sourceBuffer: AudioBuffer,
//   startSample: number,
//   endSample: number,
//   context: AudioContext
// ) {
//   const numberOfChannels = sourceBuffer.numberOfChannels;
//   const segmentLength = endSample - startSample;
//   const segment = context.createBuffer(
//     numberOfChannels,
//     segmentLength,
//     sourceBuffer.sampleRate
//   );

//   for (let channel = 0; channel < numberOfChannels; channel += 1) {
//     const channelData = sourceBuffer.getChannelData(channel).slice(
//       startSample,
//       endSample
//     );
//     segment.copyToChannel(channelData, channel, 0);
//   }

//   return segment;
// }

// function encodeWav(buffer: AudioBuffer) {
//   const channels = buffer.numberOfChannels;
//   const sampleRate = buffer.sampleRate;
//   const sampleLength = buffer.length;
//   const bytesPerSample = 2;
//   const blockAlign = channels * bytesPerSample;
//   const byteLength = 44 + sampleLength * blockAlign;
//   const arrayBuffer = new ArrayBuffer(byteLength);
//   const view = new DataView(arrayBuffer);

//   writeString(view, 0, "RIFF");
//   view.setUint32(4, 36 + sampleLength * blockAlign, true);
//   writeString(view, 8, "WAVE");
//   writeString(view, 12, "fmt ");
//   view.setUint32(16, 16, true);
//   view.setUint16(20, 1, true);
//   view.setUint16(22, channels, true);
//   view.setUint32(24, sampleRate, true);
//   view.setUint32(28, sampleRate * blockAlign, true);
//   view.setUint16(32, blockAlign, true);
//   view.setUint16(34, 16, true);
//   writeString(view, 36, "data");
//   view.setUint32(40, sampleLength * blockAlign, true);

//   let offset = 44;
//   for (let i = 0; i < sampleLength; i += 1) {
//     for (let channel = 0; channel < channels; channel += 1) {
//       const sample = Math.max(
//         -1,
//         Math.min(1, buffer.getChannelData(channel)[i])
//       );
//       view.setInt16(
//         offset,
//         sample < 0 ? sample * 0x8000 : sample * 0x7fff,
//         true
//       );
//       offset += 2;
//     }
//   }

//   return arrayBuffer;
// }

// const FALLBACK_RENDER_WS = "wss://nexora-unf8.onrender.com/ws/audio";
// const envWsUrl = process.env.NEXT_PUBLIC_WS_URL || FALLBACK_RENDER_WS;

// export default function Home() {
//   const [isMounted, setIsMounted] = useState(false);
//   const [wsUrl, setWsUrl] = useState(envWsUrl);

//   useEffect(() => {
//     setIsMounted(true);
//     if (typeof window !== "undefined") {
//       const isLocalhost = Boolean(
//         window.location.hostname === "localhost" ||
//         window.location.hostname === "127.0.0.1"
//       );

//       if (isLocalhost) {
//         setWsUrl("ws://localhost:8000/ws/audio");
//       } else {
//         setWsUrl(envWsUrl);
//       }
//     }
//   }, []);

//   const ws = useWebSocket(wsUrl);
//   const mic = useMicrophone();
//   const [isAnswered, setIsAnswered] = useState(false);
//   const [demoMode, setDemoMode] = useState<"live" | "scam">("live");
//   const [callStartTime, setCallStartTime] = useState<number | null>(null);
//   const [sampleActive, setSampleActive] = useState(false);
//   const [recognitionActive, setRecognitionActive] = useState(false);

//   const audioContextRef = useRef<AudioContext | null>(null);
//   const sampleBufferRef = useRef<AudioBuffer | null>(null);
//   const sampleIntervalRef = useRef<number | null>(null);
//   const sampleIndexRef = useRef(0);
//   const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

//   // ─── Mode-B: HTML audio element ref for playback ───────────────────────────
//   const audioElRef = useRef<HTMLAudioElement | null>(null);

//   const wsSendRef = useRef(ws.send);
//   useEffect(() => {
//     wsSendRef.current = ws.send;
//   }, [ws.send]);

//   const wsConnectedRef = useRef(ws.connected);
//   useEffect(() => {
//     wsConnectedRef.current = ws.connected;
//   }, [ws.connected]);

//   const loadSampleAudio = useCallback(async () => {
//     if (!audioContextRef.current) {
//       const AudioContextCtor =
//         window.AudioContext || (window as any).webkitAudioContext;
//       audioContextRef.current = new AudioContextCtor();
//     }

//     if (sampleBufferRef.current) {
//       return sampleBufferRef.current;
//     }

//     const response = await fetch("/sample_ai_scam.wav");
//     if (!response.ok) {
//       console.warn(
//         "[VoiceLock] Failed to load /sample_ai_scam.wav — check the public directory."
//       );
//       console.assert(
//         false,
//         "[VoiceLock] sample_ai_scam.wav fetch failed with status " +
//           response.status
//       );
//       throw new Error("sample_ai_scam.wav not found");
//     }
//     const arrayBuffer = await response.arrayBuffer();
//     const audioBuffer = await audioContextRef.current.decodeAudioData(
//       arrayBuffer
//     );
//     sampleBufferRef.current = audioBuffer;
//     return audioBuffer;
//   }, []);

//   const audioPlayPromiseRef = useRef<Promise<void> | null>(null);

//   const stopSampleStreaming = useCallback(() => {
//     if (sampleIntervalRef.current !== null) {
//       window.clearInterval(sampleIntervalRef.current);
//       sampleIntervalRef.current = null;
//     }
//     sampleIndexRef.current = 0;
//     setSampleActive(false);

//     const el = audioElRef.current;
//     if (el) {
//       const p = audioPlayPromiseRef.current;
//       if (p) {
//         p.then(() => {
//           el.pause();
//           el.currentTime = 0;
//         }).catch(() => {});
//         audioPlayPromiseRef.current = null;
//       } else {
//         el.pause();
//         el.currentTime = 0;
//       }
//     }
//   }, []);

//   const startSampleStreaming = useCallback(async () => {
//     if (!wsConnectedRef.current) {
//       return;
//     }

//     let buffer: AudioBuffer;
//     try {
//       buffer = await loadSampleAudio();
//     } catch {
//       return;
//     }

//     if (audioElRef.current) {
//       audioElRef.current.src = "/sample_ai_scam.wav";
//       audioPlayPromiseRef.current = audioElRef.current.play();
//       audioPlayPromiseRef.current.catch((err) => {
//         console.warn("[VoiceLock] Audio element play() failed:", err);
//         audioPlayPromiseRef.current = null;
//       });
//     }

//     const chunkSize = Math.floor(buffer.sampleRate * 0.5);
//     const totalChunks = Math.ceil(buffer.length / chunkSize);

//     setSampleActive(true);
//     sampleIndexRef.current = 0;

//     const sendNextChunk = () => {
//       if (sampleIndexRef.current >= totalChunks) {
//         stopSampleStreaming();
//         return;
//       }

//       const start = sampleIndexRef.current * chunkSize;
//       const end = Math.min(buffer.length, start + chunkSize);
//       const segment = createSampleSegment(
//         buffer,
//         start,
//         end,
//         audioContextRef.current!
//       );
//       const wavBytes = encodeWav(segment);
//       wsSendRef.current(wavBytes);
//       sampleIndexRef.current += 1;
//     };

//     sendNextChunk();
//     sampleIntervalRef.current = window.setInterval(sendNextChunk, 500);
//   }, [loadSampleAudio, stopSampleStreaming]);

//   const startSpeechRecognition = useCallback(() => {
//     const SpeechRecognitionCtor =
//       window.SpeechRecognition || window.webkitSpeechRecognition;
//     if (!SpeechRecognitionCtor) {
//       return;
//     }

//     const recognition = new SpeechRecognitionCtor();
//     recognition.lang = "en-US";
//     recognition.interimResults = true;
//     recognition.continuous = true;

//     recognition.onresult = (event: SpeechRecognitionEventLike) => {
//       void event;
//     };

//     recognition.onerror = () => {
//       setRecognitionActive(false);
//     };

//     recognition.onend = () => {
//       setRecognitionActive(false);
//     };

//     recognition.start();
//     recognitionRef.current = recognition;
//     setRecognitionActive(true);
//   }, []);

//   const stopSpeechRecognition = useCallback(() => {
//     recognitionRef.current?.stop();
//     recognitionRef.current = null;
//     setRecognitionActive(false);
//   }, []);

//   useEffect(() => {
//     if (isAnswered) {
//       ws.resetCounters();
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [isAnswered]);

//   useEffect(() => {
//     const tearDownStreaming = () => {
//       stopSampleStreaming();
//       mic.stopRecording();
//       stopSpeechRecognition();
//     };

//     if (!isAnswered || !ws.connected) {
//       tearDownStreaming();
//       return;
//     }

//     if (demoMode === "live") {
//       tearDownStreaming();
//       mic.startRecording((chunk) => {
//         wsSendRef.current(chunk);
//       });
//       startSpeechRecognition();
//     } else {
//       mic.stopRecording();
//       stopSpeechRecognition();
//       void startSampleStreaming();
//     }

//     return () => {
//       tearDownStreaming();
//     };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [
//     demoMode,
//     isAnswered,
//     ws.connected,
//     startSampleStreaming,
//     startSpeechRecognition,
//     stopSampleStreaming,
//     stopSpeechRecognition,
//   ]);

//   const handleAnswerCall = () => {
//     setIsAnswered(true);
//     setCallStartTime(Date.now());
//     if (demoMode === "live") {
//       startSpeechRecognition();
//     }
//   };

//   const handleRejectCall = () => {
//     mic.stopRecording();
//     stopSpeechRecognition();
//     stopSampleStreaming();
//     setIsAnswered(false);
//     setCallStartTime(null);
//   };

//   const isStreaming =
//     isAnswered &&
//     ws.connected &&
//     (demoMode === "live"
//       ? mic.isRecording || recognitionActive
//       : sampleActive);

//   // ── Prevent Server-Side Rendering (SSR) crashes in Vercel ──
//   if (!isMounted) {
//     return <div className="min-h-screen bg-black" />;
//   }

//   return (
//     <>
//       {/* Hidden audio element for Mode-B playback */}
//       {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
//       <audio
//         ref={audioElRef}
//         style={{ display: "none" }}
//         onEnded={() => {
//           stopSampleStreaming();
//           setIsAnswered(false);
//           setCallStartTime(null);
//         }}
//       />

//       <CallScreen
//         ws={ws}
//         isAnswered={isAnswered}
//         isLive={isStreaming}
//         mode={demoMode}
//         onModeChange={setDemoMode}
//         onAnswerCall={handleAnswerCall}
//         onRejectCall={handleRejectCall}
//       />
//     </>
//   );
// }










// "use client";

// import { useCallback, useEffect, useRef, useState } from "react";

// import useMicrophone from "./hooks/useMicrophone";
// import useWebSocket from "./hooks/useWebSocket";
// import CallScreen from "../components/CallScreen";

// type SpeechRecognitionEventLike = {
//   resultIndex: number;
//   results: ArrayLike<ArrayLike<{ transcript: string }>>;
// };

// type SpeechRecognitionLike = {
//   lang: string;
//   interimResults: boolean;
//   continuous: boolean;
//   onresult: ((event: SpeechRecognitionEventLike) => void) | null;
//   onerror: (() => void) | null;
//   onend: (() => void) | null;
//   start: () => void;
//   stop: () => void;
// };

// declare global {
//   interface Window {
//     SpeechRecognition?: new () => SpeechRecognitionLike;
//     webkitSpeechRecognition?: new () => SpeechRecognitionLike;
//   }
// }


// function writeString(view: DataView, offset: number, string: string) {
//   for (let i = 0; i < string.length; i += 1) {
//     view.setUint8(offset + i, string.charCodeAt(i));
//   }
// }

// function createSampleSegment(
//   sourceBuffer: AudioBuffer,
//   startSample: number,
//   endSample: number,
//   context: AudioContext
// ) {
//   const numberOfChannels = sourceBuffer.numberOfChannels;
//   const segmentLength = endSample - startSample;
//   const segment = context.createBuffer(
//     numberOfChannels,
//     segmentLength,
//     sourceBuffer.sampleRate
//   );

//   for (let channel = 0; channel < numberOfChannels; channel += 1) {
//     const channelData = sourceBuffer.getChannelData(channel).slice(
//       startSample,
//       endSample
//     );
//     segment.copyToChannel(channelData, channel, 0);
//   }

//   return segment;
// }

// function encodeWav(buffer: AudioBuffer) {
//   const channels = buffer.numberOfChannels;
//   const sampleRate = buffer.sampleRate;
//   const sampleLength = buffer.length;
//   const bytesPerSample = 2;
//   const blockAlign = channels * bytesPerSample;
//   const byteLength = 44 + sampleLength * blockAlign;
//   const arrayBuffer = new ArrayBuffer(byteLength);
//   const view = new DataView(arrayBuffer);

//   writeString(view, 0, "RIFF");
//   view.setUint32(4, 36 + sampleLength * blockAlign, true);
//   writeString(view, 8, "WAVE");
//   writeString(view, 12, "fmt ");
//   view.setUint32(16, 16, true);
//   view.setUint16(20, 1, true);
//   view.setUint16(22, channels, true);
//   view.setUint32(24, sampleRate, true);
//   view.setUint32(28, sampleRate * blockAlign, true);
//   view.setUint16(32, blockAlign, true);
//   view.setUint16(34, 16, true);
//   writeString(view, 36, "data");
//   view.setUint32(40, sampleLength * blockAlign, true);

//   let offset = 44;
//   for (let i = 0; i < sampleLength; i += 1) {
//     for (let channel = 0; channel < channels; channel += 1) {
//       const sample = Math.max(
//         -1,
//         Math.min(1, buffer.getChannelData(channel)[i])
//       );
//       view.setInt16(
//         offset,
//         sample < 0 ? sample * 0x8000 : sample * 0x7fff,
//         true
//       );
//       offset += 2;
//     }
//   }

//   return arrayBuffer;
// }

// export default function Home() {
//   const [wsUrl, setWsUrl] = useState("wss://nexora-unf8.onrender.com/ws/audio");

//   useEffect(() => {
//     if (typeof window !== "undefined") {
//       const host = window.location.hostname;
//       setWsUrl(`ws://${host}:8000/ws/audio`);
//     }
//   }, []);

//   const ws = useWebSocket(wsUrl);
//   const mic = useMicrophone();
//   const [isAnswered, setIsAnswered] = useState(false);
//   const [demoMode, setDemoMode] = useState<"live" | "scam">("live");
//   const [callStartTime, setCallStartTime] = useState<number | null>(null);
//   const [sampleActive, setSampleActive] = useState(false);
//   const [recognitionActive, setRecognitionActive] = useState(false);

//   const audioContextRef = useRef<AudioContext | null>(null);
//   const sampleBufferRef = useRef<AudioBuffer | null>(null);
//   const sampleIntervalRef = useRef<number | null>(null);
//   const sampleIndexRef = useRef(0);
//   const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

//   // ─── Mode-B: HTML audio element ref for playback ───────────────────────────
//   const audioElRef = useRef<HTMLAudioElement | null>(null);

//   // Stable send ref so streaming callbacks always call the current socket's send
//   // without needing ws in their dependency arrays.
//   const wsSendRef = useRef(ws.send);
//   useEffect(() => {
//     wsSendRef.current = ws.send;
//   }, [ws.send]);

//   const wsConnectedRef = useRef(ws.connected);
//   useEffect(() => {
//     wsConnectedRef.current = ws.connected;
//   }, [ws.connected]);

//   const loadSampleAudio = useCallback(async () => {
//     if (!audioContextRef.current) {
//       const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
//       audioContextRef.current = new AudioContextCtor();
//     }

//     if (sampleBufferRef.current) {
//       return sampleBufferRef.current;
//     }

//     const response = await fetch("/sample_ai_scam.wav");
//     if (!response.ok) {
//       console.warn("[VoiceLock] Failed to load /sample_ai_scam.wav — check the public directory.");
//       console.assert(false, "[VoiceLock] sample_ai_scam.wav fetch failed with status " + response.status);
//       throw new Error("sample_ai_scam.wav not found");
//     }
//     const arrayBuffer = await response.arrayBuffer();
//     const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
//     sampleBufferRef.current = audioBuffer;
//     return audioBuffer;
//   }, []);

//   // Track the in-flight play() promise so stopSampleStreaming can await it before pausing.
//   const audioPlayPromiseRef = useRef<Promise<void> | null>(null);

//   const stopSampleStreaming = useCallback(() => {
//     if (sampleIntervalRef.current !== null) {
//       window.clearInterval(sampleIntervalRef.current);
//       sampleIntervalRef.current = null;
//     }
//     sampleIndexRef.current = 0;
//     setSampleActive(false);

//     // Await any in-flight play() promise before pausing to prevent AbortError
//     const el = audioElRef.current;
//     if (el) {
//       const p = audioPlayPromiseRef.current;
//       if (p) {
//         p.then(() => { el.pause(); el.currentTime = 0; }).catch(() => {});
//         audioPlayPromiseRef.current = null;
//       } else {
//         el.pause();
//         el.currentTime = 0;
//       }
//     }
//   }, []);

//   const startSampleStreaming = useCallback(async () => {
//     if (!wsConnectedRef.current) {
//       return;
//     }

//     let buffer: AudioBuffer;
//     try {
//       buffer = await loadSampleAudio();
//     } catch {
//       return;
//     }

//     // ── Play the audio through the HTML <audio> element so the user can hear it ──
//     if (audioElRef.current) {
//       audioElRef.current.src = "/sample_ai_scam.wav";
//       audioPlayPromiseRef.current = audioElRef.current.play();
//       audioPlayPromiseRef.current.catch((err) => {
//         console.warn("[VoiceLock] Audio element play() failed:", err);
//         audioPlayPromiseRef.current = null;
//       });
//     }

//     const chunkSize = Math.floor(buffer.sampleRate * 0.5); // 500 ms worth of samples
//     const totalChunks = Math.ceil(buffer.length / chunkSize);

//     setSampleActive(true);
//     sampleIndexRef.current = 0;

//     const sendNextChunk = () => {
//       if (sampleIndexRef.current >= totalChunks) {
//         stopSampleStreaming();
//         return;
//       }

//       const start = sampleIndexRef.current * chunkSize;
//       const end = Math.min(buffer.length, start + chunkSize);
//       const segment = createSampleSegment(
//         buffer,
//         start,
//         end,
//         audioContextRef.current!
//       );
//       const wavBytes = encodeWav(segment);
//       // Use the ref so we always call the current stable send without deps
//       wsSendRef.current(wavBytes);
//       sampleIndexRef.current += 1;
//     };

//     sendNextChunk();
//     sampleIntervalRef.current = window.setInterval(sendNextChunk, 500);
//   }, [loadSampleAudio, stopSampleStreaming]);

//   const startSpeechRecognition = useCallback(() => {
//     const SpeechRecognitionCtor =
//       window.SpeechRecognition || window.webkitSpeechRecognition;
//     if (!SpeechRecognitionCtor) {
//       return;
//     }

//     const recognition = new SpeechRecognitionCtor();
//     recognition.lang = "en-US";
//     recognition.interimResults = true;
//     recognition.continuous = true;

//     recognition.onresult = (event: SpeechRecognitionEventLike) => {
//       // SpeechRecognition runs in Mode-A to drive the mic stream;
//       // transcript display has been removed so we just let it run silently.
//       void event;
//     };

//     recognition.onerror = () => {
//       setRecognitionActive(false);
//     };

//     recognition.onend = () => {
//       setRecognitionActive(false);
//     };

//     recognition.start();
//     recognitionRef.current = recognition;
//     setRecognitionActive(true);
//   }, []);

//   const stopSpeechRecognition = useCallback(() => {
//     recognitionRef.current?.stop();
//     recognitionRef.current = null;
//     setRecognitionActive(false);
//   }, []);

//   // ─── Reset counters when a new call starts ─────────────────────────────────
//   useEffect(() => {
//     if (isAnswered) {
//       ws.resetCounters();
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [isAnswered]);

//   useEffect(() => {
//     const tearDownStreaming = () => {
//       stopSampleStreaming();
//       mic.stopRecording();
//       stopSpeechRecognition();
//     };

//     if (!isAnswered || !ws.connected) {
//       tearDownStreaming();
//       return;
//     }

//     if (demoMode === "live") {
//       tearDownStreaming();
//       // Mode-A: request mic → MediaRecorder → stream 500 ms blobs over WS
//       mic.startRecording((chunk) => {
//         wsSendRef.current(chunk);
//       });
//       startSpeechRecognition();
//     } else {
//       mic.stopRecording();
//       stopSpeechRecognition();
//       // Mode-B: play audio element + stream WAV chunks over WS
//       void startSampleStreaming();
//     }

//     return () => {
//       tearDownStreaming();
//     };
//   // ws.connected is a primitive boolean — safe in deps. wsSendRef is a ref, not needed.
//   // mic object shouldn't be in deps to avoid infinite loops when isRecording toggles.
//   // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [demoMode, isAnswered, ws.connected, startSampleStreaming, startSpeechRecognition, stopSampleStreaming, stopSpeechRecognition]);


//   const handleAnswerCall = () => {
//     setIsAnswered(true);
//     setCallStartTime(Date.now());
//     if (demoMode === "live") {
//       startSpeechRecognition();
//     }
//   };

//   const handleRejectCall = () => {
//     mic.stopRecording();
//     stopSpeechRecognition();
//     stopSampleStreaming();
//     setIsAnswered(false);
//     setCallStartTime(null);
//   };

//   const isStreaming =
//     isAnswered &&
//     ws.connected &&
//     (demoMode === "live" ? (mic.isRecording || recognitionActive) : sampleActive);


//   return (
//     <>
//       {/* Hidden audio element for Mode-B playback */}
//       {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
//       <audio ref={audioElRef} style={{ display: "none" }} />

//       <CallScreen
//         ws={ws}
//         isAnswered={isAnswered}
//         isLive={isStreaming}
//         mode={demoMode}
//         onModeChange={setDemoMode}
//         onAnswerCall={handleAnswerCall}
//         onRejectCall={handleRejectCall}
//       />
//     </>
//   );
// }
