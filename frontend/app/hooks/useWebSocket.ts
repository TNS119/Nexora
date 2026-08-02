"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface BotMessage {
  threat_score?: number;
  acoustic_risk?: number;
  intent_risk?: number;
  alert?: boolean;
  transcript?: string;
  triggers?: string[];
}

export type WsStatus = "connected" | "reconnecting" | "disconnected";

export default function useWebSocket(url: string) {
  const socket = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>("disconnected");
  const [lastMessage, setLastMessage] = useState<BotMessage | null>(null);
  const [chunksSent, setChunksSent] = useState(0);
  const [payloadsReceived, setPayloadsReceived] = useState(0);
  const chunksSentRef = useRef(0);

  const connect = useCallback(
    function connectSocket() {
      if (socket.current && socket.current.readyState === WebSocket.OPEN) {
        return;
      }
      setWsStatus("reconnecting");
      const ws = new WebSocket(url);
      socket.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setWsStatus("connected");
        console.log("[VoiceLock] WebSocket connected");
      };

      ws.onclose = () => {
        setConnected(false);
        setWsStatus("reconnecting");
        // Clear stale score data on disconnect so the UI doesn't keep showing
        // a leftover threat_score from before the drop.
        setLastMessage(null);
        console.warn("[VoiceLock] WebSocket closed — reconnecting in 3s");
        reconnectTimeout.current = window.setTimeout(() => connectSocket(), 3000);
      };

      ws.onerror = (err: Event) => {
        console.error("[VoiceLock] WebSocket error", err);
        setWsStatus("disconnected");
        ws.close();
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data as string);
          console.log("[VoiceLock] ws message received:", data);
          setLastMessage(data as BotMessage);
          setPayloadsReceived((n) => n + 1);
        } catch {
          console.log("[VoiceLock] non-JSON ws message:", event.data);
        }
      };
    },
    [url]
  );

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      socket.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: string | Blob | BufferSource) => {
    if (socket.current && socket.current.readyState === WebSocket.OPEN) {
      socket.current.send(data);
      chunksSentRef.current += 1;
      setChunksSent(chunksSentRef.current);
    }
  }, []);

  // IMPORTANT: this now also clears lastMessage. Previously it only reset the
  // counters, so a new call would start by rendering the *previous* call's
  // last threat_score (e.g. from a prior test) before any new audio had been
  // scored — which looked exactly like "meter shows max % without speaking."
  const resetCounters = useCallback(() => {
    chunksSentRef.current = 0;
    setChunksSent(0);
    setPayloadsReceived(0);
    setLastMessage(null);
  }, []);

  return {
    connected,
    wsStatus,
    lastMessage,
    chunksSent,
    payloadsReceived,
    send,
    resetCounters,
  } as const;
}



// "use client";

// import { useCallback, useEffect, useRef, useState } from "react";

// export interface BotMessage {
//   threat_score?: number;
//   acoustic_risk?: number;
//   intent_risk?: number;
//   alert?: boolean;
//   transcript?: string;
//   triggers?: string[];
// }

// export type WsStatus = "connected" | "reconnecting" | "disconnected";

// export default function useWebSocket(url: string) {
//   const socket = useRef<WebSocket | null>(null);
//   const reconnectTimeout = useRef<number | null>(null);

//   const [connected, setConnected] = useState(false);
//   const [wsStatus, setWsStatus] = useState<WsStatus>("disconnected");
//   const [lastMessage, setLastMessage] = useState<BotMessage | null>(null);
//   const [chunksSent, setChunksSent] = useState(0);
//   const [payloadsReceived, setPayloadsReceived] = useState(0);

//   const chunksSentRef = useRef(0);

//   const connect = useCallback(function connectSocket() {
//     if (socket.current && socket.current.readyState === WebSocket.OPEN) {
//       return;
//     }

//     setWsStatus("reconnecting");

//     const ws = new WebSocket(url);
//     socket.current = ws;

//     ws.onopen = () => {
//       setConnected(true);
//       setWsStatus("connected");
//       console.log("WebSocket Connected");
//     };

//     ws.onclose = () => {
//       setConnected(false);
//       setWsStatus("reconnecting");
//       console.warn("WebSocket Closed — scheduling reconnect in 3 s");
//       console.assert(false, "[VoiceLock] WebSocket dropped. Reconnecting…");
//       reconnectTimeout.current = window.setTimeout(() => connectSocket(), 3000);
//     };

//     ws.onerror = (err: Event) => {
//       console.error("WebSocket error", err);
//       setWsStatus("disconnected");
//       ws.close();
//     };

//     ws.onmessage = (event: MessageEvent) => {
//       try {
//         const data = JSON.parse(event.data as string);
//         setLastMessage(data as BotMessage);
//         setPayloadsReceived((n) => n + 1);
//       } catch {
//         console.log(event.data);
//       }
//     };
//   }, [url]);

//   useEffect(() => {
//     connect();

//     return () => {
//       if (reconnectTimeout.current) {
//         clearTimeout(reconnectTimeout.current);
//       }
//       socket.current?.close();
//     };
//   }, [connect]);

//   const send = useCallback((data: string | Blob | BufferSource) => {
//     if (socket.current && socket.current.readyState === WebSocket.OPEN) {
//       socket.current.send(data);
//       chunksSentRef.current += 1;
//       setChunksSent(chunksSentRef.current);
//     }
//   }, []);

//   const resetCounters = useCallback(() => {
//     chunksSentRef.current = 0;
//     setChunksSent(0);
//     setPayloadsReceived(0);
//   }, []);

//   return {
//     connected,
//     wsStatus,
//     lastMessage,
//     chunksSent,
//     payloadsReceived,
//     send,
//     resetCounters,
//   } as const;
// }
