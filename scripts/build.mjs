import {build} from 'esbuild';
await build({entryPoints:['src/desktop/main.ts','src/desktop/preload.ts'],outdir:'dist-desktop',bundle:true,platform:'node',format:'cjs',outExtension:{'.js':'.cjs'},packages:'external'});
