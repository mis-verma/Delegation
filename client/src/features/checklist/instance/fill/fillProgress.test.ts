import { describe, expect, it } from 'vitest';
import { photosMissingOf } from './fillProgress';
import type { ChecklistInstanceImage, ChecklistInstanceItem } from '../../../../api/checklistInstances';

const photo = (over: Partial<ChecklistInstanceImage> = {}): ChecklistInstanceImage => ({
  id: `img-${Math.random()}`,
  url: '/uploads/a.jpg',
  mimeType: 'image/jpeg',
  name: 'a.jpg',
  captureMethod: 'LIVE',
  ...over,
} as ChecklistInstanceImage);

let seq = 0;
const item = (over: Partial<ChecklistInstanceItem> = {}): ChecklistInstanceItem => ({
  id: `item-${(seq += 1)}`,
  label: `Question ${seq}`,
  order: seq,
  floor: null,
  section: null,
  sectionOwnerId: null,
  isDone: true,
  completedAt: null,
  completedBy: null,
  completedByName: null,
  requiredImageCount: 1,
  maxImageCount: null,
  requiresLivePhoto: false,
  isCritical: false,
  itemType: 'STANDARD',
  accessories: [],
  numberEntryUnit: null,
  numberEntryMin: null,
  numberEntryMax: null,
  ratingScale: null,
  numericValue: null,
  options: [],
  booleanAnswer: 'YES',
  textValue: null,
  dateValue: null,
  gpsTargetLat: null,
  gpsTargetLng: null,
  gpsRadiusMeters: null,
  gpsLat: null,
  gpsLng: null,
  gpsAccuracy: null,
  gpsCapturedAt: null,
  signatureLabels: [],
  signatureValue: null,
  secondSignatureValue: null,
  qrExpectedValue: null,
  cashExpectedAmount: null,
  yesActions: [],
  noActions: [],
  acceptableAnswers: null,
  acceptableMin: null,
  acceptableMax: null,
  conditionalReasonValue: null,
  remarks: null,
  isNotApplicable: false,
  reviewRemark: null,
  sendBackNote: null,
  sendBackCount: 0,
  waivedAt: null,
  waivedBy: null,
  waiveReason: null,
  issueId: null,
  instanceId: 'run-1',
  images: [],
  submissions: [],
  ...over,
});

describe('photosMissingOf', () => {
  it('counts an answered question that still owes its photo', () => {
    const owing = item();
    expect(photosMissingOf([owing])).toEqual({ count: 1, firstId: owing.id });
  });

  it('leaves an unanswered question alone, so a fresh run starts clean', () => {
    expect(photosMissingOf([item({ isDone: false })])).toEqual({ count: 0, firstId: null });
  });

  it('clears once the photo is there', () => {
    expect(photosMissingOf([item({ images: [photo()] })])).toEqual({ count: 0, firstId: null });
  });

  it('still owes when the question wants two and has one', () => {
    const owing = item({ requiredImageCount: 2, images: [photo()] });
    expect(photosMissingOf([owing])).toEqual({ count: 1, firstId: owing.id });
  });

  it('does not accept a gallery photo where a live one is required', () => {
    const owing = item({ requiresLivePhoto: true, images: [photo({ captureMethod: 'GALLERY' })] });
    expect(photosMissingOf([owing])).toEqual({ count: 1, firstId: owing.id });
  });

  it('ignores a question marked not applicable', () => {
    expect(photosMissingOf([item({ isNotApplicable: true, isDone: false })])).toEqual({ count: 0, firstId: null });
  });

  it('ignores a waived question, the same as everywhere else', () => {
    expect(photosMissingOf([item({ waivedAt: '2026-11-25T04:00:00.000Z' })])).toEqual({ count: 0, firstId: null });
  });

  it('ignores a question that asks for no photo at all', () => {
    expect(photosMissingOf([item({ requiredImageCount: 0 })])).toEqual({ count: 0, firstId: null });
  });

  it('points at the first one owing, not the first in the list', () => {
    const fine = item({ images: [photo()] });
    const owing = item();
    const alsoOwing = item();
    expect(photosMissingOf([fine, owing, alsoOwing])).toEqual({ count: 2, firstId: owing.id });
  });

  it('reads an empty run as nothing owing', () => {
    expect(photosMissingOf([])).toEqual({ count: 0, firstId: null });
  });

  it('counts a Yes answer still owing the photo its rule required', () => {
    const owing = item({ itemType: 'YES_NO', requiredImageCount: 0, booleanAnswer: 'YES', yesActions: ['REQUIRE_PHOTO'] });
    expect(photosMissingOf([owing])).toEqual({ count: 1, firstId: owing.id });
  });

  it('clears once that conditional photo is there', () => {
    const settled = item({
      itemType: 'YES_NO',
      requiredImageCount: 0,
      booleanAnswer: 'YES',
      yesActions: ['REQUIRE_PHOTO'],
      images: [photo({ purpose: 'CONDITIONAL_YES' })],
    });
    expect(photosMissingOf([settled])).toEqual({ count: 0, firstId: null });
  });

  it('does not accept a photo taken for the other answer', () => {
    const owing = item({
      itemType: 'YES_NO',
      requiredImageCount: 0,
      booleanAnswer: 'YES',
      yesActions: ['REQUIRE_PHOTO'],
      images: [photo({ purpose: 'CONDITIONAL_NO' })],
    });
    expect(photosMissingOf([owing])).toEqual({ count: 1, firstId: owing.id });
  });

  it('applies a No-only photo rule to a Yes answer too', () => {
    const owing = item({ itemType: 'YES_NO', requiredImageCount: 0, booleanAnswer: 'YES', noActions: ['REQUIRE_PHOTO'] });
    expect(photosMissingOf([owing])).toEqual({ count: 1, firstId: owing.id });
  });

  it('leaves a plain Yes/No with no photo rule alone', () => {
    expect(photosMissingOf([item({ itemType: 'YES_NO', requiredImageCount: 0, booleanAnswer: 'YES' })])).toEqual({ count: 0, firstId: null });
  });
});
