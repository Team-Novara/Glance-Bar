import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import i18n from '@/i18n';
import { SettingsPanel } from './SettingsPanel';
import type { ProviderRegistryRecord } from '@/providers';
import type {
  HubProviderCapability,
  HubProviderHealth,
  HubProviderKind,
  HubProviderLifecycle,
  HubProviderMetadata,
} from '@/providers';
import type { DesktopStatusKind, DesktopStatusPreferences } from "@/entities";

vi.mock('@/runtime/window/autostartRuntime', () => ({
  getAutostartEnabled: vi.fn().mockResolvedValue(false),
  setAutostartEnabled: vi.fn().mockResolvedValue(true),
}));

const BASE_PREFERENCES: DesktopStatusPreferences = {
  alwaysFloat: true,
  avoidFullscreen: true,
  lockPosition: false,
};

const NOOP_HANDLERS = {
  onToggleAlwaysFloat: () => undefined,
  onToggleAvoidFullscreen: () => undefined,
  onToggleLockPosition: () => undefined,
  onToggleAutostart: () => undefined,
  onKindSelect: (_kind: DesktopStatusKind) => undefined,
  onRefresh: () => undefined,
  onResetPosition: () => undefined,
  onOpenNativeSettings: () => undefined,
  onRecallStatusCenter: () => undefined,
  onClose: () => undefined,
};

async function changeLanguage(lng) {
  await act(async () => {
    await i18n.changeLanguage(lng);
  });
}

function makeMetadata(overrides) {
  return {
    id: overrides.id ?? 'music-prod',
    name: overrides.name ?? 'Music Provider',
    kind: overrides.kind ?? 'music',
    version: '1.0.0',
    mock: overrides.mock ?? false,
    ...overrides,
  };
}

function makeRecord(id, name, kind, lifecycle, health, order) {
  const metadata = makeMetadata({ id, name, kind });
  const capabilities = [
    {
      id: kind,
      kind,
      origin: 'real',
      support: 'available',
    },
  ];
  return {
    id,
    name,
    kind,
    metadata,
    capabilities,
    status: { lifecycle, health },
    registrationOrder: order,
  };
}

