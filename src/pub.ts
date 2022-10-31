import debug from 'debug';

import { getClient, BASE_TOPIC } from './network';
import { CameraService } from './services';
debug('DoorCloud:Mqtt:pub');

const client = getClient();

client.on('connect', () => {
  debug.log('Connected to mqtt server');
});

client.on('error', (error) => {
  console.log(error);
});

const cameraService = new CameraService();

// [TODO] - Execute this at every button press
cameraService.takePicture().then((photoBase64) => {
  client.publish(`${BASE_TOPIC}/test`, Buffer.from(photoBase64), () => {
    debug.log('Message send');
  });
});
