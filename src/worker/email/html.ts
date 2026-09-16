const BLOCKED_CONTAINER_TAGS = /<(script|iframe|object|embed|form|svg|math|video|audio|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const BLOCKED_TAGS = /<\/?(?:script|iframe|object|embed|form|input|button|textarea|select|option|meta|base|link|svg|math|video|audio|source|track|template)\b[^>]*>/gi;
const EVENT_ATTRIBUTES = /\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const DANGEROUS_ATTRIBUTES = /\s+(?:srcdoc|formaction|action|ping)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const DANGEROUS_QUOTED_URL = /\s+(href|src|xlink:href)\s*=\s*(["'])\s*(?:javascript|vbscript|file|data:text\/html)[\s\S]*?\2/gi;
const DANGEROUS_UNQUOTED_URL = /\s+(href|src|xlink:href)\s*=\s*(?:javascript|vbscript|file|data:text\/html):[^\s>]*/gi;
const REMOTE_IMAGE_SRC = /(<img\b[^>]*?)\s+src\s*=\s*(["'])\s*https?:\/\/[^"']*\2/gi;
const REMOTE_IMAGE_SRC_UNQUOTED = /(<img\b[^>]*?)\s+src\s*=\s*https?:\/\/[^\s>]*/gi;
const IMAGE_SRCSET = /\s+srcset\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/**
 * Removes active/interactive markup before HTML is persisted. Rendering still
 * happens inside a sandboxed iframe with a restrictive CSP, so this is the
 * first layer of a defense-in-depth model rather than the only protection.
 */
export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(BLOCKED_CONTAINER_TAGS, "")
    .replace(BLOCKED_TAGS, "")
    .replace(EVENT_ATTRIBUTES, "")
    .replace(DANGEROUS_ATTRIBUTES, "")
    .replace(DANGEROUS_QUOTED_URL, " $1=\"#\"")
    .replace(DANGEROUS_UNQUOTED_URL, " $1=\"#\"")
    .replace(REMOTE_IMAGE_SRC, "$1 data-remote-image-blocked=\"true\"")
    .replace(REMOTE_IMAGE_SRC_UNQUOTED, "$1 data-remote-image-blocked=\"true\"")
    .replace(IMAGE_SRCSET, "")
    .trim();
}
