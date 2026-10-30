import hero from '../../../../assets/images/test1.jpg';
import enemy from '../../../../assets/images/tes2.jpg';
import burning from '../../../../assets/images/fire.jpg';
import blindness from '../../../../assets/images/blindness.png';
import stun from '../../../../assets/images/stun.jpg';
import regeneration from '../../../../assets/images/regeneration.png';
import battleLocation from '../../../../assets/images/battle-location.png';
import stand1 from '../../../../assets/images/hero/Stand1.png';
import stand2 from '../../../../assets/images/hero/Stand2.png';
import stand3 from '../../../../assets/images/hero/Stand3.png';
import itemMagenta from '../../../../assets/images/items/item-magenta.png';
import itemTeal from '../../../../assets/images/items/item-teal.png';
import itemBlue from '../../../../assets/images/items/item-blue.png';
import itemGold from '../../../../assets/images/items/item-gold.png';

const images: Readonly<Record<string, string>> = Object.freeze({
  'images/items/item-magenta.png': itemMagenta,
  'images/items/item-teal.png': itemTeal,
  'images/items/item-blue.png': itemBlue,
  'images/items/item-gold.png': itemGold,
  'images/test1.jpg': hero,
  'images/tes2.jpg': enemy,
  'images/fire.jpg': burning,
  'images/blindness.png': blindness,
  'images/stun.jpg': stun,
  'images/regeneration.png': regeneration,
  'images/battle-location.png': battleLocation,
  'images/hero/Stand1.png': stand1,
  'images/hero/Stand2.png': stand2,
  'images/hero/Stand3.png': stand3,
});
export function resolveImage(path: string): string {
  const image = images[path];
  if (!image) throw new Error(`Unknown image asset: ${path}`);
  return image;
}
