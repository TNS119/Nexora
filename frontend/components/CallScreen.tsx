"use client";

import { motion } from "framer-motion";
import {
  Phone,
  PhoneOff,
  ShieldCheck,
  Mic,
  Wifi,
  BatteryFull,
} from "lucide-react";

import {
  CircularProgressbar,
  buildStyles,
} from "react-circular-progressbar";

import "react-circular-progressbar/dist/styles.css";

interface Props {
  ws: any;
}

export default function CallScreen({ ws }: Props) {
  const score = Number(ws?.lastMessage?.threat_score ?? 18);

  const color =
    score < 40
      ? "#22c55e"
      : score < 80
      ? "#facc15"
      : "#ef4444";

  const status =
    score < 40
      ? "SAFE"
      : score < 80
      ? "WARNING"
      : "SCAM DETECTED";

  return (
    <main className="min-h-screen bg-black flex justify-center">

      <div className="w-full max-w-md min-h-screen bg-gradient-to-b from-[#070b14] via-[#0d1524] to-black px-7 pt-5 pb-10 flex flex-col">

        {/* STATUS BAR */}

        <div className="flex justify-between items-center text-slate-400 text-sm">

          <span>9:41</span>

          <div className="flex items-center gap-2">

            <Wifi size={16} />

            <BatteryFull size={18} />

          </div>

        </div>

        {/* CALL INFO */}

        <div className="mt-14 flex flex-col items-center">

          <motion.div
            animate={{
              scale: [1, 1.04, 1],
            }}
            transition={{
              repeat: Infinity,
              duration: 2,
            }}
            className="
            h-40
            w-40
            rounded-full
            bg-gradient-to-br
            from-cyan-400
            to-blue-700
            shadow-[0_0_70px_rgba(59,130,246,.45)]
            flex
            items-center
            justify-center
            text-7xl
            "
          >
            👤
          </motion.div>

          <h1 className="text-4xl font-bold text-white mt-10">
            Unknown Caller
          </h1>

          <p className="text-slate-400 text-lg mt-3">
            +91 XXXXX XXXXX
          </p>

          <motion.div
            animate={{
              opacity: [1, .6, 1],
            }}
            transition={{
              repeat: Infinity,
              duration: 1.5,
            }}
            className="
            mt-8
            rounded-full
            bg-green-500/15
            border
            border-green-500/30
            px-6
            py-3
            flex
            items-center
            gap-3
            "
          >
            <ShieldCheck
              className="text-green-400"
              size={20}
            />

            <span className="text-green-400 font-semibold">
              AI Protection Active
            </span>

          </motion.div>

        </div>

        {/* LIVE WAVE */}

        <div className="mt-14">

          <div className="flex justify-center gap-[7px] items-end h-28">

            {[28,55,42,82,63,95,58,105,46,90,54,76,48,88].map((h,i)=>(
              <motion.div
                key={i}
                animate={{
                  height:[h,h+20,h]
                }}
                transition={{
                  repeat:Infinity,
                  duration:.8,
                  delay:i*.05
                }}
                className="w-[7px] rounded-full bg-cyan-400"
                style={{height:h}}
              />
            ))}

          </div>

        </div>

        {/* THREAT */}
                <div className="mt-16 flex justify-center">

          <div className="w-56 h-56">

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

        </div>

        <motion.h2
          animate={{
            scale: [1, 1.03, 1],
          }}
          transition={{
            repeat: Infinity,
            duration: 1.4,
          }}
          className="text-center text-3xl font-bold mt-8"
          style={{ color }}
        >
          {status}
        </motion.h2>

        <div className="flex justify-center mt-5">

          <div className="flex items-center gap-3 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-6 py-3">

            <Mic
              size={20}
              className="text-cyan-400 animate-pulse"
            />

            <span className="text-cyan-300 font-medium">
              AI Listening...
            </span>

          </div>

        </div>

        <div className="flex-1"></div>

        {/* CALL BUTTONS */}

        <div className="grid grid-cols-2 gap-8 mt-10">

          <motion.button
            whileTap={{ scale: 0.94 }}
            whileHover={{ scale: 1.03 }}
            className="
            h-20
            rounded-full
            bg-red-600
            shadow-[0_0_30px_rgba(239,68,68,.45)]
            flex
            items-center
            justify-center
            "
          >
            <PhoneOff
              size={34}
              className="text-white"
            />
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.94 }}
            whileHover={{ scale: 1.03 }}
            className="
            h-20
            rounded-full
            bg-green-600
            shadow-[0_0_30px_rgba(34,197,94,.45)]
            flex
            items-center
            justify-center
            "
          >
            <Phone
              size={34}
              className="text-white"
            />
          </motion.button>

        </div>

      </div>

    </main>

  );
}