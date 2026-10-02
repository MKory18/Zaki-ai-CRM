import ReactDOM from 'react-dom';
import { SIZES_HERO, heroPreload } from '@/lib/responsive-image';

/**
 * THE PRODUCT PHOTOGRAPH, ASKED FOR BEFORE IT IS REACHED.
 *
 * It renders nothing. Its whole job is the call below, which is React's
 * own way of adding a preload — and the reason it is a call rather than a
 * `<link rel="preload">` written in the page is measured: React hoists a
 * hand-written one into the head, the hoisted copy loses its `href`, and
 * the copy in the body stays. Two preload elements for one picture, and an
 * extra request for it. A preload that causes a second fetch is worse than
 * none.
 *
 * `imageSrcSet` and `imageSizes` must match the element's exactly, or the
 * browser preloads one render and then paints a different one.
 */
export function PreloadHero({ image }: { image: string | null | undefined }) {
  const p = heroPreload(image);
  if (!p) return null;

  ReactDOM.preload(p.href, {
    as: 'image',
    fetchPriority: 'high',
    ...(p.imageSrcSet ? { imageSrcSet: p.imageSrcSet, imageSizes: SIZES_HERO } : {}),
  });

  return null;
}
