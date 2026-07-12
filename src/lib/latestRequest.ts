export interface LatestRequestGuard {
  begin: () => number;
  isLatest: (token: number) => boolean;
}

export function createLatestRequestGuard(): LatestRequestGuard {
  let latest = 0;
  return {
    begin: () => ++latest,
    isLatest: (token) => token === latest,
  };
}
