/** Slots for each advice word of cswap, before the max limit. */
const ADVICE_SLOTS = { slow_down: 1, ok: 2, can_speed_up: 3 };
/** Wait, in minutes, when the pace is 0 and cswap gives no resume time. */
export const DEFAULT_WAIT_MIN = 30;

/** Turn a usage read into a slot count (section 4 pace table, with the fleet floor). */
export function paceOf(usage, { planSlots, max = 3, floorPct = 5, now = new Date() } = {}) {
  if (!usage || usage.state !== 'ok' || !usage.budget) {
    return { slots: planSlots, lowTier: false, why: 'off', resumeAt: null };
  }
  const { budget } = usage;
  const firstReset = budget.resets?.[0]?.at ?? null;
  let result;
  const cap = budget.fleet?.capacityUnits;
  const left = budget.fleet?.remainingUnits;
  const leftPct = typeof cap === 'number' && cap > 0 && typeof left === 'number' ? (left / cap) * 100 : null;
  if (leftPct !== null && leftPct <= floorPct) {
    result = { slots: 0, lowTier: false, why: 'floor', resumeAt: firstReset };
  } else if (budget.advice === 'blocked') {
    result = { slots: 0, lowTier: false, why: 'blocked', resumeAt: budget.fleet?.nextUsableAt ?? firstReset };
  } else if (Object.hasOwn(ADVICE_SLOTS, budget.advice)) {
    result = {
      slots: Math.min(ADVICE_SLOTS[budget.advice], max),
      lowTier: budget.advice === 'slow_down',
      why: budget.advice,
      resumeAt: null,
    };
  } else {
    result = { slots: planSlots, lowTier: false, why: 'unknown', resumeAt: null };
  }
  if (result.slots === 0 && !result.resumeAt) {
    result.resumeAt = new Date(new Date(now).getTime() + DEFAULT_WAIT_MIN * 60000).toISOString();
  }
  return result;
}
