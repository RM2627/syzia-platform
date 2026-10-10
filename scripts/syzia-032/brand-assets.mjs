// Technical export of the approved raster source. No generated/reconstructed logo or lettering.
// Cropping occurs once here; runtime loads individual files, never the reference board.
import sharp from 'sharp';import {mkdir,copyFile,writeFile}from'node:fs/promises';
await mkdir('public/brand/syzia',{recursive:true});
const panels={
 'logo-dark':[18,17,325,337],'logo-light':[370,18,310,336],
 'horizontal-dark':[719,119,360,163],'horizontal-light':[1131,113,371,166],
 'symbol-dark':[28,461,207,208],'symbol-light':[283,459,208,210],
 'icon-dark':[550,469,183,192],'icon-light':[794,469,184,192],
};
const manifest=[];
for(const[name,[left,top,width,height]]of Object.entries(panels)){
 const path=`public/brand/syzia/syzia-${name}.png`;await sharp('brand/syzia/approved-reference.png').extract({left,top,width,height}).png().toFile(path);manifest.push({path,width,height,sourceRect:{left,top,width,height}});
}
await copyFile('public/brand/syzia/syzia-logo-dark.png','public/brand/syzia/syzia-login-dark.png');
await copyFile('public/brand/syzia/syzia-logo-light.png','public/brand/syzia/syzia-login-light.png');
for(const theme of ['dark','light'])await copyFile(`public/brand/syzia/syzia-horizontal-${theme}.png`,`public/brand/syzia/syzia-header-${theme}.png`);
await sharp('public/brand/syzia/syzia-icon-dark.png').resize(32,32,{fit:'contain',background:'#0B0B14'}).png().toFile('public/brand/syzia/syzia-favicon.png');
await writeFile('brand/syzia/assets-manifest.json',JSON.stringify({source:'approved-reference.png',method:'Exact source pixels; no new lettering, shapes or gradients',limitations:'Source is a flattened 1536×1024 board. Exported assets retain its background and original pixel resolution; no vector/high-resolution master was supplied.',assets:manifest},null,2));
