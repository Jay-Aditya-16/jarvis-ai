export function getSmallTalkReply(input) {
  const text = String(input || "").trim().toLowerCase();
  if (/^(hi|hello|hey|yo|sup|namaste|hola)[!. ]*$/.test(text)) return "Hey. I'm here.";
  if (/^(thanks|thank you|thx|ty)[!. ]*$/.test(text)) return "Anytime.";
  if (/^(ok|okay|cool|nice|great)[!. ]*$/.test(text)) return "Got it.";
  return null;
}

export function wantsLocalPreference(input) {
  return /\b(use|switch|prefer|force)\b.*\blocal\b/i.test(String(input || ""));
}

export function wantsCloudPreference(input) {
  return /\b(use|switch|prefer)\b.*\bcloud\b/i.test(String(input || ""));
}
