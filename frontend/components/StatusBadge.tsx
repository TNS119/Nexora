"use client";

interface Props {
  ws: any;
}

export default function StatusBadge({ ws }: Props) {
  return (
    <div className="fixed top-5 right-5 z-50">
      <div
        className={`px-4 py-2 rounded-full font-semibold shadow-lg ${
          ws?.connected
            ? "bg-green-600 text-white"
            : "bg-red-600 text-white"
        }`}
      >
        {ws?.connected ? "🟢 Backend Connected" : "🔴 Backend Offline"}
      </div>
    </div>
  );
}