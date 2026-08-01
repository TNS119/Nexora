"use client";

import { motion } from "framer-motion";
import { Mic } from "lucide-react";

const bars = [
  30, 70, 45, 90, 55, 100, 40, 85, 60, 95,
  35, 75, 50, 90, 65, 100, 45, 80, 55, 95,
];

export default function Waveform() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-[35px] border border-white/10 bg-white/10 backdrop-blur-2xl p-6 shadow-2xl"
    >
      <div className="flex items-center justify-between">

        <div>

          <h2 className="text-white text-2xl font-bold">
            Live Audio
          </h2>

          <p className="text-slate-400 text-sm mt-1">
            Streaming every 500 ms
          </p>

        </div>

        <motion.div
          animate={{
            scale: [1, 1.15, 1],
          }}
          transition={{
            repeat: Infinity,
            duration: 1,
          }}
          className="h-14 w-14 rounded-full bg-cyan-500 flex items-center justify-center shadow-lg shadow-cyan-500/40"
        >
          <Mic
            size={28}
            className="text-white"
          />
        </motion.div>

      </div>

      <div className="flex items-end justify-center gap-[5px] h-36 mt-10">

        {bars.map((height, index) => (
          <motion.div
            key={index}
            animate={{
              height: [
                `${height}px`,
                `${height + 20}px`,
                `${height}px`,
              ],
            }}
            transition={{
              repeat: Infinity,
              duration: 0.7,
              delay: index * 0.05,
            }}
            className="w-[6px] rounded-full bg-gradient-to-t from-cyan-500 via-sky-400 to-blue-300"
            style={{
              height,
            }}
          />
        ))}

      </div>

      <div className="mt-8 flex justify-center">

        <div className="flex items-center gap-3 rounded-full bg-cyan-500/20 border border-cyan-500/30 px-5 py-3">

          <motion.div
            animate={{
              scale: [1, 1.4, 1],
            }}
            transition={{
              repeat: Infinity,
              duration: 1,
            }}
            className="h-3 w-3 rounded-full bg-cyan-400"
          />

          <span className="text-cyan-300 font-semibold">
            AI Listening...
          </span>

        </div>

      </div>

    </motion.div>
  );
}