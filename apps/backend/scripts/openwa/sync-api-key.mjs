import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envPath = resolve(process.cwd(), '.env')
const optional = process.argv.includes('--optional')

const parseEnvFile = () => {
  if (!existsSync(envPath)) return {}

  return Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter(Boolean)
      .map(([, key, rawValue]) => [
        key,
        rawValue.replace(/^['"]|['"]$/g, '').trim()
      ])
  )
}

const runDockerCompose = args =>
  execFileSync('docker', ['compose', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()

const getServiceContainerId = service => {
  try {
    return runDockerCompose(['ps', '-q', service])
  } catch {
    return ''
  }
}

const readApiKeyFromService = service => {
  const containerId = getServiceContainerId(service)

  if (!containerId) return ''

  try {
    return runDockerCompose([
      'exec',
      '-T',
      service,
      'sh',
      '-lc',
      'cat /app/data/.api-key 2>/dev/null || cat data/.api-key 2>/dev/null'
    ])
  } catch {
    return ''
  }
}

const writeEnvValue = (key, value) => {
  const line = `${key}=${value}`
  const current = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
  const expression = new RegExp(`^\\s*${key}\\s*=.*$`, 'm')
  const next = expression.test(current)
    ? current.replace(expression, line)
    : `${current.trimEnd()}\n${line}\n`

  writeFileSync(envPath, next)
}

const main = () => {
  const env = parseEnvFile()

  if (env.OPENWA_API_KEY) {
    console.log('OPENWA_API_KEY already configured in .env')

    return
  }

  const services = [
    env.OPENWA_COMPOSE_SERVICE,
    process.env.OPENWA_COMPOSE_SERVICE,
    'openwa',
    'openwa-api'
  ].filter((value, index, values) => value && values.indexOf(value) === index)

  for (const service of services) {
    const apiKey = readApiKeyFromService(service)

    if (!apiKey) continue

    writeEnvValue('OPENWA_API_KEY', apiKey)
    console.log(`OPENWA_API_KEY synced from docker compose service "${service}"`)

    return
  }

  const message =
    'OPENWA_API_KEY is empty and no OpenWA docker compose service with /app/data/.api-key was found. Start OpenWA first or paste the key in /setup.'

  if (optional) {
    console.warn(message)

    return
  }

  throw new Error(message)
}

try {
  main()
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
