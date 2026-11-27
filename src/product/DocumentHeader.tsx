export function DocumentHeader({ title }: { title: string }) {
  return (
    <h1 className="doc-title-text" aria-label="Document title">
      {title}
    </h1>
  );
}
