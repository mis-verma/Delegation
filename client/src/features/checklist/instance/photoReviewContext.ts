import { createContext, useContext } from 'react';

export type PhotoReviewKind = 'run' | 'task' | 'ticket';

export interface PhotoReviewState {
  kind: PhotoReviewKind;
  ownerId: string;
}

export const PhotoReviewContext = createContext<PhotoReviewState | null>(null);

export const usePhotoReview = (): PhotoReviewState | null => useContext(PhotoReviewContext);
