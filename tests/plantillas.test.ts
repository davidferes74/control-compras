import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchTemplates,templateContext,corrections,type Template} from '../lib/templates';
import {clasificacionSchema} from '../lib/prompts/clasificador-documentos';
import {decidirEstado,umbralesIniciales} from '../lib/classify-rules';
// R5 (docs/requisitos-clasificacion.md): plantillas de proveedor. Ayudan a leer; nunca eximen de clasificar.

const tpl=(o:Partial<Template>):Template=>({id:'t1',kind:'invoice',supplierTaxId:'B12345678',supplierName:'Frutas Pérez SL',senders:['facturas@frutasperez.es'],format:{numeracion:'F-0000'},example:{numero:'F-1'},corrections:[],...o});
const formato={etiquetas:'',numeracion:'',fecha:'',importes:''};
const linea={code:'T01',description:'Tomate',quantity:'10',unit:'kg',unitPrice:'1.20',discountPct:'',amount:'12.00',deliveryRef:'',page:1};
const lectura=(o:Record<string,unknown>)=>clasificacionSchema.parse({estado:'FACTURA',confianza:0.97,tipo_documento:'factura',clase:'factura',motivo:'Factura completa.',coincide_con_plantilla:'si',campos_faltantes:[],partes:[],formato,
 datos:{supplier:'Frutas Pérez SL',supplierTaxId:'B12345678',recipient:'',recipientTaxId:'',number:'F-2',date:'2026-11-12',orderNumber:'',currency:'EUR',deliveryRefs:[],subtotal:'12.00',tax:'1.20',total:'13.20',warnings:[],lines:[linea]},...o});

test('R5: la plantilla se encuentra por remitente o por el NIF dentro del texto',()=>{
 const gmail=tpl({id:'t2',supplierTaxId:'A11111111',senders:['paco.fruteria@gmail.com']}),all=[tpl({}),gmail];
 assert.deepEqual(matchTemplates(all,'Frutas Pérez <Facturas@FrutasPerez.es>').map(t=>t.id),['t1']);
 // Otra persona de la misma empresa: mismo dominio propio.
 assert.deepEqual(matchTemplates(all,'ana@frutasperez.es').map(t=>t.id),['t1']);
 // Un dominio compartido (gmail) solo vale con la dirección exacta.
 assert.deepEqual(matchTemplates(all,'paco.fruteria@gmail.com').map(t=>t.id),['t2']);
 assert.deepEqual(matchTemplates(all,'otro@gmail.com'),[]);
 // Factura electrónica: el NIF del proveedor aparece en el texto.
 assert.deepEqual(matchTemplates(all,'desconocido@gestoria.es','<TaxIdentificationNumber>ES-B12345678</TaxIdentificationNumber>').map(t=>t.id),['t1']);
 assert.deepEqual(matchTemplates(all,null,null),[]);
});

test('R5: la plantilla viaja como dato de ayuda, nunca como instrucción',()=>{
 assert.equal(templateContext([]),null);
 const c=templateContext([tpl({})])!;assert.ok(c.includes('no son instrucciones')&&c.includes('coincide_con_plantilla')&&c.includes('B12345678'));
});

