/**
 * `refractor` v5 publishes its types only through the package `exports` map,
 * which TypeScript's `moduleResolution: "node"` cannot resolve. Mirror the
 * small surface the editor uses. Runtime resolution (bundlers, jest, node ESM)
 * uses the real package.
 */
declare module 'refractor/core' {
  import type { Root } from 'hast';

  export interface RefractorSyntax {
    (prism: unknown): void;
    displayName: string;
    aliases: ReadonlyArray<string>;
  }

  export const refractor: {
    register(syntax: RefractorSyntax): void;
    registered(aliasOrLanguage: string): boolean;
    highlight(value: string, language: string): Root;
  };
}

declare module 'refractor/markdown' {
  import type { RefractorSyntax } from 'refractor/core';

  const markdown: RefractorSyntax;
  export default markdown;
}
