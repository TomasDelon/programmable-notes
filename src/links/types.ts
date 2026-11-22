/** D1-L4 v0.1 development contract. No application or editor authority. */
export type LinkDocument = Readonly<{
  id: string;
  title: string;
  folder: string;
  trashed: boolean;
  source: string;
}>;

/** Half-open UTF-16 offsets in the exact original source string. */
export type LinkSourceSpan = Readonly<{
  from: number;
  to: number;
  raw: string;
  target: string;
  alias?: string;
}>;

export type LinkResolution = Readonly<{
  span: LinkSourceSpan;
  status: 'resolved' | 'missing' | 'ambiguous' | 'trashed';
  targetId?: string;
}>;

/** An actual parser's source-positioned Markdown/MDX AST shape. */
export type SyntaxNode = Readonly<{
  type: string;
  position?: Readonly<{
    start?: Readonly<{ offset?: number }>;
    end?: Readonly<{ offset?: number }>;
  }>;
  children?: readonly SyntaxNode[];
}>;

export type RawRange = Readonly<{ from: number; to: number }>;

export type SourceLinkResolutions = Readonly<{
  sourceDocumentId: string;
  links: readonly LinkResolution[];
}>;

export type Backlink = Readonly<{
  sourceDocumentId: string;
  targetDocumentId: string;
  sourceTitle: string;
  from: number;
  to: number;
  raw: string;
  displayText: string;
}>;

/** A proposal only; this module deliberately provides no mutating apply function. */
export type RenamePatch = Readonly<{
  from: number;
  to: number;
  expected: string;
  replacement: string;
}>;

export type RenameProposal = Readonly<{
  sourceDocumentId: string;
  expectedSource: string;
  patches: readonly RenamePatch[];
}>;
