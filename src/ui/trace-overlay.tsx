import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import { defaults, Settings, languageOf } from '../core/model';
import type { Region } from '../core/trace';
import './trace-overlay.css';
type Stroke={region:Region;points:{x:number;y:number}[];freehand:boolean};
const api=(window as any).winbot;
function Overlay(){
 const [settings,setSettings]=useState<Settings>(defaults),[strokes,setStrokes]=useState<Stroke[]>([]),[current,setCurrent]=useState<Stroke>(),[freehand,setFreehand]=useState(false),[error,setError]=useState(''),[submitting,setSubmitting]=useState(false);
 const [editing,setEditing]=useState<number|null>(null);
 const [toolbarPos,setToolbarPos]=useState({x:Math.max(12,innerWidth-960),y:12});
 const toolbar=useRef<HTMLDivElement>(null),moving=useRef<{id:number;pointerX:number;pointerY:number;x:number;y:number}|null>(null);
 const active=useRef<Stroke|null>(null),selected=useRef<Stroke[]>([]);const hi=languageOf(settings,'',navigator.language)==='hi',t=(en:string,h:string)=>hi?h:en;
 const boundToolbar=(x:number,y:number)=>({x:Math.max(0,Math.min(x,innerWidth-(toolbar.current?.offsetWidth||0))),y:Math.max(0,Math.min(y,innerHeight-(toolbar.current?.offsetHeight||0)))});
 useEffect(()=>{const fit=()=>setToolbarPos(p=>boundToolbar(p.x,p.y));window.addEventListener('resize',fit);fit();return()=>window.removeEventListener('resize',fit);},[strokes.length,editing]);
 function moveDown(e:React.PointerEvent<HTMLButtonElement>){e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);moving.current={id:e.pointerId,pointerX:e.clientX,pointerY:e.clientY,...toolbarPos};}
 function moveDrag(e:React.PointerEvent<HTMLButtonElement>){const start=moving.current;if(!start||start.id!==e.pointerId)return;e.preventDefault();setToolbarPos(boundToolbar(start.x+e.clientX-start.pointerX,start.y+e.clientY-start.pointerY));}
 function moveEnd(e:React.PointerEvent<HTMLButtonElement>){if(moving.current?.id===e.pointerId)moving.current=null;}
 useEffect(()=>{api.command('trace-get').then((r:any)=>{if(r.ok)setSettings(r.state.settings);});
 const remove=api.on('trace-submit-request',()=>void submit());return remove;},[]);
 const sync=(next:Stroke[])=>{selected.current=next;setStrokes(next);void api.command('trace-select',next.map(s=>s.region));};
 async function submit(){if(!selected.current.length)return;setSubmitting(true);const r=await api.command('trace-submit',selected.current.map(s=>s.region));if(!r.ok){setError(r.error);setSubmitting(false);}}
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();void api.command('trace-cancel');}else if(e.key==='Enter'){e.preventDefault();void submit();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();(setEditing(null),sync(selected.current.slice(0,-1)));}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 const point=(e:React.PointerEvent)=>({x:Math.max(0,Math.min(innerWidth,e.clientX)),y:Math.max(0,Math.min(innerHeight,e.clientY))});
 function down(e:React.PointerEvent<SVGSVGElement>){if(e.button!==0||submitting||(selected.current.length>=8&&editing===null))return;e.currentTarget.setPointerCapture(e.pointerId);const p=point(e);active.current={region:{x:p.x,y:p.y,width:0,height:0},points:[p],freehand};setCurrent({...active.current});}
 function move(e:React.PointerEvent<SVGSVGElement>){if(!active.current)return;const p=point(e),s=active.current;if(s.freehand){if(s.points.length<2000)s.points.push(p);}else s.points=[s.points[0],p];const xs=s.points.map(p=>p.x),ys=s.points.map(p=>p.y);const x=Math.min(...xs),y=Math.min(...ys);s.region={x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};setCurrent({...s});}
 function up(e:React.PointerEvent<SVGSVGElement>){if(!active.current)return;move(e);const s=active.current;active.current=null;setCurrent(undefined);if(s.region.width<12||s.region.height<12){setError(t('Select the whole question and all options.','पूरा प्रश्न और सभी विकल्प चुनें।'));return;}setError('');if(editing!==null){sync(selected.current.map((old,i)=>i===editing?s:old));setEditing(null);}else sync([...selected.current,s]);}
 return <div className="trace-root" style={{'--trace':settings.traceColor} as React.CSSProperties}>
  <svg className="trace-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{active.current=null;setCurrent(undefined);}}>
   {[...strokes,...(current?[current]:[])].map((s,i)=><g key={i}>
    <rect x={s.region.x} y={s.region.y} width={s.region.width} height={s.region.height} fill="rgba(35,136,255,.08)" stroke={settings.traceColor} strokeWidth={settings.traceThickness} strokeDasharray={s.freehand?'6 3':undefined}/>
    {s.freehand&&<polyline points={s.points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={settings.traceColor} strokeWidth={settings.traceThickness}/>}
    <text x={s.region.x+5} y={s.region.y+21} fill="white" stroke="#102030" strokeWidth="3" paintOrder="stroke" fontSize="17">R{i+1}</text>
   </g>)}
  </svg>
  <div ref={toolbar} className="trace-tools" role="toolbar" aria-label="Trace controls" style={{left:toolbarPos.x,top:toolbarPos.y}}>
   <strong>{t('Trace & Answer','चुनें और उत्तर पाएँ')}</strong><span className="trace-count">{strokes.length} {t(strokes.length===1?'region selected':'regions selected','क्षेत्र चुने गए')} / 8</span>
   <button className="trace-move" aria-label={t('Move Trace toolbar','ट्रेस बार खिसकाएँ')} title={t('Drag to uncover a question','प्रश्न दिखाने के लिए खींचें')} onPointerDown={moveDown} onPointerMove={moveDrag} onPointerUp={moveEnd} onPointerCancel={moveEnd}>{t('Move','खिसकाएँ')} ↔</button>
   <button className={!freehand?'chosen':''} onClick={()=>setFreehand(false)}>{t('Rectangle','आयत')}</button><button className={freehand?'chosen':''} onClick={()=>setFreehand(true)}>{t('Freehand','फ्रीहैंड')}</button>
   <button disabled={!strokes.length||submitting} onClick={()=>(setEditing(null),sync(selected.current.slice(0,-1)))}>{t('Undo','पूर्ववत')}</button>
   <button disabled={!strokes.length||submitting} onClick={()=>{setEditing(null);sync([]);}}>{t('Clear','हटाएँ')}</button>
   <button className="answer-button" disabled={!strokes.length||submitting} onClick={()=>void submit()}>{t('Answer','उत्तर')} ↵</button>
   <button onClick={()=>api.command('trace-cancel')}>{t('Cancel','रद्द करें')} Esc</button>
   <small>{t('Include each full question and its options. Separate regions work best; numbered questions in one region are also split. Press Enter to answer.','हर प्रश्न और उसके विकल्प पूरे चुनें। अलग क्षेत्र बेहतर हैं; एक क्षेत्र में क्रमांकित प्रश्न भी अलग होंगे। Enter से उत्तर पाएँ।')}</small>
   {strokes.length>0&&<div className="trace-remove">{strokes.map((_,i)=><span key={i}><button aria-label={`Remove region ${i+1}`} onClick={()=>{setEditing(null);sync(selected.current.filter((_,n)=>n!==i));}}>R{i+1} ×</button><button className={editing===i?"chosen":""} onClick={()=>setEditing(i)}>{t("Redraw", "फिर चुनें")} R{i+1}</button></span>)}</div>}
   {editing!==null&&<small>{t("Draw a replacement for", "फिर से चुनें")} R{editing+1}</small>}
   {error&&<small role="alert">{error}</small>}
  </div>
 </div>;
}
createRoot(document.getElementById('root')!).render(<Overlay/>);
