import fs from 'node:fs/promises';
import path from 'node:path';

// Assemble a local Windows bundle from the installed, lockfile-pinned runtime.
// Avoids additional installer-tool downloads; this does not sign the executable.
if(process.platform!=='win32')throw new Error('This portable packaging script targets Windows.');
const root=process.cwd();
const output=path.join(root,'release','portable-win-x64');
const appDir=path.join(output,'resources','app');
const lock=JSON.parse(await fs.readFile('package-lock.json','utf8'));
await fs.access('node_modules/electron/dist/electron.exe');
await fs.cp('node_modules/electron/dist',output,{recursive:true});
await fs.mkdir(appDir,{recursive:true});
for(const dir of ['dist','dist-desktop'])await fs.cp(dir,path.join(appDir,dir),{recursive:true});
await fs.copyFile('package.json',path.join(appDir,'package.json'));
let count=0;
for(const [relative,metadata] of Object.entries(lock.packages)){
 if(!relative.startsWith('node_modules/')||metadata.dev)continue;
 try{await fs.access(relative);}catch{if(metadata.optional)continue;throw new Error(`Missing production dependency: ${relative}`);}
 await fs.cp(relative,path.join(appDir,relative),{recursive:true});count++;
}
// Electron loads resources/app when no CLI app path is supplied.
await fs.copyFile(path.join(output,'electron.exe'),path.join(output,'Winbot.exe'));
await fs.unlink(path.join(output,'electron.exe'));
await fs.copyFile('.env.example',path.join(output,'.env.example'));
let initialEnv=await fs.readFile('.env.example','utf8');
try{
 await fs.access('local-models/eng.traineddata.gz');
 await fs.access('local-models/hin.traineddata.gz');
 await fs.cp('local-models',path.join(output,'tessdata'),{recursive:true});
 initialEnv=initialEnv.replace(/^TESSDATA_PATH=.*$/m,'TESSDATA_PATH=tessdata');
}catch{ /* The bundle can download OCR data on first use if local models are absent. */ }
try{await fs.writeFile(path.join(output,'.env'),initialEnv,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
await fs.copyFile('README.md',path.join(output,'README.md'));
await fs.writeFile(path.join(output,'SETUP.txt'),
 'Run Winbot.exe. Keep the entire folder together.\r\n'+
 'Add your API keys to .env beside Winbot.exe. No keys are bundled.\r\n'+
 'An existing %APPDATA%\\winbot\\.env takes priority over this portable configuration.\r\n'+
 'This is an unsigned portable build. No screen capture occurs before consent.\r\n');
for(const required of ['Winbot.exe','resources/app/dist/index.html','resources/app/dist-desktop/main.cjs','resources/app/dist-desktop/preload.cjs','resources/app/node_modules/tesseract.js/package.json'])await fs.access(path.join(output,required));
console.log(`Portable bundle ready: ${output}\nIncluded ${count} production dependency directories; no .env credentials copied.`);
