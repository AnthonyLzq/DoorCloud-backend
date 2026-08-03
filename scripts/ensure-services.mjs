import { execFileSync } from 'node:child_process'

const REQUIRED_SERVICES = ['mosquitto', 'openwa']

const runDockerCompose = args =>
  execFileSync('docker', ['compose', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()

const serviceState = service => {
  try {
    // containerId + running flag, one line per running container
    const output = runDockerCompose(['ps', '-q', '--filter', `status=running`, service])
    return output ? 'running' : 'created'
  } catch {
    return 'missing'
  }
}

const startService = service => {
  console.log(`[ensure-services] Starting ${service}...`)
  runDockerCompose(['up', '-d', service])
}

const waitForHealth = (service, timeoutMs = 60_000) => {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    try {
      const status = runDockerCompose([
        'inspect',
        '--format',
        '{{if .State.Health}}{{.State.Health.Status}}{{else}}healthy{{end}}',
        service
      ])

      if (status === 'healthy') return true
    } catch {
      // container may not exist yet; keep polling
    }

    // 500ms sleep
    execFileSync('sleep', ['0.5'])
  }

  return false
}

const main = () => {
  const missing = []

  for (const service of REQUIRED_SERVICES) {
    const state = serviceState(service)

    if (state === 'running') {
      console.log(`[ensure-services] ${service} already running`)
      continue
    }

    startService(service)
    missing.push(service)
  }

  for (const service of missing) {
    const healthy = waitForHealth(service)
    const label = healthy ? 'healthy' : 'running but healthcheck unavailable'

    console.log(`[ensure-services] ${service} is ${label}`)
  }
}

main()
