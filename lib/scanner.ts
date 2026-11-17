import type {ParsedCode, Profile} from './types';
export function validGTIN(code:string): boolean {
 if(!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
 let sum=0;for(let i=code.length-2,m=3;i>=0;i--,m=m===3?1:3)sum+=Number(code[i])*m;
 return (10-sum%10)%10===Number(code.at(-1));
}
export function parseScan(raw:string, p:Pick<Profile,'prefix'|'suffix'|'parser'|'delimiter'|'codePosition'|'lotPosition'|'serialPosition'>):ParsedCode {
 if(!raw||raw.length>512)throw new Error('Lectura vacía o demasiado larga.');
 let s=raw.replace(/[\r\n\t]+$/,'');
 if(p.prefix){if(!s.startsWith(p.prefix))throw new Error('El prefijo no coincide con el perfil.');s=s.slice(p.prefix.length);}
 if(p.suffix){if(!s.endsWith(p.suffix))throw new Error('El sufijo no coincide con el perfil.');s=s.slice(0,-p.suffix.length);}
 if(p.parser==='plain'){
  if(!/^[A-Za-z0-9._-]{1,100}$/.test(s))throw new Error('Código simple no válido. Revisa el formato del lector.');
  if(/^\d+$/.test(s)&&[8,12,13,14].includes(s.length)&&!validGTIN(s))throw new Error('El dígito de control del código no es válido.');
  return {code:s};
 }
 if(p.parser==='delimited'){
  if(!p.delimiter)throw new Error('Configura un separador.');
  const a=s.split(p.delimiter);const code=a[p.codePosition];
  if(!code)throw new Error('No se encuentra el código en la posición configurada.');
  const lot=p.lotPosition>=0?a[p.lotPosition]:undefined,serial=p.serialPosition>=0?a[p.serialPosition]:undefined;
  if((p.lotPosition>=0&&!lot)||(p.serialPosition>=0&&!serial))throw new Error('Falta un campo requerido por este perfil.');
  return {code,lot,serial};
 }
 s=s.replace(/^\](C1|d2|Q3)/,'');
 // GS1 subset supported explicitly: 01, 10, 21, 17. Reject unknown AIs.
 const fields:Record<string,string>={};
 if(s.startsWith('(')){
  const parts=[...s.matchAll(/\((\d{2})\)([^()]*)/g)];
  if(!parts.length||parts.map(x=>x[0]).join('')!==s)throw new Error('Formato GS1 entre paréntesis incompleto.');
  for(const m of parts){if(fields[m[1]])throw new Error('Identificador GS1 repetido.');fields[m[1]]=m[2];}
 } else {
  while(s.length){if(s[0]==='\x1d'){s=s.slice(1);continue;}const ai=s.slice(0,2);s=s.slice(2);if(fields[ai])throw new Error('Identificador GS1 repetido.');
   if(ai==='01'||ai==='17'){const n=ai==='01'?14:6;if(s.length<n)throw new Error('Código GS1 truncado.');fields[ai]=s.slice(0,n);s=s.slice(n);}
   else if(ai==='10'||ai==='21'){const n=s.indexOf('\x1d');fields[ai]=n<0?s:s.slice(0,n);s=n<0?'':s.slice(n+1);}
   else throw new Error('Identificador GS1 no soportado: '+ai+'. Revisión necesaria.');
  }
 }
 for(const [ai,v] of Object.entries(fields)){
  if(!['01','10','21','17'].includes(ai))throw new Error('Identificador GS1 no soportado: '+ai);
  if((ai==='10'||ai==='21')&&!/^[\x21-\x7e]{1,20}$/.test(v))throw new Error('Lote o serie GS1 no válido.');
 }
 if(!fields['01']||fields['01'].length!==14||!validGTIN(fields['01']))throw new Error('GTIN GS1 ausente o inválido.');
 if(fields['17']){const v=fields['17'];const month=Number(v.slice(2,4)),day=Number(v.slice(4)),year=2000+Number(v.slice(0,2));if(!/^\d{6}$/.test(v)||month<1||month>12||day>new Date(Date.UTC(year,month,0)).getUTCDate())throw new Error('Caducidad GS1 inválida.');}
 return {code:fields['01'],lot:fields['10'],serial:fields['21'],expiry:fields['17']};
}
export const baseProfile:Profile={id:'lector-1',name:'Lector de almacén',version:1,prefix:'',suffix:'',terminator:'Enter',parser:'plain',delimiter:'|',codePosition:0,lotPosition:-1,serialPosition:-1,quantity:'1',state:'draft'};
