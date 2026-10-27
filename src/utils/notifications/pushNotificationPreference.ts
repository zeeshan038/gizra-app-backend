/** User/app-level push master switch (in addition to admin notification_settings). */
export function resolvePushToggleNext(
  current: boolean | null | undefined,
  requested?: boolean
): boolean {
  if (requested !== undefined) return requested;
  return !(current ?? true);
}

export function isRecipientPushOn(value: boolean | null | undefined): boolean {
  return value !== false;
}
