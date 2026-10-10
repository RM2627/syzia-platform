// Reproducible local gate: use an installed browser, or the optional packaged Linux binary.
import { existsSync, createReadStream, createWriteStream } from 'node:fs';
import { mkdir, chmod, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createBrotliDecompress } from 'node:zlib';
import { spawnSync } from 'node:child_process';
export async function prepareGateBrowser() {
  if (process.env.FOUNDATION_CHROMIUM_PATH) return;
  const { chromium } = await import('@playwright/test');
  if (existsSync(chromium.executablePath())) return;
  if (process.platform !== 'linux' || process.arch !== 'x64' || !existsSync('node_modules/@sparticuz/chromium/bin/chromium.br'))
    throw Error('Chromium required: run npx playwright install chromium, or set FOUNDATION_CHROMIUM_PATH.');
  const dir=resolve('.cache/syzia-gate-chromium');await mkdir(dir,{recursive:true});
  const binary=dir+'/chromium';
  if (!existsSync(dir+'/ready')) {
    await pipeline(createReadStream('node_modules/@sparticuz/chromium/bin/chromium.br'),createBrotliDecompress(),createWriteStream(binary));
    await chmod(binary,0o755);
    for(const name of ['fonts','swiftshader']) {
      const tar=dir+'/'+name+'.tar';
      await pipeline(createReadStream('node_modules/@sparticuz/chromium/bin/'+name+'.tar.br'),createBrotliDecompress(),createWriteStream(tar));
      const result=spawnSync('tar',['--no-same-owner','-xf',tar,'-C',dir]);if(result.status!==0)throw Error('Chromium extraction failed');await unlink(tar);
    }
    await writeFile(dir+'/ready','047');
  }
  process.env.FOUNDATION_CHROMIUM_PATH=binary;
  await writeFile(dir+'/fonts.conf', '<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>'+dir+'/fonts</dir><cachedir>'+dir+'/font-cache</cachedir></fontconfig>');
  process.env.FONTCONFIG_PATH=dir;
}
if (import.meta.url===new URL('file://'+process.argv[1]).href) {await prepareGateBrowser();console.log('Chromium available for gate');}
