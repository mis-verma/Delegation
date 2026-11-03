import { createContext, useContext } from 'react';

export interface PhotoReviewState {
  instanceId: string;
}

export const PhotoReviewContext = createContext<PhotoReviewState | null>(null);

export const usePhotoReview = (): PhotoReviewState | null => useContext(PhotoReviewContext);
