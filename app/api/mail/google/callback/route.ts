import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {authorized} from '@/lib/auth';
import {getPool,org} from '@/lib/server-store';
import {seal} from '@/lib/mail-config';
import {hashState,exchangeCode,gmailGet,googleRedirect} from '@/lib/google-oauth';
export const runtime='nodejs';export const maxDuration=60;
function finish(status:string){const r=NextResponse.redirect(new URL('/?google='+status,new URL(googleRedirect).origin));r.headers.set('Cache-Control','no-store');r.headers.set('Referrer-Policy','no-referrer');return r;}
export async function GET(req:NextRequest){if(!authorized(req))return finish('session');const state=req.nextUrl.searchParams.get('state')||'';if(!/^[a-f0-9]{64}$/.test(state))return finish('invalid');try{
 const consumed=await getPool().query('DELETE FROM ria_oauth_states WHERE state_hash=$1 AND organization_id=$2 AND session_hash=$3 AND expires_at>now() RETURNING state_hash',[hashState(state),org(),hashState(req.cookies.get('ria_session')!.value)]);if(!consumed.rowCount)return finish('invalid');
 if(req.nextUrl.searchParams.has('error'))return finish('cancelled');const code=req.nextUrl.searchParams.get('code');if(!code||code.length>4096)return finish('invalid');
 const tokens=await exchangeCode(code);const profile=await gmailGet('/profile',tokens.access_token);const email=z.email().parse(profile.emailAddress).toLowerCase();
 const secret=seal(JSON.stringify({...tokens,expires_at:Date.now()+tokens.expires_in*1000}),org());
 const config={name:'Facturas Gmail',email,folder:'INBOX',since:new Date().toISOString().slice(0,10),sender:'',subject:''};
 const r=await getPool().query("INSERT INTO ria_mail_accounts(id,organization_id,name,email,config,secret,provider) VALUES($1,$2,$3,$4,$5,$6,'gmail') ON CONFLICT(organization_id,email) DO UPDATE SET secret=EXCLUDED.secret,paused=true,last_error=NULL WHERE ria_mail_accounts.provider='gmail' AND (ria_mail_accounts.lease_until IS NULL OR ria_mail_accounts.lease_until<now()) RETURNING id",[randomUUID(),org(),config.name,email,JSON.stringify(config),secret]);if(!r.rowCount)return finish('conflict');return finish('connected');
 }catch{return finish('failed');}}
