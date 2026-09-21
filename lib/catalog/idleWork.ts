import { InteractionManager } from 'react-native';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One event-loop turn so React can paint splash status. */
export async function paintTick(): Promise<void> {
  await sleep(0);
}

/**
 * Wait until the caller says work is allowed, then until interactions settle.
 * Polls only while busy — never spins during useful CPU work.
 */
export async function waitUntilIdle(isBusy?: () => boolean): Promise<void> {
  while (isBusy?.()) {
    await sleep(50);
  }
  await new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });
}

/** Run `fn` only when idle; used between parse/index chunks. */
export async function runWhenIdle<T>(
  isBusy: (() => boolean) | undefined,
  fn: () => T | Promise<T>,
): Promise<T> {
  await waitUntilIdle(isBusy);
  return fn();
}
