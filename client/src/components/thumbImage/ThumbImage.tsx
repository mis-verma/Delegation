import { useState, type ImgHTMLAttributes } from 'react';
import { withWidth } from './withWidth';

type ThumbImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'width'> & {
  src: string;
  alt: string;
  width?: number;
};

export const ThumbImage = ({ src, alt, width = 320, ...rest }: ThumbImageProps) => {
  const [failed, setFailed] = useState(false);
  return <img loading="lazy" decoding="async" {...rest} src={failed ? src : withWidth(src, width)} alt={alt} onError={() => setFailed(true)} />;
};
