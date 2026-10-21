import {it} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import fs from 'node:fs';
import {AnswerContent} from '../src/ui/AnswerContent';
it('writes a local visual test page',()=>{
const text=String.raw`**Answer: 27 minutes**

1. **Imagine a 36-litre tank.** The faster pipe adds 3 litres/minute, the slower pipe adds 2, and the drain removes 1.
2. **First 3 minutes:** 3 + 2 − 1 = **4 litres/minute**. Water added: 4 × 3 = **12 litres**.
3. **After the faster pipe closes:** 2 − 1 = **1 litre/minute**. Remaining water: 36 − 12 = **24 litres**. This takes **24 minutes**.
4. **Total time:** 3 + 24 = **27 minutes**.

### Fraction notation also displays correctly

Faster pipe: $\frac{1}{12}$ of the tank per minute.

$$
\frac{1}{12}+\frac{1}{18}-\frac{1}{36}=\frac{1}{9}
$$

**उत्तर: 27 मिनट**`;
const css=fs.readdirSync('dist/assets').find(x=>x.endsWith('.css'));
fs.writeFileSync('node_modules/.cache/answer-preview.html', '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/'+css+'"><title>Winbot answer preview</title><body><main style="max-width:440px;margin:auto"><article>'+renderToStaticMarkup(<AnswerContent text={text}/> )+'</article></main></body></html>');
});
