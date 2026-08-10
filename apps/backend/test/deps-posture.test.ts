import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Tests run with cwd = apps/backend (see vitest.config.mts), so the repo
// root is two levels up (apps/backend -> apps -> repo root).
const repoRoot = resolve(process.cwd(), '..', '..')
const workspaceYaml = readFileSync(
  resolve(repoRoot, 'pnpm-workspace.yaml'),
  'utf-8'
)
const rootPkg = readJson(resolve(repoRoot, 'package.json'))
const backendPkg = readJson(resolve(repoRoot, 'apps/backend/package.json'))
const webPkg = readJson(resolve(repoRoot, 'apps/web/package.json'))

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
}

function allDeps(pkg: Record<string, unknown>): string[] {
  const sections = [
    pkg.dependencies,
    pkg.devDependencies,
    pkg.optionalDependencies
  ] as Array<Record<string, string> | undefined>
  return sections.flatMap(section => Object.keys(section ?? {}))
}

describe('dependency posture (RF-7, WF-11, REQ-8)', () => {
  it('runtime workspace does not depend on @vladmandic/human or tfjs-node', () => {
    const runtimeDeps = allDeps(backendPkg)
    expect(runtimeDeps).not.toContain('@vladmandic/human')
    expect(runtimeDeps).not.toContain('@tensorflow/tfjs-node')
    expect(runtimeDeps).not.toContain('@tensorflow/tfjs')
  })

  it('no @vladmandic/human or tfjs allowBuilds entry remains in pnpm-workspace.yaml', () => {
    expect(workspaceYaml).not.toMatch(/@vladmandic\/human/)
    expect(workspaceYaml).not.toMatch(/@tensorflow\/tfjs-node/)
  })

  it('root pnpm.onlyBuiltDependencies no longer references tfjs-node', () => {
    const onlyBuilt = (
      (rootPkg.pnpm as { onlyBuiltDependencies?: string[] } | undefined)
        ?.onlyBuiltDependencies ?? []
    )
    expect(onlyBuilt).not.toContain('@tensorflow/tfjs-node')
  })

  it('runtime dead-code dir src/lib/human and re-export are gone', () => {
    const libIndex = resolve(
      repoRoot,
      'apps/backend/src/lib/index.ts'
    )
    const humanDir = resolve(repoRoot, 'apps/backend/src/lib/human')
    expect(exists(libIndex)).toBe(false)
    expect(exists(humanDir)).toBe(false)
  })

  it('backend sharp resolves to a patched major (>= 0.35)', () => {
    const sharpRange = (backendPkg.dependencies as Record<string, string>).sharp
    expect(sharpRange).toBeDefined()
    expect(sharpRange).toMatch(/^[\^~]?0\.35/)
  })

  it('backend @fastify/static resolves to patched major (>= 10.1.2)', () => {
    const staticRange = (
      backendPkg.dependencies as Record<string, string>
    )['@fastify/static']
    expect(staticRange).toBeDefined()
    expect(staticRange).toMatch(/^[\^~]?10\./)
  })

  it('backend fastify resolves to a patched version (>= 5.11.0)', () => {
    const fastifyRange = (backendPkg.dependencies as Record<string, string>)
      .fastify
    expect(fastifyRange).toBeDefined()
    const majorVersion = Number(fastifyRange.match(/5\.(\d+)/)?.[1] ?? 0)
    expect(majorVersion).toBeGreaterThanOrEqual(11)
  })

  it('web happy-dom resolves to a patched version (>= 20.8.9)', () => {
    const happyDomRange = (webPkg.devDependencies as Record<string, string>)[
      'happy-dom'
    ]
    expect(happyDomRange).toBeDefined()
    expect(happyDomRange).toMatch(/^[\^~]?20\./)
  })
})

function exists(path: string): boolean {
  try {
    readFileSync(path)
    return true
  } catch {
    return false
  }
}