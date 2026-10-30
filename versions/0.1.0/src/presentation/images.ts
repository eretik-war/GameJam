import hero from '../../../../assets/images/test1.jpg';
import enemy from '../../../../assets/images/tes2.jpg';
import burning from '../../../../assets/images/fire.jpg';
import blindness from '../../../../assets/images/blindness.png';
import stun from '../../../../assets/images/stun.jpg';
import regeneration from '../../../../assets/images/regeneration.png';
import battleLocation from '../../../../assets/images/battle-location.png';

const images: Readonly<Record<string, string>> = Object.freeze({
  'images/test1.jpg': hero,
  'images/tes2.jpg': enemy,
  'images/fire.jpg': burning,
  'images/blindness.png': blindness,
  'images/stun.jpg': stun,
  'images/regeneration.png': regeneration,
  'images/battle-location.png': battleLocation,
});
export function resolveImage(path: string): string {
  const image = images[path];
  if (!image) throw new Error(`Unknown image asset: ${path}`);
  return image;
}
