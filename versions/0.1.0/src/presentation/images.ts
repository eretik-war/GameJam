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
import stand1 from '../../../../assets/images/hero/Stand1.png';
import stand2 from '../../../../assets/images/hero/Stand2.png';
import stand3 from '../../../../assets/images/hero/Stand3.png';

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
  'images/hero/Stand1.png': stand1,
  'images/hero/Stand2.png': stand2,
  'images/hero/Stand3.png': stand3,
});
export function resolveImage(path: string): string {
  const image = images[path];
  if (!image) throw new Error(`Unknown image asset: ${path}`);
  return image;
}
