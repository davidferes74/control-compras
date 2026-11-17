import {resolve4,resolveMx,resolveSrv} from 'node:dns/promises';
import tls from 'node:tls';
import {allowedHost,publicIPv4} from './mail-config';
import {candidateHosts,emailDomain,genericProvider,providerForEmail,providerForMx,type MailProvider} from './mail-providers';
// Detección del servidor de correo a partir de la dirección, sin credenciales y sin consultar a terceros:
// solo DNS del propio dominio y una conexión TLS de comprobación al puerto 993.
const hostPattern=/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
async function probe(host:string):Promise<boolean>{
 if(!hostPattern.test(host)||!allowedHost(host))return false;
 let addresses:string[];try{addresses=await resolve4(host);}catch{return false;}
 if(!addresses.length||addresses.some(ip=>!publicIPv4(ip)))return false;
 return new Promise(resolve=>{let done=false;const finish=(ok:boolean)=>{if(done)return;done=true;socket.destroy();resolve(ok);};
  const socket=tls.connect({host:addresses[0],servername:host,port:993,rejectUnauthorized:true,minVersion:'TLSv1.2',timeout:4000},()=>finish(socket.authorized));
  socket.on('error',()=>finish(false));socket.on('timeout',()=>finish(false));});
}
export type Discovery={provider:MailProvider;host:string|null;detected:boolean};
export async function discoverMail(email:string):Promise<Discovery>{
 const domain=emailDomain(email);if(!domain||!hostPattern.test(domain))return {provider:genericProvider(),host:null,detected:false};
 const known=providerForEmail(email);if(known)return {provider:known,host:known.host||null,detected:true};
 const mx=await resolveMx(domain).then(r=>r.map(x=>x.exchange),()=>[] as string[]);
 const byMx=providerForMx(mx);if(byMx)return {provider:byMx,host:byMx.host||null,detected:true};
 // RFC 6186: el dominio puede anunciar su servidor IMAP seguro.
 const srv=await resolveSrv('_imaps._tcp.'+domain).then(r=>r.filter(x=>x.port===993&&x.name&&x.name!=='.').sort((a,b)=>a.priority-b.priority).map(x=>x.name.toLowerCase().replace(/\.$/,'')),()=>[] as string[]);
 const candidates=[...new Set([...srv,...candidateHosts(domain)])].slice(0,5);
 const results=await Promise.all(candidates.map(probe));
 const host=candidates.find((_,i)=>results[i])||null;
 return {provider:genericProvider(host||undefined),host,detected:Boolean(host)};
}
