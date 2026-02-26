const SECRET_PATTERNS: Array<{ type: string; regex: RegExp }> = [
  {
    type: "openai_api_key",
    regex: /\bsk-[A-Za-z0-9]{20,}\b/g,
  },
  {
    type: "github_token",
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  },
  {
    type: "github_pat",
    regex: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g,
  },
  {
    type: "aws_access_key",
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    type: "private_key",
    regex:
      /-----BEGIN(?: RSA| EC| OPENSSH)? PRIVATE KEY-----[\s\S]+?-----END(?: RSA| EC| OPENSSH)? PRIVATE KEY-----/g,
  },
  {
    type: "jwt",
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/g,
  },
  {
    type: "bearer_token",
    regex: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/gi,
  },
  {
    type: "generic_api_key",
    regex: /\b(?:api[_-]?key|token|secret)\s*[:=]\s*['\"]?[A-Za-z0-9._-]{16,}['\"]?/gi,
  },
];

export interface SecretMatch {
  type: string;
  value: string;
  index: number;
}

export function detectSecretsInText(text: string): SecretMatch[] {
  if (!text) return [];

  const matches: SecretMatch[] = [];

  for (const pattern of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      matches.push({
        type: pattern.type,
        value: match[0],
        index: match.index,
      });
    }
  }

  return matches.sort((a, b) => a.index - b.index);
}

export function containsLikelySecret(value: unknown): boolean {
  if (typeof value === "string") {
    return detectSecretsInText(value).length > 0;
  }

  if (Array.isArray(value)) {
    return value.some((entry) => containsLikelySecret(entry));
  }

  if (value && typeof value === "object") {
    return Object.values(value).some((entry) => containsLikelySecret(entry));
  }

  return false;
}

export function redactSecretsInText(text: string): string {
  if (!text) return text;

  let redacted = text;

  for (const pattern of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    redacted = redacted.replace(regex, `[REDACTED:${pattern.type}]`);
  }

  return redacted;
}

export function redactSecretsDeep<T>(value: T): T {
  if (typeof value === "string") {
    return redactSecretsInText(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactSecretsDeep(entry)) as T;
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
      result[key] = redactSecretsDeep(entry);
    }

    return result as T;
  }

  return value;
}
