import {expect,it,vi} from 'vitest';
import {FrameEndDetector,QuestionBasket,frameFingerprint,similarity,splitPageQuestions,questionNumber} from '../src/core/multi-page';
import {MultiPageCapture} from '../src/core/multi-page-capture';

const q=(n:number)=>'Q'+n+'. Which planet is number '+n+'?\nA) Mercury\nB) Venus\nC) Earth\nD) Mars';
it('merges overlapping pages by number and fuzzy OCR, preserving distinct Q1-Q30',()=>{
 const basket=new QuestionBasket();
 const page=(start:number,end:number)=>Array.from({length:end-start+1},(_,i)=>q(start+i)).join('\n\n');
 basket.addFrame(page(1,7));basket.addFrame(page(6,13).replace('Which planet','Which pIanet'));
 basket.addFrame(page(12,22));basket.addFrame(page(20,30));
 expect(basket.questions).toHaveLength(30);
 expect(basket.questions.map(item=>item.number)).toEqual(Array.from({length:30},(_,i)=>i+1));
 expect(basket.questions.every(item=>item.status==='pending')).toBe(true);
});
it('keeps same-looking questions with different numbers and skips answered entries',()=>{
 const basket=new QuestionBasket();
 basket.addFrame(q(1)+'\n\n'+q(2));
 basket.markAnswered(1,'Q1: A) Mercury');
 basket.addFrame(q(1).replace('planet','pIanet')+'\n\n'+q(2));
 expect(basket.questions).toHaveLength(2);
 expect(basket.answered).toBe(1);
 expect(basket.pending.map(q=>q.number)).toEqual([2]);
 expect(basket.questions[0].answer).toBe('Q1: A) Mercury');
});
it('splits nonconsecutive headings and uses conservative fuzzy matching',()=>{
 expect(splitPageQuestions(q(1)+'\n\n'+q(3))).toHaveLength(2);
 expect(similarity(q(1),q(1).replace('planet','pIanet'))).toBeGreaterThan(.45);
 const basket=new QuestionBasket();basket.addFrame(q(1));basket.addFrame(q(1).replace('Which planet is number 1','Compute the square root of 81'));
 expect(basket.questions).toHaveLength(1);
 expect(basket.questions[0].question).toBe(q(1));
});
it('detects an unchanged frame and changes in downscaled bytes',()=>{
 const detector=new FrameEndDetector(),first=frameFingerprint(new Uint8Array([1,2,3]));
 expect(detector.observe(first)).toBe(false);
 expect(detector.observe(first)).toBe(true);
 expect(detector.observe(frameFingerprint(new Uint8Array([1,2,4])))).toBe(false);
});
it('auto-scrolls, reads two frames, stops at unchanged page, erases pixels',async()=>{
 const images=[new Uint8Array([1,2,3]),new Uint8Array([4,5,6]),new Uint8Array([4,5,6])];
 let position=0,reads=0,scrolls=0;
 const notify=vi.fn();
 const capture=new MultiPageCapture({
  canAutoScroll:()=>true,
  scrollNext:async()=>{scrolls++;position=Math.min(position+1,2);},
  capture:async()=>new Uint8Array(images[position]),
 },{
  extract:async()=>{reads++;return q(position+1);},close:async()=>{}
 },notify);
 const result=await capture.run('auto',new AbortController().signal,10);
 expect(result.map(q=>q.number)).toEqual([1,2]);
 expect(reads).toBe(2);expect(scrolls).toBe(2);
 expect(capture.progress).toMatchObject({pages:2,active:false,reason:'unchanged'});
 expect(notify).toHaveBeenCalled();
});
it('watch mode captures changed frames and accepts Done',async()=>{
 let frame=1;
 const session=new MultiPageCapture({
  canAutoScroll:()=>false,scrollNext:async()=>{throw Error('not allowed');},
  capture:async()=>new Uint8Array([frame++])
 },{extract:async()=>q(frame-1),close:async()=>{}},()=>{});
 const run=session.run('watch',new AbortController().signal,40);
 await vi.waitFor(()=>expect(session.progress.pages).toBeGreaterThanOrEqual(2));
 session.done();const result=await run;
 expect(result.length).toBeGreaterThanOrEqual(2);
 expect(session.progress.reason).toBe('done');
});


it('keeps frame capture moving while local OCR works in parallel',async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 let captures=0;
 const session=new MultiPageCapture({
  canAutoScroll:()=>true,scrollNext:async()=>{},capture:async()=>new Uint8Array([++captures])
 },{extract:async image=>{await gate;return q(image[0]);},close:async()=>{}},()=>{});
 const run=session.run('auto',new AbortController().signal,2);
 await vi.waitFor(()=>expect(captures).toBe(2));
 expect(session.basket.questions).toHaveLength(0);
 release();const result=await run;
 expect(result.map(entry=>entry.number)).toEqual([1,2]);
 expect(session.progress.reason).toBe('limit');
});


it('splits numbered questions without a Q prefix when their stems are clear',()=>{
 const text='1. Which planet is nearest the Sun?\nA) Mercury\nB) Venus\nC) Earth\nD) Mars\n\n2. Which planet has rings?\nA) Mercury\nB) Venus\nC) Saturn\nD) Mars';
 const basket=new QuestionBasket();basket.addFrame(text);
 expect(basket.questions.map(q=>q.number)).toEqual([1,2]);
});
it('uses source text directly when a trusted browser or PDF adapter provides it',async()=>{
 const capture=vi.fn(async()=>new Uint8Array([1]));
 const extract=vi.fn(async()=>'');
 const session=new MultiPageCapture({canAutoScroll:()=>false,scrollNext:async()=>{},capture,readText:async()=>q(4)}, {extract,close:async()=>{}},()=>{});
 await session.run('watch',new AbortController().signal,1);
 expect(session.basket.questions.map(q=>q.number)).toEqual([4]);
 expect(capture).not.toHaveBeenCalled();expect(extract).not.toHaveBeenCalled();
});


