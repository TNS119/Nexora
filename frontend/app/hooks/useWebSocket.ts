"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface BotMessage {
  threat_score?: number;
  acoustic_risk?: number;
  intent_risk?: number;
  alert?: boolean;
  transcript?: string;
}

export default function useWebSocket(url: string) {
  const socket = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number | null>(null);

  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<BotMessage | null>(null);

  const connect = useCallback(function connectSocket() {
    if (socket.current && socket.current.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = new WebSocket(url);
    socket.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log("WebSocket Connected");
    };

    ws.onclose = () => {
      setConnected(false);
      console.log("WebSocket Closed");
      reconnectTimeout.current = window.setTimeout(() => connectSocket(), 3000);
    };

    ws.onerror = (err: Event) => {
      console.error("WebSocket error", err);
      ws.close();
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data as BotMessage);
      } catch {
        console.log(event.data);
      }
    };
  }, [url]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      socket.current?.close();
    };
  }, [connect]);

  const send = (data: string | Blob | ArrayBufferLike | ArrayBufferView) => {
    if (socket.current && socket.current.readyState === WebSocket.OPEN) {
      socket.current.send(data as string | Blob | ArrayBufferLike);
    }
  };

  return {
    connected,
    lastMessage,
    send,
  } as const;
}