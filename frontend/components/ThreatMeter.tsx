"use client";

import { motion } from "framer-motion";
import {
  CircularProgressbar,
  buildStyles,
} from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import {
  ShieldAlert,
  ShieldCheck,
  Activity,
} from "lucide-react";

interface Props {
  ws: any;
}

export default function ThreatMeter({ ws }: Props) {
  const threatScore = Number(ws?.lastMessage?.threat_score ?? 22);

  const status =
    threatScore < 40
      ? "SAFE"
      : threatScore < 80
      ? "SUSPICIOUS"
      : "CRITICAL";

  const color =
    threatScore < 40
      ? "#22c55e"
      : threatScore < 80
      ? "#facc15"
      : "#ef4444";

  return (
    <motion.div
      initial={{ opacity: 0, y: 25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-[35px] border border-white/10 bg-white/10 backdrop-blur-2xl p-6 shadow-2xl"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">
            Threat Analysis
          </h2>

          <p className="text-slate-400 text-sm">
            Live AI Detection Engine
          </p>
        </div>

        <motion.div
          animate={{ rotate: 360 }}
          transition={{
            repeat: Infinity,
            duration: 6,
            ease: "linear",
          }}
        >
          <Activity
            size={30}
            className="text-cyan-400"
          />
        </motion.div>
      </div>

      <div className="w-56 h-56 mx-auto mt-8">
        <CircularProgressbar
          value={threatScore}
          text={`${threatScore}%`}
          styles={buildStyles({
            pathColor: color,
            trailColor: "#1e293b",
            textColor: color,
            textSize: "16px",
          })}
        />
      </div>

      <div className="mt-8 flex justify-center">
        <div
          className="flex items-center gap-3 rounded-full px-6 py-3"
          style={{
            background:
              threatScore < 40
                ? "rgba(34,197,94,.15)"
                : threatScore < 80
                ? "rgba(250,204,21,.15)"
                : "rgba(239,68,68,.15)",
          }}
        >
          {threatScore < 40 ? (
            <ShieldCheck
              className="text-green-400"
              size={22}
            />
          ) : (
            <ShieldAlert
              className={
                threatScore < 80
                  ? "text-yellow-400"
                  : "text-red-500"
              }
              size={22}
            />
          )}

          <span
            className="font-bold text-lg"
            style={{ color }}
          >
            {status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-8">
        <div className="rounded-2xl bg-slate-900/60 p-4 text-center">
          <p className="text-slate-400 text-xs">
            Acoustic
          </p>

          <h3 className="text-cyan-400 font-bold text-xl mt-2">
            {ws?.lastMessage?.acoustic_risk ?? 18}%
          </h3>
        </div>

        <div className="rounded-2xl bg-slate-900/60 p-4 text-center">
          <p className="text-slate-400 text-xs">
            Intent
          </p>

          <h3 className="text-green-400 font-bold text-xl mt-2">
            {ws?.lastMessage?.intent_risk ?? 25}%
          </h3>
        </div>

        <div className="rounded-2xl bg-slate-900/60 p-4 text-center">
          <p className="text-slate-400 text-xs">
            Connection
          </p>

          <h3 className="text-white font-bold text-xl mt-2">
            {ws?.connected ? "LIVE" : "OFF"}
          </h3>
        </div>
      </div>
    </motion.div>
  );
}