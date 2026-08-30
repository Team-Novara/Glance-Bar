import { Bell, Bot, Download, Layers3, Music2, PanelTop, Sparkles } from "lucide-react";

import type { HubMode } from "@/entities";

type ModeSidebarProps = {
  activeMode: HubMode;
  onModeChange: (mode: HubMode) => void;
};

const modes: Array<{ mode: HubMode; title: string; text: string; icon: typeof PanelTop }> = [
  {
    mode: "idle",
    title: "Idle",
    text: "Baseline preview with no active mock or fixture events.",
    icon: PanelTop,
  },
  {
    mode: "music",
    title: "Music",
    text: "Store-derived playback state rendered in the Hub preview.",
    icon: Music2,
  },
  {
    mode: "aiProgress",
    title: "AI Progress",
    text: "Mock provider task progress with title, subtitle, and percent.",
    icon: Bot,
  },
  {
    mode: "download",
    title: "Download",
    text: "Mock transfer state with compact file progress metadata.",
    icon: Download,
  },
  {
    mode: "notification",
    title: "Notification",
    text: "Fixture-style message preview without native notifications.",
    icon: Bell,
  },
  {
    mode: "multiTask",
    title: "MultiTask",
    text: "Multiple mock tasks composed into one preview surface.",
    icon: Layers3,
  },
];

export function ModeSidebar({ activeMode, onModeChange }: ModeSidebarProps) {
  return (
    <aside className="space-y-5 font-['Segoe_UI','Microsoft_YaHei',system-ui,sans-serif]">
      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] px-5 py-5 shadow-[0_18px_46px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl">
        <div className="border-sky-200/18 inline-flex items-center gap-2 rounded-full border bg-sky-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-normal text-sky-100">
          <Sparkles size={13} strokeWidth={2} />
          Desktop Workbench
        </div>
        <h1 className="mt-4 text-[1.8rem] font-semibold leading-tight tracking-normal text-white sm:text-[2.1rem]">
          Cober Status Center
        </h1>
        <p className="mt-2 text-base font-medium text-slate-200">
          Current state first, diagnostics second.
        </p>
        <p className="mt-4 max-w-md text-[14px] leading-6 text-slate-300">
          Review the active desktop surface, switch mode priorities, and inspect how mock, provider,
          and fixture inputs resolve into one resident hub.
        </p>

        <div className="mt-5 grid gap-2">
          <WorkbenchSignal
            label="Primary surface"
            value={modes.find((item) => item.mode === activeMode)?.title ?? "Idle"}
            tone="sky"
          />
          <WorkbenchSignal
            label="Preview source"
            value="Store-driven state resolver"
            tone="slate"
          />
          <WorkbenchSignal label="Desktop target" value="Right-bottom floating hub" tone="slate" />
        </div>
      </div>

      <div className="rounded-[24px] border border-white/10 bg-[rgba(243,248,255,0.075)] p-2 shadow-[0_18px_46px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-2xl">
        <div className="px-3 pb-2 pt-2 text-[13px] font-semibold text-slate-300">State stack</div>
        <nav className="space-y-1">
          {modes.map((item) => {
            const Icon = item.icon;
            const selected = activeMode === item.mode;

            return (
              <button
                key={item.mode}
                type="button"
                onClick={() => onModeChange(item.mode)}
                aria-current={selected ? "page" : undefined}
                className={`group relative flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${
                  selected
                    ? "border-white/12 bg-white/[0.13] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_8px_24px_rgba(0,0,0,0.18)]"
                    : "hover:border-white/8 border-transparent text-slate-200 hover:bg-white/[0.075]"
                }`}
              >
                <span
                  className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full transition ${
                    selected ? "bg-[#60cdff] opacity-100" : "bg-transparent opacity-0"
                  }`}
                />
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                    selected
                      ? "bg-[#60cdff]/18 text-[#8bd8ff]"
                      : "bg-white/[0.055] text-slate-300 group-hover:text-slate-100"
                  }`}
                >
                  <Icon size={18} strokeWidth={1.8} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold leading-5">{item.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-5 text-slate-400">
                    {item.text}
                  </span>
                </span>
                <span className="ml-auto hidden rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] font-semibold uppercase text-slate-300 xl:inline-flex">
                  {selected ? "Active" : "Ready"}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

function WorkbenchSignal({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "sky" | "slate";
}) {
  const toneClass =
    tone === "sky"
      ? "border-sky-200/18 bg-sky-300/10 text-sky-100"
      : "border-white/10 bg-white/[0.055] text-slate-200";

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-[16px] border px-3 py-2.5 ${toneClass}`}
    >
      <span className="text-[11px] font-semibold uppercase text-slate-400">{label}</span>
      <span className="truncate text-right text-[12px] font-semibold">{value}</span>
    </div>
  );
}
