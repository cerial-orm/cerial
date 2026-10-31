import { f, model, object } from '../../../../src/schema';

export const ReviewMeta = object('ReviewMeta', {
  note: f.string().defaultAlways('pending review'),
  flagged: f.bool().defaultAlways(false),
});

export const ContentItem = model('ContentItem', {
  id: f.record().id(),
  title: f.string(),
  body: f.string(),
  reviewed: f.bool().defaultAlways(false),
  syncStatus: f.string().defaultAlways('dirty'),
  retryCount: f.int().defaultAlways(0),
  score: f.float().defaultAlways(1.0),
  meta: f.object(ReviewMeta).optional(),
});
