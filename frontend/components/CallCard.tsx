import { PhoneIncoming, ShieldCheck } from "lucide-react";

export default function CallCard() {
  return (
    <div className="rounded-3xl bg-white/10 backdrop-blur-xl border border-white/10 p-6 shadow-2xl">

      <div className="flex justify-center">
        <div className="h-24 w-24 rounded-full bg-cyan-500 flex items-center justify-center animate-pulse shadow-lg shadow-cyan-500/40">
          <PhoneIncoming size={42} className="text-white" />
        </div>
      </div>

      <h2 className="mt-6 text-center text-3xl font-bold text-white">
        Incoming Call
      </h2>

      <p className="mt-2 text-center text-xl text-slate-300">
        Unknown Caller
      </p>

      <p className="text-center text-slate-500">
        +91 XXXXX XXXXX
      </p>

      <div className="mt-6 flex justify-center">
        <div className="flex items-center gap-2 rounded-full bg-green-500/20 px-4 py-2">
          <ShieldCheck size={18} className="text-green-400" />
          <span className="font-semibold text-green-400">
            SAFE CONNECTION
          </span>
        </div>
      </div>

    </div>
  );
}