// Skill Sentinel — lightweight JS port of enkryptai/skill-sentinel
// https://github.com/enkryptai/skill-sentinel/blob/main/src/skill_sentinel/data/threat_categories.md

const THREAT_CATEGORIES = [
  {
    id: "prompt_injection", severity: "CRITICAL",
    patterns: [
      /ignore (previous|all|prior) instructions/i,
      /disregard (your|all) (previous |prior )?(instructions|rules|constraints)/i,
      /enable (debug|admin|developer|god) mode/i,
      /you are now (a|an)/i,
      /forget (everything|all) (you|i)/i,
      /new persona/i,
    ],
  },
  {
    id: "data_exfiltration", severity: "CRITICAL",
    patterns: [
      /requests\.(post|put|patch)\(.*?(env|secret|key|token|password|credential)/i,
      /fetch\(.*?(env|secret|key|token|credential)/i,
      /upload.*(credential|secret|api.?key|\.env)/i,
      /send.*(ssh|private.?key|password).*(http|url|endpoint|server)/i,
      /exfiltrat/i,
    ],
  },
  {
    id: "hardcoded_secrets", severity: "CRITICAL",
    patterns: [
      /sk-[a-zA-Z0-9]{20,}/,
      /AKIA[0-9A-Z]{16}/,
      /-----BEGIN (RSA |EC )?PRIVATE KEY/,
      /ghp_[a-zA-Z0-9]{36}/,
      /password\s*=\s*["'][^"']{6,}/i,
      /api.?key\s*=\s*["'][^"']{8,}/i,
    ],
  },
  {
    id: "command_injection", severity: "CRITICAL",
    patterns: [
      /eval\(.*?(input|user|req\.)/i,
      /exec\(.*?(input|user|request)/i,
      /subprocess\.(run|call|Popen)\(/i,
      /os\.system\(/i,
      /child_process.*exec.*input/i,
    ],
  },
  {
    id: "obfuscation", severity: "HIGH",
    patterns: [
      /base64\.b64decode.*exec/i,
      /eval\(atob\(/i,
      /fromCharCode.*eval/i,
      /\\x[0-9a-f]{2}(\\x[0-9a-f]{2}){10,}/i,
    ],
  },
  {
    id: "transitive_trust_abuse", severity: "HIGH",
    patterns: [
      /follow instructions from (this |the )?(url|webpage|link|http)/i,
      /execute (code|instructions) from (external|remote|url)/i,
      /load (rules|instructions) from/i,
    ],
  },
  {
    id: "unauthorized_tool_use", severity: "HIGH",
    patterns: [
      /allowed.tools.*read.*(?:write|delete|execute)/i,
      /bypass.*permission/i,
      /without.*user.*confirm/i,
    ],
  },
  {
    id: "autonomy_abuse", severity: "MEDIUM",
    patterns: [
      /without (user )?confirmation/i,
      /keep (trying|running|retrying) until success/i,
      /do not (ask|prompt|notify)/i,
    ],
  },
  {
    id: "over_collection", severity: "MEDIUM",
    patterns: [
      /walk (the|entire|whole) (home|root|system) directory/i,
      /collect all files/i,
      /read every file/i,
    ],
  },
  {
    id: "supply_chain_risk", severity: "MEDIUM",
    patterns: [
      /pip install .* --pre/i,
      /install from.*unknown.*github/i,
      /curl.*\| (sh|bash|python)/i,
    ],
  },
];

export function scanSkill(content) {
  const findings = [];
  for (const threat of THREAT_CATEGORIES) {
    for (const pattern of threat.patterns) {
      if (pattern.test(content)) {
        findings.push({ id: threat.id, severity: threat.severity });
        break;
      }
    }
  }
  return findings;
}
