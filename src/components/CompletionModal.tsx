"use client";

import Link from "next/link";

type CompletionModalProps = {
  isOpen: boolean;
  onClose?: () => void;
};

export function CompletionModal({ isOpen, onClose }: CompletionModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/35 p-4 sm:items-center sm:justify-center">
      <div className="w-full max-w-[430px] rounded-[26px] border border-bamboo-100 bg-white p-5 shadow-soft">
        <h2 className="text-xl font-bold text-ink">真棒！您已完成本轮话题练习</h2>
        <div className="mt-6 grid gap-3">
          <Link
            href="/topics"
            className="flex min-h-12 items-center justify-center rounded-2xl bg-bamboo-600 px-4 text-base font-semibold text-white"
          >
            回题库页
          </Link>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="min-h-12 rounded-2xl border border-bamboo-100 bg-white px-4 text-base font-semibold text-bamboo-700"
            >
              继续停留
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
