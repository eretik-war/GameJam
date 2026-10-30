import hero from '../../../../assets/images/test1.jpg';
import burning from '../../../../assets/images/testeffect.jpg';
import magenta from '../../../../assets/images/enemies/camera-magenta.png';
import teal from '../../../../assets/images/enemies/camera-teal.png';
import blue from '../../../../assets/images/enemies/camera-blue.png';
import gold from '../../../../assets/images/enemies/camera-gold.png';
import leg from '../../../../assets/images/enemies/shooter-leg.png';

const images: Readonly<Record<string, string>> = Object.freeze({
  'images/test1.jpg': hero,
  'images/testeffect.jpg': burning,
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
