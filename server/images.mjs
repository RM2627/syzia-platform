import sharp from 'sharp';
import {createHash} from 'node:crypto';
export const MAX_IMAGE_BYTES=5*1024*1024;
export async function sanitizeImage(bytes,declaredMime){
 if(!Buffer.isBuffer(bytes)||bytes.length<12||bytes.length>MAX_IMAGE_BYTES)throw Error('invalid_image_size');
 const signature=bytes.subarray(0,12);
 const actual=signature[0]===0xff&&signature[1]===0xd8&&signature[2]===0xff?'image/jpeg':signature.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':signature.toString('ascii',0,4)==='RIFF'&&signature.toString('ascii',8,12)==='WEBP'?'image/webp':null;
 if(!actual||actual!==declaredMime)throw Error('invalid_image_type');
 try{
 const input=sharp(bytes,{limitInputPixels:20000000,failOn:'warning',animated:true});const meta=await input.metadata();
 if(!meta.width||!meta.height||meta.width>8000||meta.height>8000||(meta.pages||1)!==1)throw Error('image_dimensions_or_animation');
 let pipeline=input.rotate();pipeline=actual==='image/jpeg'?pipeline.jpeg({quality:88}):actual==='image/png'?pipeline.png():pipeline.webp({quality:88});
 const {data,info}=await pipeline.toBuffer({resolveWithObject:true});if(data.length>MAX_IMAGE_BYTES)throw Error('image_too_large');
 return {data,mime:actual,size:data.length,width:info.width,height:info.height,sha256:createHash('sha256').update(data).digest('hex')};
 }catch{throw Error('invalid_image_content');}
}
