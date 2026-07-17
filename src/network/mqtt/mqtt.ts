import { getEnv } from 'config/env'
import type { FastifyBaseLogger } from 'fastify'
import mqtt from 'mqtt'
import { applyRoutes } from './router'

declare global {
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

const isAuthenticationError = (error: Error): boolean => {
  const errorCode = (error as Error & { code?: unknown }).code

  return errorCode === 4 || errorCode === 5 || errorCode === 'Not authorized'
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

    if (isAuthenticationError(error)) {
      logError(log, 'Stopping MQTT reconnect after authentication error', error)
      client.end(true)
    }
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

const removeStartupListeners = (
  client: mqtt.MqttClient,
  onConnect: () => void,
  onClose: () => void,
  onError: (error: Error) => void
) => {
  client.removeListener('connect', onConnect)
  client.removeListener('close', onClose)
  client.removeListener('error', onError)
}

const rejectStartup = async (
  client: mqtt.MqttClient,
  error: Error
): Promise<never> => {
  client.end(true)
  Reflect.deleteProperty(global, '__mqttClient__')

  throw error
}

const waitForClientConnect = async (client: mqtt.MqttClient): Promise<void> => {
  const { MQTT_CONNECT_TIMEOUT } = getEnv()

  if ((client as mqtt.MqttClient & { connected?: boolean }).connected) return

  await new Promise<void>((resolve, reject) => {
    const onConnect = () => {
      clearTimeout(timeout)
      removeStartupListeners(client, onConnect, onClose, onError)
      resolve()
    }
    const onClose = () => {
      clearTimeout(timeout)
      removeStartupListeners(client, onConnect, onClose, onError)
      reject(new Error('MQTT connection closed before startup completed'))
    }
    const onError = (error: Error) => {
      clearTimeout(timeout)
      removeStartupListeners(client, onConnect, onClose, onError)
      reject(error)
    }
    const timeout = setTimeout(() => {
      removeStartupListeners(client, onConnect, onClose, onError)
      reject(
        new Error(`MQTT connection timed out after ${MQTT_CONNECT_TIMEOUT}ms`)
      )
    }, MQTT_CONNECT_TIMEOUT)

    client.once('connect', onConnect)
    client.once('close', onClose)
    client.once('error', onError)
  }).catch(error => rejectStartup(client, error as Error))
}

const mqttConnection = (log: FastifyBaseLogger) => ({
  start: async () => {
    const client = getClient(log)

    await waitForClientConnect(client)

    try {
      await applyRoutes(client, log)
    } catch (error) {
      await rejectStartup(client, error as Error)
    }

    return global.__mqttClient__
  },
  stop: async () => {
    if (!global.__mqttClient__) return

    await stopClient(global.__mqttClient__)
    Reflect.deleteProperty(global, '__mqttClient__')
  }
})

export { debugMessage, getClient, getMqttOptions, mqttConnection, namespace }
