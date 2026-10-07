import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export interface ScanImage {
  /** For the preview. */
  uri: string;
  /** JPEG, base64 without a data: prefix — what the reader receives. */
  base64: string;
}

/** Long side of the image sent for reading: plenty for a watch face, small enough to upload fast. */
const MAX_SIDE = 1600;

export class PhotoAccessError extends Error {}

export interface PickedImage {
  /** Local URI: file:// on phones, blob:/data: on the web. */
  uri: string;
  width: number;
  height: number;
}

/**
 * Opens the camera or the photo library and returns the picked image, or null if cancelled.
 * On the web this must be called directly from a tap handler: browsers only open the camera
 * for a user gesture, so nothing may be awaited before the picker opens.
 */
export function pickImage(source: 'camera' | 'library'): Promise<PickedImage | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
  const opened =
    Platform.OS === 'web'
      ? source === 'camera'
        ? ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.back })
        : ImagePicker.launchImageLibraryAsync(options)
      : openNative(source, options);
  return opened.then((res) => {
    const asset = res.canceled ? null : res.assets?.[0];
    return asset ? { uri: asset.uri, width: asset.width, height: asset.height } : null;
  });
}

/** Camera/library → a downsized JPEG ready for the workout reader. */
export function pickWorkoutPhoto(source: 'camera' | 'library'): Promise<ScanImage | null> {
  return pickImage(source).then((picked) => (picked ? shrink(picked) : null));
}

async function openNative(source: 'camera' | 'library', options: ImagePicker.ImagePickerOptions) {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new PhotoAccessError('Allow camera access for FORM in Settings to take photos.');
    return ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.back });
  }
  return ImagePicker.launchImageLibraryAsync(options);
}

async function shrink(asset: PickedImage): Promise<ScanImage> {
  const ctx = ImageManipulator.manipulate(asset.uri);
  const long = Math.max(asset.width || 0, asset.height || 0);
  if (long > MAX_SIDE) {
    ctx.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ base64: true, compress: 0.82, format: SaveFormat.JPEG });
  if (!out.base64) throw new Error('Could not read the photo.');
  return { uri: out.uri, base64: out.base64.replace(/^data:[^,]+,/, '') };
}
