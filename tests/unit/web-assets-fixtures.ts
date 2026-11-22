import { inspectMediaBytes } from '../../src/assets/inspection';
import {
  encodeAssetBytes,
  MEDIA_POLICY,
  type StoredAsset,
} from '../../src/assets/catalog';

export const PNG = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAFElEQVR4nGMUT17DAANMDEgAhQMAKoUBLAfJLFcAAAAASUVORK5CYII=',
    'base64',
  ),
);
export async function pngAsset(name = 'chart.png'): Promise<StoredAsset> {
  const inspected = await inspectMediaBytes(
    PNG,
    name,
    'image/png',
    MEDIA_POLICY,
  );
  return {
    id: inspected.id,
    mime: inspected.mime,
    name: inspected.safeName,
    byteLength: PNG.length,
    base64: encodeAssetBytes(PNG),
    width: inspected.width,
    height: inspected.height,
  };
}
