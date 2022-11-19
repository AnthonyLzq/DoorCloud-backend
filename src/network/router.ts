import { MqttClient } from 'mqtt'
import * as Routes from './routes'

const applyRoutes = (client: MqttClient) => {
  ;(Object.keys(Routes) as (keyof typeof Routes)[]).forEach(route => {
    Routes[route].sub(client)
  })
}

export { applyRoutes }
