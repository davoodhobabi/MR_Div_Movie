import { strings } from '../constants/strings';

const DONITO_PROFILE_URL = 'https://donito.me/api/v1/public/users/mrdiv';

type DonitoSetting = {
  key?: string;
  value?: unknown;
};

type DonitoPayload = {
  data?: {
    donation_target_settings?: { data?: DonitoSetting[] };
    gateway_settings?: { data?: DonitoSetting[] };
  };
};

export type DonitoGoal = {
  title: string;
  description: string;
  goalAmount: number;
  filledAmount: number;
};

function asMap(list: DonitoSetting[] | undefined): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const item of list ?? []) {
    if (item.key) map[item.key] = item.value;
  }
  return map;
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function formatToman(amount: number): string {
  return `${Math.round(amount).toLocaleString('fa-IR')} تومان`;
}

export async function fetchDonitoGoal(): Promise<DonitoGoal | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(DONITO_PROFILE_URL, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MrDiv_Movie/1.0 (Android)',
      },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as DonitoPayload;
    const target = asMap(payload.data?.donation_target_settings?.data);
    const gateway = asMap(payload.data?.gateway_settings?.data);
    if (target.tool_target_donation_main_status !== true) return null;

    const goalAmount = asNumber(target.tool_target_donation_main_goad_amount);
    if (goalAmount <= 0) return null;

    const incoming = asNumber(target.tool_target_donation_main_goad_incoming);
    const initial = asNumber(target.tool_target_donation_main_progress_goad_amount);
    const filledAmount = Math.min(goalAmount, Math.max(0, incoming + initial));
    const title =
      asString(target.tool_target_donation_main_title) || strings.supportGoalFallbackTitle;
    const description =
      asString(gateway.panel_setting_gateway_description) || strings.supportReminderBody;

    return { title, description, goalAmount, filledAmount };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
