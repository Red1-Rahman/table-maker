import type { ImageConfig } from '@/types/schema';

const OBJECT_FIT: Record<ImageConfig['fitMode'], string> = {
  contain: 'contain',
  cover: 'cover',
  stretch: 'fill',
  original: 'none',
  center: 'none',
};

export function ImageCell({ image }: { image: ImageConfig }) {
  return (
    <div style={{ position: 'absolute', inset: 2, overflow: 'hidden' }}>
      <img
        src={image.src}
        alt={image.altText ?? ''}
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: OBJECT_FIT[image.fitMode] as 'contain',
          objectPosition: image.fitMode === 'original' ? 'left top' : 'center',
          display: 'block',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
