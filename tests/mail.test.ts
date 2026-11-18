import test from 'node:test';
import assert from 'node:assert/strict';
import {detectType,isEInvoice} from '../lib/extraction';
import {attachmentItems,mailAccepted} from '../lib/mail-items';
import {extensionFor} from '../lib/drive-names';
import {defaultGmailSetting,gmailSettingSchema} from '../lib/gmail-capture';

const ubl='<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><cbc:ID>F-1</cbc:ID></Invoice>';
const facturae='﻿<fe:Facturae xmlns:fe="http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml"><FileHeader/></fe:Facturae>';
const edifact="UNA:+.? 'UNB+UNOC:3+8400000000001+8400000000002+261117:1200+1'UNH+1+INVOIC:D:96A:UN'";

test('factura electrónica reconocida por su contenido: XML (UBL, Facturae) y EDIFACT',()=>{
 assert.equal(detectType(Buffer.from(ubl)),'application/xml');
 assert.equal(detectType(Buffer.from(facturae)),'application/xml','con BOM y sin declaración XML');
 assert.equal(detectType(Buffer.from(edifact)),'application/edifact');
 assert.equal(detectType(Buffer.from("UNB+UNOC:3+A+B+261117:1200+1'")),'application/edifact','sin segmento UNA');
 assert.ok(isEInvoice('application/xml')&&isEInvoice('application/edifact')&&!isEInvoice('application/pdf'));
 assert.deepEqual(['application/xml','application/edifact'].map(extensionFor),['xml','edi']);
});

test('HTML, SVG, texto suelto y binarios no pasan por factura electrónica',()=>{
 for(const bad of ['<html><body>hola</body></html>','<!DOCTYPE html><html></html>','<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>','<script>alert(1)</script>','Hola, adjunto la factura','UNA factura para usted'])
  assert.throws(()=>detectType(Buffer.from(bad)),Error,bad);
 assert.throws(()=>detectType(Buffer.from([0x3c,0x00,0x41,0x00,0x3e])),'XML con bytes nulos');
});

test('del correo solo se aceptan PDF y factura electrónica; las imágenes se excluyen',()=>{
 assert.ok(mailAccepted('application/pdf')&&mailAccepted('application/xml')&&mailAccepted('application/edifact'));
 assert.ok(!mailAccepted('image/png')&&!mailAccepted('image/jpeg')&&!mailAccepted(null));
});

const b64=(b:Buffer|string)=>Buffer.from(b).toString('base64');
const part=(name:string,type:string,body:Buffer|string)=>`--X\r\nContent-Type: ${type}; name="${name}"\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(body)}\r\n`;
const email=(parts:string)=>Buffer.from(`From: Ana <ana@proveedor.com>\r\nSubject: Factura\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="X"\r\n\r\n--X\r\nContent-Type: text/plain\r\n\r\nAdjunto factura.\r\n${parts}--X--\r\n`);
const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13]);

test('un correo con PDF, logotipo, XML, EDIFACT y un Word: se guardan tres y se excluyen dos',async()=>{
 const items=await attachmentItems(email(part('factura.pdf','application/pdf','%PDF-1.7 contenido')+part('logo.png','image/png',png)+part('factura.xml','text/xml',ubl)+part('INVOIC.edi','application/octet-stream',edifact)+part('carta.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','PK\u0003\u0004 no es factura')));
 const by=Object.fromEntries(items.map(i=>[i.filename,i]));
 assert.deepEqual(items.filter(i=>i.status==='received').map(i=>[i.filename,i.mime]),[['factura.pdf','application/pdf'],['factura.xml','application/xml'],['INVOIC.edi','application/edifact']]);
 assert.equal(by['logo.png'].status,'excluded');assert.equal(by['logo.png'].bytes,null);assert.match(by['logo.png'].detail,/Solo PDF o factura electrónica/);
 assert.equal(by['carta.docx'].status,'excluded');
});

test('el tipo sale del contenido, no del nombre: un HTML llamado factura.xml se excluye',async()=>{
 const items=await attachmentItems(email(part('factura.xml','text/xml','<html><script>x</script></html>')+part('factura.pdf','application/pdf','no soy un pdf')));
 assert.ok(items.every(i=>i.status==='excluded'));
});

test('Gmail: todo es opcional; sin etiquetas ni filtros la configuración es válida',()=>{
 const d=defaultGmailSetting();assert.deepEqual(d.labels,[]);assert.equal(d.sender,'');assert.equal(d.subject,'');assert.match(d.since,/^\d{4}-\d{2}-\d{2}$/);
 assert.ok(gmailSettingSchema.parse({labels:[],since:'2026-11-01',autoRead:false}));
});
