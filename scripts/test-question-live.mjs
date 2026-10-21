// Opt-in live provider regression. Uses a synthetic screen; never captures the desktop.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import dotenv from 'dotenv';
const profileEnv = path.join(process.env.APPDATA || '.', 'winbot', '.env');
let envPath = path.resolve('release/portable-win-x64/.env');
try { await fs.access(profileEnv); envPath = profileEnv; } catch {}
dotenv.config({path: envPath, quiet: true});
const output = path.resolve('node_modules/.cache/winbot-tests/live-providers.cjs');
if (!process.env.WINBOT_PREBUILT_PROVIDERS) await build({entryPoints:['src/providers/index.ts'],outfile:output,bundle:true,platform:'node',format:'cjs',packages:'external'});
const require = createRequire(import.meta.url);
const {OpenAI, createSearchProvider} = require(output);
const llm = new OpenAI();
const signal = AbortSignal.timeout(120000);
const screenText = `File Edit View Help
Keep this question visible, then click Start Answer Mode in Winbot.
The answer should identify New Delhi as India's capital and include source links.
Pinned Projects
Which planet is known as the Red Planet?
किस ग्रह को लाल ग्रह कहा जाता है?
A. Venus / शुक्र
B. Mars / मंगल
C. Jupiter / बृहस्पति
D. Saturn / शनि
Binary file previews aren't supported yet
Find the problem
Search`;
const question = await llm.selectQuestion(screenText, signal);
if (!/Red Planet|लाल ग्रह/i.test(question) || /Delhi|दिल्ली/i.test(question) || !/Mars|मंगल/i.test(question)) throw new Error('Wrong question selected');
const sources = await createSearchProvider().search(question, 'en', signal);
const answer = await llm.answer(question, sources, {style:'short'}, 'en', signal, true);
if (!/Mars|मंगल/i.test(answer) || /New Delhi/i.test(answer)) throw new Error('Answer regression failed');
console.log(JSON.stringify({selectedQuestion:question,sourceCount:sources.length,answer},null,2));


const oceanQuestion = 'Which is the largest ocean? A Atlantic B Pacific';
const oceanSources = await createSearchProvider().search('largest ocean', 'en', signal);
const oceanAnswer = await llm.answer(oceanQuestion, oceanSources, {style:'short'}, 'en', signal, true);
if (!/Pacific/i.test(oceanAnswer) || /\b[A-D][.)]/.test(oceanAnswer)) throw new Error('Unreliable option label was returned');
console.log(JSON.stringify({test:'incomplete OCR choices',answer:oceanAnswer,sourceCount:oceanSources.length},null,2));
