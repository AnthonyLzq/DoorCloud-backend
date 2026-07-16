import mqtt from 'mqtt'
import { FastifyBaseLogger } from 'fastify'

import { getEnv } from 'config/env'

declare global {
  // eslint-disable-next-line no-var
  var __mqttClient__: mqtt.MqttClient
}

const getMqttOptions = (): mqtt.IClientOptions => {
  const { MQTT_HOST, MQTT_PASS, MQTT_PORT, MQTT_PROTOCOL, MQTT_USER } = getEnv()

  return {
    port: MQTT_PORT,
    host: MQTT_HOST,
    protocol: MQTT_PROTOCOL,
    keepalive: 0,
    username: MQTT_USER,
    password: MQTT_PASS
  }
}
const namespace = 'DoorCloud:Mqtt:Server'
const debugMessage = 'Connected to mqtt server'

const getClient = (log?: FastifyBaseLogger) => {
  if (!global.__mqttClient__) {
    global.__mqttClient__ = mqtt.connect(getMqttOptions())
    global.__mqttClient__.on('connect', () => {
      if (log) log?.info({}, debugMessage)
      else
        import('debug').then(debug => {
          const clientDebug = debug.default(namespace)

          clientDebug(debugMessage)
        })
    })
  }

  return global.__mqttClient__
}

const mqttConnection = (log: FastifyBaseLogger) => ({
  start: async () => {
    const { applyRoutes } = await import('./router')

    applyRoutes(getClient(log), log)

    return global.__mqttClient__
  },
  stop: async () => {
    getClient(log).end()
  }
})

export { getClient, getMqttOptions, mqttConnection, namespace, debugMessage }
