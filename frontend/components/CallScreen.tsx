"use client";

import { motion } from "framer-motion";
import {
  Phone,
  PhoneOff,
  ShieldCheck,
  Mic,
} from "lucide-react";

import {
  CircularProgressbar,
  buildStyles,
} from "react-circular-progressbar";

import { BotMessage } from "@/app/hooks/useWebSocket";

import "react-circular-progressbar/dist/styles.css";

interface WebSocketState {
  connected: boolean;
  lastMessage: BotMessage | null;
  send: (data: string | Blob | BufferSource) => void;
}

interface Props {
  ws: WebSocketState;
  isAnswered?: boolean;
  duration?: string;
  transcript?: string;
  isLive?: boolean;
  mode?: "live" | "scam";
  onModeChange?: (mode: "live" | "scam") => void;
  onAnswerCall?: () => void;
  onRejectCall?: () => void;
}

export default function CallScreen({
  ws,
  isAnswered = false,
  // duration = "00:00",
  transcript = "",
  isLive = false,
  mode = "live",
  onModeChange,
  onAnswerCall,
  onRejectCall,
}: Props) {
  const score = Number(ws?.lastMessage?.threat_score ?? 18);
  const voiceRisk = Number(ws?.lastMessage?.acoustic_risk ?? 0);
  const intentRisk = Number(ws?.lastMessage?.intent_risk ?? 0);
  const alert = Boolean(ws?.lastMessage?.alert ?? false);
  const isCallActive = Boolean(ws?.connected && isAnswered);

  const color =
    score < 40 ? "#22c55e" : score < 80 ? "#facc15" : "#ef4444";

  const status =
    score < 40 ? "SAFE" : score < 80 ? "WARNING" : "SCAM DETECTED";

  const liveStatus = isLive
    ? "LIVE"
    : ws.connected
    ? "CONNECTED"
    : "OFFLINE";

  const liveBadge = isLive
    ? "bg-emerald-500/20 text-emerald-200"
    : ws.connected
    ? "bg-sky-500/20 text-sky-200"
    : "bg-amber-500/20 text-amber-200";

  const waveformHeights = [28, 55, 42, 82, 63, 95, 58, 105, 46, 90, 54, 76, 48, 88];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.2),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.18),_transparent_30%),linear-gradient(135deg,_#020617_0%,_#030712_45%,_#02040a_100%)] px-3 py-3 sm:px-5 lg:px-8">
      <div className="relative mx-auto flex min-h-[calc(100vh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-cyan-400/15 bg-slate-950/70 p-4 shadow-[0_30px_90px_rgba(2,6,23,0.8)] backdrop-blur-xl sm:p-6 lg:min-h-[760px] lg:p-8">
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(34,211,238,0.05),transparent_35%,rgba(59,130,246,0.08),transparent_70%)]" />
        <div className="absolute -top-20 left-8 h-44 w-44 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-56 w-56 rounded-full bg-blue-600/10 blur-3xl" />

        <header className="relative mb-6 flex items-center justify-center text-center text-slate-300">
          <h1 className="text-3xl font-extrabold uppercase tracking-[0.2em] text-white sm:text-4xl">
            VoiceLock AI
          </h1>
        </header>

        <div className="flex-1 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:gap-8">
          <div className="relative flex flex-col items-center justify-center rounded-[28px] border border-white/10 bg-white/5 p-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm sm:p-6 lg:items-center lg:text-center lg:p-8">
            <motion.div
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="h-32 w-32 rounded-full bg-gradient-to-br from-cyan-400 to-blue-700 shadow-[0_0_70px_rgba(59,130,246,.45)] flex items-center justify-center text-6xl sm:h-36 sm:w-36 sm:text-7xl lg:h-44 lg:w-44"
            >
              👤
            </motion.div>

            <h1 className="mt-6 text-3xl font-bold text-white sm:text-4xl">
              Unknown Caller
            </h1>

            <p className="mt-2 text-base text-slate-400 sm:text-lg">+91 XXXXX XXXXX</p>

            <motion.div
              animate={{ opacity: [1, 0.6, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className={`mt-6 flex items-center gap-3 rounded-full border px-5 py-3 sm:px-6 ${
                isCallActive
                  ? "border-emerald-500/30 bg-emerald-500/15"
                  : "border-slate-500/30 bg-slate-500/10"
              }`}
            >
              <ShieldCheck
                className={isCallActive ? "text-emerald-400" : "text-slate-400"}
                size={20}
              />

              <span className={isCallActive ? "font-semibold text-emerald-400" : "font-semibold text-slate-300"}>
                {isCallActive ? "AI Protection Active" : "Waiting for call answer"}
              </span>
            </motion.div>

            <div className="mt-8 w-full max-w-xl">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div className="flex items-center justify-between rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
                  <span>
                    {isCallActive
                      ? "Live audio stream is active"
                      : "Audio signal will begin once the call is answered"}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      isCallActive ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-500/20 text-slate-300"
                    }`}
                  >
                    {isCallActive ? "LIVE" : "STANDBY"}
                  </span>
                </div>

                <div className="rounded-full border border-white/10 bg-slate-900/80 px-2 py-2 text-sm text-slate-300">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onModeChange?.("live")}
                      className={`rounded-full px-4 py-2 transition ${
                        mode === "live"
                          ? "bg-cyan-500 text-slate-950"
                          : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      Mode A
                    </button>
                    <button
                      type="button"
                      onClick={() => onModeChange?.("scam")}
                      className={`rounded-full px-4 py-2 transition ${
                        mode === "scam"
                          ? "bg-rose-500 text-slate-950"
                          : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      Mode B
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] uppercase tracking-[0.25em] text-slate-500">
                    {mode === "live"
                      ? "Mic stream"
                      : "Demo scam audio"}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex h-36 items-end justify-center gap-[7px] rounded-[24px] border border-white/10 bg-black/20 px-6 py-5 overflow-hidden sm:h-40 sm:px-8 sm:py-6 lg:h-44 lg:px-10 lg:py-8">
                {waveformHeights.map((height, index) => (
                  <motion.div
                    key={index}
                    initial={{ height }}
                    animate={isCallActive ? { height: [height, height + 12, height] } : { height }}
                    transition={{
                      repeat: isCallActive ? Infinity : 0,
                      duration: 0.8,
                      delay: index * 0.05,
                    }}
                    className={`w-[7px] rounded-full ${isCallActive ? "bg-cyan-400" : "bg-slate-500/70"}`}
                    style={{ height }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center justify-center gap-6 rounded-[28px] border border-white/10 bg-slate-950/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm sm:p-6 lg:mt-0 lg:p-8">
            <div className="h-44 w-44 sm:h-52 sm:w-52 lg:h-56 lg:w-56">
              <CircularProgressbar
                value={score}
                text={`${score}%`}
                styles={buildStyles({
                  pathColor: color,
                  textColor: color,
                  trailColor: "#1e293b",
                  strokeLinecap: "round",
                  textSize: "16px",
                })}
              />
            </div>

            <motion.h2
              animate={{ scale: [1, 1.03, 1] }}
              transition={{ repeat: Infinity, duration: 1.4 }}
              className="text-center text-2xl font-bold sm:text-3xl"
              style={{ color }}
            >
              {status}
            </motion.h2>

            <div className="flex items-center gap-3 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-5 py-3 text-sm sm:text-base">
              <Mic size={20} className={`text-cyan-400 ${isCallActive ? "animate-pulse" : ""}`} />
              <span className="font-medium text-cyan-300">
                {isCallActive ? "AI Listening..." : "Ready to listen"}
              </span>
            </div>

            <div className="grid w-full max-w-sm grid-cols-2 gap-3 sm:gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
                <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">Voice Risk</p>
                <p className="mt-1 text-xl font-semibold text-cyan-300">{voiceRisk.toFixed(0)}%</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
                <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">Intent Risk</p>
                <p className="mt-1 text-xl font-semibold text-amber-300">{intentRisk.toFixed(0)}%</p>
              </div>
            </div>

            <div className="flex w-full max-w-sm items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Alert Status</p>
                <p className="mt-1 text-lg font-semibold text-white">{alert ? "ALERT" : "CLEAR"}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${alert ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300"}`}>
                {alert ? "ALERT" : "CLEAR"}
              </span>
            </div>

            <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-slate-900/70 p-4 text-left text-slate-300 shadow-lg shadow-slate-950/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Transcript Feed</p>
                  <p className="mt-2 text-sm text-slate-200">
                    {isCallActive ? "Live insights from recent audio." : "Awaiting call..."}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${liveBadge}`}>
                  {liveStatus}
                </span>
              </div>

              <div className="mt-4 space-y-3 max-h-56 overflow-y-auto pr-2 text-sm leading-6 text-slate-300">
                {isCallActive ? (
                  transcript ? (
                    transcript.split("\n\n").map((line, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="rounded-2xl bg-slate-950/90 p-3 text-slate-200"
                      >
                        {line}
                      </motion.div>
                    ))
                  ) : (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="rounded-2xl bg-slate-950/90 p-3 text-slate-500"
                    >
                      Listening to audio...
                    </motion.p>
                  )
                ) : (
                  <p className="rounded-2xl bg-slate-950/90 p-3 text-slate-500">
                    Answer the call to see live insights.
                  </p>
                )}
              </div>
            </div>

            <div className="grid w-full max-w-sm grid-cols-2 gap-4 sm:gap-6">
              <motion.button
                whileTap={{ scale: 0.94 }}
                whileHover={{ scale: 1.03 }}
                onClick={onRejectCall}
                className="flex h-16 items-center justify-center rounded-full bg-red-600 shadow-[0_0_30px_rgba(239,68,68,.45)] sm:h-20"
              >
                <PhoneOff size={30} className="text-white" />
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.94 }}
                whileHover={{ scale: 1.03 }}
                onClick={onAnswerCall}
                className="flex h-16 items-center justify-center rounded-full bg-green-600 shadow-[0_0_30px_rgba(34,197,94,.45)] sm:h-20"
              >
                <Phone size={30} className="text-white" />
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}