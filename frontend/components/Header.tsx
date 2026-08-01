"use client";

import { ShieldCheck, Wifi, BatteryFull } from "lucide-react";
import { motion } from "framer-motion";

export default function Header() {
  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="sticky top-0 z-50 bg-black/40 backdrop-blur-2xl border-b border-white/10"
    >
      <div className="max-w-md mx-auto px-5 py-4">

        {/* Status Bar */}

        <div className="flex items-center justify-between text-xs text-slate-300 mb-5">

          <span className="font-semibold">
            9:41
          </span>

          <div className="flex items-center gap-3">

            <Wifi size={16} />

            <BatteryFull size={18} />

          </div>

        </div>

        {/* App Title */}

        <div className="flex items-center justify-between">

          <div>

            <h1 className="text-3xl font-extrabold tracking-wide bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              VoiceLock AI
            </h1>

            <p className="text-slate-400 text-sm mt-1">
              Real-Time Scam Detection
            </p>

          </div>

          <motion.div
            animate={{
              scale: [1, 1.15, 1],
            }}
            transition={{
              repeat: Infinity,
              duration: 1.2,
            }}
            className="flex items-center gap-2 rounded-full bg-green-500/20 px-4 py-2 border border-green-500/30"
          >
            <ShieldCheck
              size={18}
              className="text-green-400"
            />

            <span className="text-green-400 font-semibold text-sm">
              Protected
            </span>

          </motion.div>

        </div>

      </div>
    </motion.header>
  );
}