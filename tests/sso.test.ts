import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {signModuleToken,verifyModuleToken,ssoSecret,parentAppUrl,ssoMaxLifetimeMs} from '../lib/sso';
const secret='s'.repeat(40),now=1_800_000_000_000;
test('a pass signed by the parent app is accepted once it is fresh and well formed',()=>{const t=signModuleToken(secret,now);const r=verifyModuleToken(t,secret,now+1000);assert.equal(r.ok,true);if(r.ok){assert.match(r.nonce,/^[a-f0-9]{32}$/);assert.equal(r.expires,now+60000);}assert.notEqual(signModuleToken(secret,now),t);});
test('expired, tampered, foreign-secret, malformed and long-lived passes are rejected',()=>{const t=signModuleToken(secret,now),reason=(tok:string,s=secret,at=now)=>{const r=verifyModuleToken(tok,s,at);return r.ok?'ok':r.reason;};
 assert.equal(reason(t,secret,now+60000),'expired');assert.equal(reason(t,'x'.repeat(40)),'signature');
 const parts=t.split('.');assert.equal(reason([parts[0],String(Number(parts[1])+1),parts[2],parts[3]].join('.')),'signature');
 for(const bad of ['',' ','v1.1.2.3','v2.'+parts.slice(1).join('.'),t+'0',t.toUpperCase(),'../../etc'])assert.equal(reason(bad),'format',bad);
 const far=signModuleToken(secret,now,ssoMaxLifetimeMs+1000);assert.equal(reason(far),'lifetime');});
test('the pass format is plain HMAC-SHA256 so the parent app can produce it without this code',()=>{const exp=now+30000,nonce='ab'.repeat(16),payload=`v1.${exp}.${nonce}`;const t=payload+'.'+createHmac('sha256',secret).update(payload).digest('hex');assert.equal(verifyModuleToken(t,secret,now).ok,true);});
test('shared secret must be long and the parent address must be https',()=>{const keys=['SENTIDINO_MODULE_SECRET','SENTIDINO_BI_URL'] as const,old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{delete process.env.SENTIDINO_MODULE_SECRET;assert.equal(ssoSecret(),null);process.env.SENTIDINO_MODULE_SECRET='corto';assert.equal(ssoSecret(),null);process.env.SENTIDINO_MODULE_SECRET=secret;assert.equal(ssoSecret(),secret);
  delete process.env.SENTIDINO_BI_URL;assert.equal(parentAppUrl(),null);for(const bad of ['javascript:alert(1)','http://bi.example.com','no-es-url'])  {process.env.SENTIDINO_BI_URL=bad;assert.equal(parentAppUrl(),null,bad);}
  process.env.SENTIDINO_BI_URL='https://bi.sentidino.es/';assert.equal(parentAppUrl(),'https://bi.sentidino.es');process.env.SENTIDINO_BI_URL='http://localhost:3000';assert.equal(parentAppUrl(),'http://localhost:3000');
 }finally{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}});
