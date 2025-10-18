export const sleep = (ms: number): Promise<unknown> => {
  return new Promise((r) => setTimeout(r, ms));
};

export const jitter = (v: number): number => {
  return Math.floor(v * (0.7 + Math.random() * 0.6));
};
