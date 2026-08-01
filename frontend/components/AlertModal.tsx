"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, PhoneOff, ShieldAlert } from "lucide-react";

interface Props {
  open: boolean;
}

export default function AlertModal({ open }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center px-6"
        >
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.8 }}
            className="w-full max-w-sm rounded-3xl bg-red-600 p-8 shadow-2xl text-center"
          >
            <ShieldAlert
              size={70}
              className="mx-auto text-white animate-pulse"
            />

            <h1 className="mt-5 text-3xl font-bold text-white">
              SCAM DETECTED
            </h1>

            <p className="mt-4 text-red-100">
              AI detected a high-risk fraudulent call.
            </p>

            <div className="mt-8 rounded-2xl bg-red-700 p-4 text-left">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-yellow-300" />
                <span className="font-semibold text-white">
                  Do NOT Share:
                </span>
              </div>

              <ul className="mt-3 space-y-2 text-red-100">
                <li>• OTP</li>
                <li>• UPI PIN</li>
                <li>• Bank Password</li>
                <li>• Aadhaar Details</li>
              </ul>
            </div>

            <button className="mt-8 w-full rounded-full bg-white py-4 font-bold text-red-600 flex items-center justify-center gap-3">
              <PhoneOff size={22} />
              END CALL
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}