import mqtt, { IClientOptions, MqttClient } from 'mqtt'

type AsyncTest = () => Promise<void>
type TestSuite = ((name: string, fn: () => void) => void) & {
  skip: (name: string, fn: () => void) => void
}
type Expectation = {
  toBe: (expected: unknown) => void
}

declare const describe: TestSuite
declare const expect: (actual: unknown) => Expectation
declare const test: (name: string, fn: AsyncTest, timeout?: number) => void

type Credentials = {
  username?: string
  password?: string
}

const enabled =
  process.env.RUN_MQTT_INTEGRATION === 'true' ? describe : describe.skip

const host = process.env.MQTT_HOST ?? '127.0.0.1'
const port = process.env.MQTT_PORT ? Number(process.env.MQTT_PORT) : 1883
const username = process.env.MQTT_USER ?? 'doorcloud-backend'
const password = process.env.MQTT_PASS ?? 'doorcloud-backend-local'

const connectClient = ({
  username: clientUsername = username,
  password: clientPassword = password
}: Credentials = {}): Promise<MqttClient> =>
  new Promise((resolve, reject) => {
    const options: IClientOptions = {
      connectTimeout: 2_000,
      host,
      password: clientPassword,
      port,
      protocol: 'mqtt',
      reconnectPeriod: 0,
      username: clientUsername
    }
    const client = mqtt.connect(options)
    const timeout = setTimeout(() => {
      client.end(true)
      reject(new Error('Timed out while connecting to Mosquitto'))
    }, 3_000)
    const cleanup = () => {
      clearTimeout(timeout)
      client.removeAllListeners('connect')
      client.removeAllListeners('error')
    }

    client.once('connect', () => {
      cleanup()
      resolve(client)
    })
    client.once('error', error => {
      cleanup()
      client.end(true)
      reject(error)
    })
  })

const subscribe = (client: MqttClient, topic: string): Promise<void> =>
  new Promise((resolve, reject) => {
    client.subscribe(topic, error => {
      if (error) {
        reject(error)

        return
      }

      resolve()
    })
  })

const publish = (
  client: MqttClient,
  topic: string,
  payload: string
): Promise<void> =>
  new Promise((resolve, reject) => {
    client.publish(topic, payload, error => {
      if (error) {
        reject(error)

        return
      }

      resolve()
    })
  })

const waitForMessage = (
  client: MqttClient,
  topic: string
): Promise<string> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.removeAllListeners('message')
      reject(new Error(`Timed out waiting for ${topic}`))
    }, 3_000)

    client.on('message', (receivedTopic, message) => {
      if (receivedTopic !== topic) return

      clearTimeout(timeout)
      client.removeAllListeners('message')
      resolve(message.toString())
    })
  })

enabled('Mosquitto MQTT integration', () => {
  test(
    'publishes and receives an authenticated healthcheck message',
    async () => {
      const topic = 'doorcloud/healthcheck'
      const payload = `ok-${Date.now()}`
      const subscriber = await connectClient()
      const publisher = await connectClient()

      try {
        await subscribe(subscriber, topic)
        const message = waitForMessage(subscriber, topic)

        await publish(publisher, topic, payload)

        expect(await message).toBe(payload)
      } finally {
        subscriber.end(true)
        publisher.end(true)
      }
    },
    10_000
  )

  test(
    'rejects invalid broker credentials',
    async () => {
      let rejected = false

      try {
        const client = await connectClient({ password: 'invalid-password' })

        client.end(true)
      } catch {
        rejected = true
      }

      expect(rejected).toBe(true)
    },
    10_000
  )
})
