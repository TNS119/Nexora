"use client";

import { useEffect } from "react";

import useMicrophone from "./hooks/useMicrophone";
import useWebSocket from "./hooks/useWebSocket";
import AlertModal from "../components/AlertModal";
import CallScreen from "../components/CallScreen";

export default function Home() {
  const ws = useWebSocket("ws://localhost:8000/ws/audio");
  const mic = useMicrophone();

  useEffect(() => {
    if (!ws.connected) return;

    mic.startRecording((chunk) => {
      ws.send(chunk);
    });

    return () => {
      mic.stopRecording();
    };
  }, [ws.connected]);

  return <CallScreen ws={ws} />;
}