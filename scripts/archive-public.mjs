import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

if (process.platform !== 'win32') throw new Error('The portable ZIP is built on Windows.');

const root = process.cwd();
const source = path.join(root, 'release', 'portable-win-x64');
const version = JSON.parse(await fs.readFile('package.json', 'utf8')).version;
const archive = path.join(root, 'release', `Winbot-${version}-win-x64.zip`);

// Only the runtime, documentation, and blank configuration template are public.
// The local portable folder can contain a real .env, logs, and user-added files.
const files = [
  'Winbot.exe', 'LICENSE', 'WINBOT-LICENSE.txt', 'LICENSES.chromium.html', 'README.md',
  'SETUP.txt', '.env.example', 'version', 'chrome_100_percent.pak',
  'chrome_200_percent.pak', 'd3dcompiler_47.dll', 'dxcompiler.dll',
  'dxil.dll', 'ffmpeg.dll', 'icudtl.dat', 'resources.pak',
  'snapshot_blob.bin', 'v8_context_snapshot.bin', 'vk_swiftshader_icd.json',
  'vk_swiftshader.dll', 'vulkan-1.dll', 'locales', 'resources',
];
for (const name of files) await fs.access(path.join(source, name));
try { await fs.access(path.join(source, 'tessdata')); files.push('tessdata'); } catch {}

execFileSync('tar', ['-a', '-c', '-f', archive, '-C', source, ...files],
  { stdio: 'pipe', maxBuffer: 16 * 1024 * 1024 });
const entries = execFileSync('tar', ['-tf', archive],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean);
if (!entries.some(entry => /(^|\/)Winbot\.exe$/.test(entry))) throw new Error('The ZIP lacks Winbot.exe.');
if (!entries.some(entry => /(^|\/)\.env\.example$/.test(entry))) throw new Error('The ZIP lacks .env.example.');
const forbidden = entries.filter(entry => /(^|\/)(\.env|[^/]*\.log|[^/]*\.(?:pem|p12|pfx))$/i.test(entry.replaceAll('\\', '/')));
if (forbidden.length) throw new Error(`Private files were found in the ZIP: ${forbidden.join(', ')}`);

const digest = createHash('sha256');
for await (const chunk of createReadStream(archive)) digest.update(chunk);
await fs.writeFile(`${archive}.sha256`, `${digest.digest('hex')}  ${path.basename(archive)}\n`);
console.log(`Public ZIP ready: ${archive} (${(await fs.stat(archive)).size} bytes, ${entries.length} entries).`);
