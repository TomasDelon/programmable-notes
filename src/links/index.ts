export {
  MAX_LINK_SOURCE_UNITS,
  MAX_LINK_MARKERS,
  withinLinkAnalysisBudget,
  collectLiteralTextRanges,
  validLinkTarget,
  parseWikilinks,
} from './parse';
export {
  validFolder,
  buildLinkCatalog,
  resolveWikilinks,
  resolveWithCatalog,
} from './resolve';
export { deriveBacklinks } from './backlinks';
export { proposeRenameReferences } from './rename';
export type {
  LinkDocument,
  LinkSourceSpan,
  LinkResolution,
  SyntaxNode,
  RawRange,
  SourceLinkResolutions,
  Backlink,
  RenamePatch,
  RenameProposal,
} from './types';
export { parseSourceWikilinks, indexWorkspaceLinks } from './workspaceLinks';
export type { WorkspaceLinkIndex } from './workspaceLinks';
