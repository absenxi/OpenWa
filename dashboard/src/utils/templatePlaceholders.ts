/**
 * Shared template placeholder utilities for the dashboard composer.
 *
 * The pattern matches the gateway's server-side renderer:
 *   - Canonical double-brace {{key}}
 *   - Legacy single-brace {key}
 */
export const PLACEHOLDER_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}|\{(\w+)\}/g;

export interface TemplateParts {
  header?: string | null;
  body: string;
  footer?: string | null;
}

/**
 * Extracts distinct placeholder variable names from a template's header, body, and footer.
 */
export function extractPlaceholders(template: TemplateParts): string[] {
  const source = [template.header, template.body, template.footer].filter(Boolean).join('\n');
  const tokens = new Set<string>();
  for (const [, doubleKey, singleKey] of source.matchAll(PLACEHOLDER_PATTERN)) {
    const key = doubleKey ?? singleKey;
    if (key) tokens.add(key);
  }
  return [...tokens];
}

/**
 * Renders a template preview with provided variables substituted.
 * Unfilled placeholders remain literal, mirroring the backend renderer.
 */
export function renderTemplatePreview(template: TemplateParts, vars: Record<string, string> = {}): string {
  const parts = [template.header, template.body, template.footer].filter(
    (segment): segment is string => segment != null && segment.length > 0,
  );
  return parts
    .map(part =>
      part.replace(PLACEHOLDER_PATTERN, (match, doubleKey: string | undefined, singleKey: string | undefined) => {
        const key = doubleKey ?? singleKey;
        return key && Object.prototype.hasOwnProperty.call(vars, key) && vars[key] !== '' ? vars[key] : match;
      }),
    )
    .join('\n\n');
}