describe('SettingsPanel i18n reactivity', () => {
  it('renders translated section labels on mount in current language', async () => {
    await changeLanguage('en');
    render(
      <SettingsPanel
        preferences={BASE_PREFERENCES}
        activeStatusKind={null}
        autostartEnabled={false}
        providerRecords={[]}
        {...NOOP_HANDLERS}
      />,
    );
    expect(screen.getByText('Window Behavior')).toBeInTheDocument();
    expect(screen.getByText('Status Templates')).toBeInTheDocument();
    expect(screen.getByText('Quick Controls')).toBeInTheDocument();
  });

  it('updates panel copy when language switches from en to zh-CN', async () => {
    await changeLanguage('en');
    const { rerender } = render(
      <SettingsPanel
        preferences={BASE_PREFERENCES}
        activeStatusKind={null}
        autostartEnabled={false}
        providerRecords={[]}
        {...NOOP_HANDLERS}
      />,
    );
    expect(screen.getByText('Window Behavior')).toBeInTheDocument();
    await changeLanguage('zh-CN');
    rerender(
      <SettingsPanel
        preferences={BASE_PREFERENCES}
        activeStatusKind={null}
        autostartEnabled={false}
        providerRecords={[]}
        {...NOOP_HANDLERS}
      />,
    );
    expect(screen.getByText('窗口行为')).toBeInTheDocument();
    expect(screen.getByText('状态模板')).toBeInTheDocument();
    expect(screen.queryByText('Window Behavior')).not.toBeInTheDocument();
  });

  it('updates template descriptor labels when language switches', async () => {
    await changeLanguage('en');
    const { rerender } = render(
      <SettingsPanel
        preferences={BASE_PREFERENCES}
        activeStatusKind={null}
        autostartEnabled={false}
        providerRecords={[]}
        {...NOOP_HANDLERS}
      />,
    );
    expect(screen.getAllByText('Resident').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Media').length).toBeGreaterThan(0);
    await changeLanguage('zh-CN');
    rerender(
      <SettingsPanel
        preferences={BASE_PREFERENCES}
        activeStatusKind={null}
        autostartEnabled={false}
        providerRecords={[]}
        {...NOOP_HANDLERS}
      />,
    );
    expect(screen.getAllByText('常驻态').length).toBeGreaterThan(0);
    expect(screen.getAllByText('媒体').length).toBeGreaterThan(0);
  });
});
describe('SettingsPanel ProviderStatusPanel integration', () => {
  it('renders the provider status section when records are supplied', async () => {
    await changeLanguage('en');
    const records = [
      makeRecord('music', 'Music', 'music', 'Publishing', 'Healthy', 0),
    ];
    render(
      <SettingsPanel
        preferences={BASE_PREFERENCES}
        activeStatusKind={null}
        autostartEnabled={false}
        providerRecords={records}
        {...NOOP_HANDLERS}
      />,
    );
    expect(screen.getByTestId('provider-status-panel')).toBeInTheDocument();
    expect(screen.getByText('Provider Status')).toBeInTheDocument();
  });

  it('displays the correct healthy count for five healthy providers', async () => {
    await changeLanguage('en');
    const records = [
      makeRecord('a', 'Provider A', 'music', 'Publishing', 'Healthy', 0),
      makeRecord('b', 'Provider B', 'clipboard', 'Started', 'Healthy', 1),
      makeRecord('c', 'Provider C', 'download', 'Started', 'Healthy', 2),
      makeRecord('d', 'Provider D', 'focus', 'Started', 'Healthy', 3),
      makeRecord('e', 'Provider E', 'update', 'Started', 'Healthy', 4),
    ];
    render(
      <SettingsPanel
        preferences={BASE_PREFERENCES}
        activeStatusKind={null}
        autostartEnabled={false}
        providerRecords={records}
        {...NOOP_HANDLERS}
      />,
    );
    const greenItem = document.querySelector('.provider-summary-item.tone-green');
    expect(within(greenItem).getByText('5')).toBeInTheDocument();
  });
  it('shows degraded providers in the Needs Attention block', async () => {
    await changeLanguage('en');
    const records = [
      makeRecord('ok', 'Healthy One', 'music', 'Publishing', 'Healthy', 0),
      makeRecord('warn-1', 'Slow Download', 'download', 'Started', 'Degraded', 1),
    ];
    render(
      <SettingsPanel
        preferences={BASE_PREFERENCES}
        activeStatusKind={null}
        autostartEnabled={false}
        providerRecords={records}
        {...NOOP_HANDLERS}
      />,
    );
    const attention = screen.getByTestId('provider-attention');
    expect(attention).toBeInTheDocument();
    expect(within(attention).getByText('Needs Attention')).toBeInTheDocument();
    expect(within(attention).getByTestId('provider-row-warn-1')).toBeInTheDocument();
  });

  it('does not crash when providerRecords is an empty array', async () => {
    await changeLanguage('en');
    render(
      <SettingsPanel
        preferences={BASE_PREFERENCES}
        activeStatusKind={null}
        autostartEnabled={false}
        providerRecords={[]}
        {...NOOP_HANDLERS}
      />,
    );
    expect(screen.getByTestId('provider-status-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('provider-attention')).not.toBeInTheDocument();
  });
  it('renders Quick Controls after the Provider Status section', async () => {
    await changeLanguage('en');
    const records = [
      makeRecord('music', 'Music', 'music', 'Publishing', 'Healthy', 0),
    ];
    const { container } = render(
      <SettingsPanel
        preferences={BASE_PREFERENCES}
        activeStatusKind={null}
        autostartEnabled={false}
        providerRecords={records}
        {...NOOP_HANDLERS}
      />,
    );
    const providerPanel = screen.getByTestId('provider-status-panel');
    const quickControls = screen.getByText('Quick Controls');
    const providerPos =
      providerPanel.compareDocumentPosition(quickControls) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(providerPos).toBeTruthy();
    expect(container.contains(providerPanel)).toBe(true);
    expect(container.contains(quickControls)).toBe(true);
  });

  it('degrades gracefully when providerRecords is explicitly undefined', async () => {
    await changeLanguage('en');
    render(
      <SettingsPanel
        preferences={BASE_PREFERENCES}
        activeStatusKind={null}
        autostartEnabled={false}
        {...NOOP_HANDLERS}
      />,
    );
    expect(screen.getByTestId('provider-status-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('provider-attention')).not.toBeInTheDocument();
  });
  it('displays mixed status counters (degraded, unhealthy, stopped) correctly', async () => {
    const records = [
      makeRecord('a', 'Healthy A', 'music', 'Publishing', 'Healthy', 0),
      makeRecord('b', 'Degraded B', 'clipboard', 'Started', 'Degraded', 1),
      makeRecord('c', 'Unhealthy C', 'download', 'Stopped', 'Unhealthy', 2),
      makeRecord('d', 'Stopped D', 'focus', 'Stopped', 'Healthy', 3),
      makeRecord('e', 'Stopped E', 'update', 'Stopped', 'Healthy', 4),
    ];
    render(
      <SettingsPanel
        preferences={BASE_PREFERENCES}
        activeStatusKind={null}
        autostartEnabled={false}
        providerRecords={records}
        {...NOOP_HANDLERS}
      />,
    );
    const greenItem = document.querySelector('.provider-summary-item.tone-green');
    const amberItem = document.querySelector('.provider-summary-item.tone-amber');
    const redItem = document.querySelector('.provider-summary-item.tone-red');
    const grayItem = document.querySelector('.provider-summary-item.tone-gray');
    expect(within(greenItem).getByText('3')).toBeInTheDocument();
    expect(within(amberItem).getByText('1')).toBeInTheDocument();
    expect(within(redItem).getByText('1')).toBeInTheDocument();
    expect(within(grayItem).getByText('3')).toBeInTheDocument();
  });

  it('renders provider status without requiring other optional props (regression)', async () => {
    const records = [
      makeRecord('x', 'Solo Provider', 'music', 'Publishing', 'Healthy', 0),
    ];
    render(
      <SettingsPanel
        preferences={BASE_PREFERENCES}
        activeStatusKind={null}
        autostartEnabled={false}
        providerRecords={records}
        {...NOOP_HANDLERS}
      />,
    );
    expect(screen.getByTestId('provider-status-panel')).toBeInTheDocument();
    const greenItem = document.querySelector('.provider-summary-item.tone-green');
    expect(within(greenItem).getByText('1')).toBeInTheDocument();
  });
});
