// Test-only controlled host, never a production entry or native IPC bridge.
import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import {
  SourceEditor,
  type EditorCommands,
} from '../../src/editor/SourceEditor';
import type {
  SourceSession,
  SourceWitness,
} from '../../src/editor/sourceWitness';
import { NotificationProvider } from '../../src/ui/Notifications';

function Fixture() {
  const owned = useRef<SourceWitness>({
    sessionId: 'browser-session',
    editorRevision: 0,
    source: 'Paragraph $x$.\r\n',
  });
  const [echo, setEcho] = useState(owned.current);
  const [status, setStatus] = useState({
    ...owned.current,
    publications: 0,
    failed: '',
  });
  const [preview, setPreview] = useState(true);
  const [location, setLocation] = useState<number | null>(null);
  const captured = useRef(owned.current);
  const commands = useRef<EditorCommands>(null);
  const isCurrent = (witness: SourceWitness) =>
    witness.sessionId === owned.current.sessionId &&
    witness.editorRevision === owned.current.editorRevision &&
    witness.source === owned.current.source;
  const session: SourceSession = {
    witness: echo,
    isCurrent,
    validate: (batch) => isCurrent(batch.expected),
    publish: (batch) => {
      if (!isCurrent(batch.expected)) throw Error('stale fixture publication');
      owned.current = {
        ...owned.current,
        editorRevision: owned.current.editorRevision + 1,
        source: batch.source,
      };
      setStatus((before) => ({
        ...owned.current,
        publications: before.publications + 1,
        failed: before.failed,
      }));
      return owned.current;
    },
    retainFailure: (batch) =>
      setStatus((before) => ({ ...before, failed: batch.source })),
  };
  return (
    <NotificationProvider>
      <nav>
        <button onClick={() => setPreview(false)}>Source</button>
        <button onClick={() => setPreview(true)}>Preview</button>
        <button onClick={() => setEcho({ ...owned.current })}>
          Echo current props
        </button>
        <button
          onClick={() => {
            captured.current = { ...owned.current };
          }}
        >
          Capture location
        </button>
        <button
          onClick={() => {
            commands.current?.revealSource(
              4,
              captured.current.source,
              captured.current,
            );
            const dom = document.querySelector<HTMLElement>('.cm-editor');
            setLocation(
              dom
                ? EditorView.findFromDOM(dom)!.state.selection.main.anchor
                : null,
            );
          }}
        >
          Reveal captured location
        </button>
      </nav>
      <output data-testid="state">{JSON.stringify(status)}</output>
      <output data-testid="location">{location}</output>
      <SourceEditor
        source={echo.source}
        session={session}
        onChange={() => {
          throw Error('duplicate legacy publication');
        }}
        documentKey="note.mdx"
        commandsRef={commands}
        rendered={{
          active: preview,
          files: { 'note.mdx': echo.source },
          entry: 'note.mdx',
          theme: 'light',
          images: [],
          stopped: true,
        }}
      />
    </NotificationProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