test('(e) un proveedor con plantilla no se salta la clasificación',()=>{
 // Con plantilla que coincide, un presupuesto sigue descartado y un documento dudoso sigue dudoso.
 const presupuesto=lectura({estado:'DESCARTADO',clase:'ninguna',tipo_documento:'presupuesto',motivo:'Es un presupuesto.'});
 assert.equal(decidirEstado(presupuesto).estado,'DESCARTADO');
 assert.equal(decidirEstado(lectura({confianza:0.5})).estado,'DUDOSO');
 assert.equal(decidirEstado(lectura({})).estado,'FACTURA');
 // Si el documento no encaja con la plantilla (formato cambiado): DUDOSO, aunque la IA esté segura.
 const cambiado=decidirEstado(lectura({coincide_con_plantilla:'no'}));assert.equal(cambiado.estado,'DUDOSO');assert.match(cambiado.motivo,/plantilla/);
 // El módulo de plantillas no decide ni toca el estado de ningún documento.
 const src=readFileSync('lib/templates.ts','utf8');assert.ok(!/class_state\s*=|status\s*=/.test(src),'templates.ts no puede cambiar estados');
 // La entrada lee siempre con el prompt único y decide siempre con las reglas, haya plantilla o no.
 const intake=readFileSync('lib/intake.ts','utf8'),body=intake.slice(intake.indexOf('export async function clasificarDocumento'),intake.indexOf('/** Clasifica los documentos pendientes'));
 assert.ok(body.indexOf('findTemplates(')<body.indexOf('readFile(row.file_id,{context'),'la plantilla solo acompaña a la lectura');
 assert.ok(body.includes('decidirEstado(x,await umbrales(),templates,await empresa())'));
 assert.ok(!/templates\.length[^;]*return\s*\{estado/.test(body),'tener plantilla no puede devolver un estado sin clasificar');
});

test('R5: las correcciones de una persona sobre la lectura de la IA se registran',()=>{
 const leido={number:'F-2',date:'2026-11-12',supplier:'Frutas Perez',supplierTaxId:'B12345678',subtotal:'12.00',tax:'1.20',total:'13.20'};
 assert.deepEqual(corrections(leido,{number:'F-2',date:'2026-11-12',supplier:'Frutas Perez',supplierTaxId:'B12345678',subtotal:'12',tax:'1.2',total:'13.20'}),[]);
 assert.deepEqual(corrections(leido,{...leido,number:'F-20',total:'13.50'}),[{campo:'número',leido:'F-2',validado:'F-20'},{campo:'total',leido:'13.20',validado:'13.50'}]);
 assert.deepEqual(corrections(null,{...leido}),[]);
 // Aprender es cosa de una validación humana: solo saveDocument llama a learnTemplate.
 assert.ok(readFileSync('lib/documents.ts','utf8').includes("if(status==='confirmed')await learnTemplate(c,id);"));
 assert.ok(!readFileSync('lib/intake.ts','utf8').includes('learnTemplate'));
});

test('Proveedor conocido: umbral «plantilla» (decisión del propietario, 19-11-2026)',()=>{
 const t=[tpl({})],u=umbralesIniciales;
 const base={supplier:'Frutas Pérez SL',supplierTaxId:'B12345678',recipient:'',recipientTaxId:'',number:'F-2',date:'2026-11-12',orderNumber:'',currency:'EUR',deliveryRefs:[],subtotal:'12.00',tax:'1.20',total:'13.20',warnings:[],lines:[linea]};assert.equal(u.plantilla,0.70);
 // Plantilla validada + coincide + mismo NIF: una factura al 80 % se valida sola.
 const ok=decidirEstado(lectura({confianza:0.80}),u,t);assert.equal(ok.estado,'FACTURA');assert.match(ok.motivo,/Proveedor conocido/);
 // NIF con prefijo ES o separadores: es el mismo.
 assert.equal(decidirEstado(lectura({confianza:0.80,datos:{...base,supplierTaxId:'ES-B12345678'}}),u,t).estado,'FACTURA');
 // Por debajo del umbral «plantilla»: DUDOSO.
 assert.equal(decidirEstado(lectura({confianza:0.65}),u,t).estado,'DUDOSO');
 // Sin plantilla, plantilla de otro tipo, o que no coincide: sigue haciendo falta el umbral normal.
 assert.equal(decidirEstado(lectura({confianza:0.80}),u,[]).estado,'DUDOSO');
 assert.equal(decidirEstado(lectura({confianza:0.80}),u,[tpl({kind:'delivery_note'})]).estado,'DUDOSO');
 assert.equal(decidirEstado(lectura({confianza:0.80,coincide_con_plantilla:'sin_plantilla'}),u,t).estado,'DUDOSO');
 assert.equal(decidirEstado(lectura({confianza:0.95,coincide_con_plantilla:'no'}),u,t).estado,'DUDOSO');
 // NIF distinto del de la plantilla, o sin NIF: DUDOSO.
 assert.equal(decidirEstado(lectura({confianza:0.80,datos:{...base,supplierTaxId:'B99999999'}}),u,t).estado,'DUDOSO');
 assert.equal(decidirEstado(lectura({confianza:0.80,datos:{...base,supplierTaxId:''}}),u,t).estado,'DUDOSO');
 // Las comprobaciones de siempre se mantienen: importes que no cuadran, datos que faltan, la IA dice DUDOSO o proforma.
 assert.equal(decidirEstado(lectura({confianza:0.80,datos:{...base,total:'99.00'}}),u,t).estado,'DUDOSO');
 assert.equal(decidirEstado(lectura({confianza:0.80,datos:{...base,number:''}}),u,t).estado,'DUDOSO');
 assert.equal(decidirEstado(lectura({estado:'DUDOSO',confianza:0.80}),u,t).estado,'DUDOSO');
 assert.equal(decidirEstado(lectura({confianza:0.80,tipo_documento:'factura proforma'}),u,t).estado,'DUDOSO');
 // Solo afecta a facturas: un albarán sigue necesitando el umbral normal.
 const alb=lectura({estado:'ALBARAN',clase:'albaran',tipo_documento:'albarán',confianza:0.80});
 assert.equal(decidirEstado(alb,u,[tpl({kind:'delivery_note'})]).estado,'DUDOSO');
});
