const NodeWebcam = require('node-webcam');
import { DateTimeHelper } from '../helpers';
class Camera {
  opts = {
    width: 1280,
    height: 720,
    quality: 100,
    frames: 60,
    delay: 0,
    saveShots: true,
    output: 'jpeg',
    device: false,
    callbackReturn: 'location',
    verbose: true,
  };

  //Creates webcam instance
  localWebcam = NodeWebcam.create(this.opts);
  dateTimeHelpers = new DateTimeHelper();

  /**
   * Takes a picture and returns the path to the image
   * @returns {Promise<string>}
   */
  takePicture(): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeStamp = this.dateTimeHelpers.getTimeStamp();
      this.localWebcam.capture(
        `media/${timeStamp}-pic`,
        (err: Error, data: PromiseLike<string>) => {
          if (err) {
            reject(err);
          }
          resolve(data);
        }
      );
    });
  }

  /**
   * Records a video and returns the path to the video
   * @returns {Promise<string>}
   */
  recordVideo() {
    // [TODO] Implement this
  }
}

export default Camera;
