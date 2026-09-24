/**
 * Present only when this app is running inside the Claude Artifact viewer
 * (the published-artifact deployment target); absent in the standalone
 * hosted build. Always feature-detect before use — see utils/saveFile.ts.
 */
export {};

declare global {
  interface Window {
    claude?: {
      use: (capability: string) => Promise<unknown>;
    };
  }
}
