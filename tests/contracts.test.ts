import test from 'node:test';
import assert from 'node:assert/strict';
import {detectType} from '../lib/extraction';
import {documentInput} from '../lib/documents';
import {parseDecimal,showDecimal} from '../components/lib';
import {gmailScope,driveScope,missingScopes} from '../lib/google';

// El contrato de lectura de la IA se prueba en tests/clasificacion.test.ts.

test('tipos de archivo por contenido, no por nombre',()=>{
 assert.equal(detectType(Buffer.from('%PDF-1.7 ...')),'application/pdf');
 assert.equal(detectType(Buffer.from([255,216,255,224])),'image/jpeg');
 assert.throws(()=>detectType(Buffer.from('<html>')));
});

test('números escritos en español',()=>{
 assert.equal(parseDecimal('1.234,56'),'1234.56');
 assert.equal(parseDecimal('12,5 €'),'12.5');
 assert.equal(parseDecimal('7'),'7');
 assert.equal(parseDecimal(''),null);
 assert.equal(parseDecimal('doce'),undefined);
 assert.equal(showDecimal('1234.56'),'1234,56');
});

test('el formulario rechaza números mal formados y tipos desconocidos',()=>{
 const ok={kind:'invoice',supplier:'X',supplierTaxId:'',number:'1',date:'2026-01-01',deliveryRefs:[],subtotal:null,tax:null,total:'10',lines:[]};
 assert.ok(documentInput.parse(ok));
 assert.throws(()=>documentInput.parse({...ok,total:'10,5'}));
 assert.throws(()=>documentInput.parse({...ok,kind:'order'}));
});

test('Google: Gmail solo lectura y Drive limitado, cada uno con su autorización',()=>{
 assert.deepEqual(missingScopes(gmailScope),[]);
 assert.equal(missingScopes(driveScope).length,1,'el permiso de Drive no sirve para Gmail');
 assert.ok(gmailScope.endsWith('/gmail.readonly'));
 assert.ok(driveScope.endsWith('/drive.file'),'nunca acceso completo a Drive');
});

import {gmailSettingSchema,passesFilters} from '../lib/gmail-capture';
import {forbiddenKind as googleForbidden} from '../lib/google';
test('Gmail: configuración con nombre, etiquetas, fecha y filtros; la antigua sigue valiendo',()=>{
 const old=gmailSettingSchema.parse({labels:[{id:'INBOX',name:'INBOX'}],since:'2026-11-01',autoRead:true});
 assert.equal(old.name,'Facturas Gmail');assert.equal(old.sender,'');assert.equal(old.subject,'');
 assert.throws(()=>gmailSettingSchema.parse({labels:[],since:'01/11/2026',autoRead:true}));
 assert.throws(()=>gmailSettingSchema.parse({name:'   ',labels:[],since:'2026-11-01',autoRead:true}));
});
test('Gmail: filtros «contiene» de remitente y asunto, sin distinguir mayúsculas',()=>{
 assert.ok(passesFilters({sender:'',subject:''},'x@y.com','lo que sea'));
 assert.ok(passesFilters({sender:'@Proveedor.com',subject:'FACTURA'},'Ana <ana@proveedor.com>','Su factura de noviembre'));
 assert.ok(!passesFilters({sender:'@proveedor.com',subject:''},'otro@empresa.es','Factura'));
 assert.ok(!passesFilters({sender:'',subject:'factura'},'ana@proveedor.com','Albarán 12'));
});
test('Gmail: un 403 distingue API sin activar de cuenta sin acceso',()=>{
 assert.equal(googleForbidden({error:{message:'Gmail API has not been used in project 1 before or it is disabled.',errors:[{reason:'accessNotConfigured'}]}}),'api');
 assert.equal(googleForbidden({error:{message:'Insufficient Permission'}}),'denied');
});
