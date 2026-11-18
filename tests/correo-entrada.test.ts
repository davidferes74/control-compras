import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isIncoming,ownEntries,senderAddress,gmailQuery,gmailSettingSchema,defaultGmailSetting} from '../lib/gmail-capture';
// R1 (docs/requisitos-clasificacion.md): solo correos de entrada. Un correo de salida o propio nunca llega al clasificador.
const own=ownEntries('miempresa.es, @Otra.com; socio@gmail.com','Cuenta@MiBuzon.es');

test('R1: cuentas y dominios propios, con la cuenta conectada siempre incluida',()=>{
 assert.deepEqual(own,['miempresa.es','otra.com','socio@gmail.com','cuenta@mibuzon.es']);
 assert.deepEqual(ownEntries('',null),[]);
 assert.equal(senderAddress('"Compras, Dpto." <Facturas@Proveedor.COM>'),'facturas@proveedor.com');
 assert.equal(senderAddress('ventas@proveedor.com'),'ventas@proveedor.com');
 assert.equal(senderAddress('Sin dirección'),'');
});

test('R1: Enviados, Borradores, Spam y Papelera nunca son correo de entrada',()=>{
 const from='Proveedor <ventas@proveedor.com>';
 assert.equal(isIncoming({labelIds:['INBOX','UNREAD'],from},own),true);
 for(const l of ['SENT','DRAFT','SPAM','TRASH'])assert.equal(isIncoming({labelIds:['INBOX',l],from},own),false,l);
 assert.equal(isIncoming({from},own),true);
});

test('R1: un remitente propio se excluye aunque el correo esté en Recibidos',()=>{
 const inbox=['INBOX'];
 assert.equal(isIncoming({labelIds:inbox,from:'Yo <cuenta@mibuzon.es>'},own),false);
 assert.equal(isIncoming({labelIds:inbox,from:'Admin <admin@miempresa.es>'},own),false);
 assert.equal(isIncoming({labelIds:inbox,from:'x@tienda.miempresa.es'},own),false);
 assert.equal(isIncoming({labelIds:inbox,from:'Socio <SOCIO@gmail.com>'},own),false);
 // Otra cuenta del mismo proveedor de correo o un dominio parecido no son propios.
 assert.equal(isIncoming({labelIds:inbox,from:'otro@gmail.com'},own),true);
 assert.equal(isIncoming({labelIds:inbox,from:'ventas@nomiempresa.es'},own),true);
 assert.equal(isIncoming({labelIds:inbox,from:'otro@mibuzon.es'},own),true);
 // Sin remitente reconocible no se puede saber que es de un tercero: no entra.
 assert.equal(isIncoming({labelIds:inbox,from:''},own),false);
});

test('R1: la consulta a Gmail excluye salida y remitentes propios',()=>{
 const q=gmailQuery(1760000000,own);
 for(const part of ['has:attachment','after:1760000000','-in:sent','-in:drafts','-in:spam','-in:trash','-from:me','-from:miempresa.es','-from:socio@gmail.com'])assert.ok(q.includes(part),part);
 assert.throws(()=>gmailSettingSchema.parse({...defaultGmailSetting(),own:'miempresa.es OR in:sent {x}'}));
 assert.equal(gmailSettingSchema.parse({...defaultGmailSetting(),own:'miempresa.es, a@b.com'}).own,'miempresa.es, a@b.com');
 assert.equal(defaultGmailSetting().own,'');
});

test('R1: la captura comprueba isIncoming antes de guardar ningún adjunto',()=>{
 const src=readFileSync('lib/gmail-capture.ts','utf8');const check=src.indexOf('if(!isIncoming('),store=src.indexOf('storeFile({');
 assert.ok(check>0&&store>check,'isIncoming debe ir antes de storeFile');
 assert.ok(src.includes('q:gmailQuery(after,own)'));
 assert.equal(src.split('storeFile({').length,2,'un solo punto donde el correo guarda adjuntos');
});
