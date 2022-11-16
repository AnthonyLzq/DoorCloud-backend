import { MqttClient } from 'mqtt'
import { demo } from './routes'

const routes = [demo]

const applyRoutes = (client: MqttClient) => {
  routes.forEach(route => {
    route.pub(client)
    route.sub(client)
  })
}

export { applyRoutes }
