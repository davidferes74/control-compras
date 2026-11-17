import {createHmac, timingSafeEqual, createHash} from 'node:crypto';
import type {NextRequest} from 'next/server';
export function configured(){return Boolean(process.env.DATABASE_URL&&process.env.APP_ACCESS_PASSWORD&&process.env.SESSION_SECRET&&process.env.SESSION_SECRET.length>=32);}
const digest=(s:string)=>createHash('sha256').update(s).digest();
export function checkPassword(s:string){return configured()&&timingSafeEqual(digest(s),digest(process.env.APP_ACCESS_PASSWORD!));}
export function checkCredentials(username:string,password:string){return checkPassword(password)&&timingSafeEqual(digest(username),digest(process.env.APP_ACCESS_USERNAME||'sentidino'));}
function sign(s:string){return createHmac('sha256',process.env.SESSION_SECRET!).update(s).digest('hex');}
export function token(){const expires=String(Date.now()+8*60*60*1000);return expires+'.'+sign(expires);}
export function missingConfig(){return [!process.env.DATABASE_URL&&'DATABASE_URL (base de datos Neon)',!process.env.APP_ACCESS_PASSWORD&&'APP_ACCESS_PASSWORD (contraseña de acceso)',!(process.env.SESSION_SECRET&&process.env.SESSION_SECRET.length>=32)&&'SESSION_SECRET (32 caracteres o más)'].filter(Boolean) as string[];}
export const username=()=>process.env.APP_ACCESS_USERNAME||'sentidino';
export function authorized(req:NextRequest){return validSession(req.cookies.get('ria_session')?.value);}
export function validSession(t:string|undefined){if(!configured())return false;if(!t)return false;if(t.split('.').length!==2)return false;const [expires,signature]=t.split('.');if(!expires||!signature||!/^\d{13}$/.test(expires)||Number(expires)<Date.now()||! /^[a-f0-9]{64}$/.test(signature))return false;return timingSafeEqual(Buffer.from(signature),Buffer.from(sign(expires)));}
export function sameOrigin(req:NextRequest){const origin=req.headers.get('origin');return origin===new URL(req.url).origin;}
