import test from 'node:test';
import assert from 'node:assert/strict';
import {fileName,safePart,extensionFor,monthFolders,documentName,kindFolder} from '../lib/drive-names';
import {forbiddenKind,folderNameSchema} from '../lib/drive';
// Portadas de Recepciones-IA (tests/drive-names.test.ts) y adaptadas a los documentos de control-compras.

test('los archivos se nombran con la fecha primero, el proveedor y el documento',()=>{
 assert.equal(documentName({kind:'invoice',date:'2026-11-17',supplier:'Distribuciones Atlántico',number:'F-2026-0312'}),'2026-11-17 · Distribuciones Atlántico · Factura F-2026-0312');
 assert.equal(documentName({kind:'delivery_note',date:'2026-11-17',supplier:'Distribuciones Atlántico',number:'ALB-2026-0148'}),'2026-11-17 · Distribuciones Atlántico · Albarán ALB-2026-0148');
 assert.equal(documentName({kind:'credit_note',date:null,supplier:'',number:''}),'sin fecha · Proveedor sin nombre · Abono sin número');
});

test('nombres válidos para Drive, Windows y macOS, y nunca demasiado largos',()=>{
 assert.equal(safePart('  A/B\\C: "D" <E>|F?*  '),'A B C D E F');assert.equal(safePart('..oculto. '),'oculto');assert.equal(safePart('Línea\nnueva\ty tab'),'Línea nueva y tab');
 assert.equal(fileName(['2026-11-17','Proveedor / Raro','Factura F:1',undefined,false,'']),'2026-11-17 · Proveedor Raro · Factura F 1');
 assert.ok(fileName(['2026-11-17','x'.repeat(300),'y'.repeat(300),'z'.repeat(300)]).length<=200);
 assert.equal(documentName({kind:'invoice',date:'2026-11-15',supplier:'Ac/me: "Sur" S.L.',number:'F/12'}),'2026-11-15 · Ac me Sur S.L · Factura F 12');
});

test('la extensión sale del tipo real del archivo; carpetas de año y mes en español',()=>{
 assert.deepEqual(['application/pdf','image/jpeg','image/png','image/webp','text/html'].map(extensionFor),['pdf','jpg','png','webp','bin']);
 assert.deepEqual(monthFolders('2026-11-17'),{year:'2026',month:'11 noviembre',key:'2026-11'});assert.deepEqual(monthFolders('2027-01-02'),{year:'2027',month:'01 enero',key:'2027-01'});
 assert.equal(monthFolders('fecha rara').key,'sin-fecha');assert.equal(monthFolders('2026-13-01').key,'sin-fecha');assert.equal(monthFolders(null).key,'sin-fecha');
});

test('un 403 de Google se distingue: API de Drive sin activar frente a acceso denegado',()=>{
 assert.equal(forbiddenKind({error:{code:403,message:'Google Drive API has not been used in project 123 before or it is disabled.',errors:[{reason:'accessNotConfigured'}],status:'PERMISSION_DENIED'}}),'api');
 assert.equal(forbiddenKind({error:{code:403,message:'x',details:[{reason:'SERVICE_DISABLED'}]}}),'api');
 assert.equal(forbiddenKind({error:{code:403,message:'Insufficient Permission',errors:[{reason:'insufficientPermissions'}]}}),'denied');
 assert.equal(forbiddenKind(null),'denied');assert.equal(forbiddenKind('no es json'),'denied');
});

test('el nombre de la carpeta que escribe el usuario se limpia y no puede quedar vacío',()=>{
 assert.equal(folderNameSchema.parse('  Compras / 2026  '),'Compras 2026');
 assert.equal(folderNameSchema.safeParse('  /// ').success,false);
});

test('subcarpetas por tipo: facturas y abonos por un lado, albaranes por otro',()=>{
 assert.equal(kindFolder('invoice'),'Facturas');assert.equal(kindFolder('credit_note'),'Facturas');assert.equal(kindFolder('delivery_note'),'Albaranes');
});
