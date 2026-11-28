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
  // Use the compiler's MathML branch with the system math renderer. This avoids
  // adding font/network permissions or adopting the browser iframe transport.
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; media-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><style>:root{font-family:system-ui,sans-serif;color-scheme:light dark}body{margin:0;padding:1.5rem;line-height:1.7;overflow-wrap:anywhere}h1,h2,h3{line-height:1.25;letter-spacing:-.025em}button,input,textarea,select{font:inherit}button{padding:.4rem .7rem;border:1px solid #8886;border-radius:.4rem;cursor:pointer}pre{white-space:pre-wrap}img{max-width:100%}.katex-html{display:none}.katex-display{display:block;text-align:center;margin:1em 0}</style></head><body><div id="preview"></div><script>${script}</script></body></html>`;
}
