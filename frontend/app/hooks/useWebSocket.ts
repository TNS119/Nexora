"use client";

import { useEffect, useRef, useState } from "react";

export default function useWebSocket(url: string) {
  const socket = useRef<WebSocket | null>(null);

  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);

  useEffect(() => {
    socket.current = new WebSocket(url);

    socket.current.onopen = () => {
      setConnected(true);
      console.log("WebSocket Connected");
    };

    socket.current.onclose = () => {
      setConnected(false);
      console.log("WebSocket Closed");
    };

    socket.current.onerror = (err) => {
      console.error(err);
    };

    socket.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
      } catch {
        console.log(event.data);
      }
    };

    return () => {
      socket.current?.close();
    };
  }, [url]);

  const send = (data: Blob | string) => {
    if (
      socket.current &&
      socket.current.readyState === WebSocket.OPEN
    ) {
      socket.current.send(data);
    }
  };

  return {
    connected,
    lastMessage,
    send,
  };
}