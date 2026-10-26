export const withWidth = (src: string, width: number) => `${src}${src.includes('?') ? '&' : '?'}w=${width}`;
