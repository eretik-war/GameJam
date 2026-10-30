import hero from '../../../../assets/images/test1.jpg';
import burning from '../../../../assets/images/fire.jpg';
import blindness from '../../../../assets/images/blindness.png';
import stun from '../../../../assets/images/stun.jpg';
import regeneration from '../../../../assets/images/regeneration.png';
import battleLocation from '../../../../assets/images/battle-location.png';
import magenta from '../../../../assets/images/enemies/camera-magenta.png';
import teal from '../../../../assets/images/enemies/camera-teal.png';
import blue from '../../../../assets/images/enemies/camera-blue.png';
import gold from '../../../../assets/images/enemies/camera-gold.png';
import leg from '../../../../assets/images/enemies/shooter-leg.png';

const images: Readonly<Record<string, string>> = Object.freeze({
  'images/test1.jpg': hero,
  'images/fire.jpg': burning,
  'images/blindness.png': blindness,
  'images/stun.jpg': stun,
  'images/regeneration.png': regeneration,
  'images/battle-location.png': battleLocation,
  'images/enemies/camera-magenta.png': magenta,
  'images/enemies/camera-teal.png': teal,
  'images/enemies/camera-blue.png': blue,
  'images/enemies/camera-gold.png': gold,
  'images/enemies/shooter-leg.png': leg,
});
export function resolveImage(path: string): string {
  const image = images[path];
  if (!image) throw new Error(`Unknown image asset: ${path}`);
  return image;
}