it('keeps unclear questions pending so a later clearer frame can repair them',()=>{
 const basket=new QuestionBasket();
 basket.addFrame('Q7. Which planet has rings?\nA) Earth\nB) Saturn');
 basket.markError(1,'multiUnclear');
 basket.addFrame('Q7. Which planet has rings?\nA) Earth\nB) Saturn\nC) Mercury\nD) Venus');
 expect(basket.questions).toHaveLength(1);
 expect(basket.pending).toHaveLength(1);
 expect(basket.questions[0].error).toBeUndefined();
 expect(basket.questions[0].question).toContain('D) Venus');
});


it('does not reread a frame when the user scrolls back to an earlier page',async()=>{
 const seen=[1,2,1];let cursor=0;
 const extract=vi.fn(async(image:Uint8Array)=>q(image[0]));
 const session=new MultiPageCapture({canAutoScroll:()=>false,scrollNext:async()=>{},capture:async()=>new Uint8Array([seen[cursor++]])},{extract,close:async()=>{}},()=>{});
 await session.captureFrame(new AbortController().signal);
 await session.captureFrame(new AbortController().signal);
 const revisit=await session.captureFrame(new AbortController().signal);
 expect(revisit.duplicate).toBe(true);
 await vi.waitFor(()=>expect(session.basket.questions).toHaveLength(2));
 expect(extract).toHaveBeenCalledTimes(2);
});


it('splits mixed Q and OCR zero-prefixed headings without splitting numbered choices',()=>{
 const text='Q2. What is two plus two?\nA) 2\nB) 4\nC) 6\nD) 8\n03. What is three plus three?\nA) 3\nB) 6\nC) 9\nD) 12\nQ4. What is four plus four?\nA) 4\nB) 8\nC) 12\nD) 16';
 expect(splitPageQuestions(text).map(questionNumber)).toEqual([2,3,4]);
 const basket=new QuestionBasket();basket.addFrame(text);
 expect(basket.questions.map(item=>item.number)).toEqual([2,3,4]);
});
it('merges degraded OCR of one numbered question from overlapping frames',()=>{
 const basket=new QuestionBasket();
 basket.addFrame('Q7. What is seven plus seven?\nA) 7\nB) 14\nC) 21');
 basket.addFrame('Q7. what is seven plus seven\nA) 7\nB) 14\nC) 21\nD) 28');
 expect(basket.questions).toHaveLength(1);
 expect(basket.questions[0].question).toContain('D) 28');
});

it('repairs parenthesis-prefixed OCR headings only with neighboring ordinal proof',()=>{
 const frame='Q5. What is five plus five?\nA) 5\nB) 10\nC) 15\nD) 20\n(26. What is six plus six?\nA) 6\nB) 12\nC) 18\nD) 24\nQ7. What is seven plus seven?\nA) 7\nB) 14\nC) 21\nD) 28';
 expect(splitPageQuestions(frame).map(questionNumber)).toEqual([5,6,7]);
 expect(splitPageQuestions('Q13. What is thirteen?\n(14. What is fourteen?\nQ15. What is fifteen?').map(questionNumber)).toEqual([13,14,15]);
 expect(splitPageQuestions('Q5. What is five?\n(26. What is twenty six?\nQ27. What is twenty seven?').map(questionNumber)).toEqual([5,26,27]);
});

it('repairs an OCR Q9 heading only with Q8 and Q10 as neighbors',()=>{
 const text='Q8. What is eight?\nA)1\nB)2\nC)3\nD)4\nQS. What is nine?\nA)1\nB)2\nC)3\nD)4\nQ10. What is ten?\nA)1\nB)2\nC)3\nD)4';
 expect(splitPageQuestions(text).map(questionNumber)).toEqual([8,9,10]);
 expect(splitPageQuestions('Q8. Eight?\nQS. Something?\nQ11. Eleven?').map(questionNumber)).toEqual([8,11]);
});
it('keeps a complete basket reading when a longer overlapping OCR frame drops an option',()=>{
 const basket=new QuestionBasket();
 const complete='Q7. What is seven plus seven?\nA) 7\nB) 14\nC) 21\nD) 28';
 basket.addFrame(complete);
 basket.addFrame('Q7. What is seven plus seven? This text is much longer but the last choice is missing\nA) 7\nB) 14\nC) 21');
 expect(basket.questions[0].question).toBe(complete);
});

it('never repeats the same numbered question when overlapping OCR readings differ greatly',()=>{
 const basket=new QuestionBasket();
 basket.addFrame('Q19. Which gas is most abundant?\nA) Oxygen\nB) Nitrogen\nC) Carbon dioxide\nD) Argon');
 basket.markAnswered(1,'Q19: B) Nitrogen');
 basket.addFrame('Q19. Whlch gas ls most abundant in the atmosphere?\nA) Oxyqen\nB) Nitrogen\nC) CO2\nD) Argon');
 expect(basket.questions).toHaveLength(1);
 expect(basket.questions[0].answer).toBe('Q19: B) Nitrogen');
});
