import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import { defaults, Settings, languageOf } from '../core/model';
import type { Region } from '../core/trace';
import './trace-overlay.css';
type Stroke={region:Region;points:{x:number;y:number}[];freehand:boolean};
const api=(window as any).winbot;
function Overlay(){
 const [settings,setSettings]=useState<Settings>(defaults),[strokes,setStrokes]=useState<Stroke[]>([]),[current,setCurrent]=useState<Stroke>(),[freehand,setFreehand]=useState(false),[error,setError]=useState(''),[submitting,setSubmitting]=useState(false);
 const [editing,setEditing]=useState<number|null>(null),[savedCount,setSavedCount]=useState(0),[scrolling,setScrolling]=useState(false);
 const [toolbarPos,setToolbarPos]=useState({x:Math.max(12,innerWidth-960),y:12});
 const toolbar=useRef<HTMLDivElement>(null),moving=useRef<{id:number;pointerX:number;pointerY:number;x:number;y:number}|null>(null);
 const active=useRef<Stroke|null>(null),selected=useRef<Stroke[]>([]),edge=useRef<'down'|null>(null),scrollBusy=useRef(false),scrollTicks=useRef(0);const hi=languageOf(settings,'',navigator.language)==='hi',t=(en:string,h:string)=>hi?h:en;
 const boundToolbar=(x:number,y:number)=>({x:Math.max(0,Math.min(x,innerWidth-(toolbar.current?.offsetWidth||0))),y:Math.max(0,Math.min(y,innerHeight-(toolbar.current?.offsetHeight||0)))});
 useEffect(()=>{const fit=()=>setToolbarPos(p=>boundToolbar(p.x,p.y));window.addEventListener('resize',fit);fit();return()=>window.removeEventListener('resize',fit);},[strokes.length,editing]);
 function moveDown(e:React.PointerEvent<HTMLButtonElement>){e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);moving.current={id:e.pointerId,pointerX:e.clientX,pointerY:e.clientY,...toolbarPos};}
 function moveDrag(e:React.PointerEvent<HTMLButtonElement>){const start=moving.current;if(!start||start.id!==e.pointerId)return;e.preventDefault();setToolbarPos(boundToolbar(start.x+e.clientX-start.pointerX,start.y+e.clientY-start.pointerY));}
 function moveEnd(e:React.PointerEvent<HTMLButtonElement>){if(moving.current?.id===e.pointerId)moving.current=null;}
 useEffect(()=>{void api.command('trace-get').then((r:any)=>{if(r.ok){setSettings(r.state.settings);setSavedCount(r.state.traceSavedCount||0);}});},[]);
 useEffect(()=>api.on('trace-submit-request',()=>void submit()),[savedCount,submitting]);
 const sync=(next:Stroke[])=>{selected.current=next;setStrokes(next);return api.command('trace-select',next.map(s=>s.region));};
 async function submit(){if(!selected.current.length&&!savedCount)return;edge.current=null;setSubmitting(true);const r=await api.command('trace-submit',selected.current.map(s=>s.region));if(!r.ok){setError(r.error);setSubmitting(false);}}
 async function scrollNow(direction:'up'|'down',auto=false){
  if(scrollBusy.current||submitting||active.current||(auto&&scrollTicks.current>=8))return;
  scrollBusy.current=true;setScrolling(true);
  try{
   const r=await api.command('trace-scroll',{direction,auto});
   if(!r.ok){if(r.error!=='traceScrollPointerMoved')setError(t('Could not scroll the underlying page.','नीचे का पेज स्क्रोल नहीं हुआ।')+' ['+r.error+']');edge.current=null;return;}
   if(auto)scrollTicks.current++;
   selected.current=[];setStrokes([]);setEditing(null);setSavedCount(r.state.traceSavedCount||0);setError('');
  }finally{scrollBusy.current=false;setScrolling(false);}
 }
 useEffect(()=>{const id=setInterval(()=>{if(edge.current&&!scrollBusy.current&&!active.current&&!submitting)void scrollNow(edge.current,true);},450);return()=>clearInterval(id);},[submitting]);
 const edgeAt=(y:number):'down'|null=>y>=innerHeight-55?'down':null;
 useEffect(()=>{const track=(e:PointerEvent)=>{if(active.current)return;const next=toolbar.current?.contains(e.target as Node)?null:edgeAt(e.clientY);if(!next)scrollTicks.current=0;edge.current=next;};window.addEventListener('pointermove',track);return()=>window.removeEventListener('pointermove',track);},[]);
 async function undo(){if(selected.current.length){await sync(selected.current.slice(0,-1));return;}if(savedCount){const r=await api.command('trace-undo-saved');if(r.ok)setSavedCount(r.state.traceSavedCount||0);}}
 async function clearSelections(){edge.current=null;const r=await api.command('trace-clear-selections');if(r.ok){selected.current=[];setStrokes([]);setSavedCount(0);setEditing(null);}}
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();void api.command('trace-cancel');}else if(scrollBusy.current)return;else if(e.key==='Enter'){e.preventDefault();void submit();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();setEditing(null);void undo();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[savedCount,submitting]);
 const point=(e:React.PointerEvent)=>({x:Math.max(0,Math.min(innerWidth,e.clientX)),y:Math.max(0,Math.min(innerHeight,e.clientY))});
 function down(e:React.PointerEvent<SVGSVGElement>){if(e.button!==0||submitting||scrolling||(selected.current.length+savedCount>=16&&editing===null))return;edge.current=null;e.currentTarget.setPointerCapture(e.pointerId);const p=point(e);active.current={region:{x:p.x,y:p.y,width:0,height:0},points:[p],freehand};setCurrent({...active.current});}
 function move(e:React.PointerEvent<SVGSVGElement>){if(!active.current){const next=edgeAt(e.clientY);if(!next)scrollTicks.current=0;edge.current=next;return;}const p=point(e),s=active.current;if(s.freehand){if(s.points.length<2000)s.points.push(p);}else s.points=[s.points[0],p];const xs=s.points.map(p=>p.x),ys=s.points.map(p=>p.y);const x=Math.min(...xs),y=Math.min(...ys);s.region={x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};setCurrent({...s});}
 function up(e:React.PointerEvent<SVGSVGElement>){if(!active.current)return;move(e);const p=point(e),s=active.current;active.current=null;setCurrent(undefined);if(s.region.width<12||s.region.height<12){setError(t('Select the whole question and all options.','पूरा प्रश्न और सभी विकल्प चुनें।'));return;}setError('');if(editing!==null){void sync(selected.current.map((old,i)=>i===editing?s:old)).then((r:any)=>{if(r.ok)edge.current=edgeAt(p.y);});setEditing(null);}else void sync([...selected.current,s]).then((r:any)=>{if(r.ok)edge.current=edgeAt(p.y);});}
 return <div className="trace-root" style={{'--trace':settings.traceColor} as React.CSSProperties}>
  <svg className="trace-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{active.current=null;edge.current=null;setCurrent(undefined);}}>
   {[...strokes,...(current?[current]:[])].map((s,i)=><g key={i}>
    <rect x={s.region.x} y={s.region.y} width={s.region.width} height={s.region.height} fill="rgba(35,136,255,.08)" stroke={settings.traceColor} strokeWidth={settings.traceThickness} strokeDasharray={s.freehand?'6 3':undefined}/>
    {s.freehand&&<polyline points={s.points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={settings.traceColor} strokeWidth={settings.traceThickness}/>}
    <text x={s.region.x+5} y={s.region.y+21} fill="white" stroke="#102030" strokeWidth="3" paintOrder="stroke" fontSize="17">R{savedCount+i+1}</text>
   </g>)}
  </svg>
  <div className="trace-edge" aria-hidden="true">{t('Hover here to scroll down','नीचे स्क्रोल करने के लिए यहाँ कर्सर रखें')} ↓</div>
  <div ref={toolbar} className="trace-tools" role="toolbar" aria-label="Trace controls" style={{left:toolbarPos.x,top:toolbarPos.y}}>
   <strong>{t('Trace & Answer','चुनें और उत्तर पाएँ')}</strong><span className="trace-count">{savedCount+strokes.length} {t(savedCount+strokes.length===1?'region selected':'regions selected','क्षेत्र चुने गए')} / 16</span>
   <button className="trace-move" aria-label={t('Move Trace toolbar','ट्रेस बार खिसकाएँ')} title={t('Drag to uncover a question','प्रश्न दिखाने के लिए खींचें')} onPointerDown={moveDown} onPointerMove={moveDrag} onPointerUp={moveEnd} onPointerCancel={moveEnd}>{t('Move','खिसकाएँ')} ↔</button>
   <button className={!freehand?'chosen':''} onClick={()=>setFreehand(false)}>{t('Rectangle','आयत')}</button><button className={freehand?'chosen':''} onClick={()=>setFreehand(true)}>{t('Freehand','फ्रीहैंड')}</button>
   <button disabled={!(savedCount+strokes.length)||submitting||scrolling} onClick={()=>void undo()}>{t('Undo','पूर्ववत')}</button>
   <button disabled={!(savedCount+strokes.length)||submitting||scrolling} onClick={()=>void clearSelections()}>{t('Clear','हटाएँ')}</button>
   <button className="answer-button" disabled={!(savedCount+strokes.length)||submitting||scrolling} onClick={()=>void submit()}>{t('Answer','उत्तर')} ↵</button>
   <button onClick={()=>api.command('trace-cancel')}>{t('Cancel','रद्द करें')} Esc</button>
   <small>{t('Trace visible questions, release, then move the cursor to the bottom edge to scroll down. Earlier selections stay saved in memory. Press Enter to answer all.','दिख रहे प्रश्न चुनें, छोड़ें, फिर नीचे किनारे पर कर्सर ले जाकर स्क्रोल करें। पहले चुने क्षेत्र मेमोरी में रहेंगे। Enter से सभी उत्तर पाएँ।')}</small>
   {savedCount>0&&<small>{savedCount} {t('earlier regions saved','पहले के क्षेत्र सहेजे गए')}</small>}
   {scrolling&&<small>{t('Scrolling…','स्क्रोल हो रहा है…')}</small>}
   {strokes.length>0&&<div className="trace-remove">{strokes.map((_,i)=><span key={i}><button disabled={scrolling} aria-label={`Remove region ${savedCount+i+1}`} onClick={()=>{setEditing(null);sync(selected.current.filter((_,n)=>n!==i));}}>R{savedCount+i+1} ×</button><button disabled={scrolling} className={editing===i?"chosen":""} onClick={()=>setEditing(i)}>{t("Redraw", "फिर चुनें")} R{savedCount+i+1}</button></span>)}</div>}
   {editing!==null&&<small>{t("Draw a replacement for", "फिर से चुनें")} R{savedCount+editing+1}</small>}
   {error&&<small role="alert">{error}</small>}
  </div>
 </div>;
}
createRoot(document.getElementById('root')!).render(<Overlay/>);
