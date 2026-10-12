import type { CatalogItem } from './types';

export function catalogScores(item: Pick<CatalogItem, 'imdbRating' | 'imdbVotes'>): {
  rating: number | null;
  votes: number | null;
} {
  const rating = item.imdbRating;
  const votes = item.imdbVotes;
  if (
    rating != null &&
    rating > 10 &&
    votes != null &&
    votes >= 0 &&
    votes <= 10
  ) {
    return { rating: votes, votes: Math.round(rating) };
  }
  return {
    rating: rating != null && rating >= 0 && rating <= 10 ? rating : null,
    votes,
  };
}

export function compareByImdbRating(a: CatalogItem, b: CatalogItem): number {
  const left = catalogScores(a);
  const right = catalogScores(b);
  return (
    (right.rating ?? -1) - (left.rating ?? -1) ||
    (right.votes ?? 0) - (left.votes ?? 0)
  );
}
