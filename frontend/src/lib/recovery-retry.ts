export function recoveryRetryAfter(headers?: Headers): number {
  const value = headers?.get("Retry-After")?.trim() ?? "";
  const seconds = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(seconds) && seconds > 0 ? seconds : 60;
}

export function formatRecoveryWait(seconds: number): string {
  const remaining = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const rest = remaining % 60;
  return [hours && `${hours}시간`, minutes && `${minutes}분`, rest && `${rest}초`].filter(Boolean).join(" ") || "0초";
}

export function recoveryWaitMessage(seconds: number): string {
  return seconds > 0
    ? `요청이 너무 많습니다. ${formatRecoveryWait(seconds)} 후 다시 시도해 주세요.`
    : "대기 시간이 지났습니다. 다시 시도해 주세요.";
}
