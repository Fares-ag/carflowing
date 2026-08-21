const DEFAULT_POLICY = "default-src 'self'"

function camelCaseDirective(name: string): string {
  return name.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase())
}

export function resolveContentSecurityPolicy(): { policy: string; enforce: boolean } {
  return {
    policy: process.env.CONTENT_SECURITY_POLICY?.trim() || DEFAULT_POLICY,
    enforce: process.env.CSP_ENFORCE === 'true',
  }
}

export function parseCspDirectives(policy: string): Record<string, string[]> {
  const directives: Record<string, string[]> = {}
  for (const segment of policy.split(';')) {
    const part = segment.trim()
    if (!part) continue
    const space = part.indexOf(' ')
    if (space === -1) {
      directives[camelCaseDirective(part)] = []
      continue
    }
    const name = part.slice(0, space).trim()
    const values = part.slice(space + 1).trim().split(/\s+/).filter(Boolean)
    directives[camelCaseDirective(name)] = values
  }
  return directives
}

export function helmetContentSecurityPolicyOptions() {
  const { policy, enforce } = resolveContentSecurityPolicy()
  return {
    useDefaults: false as const,
    directives: parseCspDirectives(policy),
    reportOnly: !enforce,
  }
}
