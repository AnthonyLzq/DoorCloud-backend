import Camera from 'local/Camera';
import fs from 'fs';
class CameraService {
  localCamera: Camera = new Camera();

  /**
   * Thake a picture and return the base64 string
   * @returns {Promise<string>}
   */
  public async takePicture(): Promise<string> {
    try {
      const photoName = await this.localCamera.takePicture();
      //Find the image in the media folder and conver to buffer
      const image = fs.readFileSync(photoName);
      //Convert the image to base64
      const imageBase64 = image.toString('base64');
      //Delete the image from the media folder
      fs.unlinkSync(photoName);
      //Send the image to the cloud
      return imageBase64;
    } catch (error) {
      throw error;
    }
  }
}

export default CameraService;
