import mqtt from 'mqtt'
import debug from 'debug'

import * as mqttServer from '../src/network/mqtt'
import * as router from '../src/network/router'

beforeAll(async () => {
  await mqttServer.start()
})

afterAll(async () => {
  await mqttServer.stop()
})

const mockDebug = jest.fn()

jest.mock('mqtt', () => {
  return {
    connect: jest.fn(() => {
      return {
        on: jest.fn().mockImplementation(() => {
          mockDebug(mqttServer.debugMessage)
        }),
        end: jest.fn(),
        subscribe: jest.fn()
      }
    })
  }
})

jest.mock('debug', () => {
  return jest.fn()
})

const applyRoutes = jest.spyOn(router, 'applyRoutes')

describe('DoorCloud backend tests', () => {
  describe('Server', () => {
    test('Client connect should be called once', async () => {
      expect(mqtt.connect).toHaveBeenCalled()
    })

    test(`Client debug should be called with "${mqttServer.namespace}"`, async () => {
      expect(debug).toHaveBeenCalled()
      expect(debug).toHaveBeenCalledWith(mqttServer.namespace)
    })

    test(`Client serverDebug should be called with "${mqttServer.debugMessage}"`, async () => {
      expect(mockDebug).toHaveBeenCalled()
      expect(mockDebug).toHaveBeenCalledWith(mqttServer.debugMessage)
    })

    test('applyRoutes method should be called once', () => {
      expect(applyRoutes).toHaveBeenCalledTimes(1)
    })
  })
})
