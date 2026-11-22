import { parseNoteSyntax } from '../links/workspaceLinks';
import type { AssetCatalog, StoredAsset } from '../assets/catalog';

const containers = new Set([
  'root',
  'paragraph',
  'heading',
  'blockquote',
  'list',
  'listItem',
  'strong',
  'emphasis',
  'delete',
  'table',
  'tableRow',
  'tableCell',
  'link',
]);
type ImageSyntax = {
  type: string;
  url?: string;
  identifier?: string;
  alt?: string | null;
  value?: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: ImageSyntax[];
};

export interface AttachmentReference {
  readonly id: string;
  readonly label: string;
  readonly from: number;
  readonly to: number;
  readonly isImage: boolean;
}

/** Source-positioned references, including missing IDs for the trusted host UI. */
export function attachmentReferences(
  source: string,
  path: string,
): readonly AttachmentReference[] {
  if (!source.includes('attachment:sha256:')) return [];
  let tree: ImageSyntax;
  try {
    tree = parseNoteSyntax(source, path);
  } catch {
    return [];
  }
  const definitions = new Map<string, string>();
  function collectDefinitions(node: ImageSyntax) {
    if (node.type === 'definition' && node.identifier && node.url) {
      const key = node.identifier.toUpperCase();
      if (!definitions.has(key)) definitions.set(key, node.url);
    } else if (containers.has(node.type)) {
      for (const child of node.children ?? []) collectDefinitions(child);
    }
  }
  collectDefinitions(tree);
  const references: AttachmentReference[] = [];
  function include(node: ImageSyntax, url: string | undefined) {
    if (!url?.startsWith('attachment:')) return;
    const id = url.slice('attachment:'.length);
    if (!/^sha256:[a-f0-9]{64}$/.test(id)) return;
    const from = node.position?.start.offset,
      to = node.position?.end.offset;
    if (
      from === undefined ||
      to === undefined ||
      from < 0 ||
      to > source.length
    )
      return;
    const isImage = node.type === 'image' || node.type === 'imageReference';
    const label =
      node.alt ??
      node.children?.map((child) => child.value ?? '').join('') ??
      '';
    references.push({ id, label, from, to, isImage });
  }
  function visit(node: ImageSyntax) {
    if (node.type === 'image' || node.type === 'link') include(node, node.url);
    else if (
      (node.type === 'imageReference' || node.type === 'linkReference') &&
      node.identifier
    )
      include(node, definitions.get(node.identifier.toUpperCase()));
    if (containers.has(node.type))
      for (const child of node.children ?? []) visit(child);
  }
  visit(tree);
  return references;
}

/** Only images explicitly referenced by this note enter its isolated runtime. */
export function referencedPreviewAssets(
  source: string,
  path: string,
  catalog: AssetCatalog | undefined,
): readonly StoredAsset[] {
  if (!catalog) return [];
  const selected = new Map<string, StoredAsset>();
  for (const reference of attachmentReferences(source, path)) {
    if (!reference.isImage) continue;
    const asset = catalog[reference.id];
    if (
      asset?.id === reference.id &&
      ['image/png', 'image/jpeg', 'image/webp'].includes(asset.mime)
    )
      selected.set(reference.id, asset);
  }
  return [...selected.values()];
}
