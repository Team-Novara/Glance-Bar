import {
  FluentIconChip,
  FluentProgressRail,
  type ShowcaseFluentMode,
} from "./ShowcaseFluentTokens";

import type { HubTask } from "@/entities";

type MultiTaskHubProps = {
  tasks: HubTask[];
};

const modeMap: Record<HubTask["type"], ShowcaseFluentMode> = {
  music: "music",
  ai: "ai",
  download: "download",
  notification: "notification",
  media: "music",
  clipboard: "notification",
  focus: "notification",
  system: "notification",
} as const;

export function MultiTaskHub({ tasks }: MultiTaskHubProps) {
  return (
    <section className="hub-card-lg relative min-w-[372px] overflow-hidden rounded-[30px] bg-[linear-gradient(180deg,rgba(255,255,255,0.72)_0%,rgba(255,255,255,0.52)_100%)] px-4 py-3 text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.78)] backdrop-blur-[24px] backdrop-saturate-150 supports-[backdrop-filter]:bg-[linear-gradient(180deg,rgba(255,255,255,0.62)_0%,rgba(245,243,255,0.44)_100%)]">
      <div className="relative z-[1] space-y-2.5">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="border-white/26 bg-white/28 grid grid-cols-[36px_1fr_40px] items-center gap-3 rounded-[22px] border px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
          >
            <FluentIconChip mode={modeMap[task.type]} compact />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold tracking-[0] text-slate-900">
                {task.title}
              </div>
              <div className="mt-0.5 truncate text-[11px] font-medium tracking-[0] text-slate-600">
                {task.subtitle}
              </div>
              <div className="mt-1.5">
                {task.progress !== undefined && (
                  <FluentProgressRail
                    mode={modeMap[task.type]}
                    value={task.progress}
                    label={`${task.title} progress`}
                    shimmer={task.type !== "notification"}
                  />
                )}
              </div>
            </div>
            <span className="text-right text-[10px] font-medium tabular-nums text-slate-500">
              {task.progress !== undefined ? `${task.progress}%` : ""}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
