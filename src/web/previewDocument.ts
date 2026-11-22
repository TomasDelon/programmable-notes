import runtime from '../../.cache/runtime.js?raw';
import fonts from '../../.cache/web-fonts.txt?raw';
import { previewStyles } from './previewStyles';
import { validateAssetCatalog, type StoredAsset } from '../assets/catalog';

export async function webPreviewDocument(
  code: string,
  theme: 'light' | 'dark',
  compact = false,
  images: readonly StoredAsset[] = [],
) {
  const catalog = Object.fromEntries(images.map((image) => [image.id, image]));
  validateAssetCatalog(catalog);
  if (images.some((image) => image.mime === 'application/pdf'))
    throw new Error(
      'Only validated raster images may enter the document preview.',
    );
  const script = (
    runtime +
    `\nconst R=__PN.React;
const report=message=>parent.postMessage({type:'preview-error',message:String(message).slice(0,2000)},'*');
addEventListener('error',event=>report(event.message));
addEventListener('unhandledrejection',event=>report(event.reason));
class Boundary extends R.Component { constructor(p){super(p);this.state={error:null};} static getDerivedStateFromError(e){return {error:String(e)};} componentDidCatch(e){report(e);} render(){return this.state.error ? R.createElement('pre',null,this.state.error):this.props.children;} }
const root=document.getElementById('preview');
let sizeFrame=0,lastHeight=0;
function measure(){
  if(sizeFrame)return;
  sizeFrame=requestAnimationFrame(()=>{
    sizeFrame=0;
    const height=Math.max(120,Math.min(100000,Math.ceil(Math.max(root.scrollHeight,root.getBoundingClientRect().height))));
    if(height!==lastHeight){lastHeight=height;parent.postMessage({type:'preview-size',height},'*');}
  });
}
new ResizeObserver(measure).observe(root);
document.fonts.ready.then(measure);
addEventListener('message',event=>{
  if(event.source!==parent)return;
  const data=event.data;
  if(!data||typeof data!=='object'||Object.keys(data).length!==3||data.type!=='preview-appearance'||!['light','dark'].includes(data.theme)||typeof data.compact!=='boolean')return;
  document.documentElement.dataset.theme=data.theme;
  document.documentElement.dataset.compact=String(data.compact);
  measure();
});
const imageAssets=new Map(${JSON.stringify(images)}.map(asset=>['attachment:'+asset.id,asset]));
function AttachmentImage(props){
  const asset=imageAssets.get(props.src),canvas=R.useRef(null),[failure,setFailure]=R.useState('');
  R.useEffect(()=>{
    if(!asset)return;
    let active=true;
    if(typeof createImageBitmap!=='function'){setFailure('Use the Attachments panel to view this image.');return;}
    const bytes=Uint8Array.from(atob(asset.base64),value=>value.charCodeAt(0));
    createImageBitmap(new Blob([bytes],{type:asset.mime})).then(bitmap=>{
      try {
        if(!active)return;
        if(bitmap.width!==asset.width||bitmap.height!==asset.height)throw Error('Image dimensions changed.');
        const target=canvas.current;
        if(!target)return;
        const context=target.getContext('2d');
        if(!context)throw Error('Canvas rendering is unavailable.');
        context.drawImage(bitmap,0,0);
        measure();
      }catch(error){if(active)setFailure('This image could not be displayed. Use the Attachments panel.');}
      finally{bitmap.close();}
    },()=>{if(active)setFailure('This image could not be decoded. Use the Attachments panel.');});
    return()=>{active=false;};
  },[asset]);
  if(!asset)return R.createElement('span',{role:'note'},props.alt||'Image unavailable');
  if(failure)return R.createElement('span',{role:'status'},failure);
  return R.createElement('canvas',{ref:canvas,width:asset.width,height:asset.height,role:'img','aria-label':props.alt||asset.name,style:{maxWidth:'100%',height:'auto',display:'block'}},props.alt||asset.name);
}
function DocumentLink(props){
  if(typeof props.href==='string'&&props.href.startsWith('attachment:'))return R.createElement('span',{title:'Download this file from the Attachments panel.'},props.children);
  return R.createElement('a',props);
}
const components={img:AttachmentImage,a:DocumentLink};
__PN.mount=Doc=>__PN.createRoot(root).render(R.createElement(Boundary,null,R.createElement(Doc,{components})));
try {\n` +
    code +
    `\n} catch(e){report(e);root.textContent=String(e);}
measure();`
  ).replace(/<\/script/gi, '<\\/script');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(script),
  );
  const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
  // Raster attachments decode directly into canvas, without image URLs.
  // The only addition to the native CSP is bundled data fonts. Network, frame,
  // storage, download and parent-origin authority remain outside this document.
  return `<!doctype html><html lang="en" data-theme="${theme}" data-compact="${compact}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src data:; media-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><style>${fonts}\n${previewStyles()}</style></head><body><div id="preview"></div><script>${script}</script></body></html>`;
}
