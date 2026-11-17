import runtime from '../../.cache/runtime.js?raw';

export async function previewDocument(code: string) {
  const script = (
    runtime +
    `\nconst R=__PN.React;
const report=message=>parent.postMessage({type:'preview-error',message:String(message).slice(0,2000)},'*');
addEventListener('error',event=>report(event.message));
addEventListener('unhandledrejection',event=>report(event.reason));
class Boundary extends R.Component { constructor(p){super(p);this.state={error:null};} static getDerivedStateFromError(e){return {error:String(e)};} componentDidCatch(e){report(e);} render(){return this.state.error ? R.createElement('pre',null,this.state.error):this.props.children;} }
__PN.mount=Doc=>__PN.createRoot(document.getElementById('preview')).render(R.createElement(Boundary,null,R.createElement(Doc)));
try {\n` +
    code +
    `\n} catch(e){report(e);document.getElementById('preview').textContent=String(e);}`
  ).replace(/<\/script/gi, '<\\/script');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(script),
  );
  const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; media-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"></head><body><div id="preview"></div><script>${script}</script></body></html>`;
}
