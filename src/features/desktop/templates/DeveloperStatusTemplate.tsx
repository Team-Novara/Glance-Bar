import { Terminal } from "lucide-react";

import type { DesktopDeveloperState } from "@/entities";
import { getDesktopStatusTemplateChromeCopy } from "@/entities/status/config";

import { DesktopStatusTemplateFrame } from "./DesktopStatusTemplateFrame";
import { GuestSourceHealthIndicator } from "./GuestSourceHealthIndicator";
import { StatusRail } from "./StatusRail";


type DeveloperStatusTemplateProps = {
  state: DesktopDeveloperState;
};

export function DeveloperStatusTemplate({ state }: DeveloperStatusTemplateProps) {
  const copy = getDesktopStatusTemplateChromeCopy();

  return (
    <>
      <div className="product-status-icon product-status-icon-developer" aria-hidden="true">
        <Terminal size={20} strokeWidth={2.2} />
        <GuestSourceHealthIndicator sourceHealth={state.sourceHealth} />
      </div>
      <DesktopStatusTemplateFrame
        eyebrow={copy.developerEyebrow}
        title={state.title}
        subtitle={state.subtitle}
        meta={<span>{state.detail}</span>}
      >
        {typeof state.progress === "number" ? (
          <StatusRail
            value={state.progress}
            label={copy.developerProgress}
            accent="green"
            active
          />
        ) : null}
      </DesktopStatusTemplateFrame>
    </>
  );
}
