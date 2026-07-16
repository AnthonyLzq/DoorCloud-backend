import mqtt from 'mqtt'
import { FastifyBaseLogger } from 'fastify'

import { getEnv } from 'config/env'

declare global {
  // eslint-disable-next-line no-var
  var __mqttClient__: mqtt.MqttClient
}

const getMqttOptions = (): mqtt.IClientOptions => {
  const {
    MQTT_CLEAN,
    MQTT_CLIENT_ID,
    MQTT_CONNECT_TIMEOUT,
    MQTT_HOST,
    MQTT_KEEPALIVE,
    MQTT_PASS,
    MQTT_PORT,
    MQTT_PROTOCOL,
    MQTT_RECONNECT_PERIOD,
    MQTT_USER
  } = getEnv()

  return {
    clean: MQTT_CLEAN,
    clientId: MQTT_CLIENT_ID ?? `doorcloud-backend-${process.pid}`,
    connectTimeout: MQTT_CONNECT_TIMEOUT,
    host: MQTT_HOST,
    keepalive: MQTT_KEEPALIVE,
    password: MQTT_PASS,
    port: MQTT_PORT,
    protocol: MQTT_PROTOCOL,
    reconnectPeriod: MQTT_RECONNECT_PERIOD,
    resubscribe: true,
    username: MQTT_USER
  }
}
const namespace = 'DoorCloud:Mqtt:Server'
const debugMessage = 'Connected to mqtt server'

const writeDebug = (message: string) => {
  import('debug').then(debug => {
    const clientDebug = debug.default(namespace)

    clientDebug(message)
  })
}

const logInfo = (
  log: FastifyBaseLogger | undefined,
  message: string,
  metadata = {}
) => {
  if (log) log.info(metadata, message)
  else writeDebug(message)
}

const logError = (
  log: FastifyBaseLogger | undefined,
  message: string,
  error: Error
) => {
  if (log) log.error({ error }, message)
  else writeDebug(`${message}: ${error.message}`)
}

const attachLifecycleLogging = (
  client: mqtt.MqttClient,
  log?: FastifyBaseLogger
) => {
  client.on('connect', () => {
    logInfo(log, debugMessage, {
      clientId: client.options.clientId,
      host: client.options.host,
      port: client.options.port,
      protocol: client.options.protocol
    })
  })
  client.on('reconnect', () => {
    logInfo(log, 'Reconnecting to mqtt server')
  })
  client.on('offline', () => {
    logInfo(log, 'MQTT client is offline')
  })
  client.on('close', () => {
    logInfo(log, 'MQTT connection closed')
  })
  client.on('error', error => {
    logError(log, 'MQTT connection error', error)
  })
}

const getClient = (log?: FastifyBaseLogger) => {
  if (!global.__mqttClient__) {
    global.__mqttClient__ = mqtt.connect(getMqttOptions())
    attachLifecycleLogging(global.__mqttClient__, log)
  }

  return global.__mqttClient__
}

const stopClient = async (client: mqtt.MqttClient): Promise<void> =>
  await new Promise((resolve, reject) => {
    client.end(false, {}, error => {
      if (error) {
        reject(error)

        return
      }

      resolve()
    })
  })

const mqttConnection = (log: FastifyBaseLogger) => ({
  start: async () => {
    const { applyRoutes } = await import('./router')

    applyRoutes(getClient(log), log)

    return global.__mqttClient__
  },
  stop: async () => {
    if (!global.__mqttClient__) return

    await stopClient(global.__mqttClient__)
    Reflect.deleteProperty(global, '__mqttClient__')
  }
})

export { getClient, getMqttOptions, mqttConnection, namespace, debugMessage }
