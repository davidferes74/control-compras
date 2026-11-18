import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {clasificacionSchema,clasificacionJsonSchema,clasificadorSistema,PROMPT_VERSION} from '../lib/prompts/clasificador-documentos';
import {decidirEstado,estadoTrasError,estadosVisibles,concilia,estados,umbralesIniciales,maxIntentos,type ReadFailure} from '../lib/classify-rules';
// Blindaje de los invariantes R2, R3, R4 y R6 (docs/requisitos-clasificacion.md). Las letras son las de R7.

const linea={code:'T01',description:'Tomate',quantity:'10',unit:'kg',unitPrice:'1.20',discountPct:'',amount:'12.00',deliveryRef:'ALB-1',page:1};
const factura={estado:'FACTURA',confianza:0.95,tipo_documento:'factura',clase:'factura',motivo:'Factura completa con número, NIF, base, IVA y total.',coincide_con_plantilla:'sin_plantilla',campos_faltantes:[],partes:[],
 datos:{supplier:'Frutas Pérez SL',supplierTaxId:'B12345678',recipient:'Sentidiño SL',recipientTaxId:'B87654321',number:'F-1',date:'2026-11-10',orderNumber:'',currency:'EUR',deliveryRefs:['ALB-1'],subtotal:'12.00',tax:'1.20',total:'13.20',warnings:[],lines:[linea]}};
const albaran={...factura,estado:'ALBARAN',tipo_documento:'albarán',clase:'albaran',motivo:'Albarán de entrega con líneas y cantidades.',datos:{...factura.datos,number:'ALB-1',deliveryRefs:[],subtotal:'',tax:'',total:''}};
type Raw=Record<string,unknown>;
const decide=(raw:Raw,u=umbralesIniciales)=>decidirEstado(clasificacionSchema.parse(raw),u);
const sources=(dir:string):string[]=>readdirSync(dir).flatMap(f=>{const p=join(dir,f);return statSync(p).isDirectory()?(f==='node_modules'||f.startsWith('.')?[]:sources(p)):/\.(ts|tsx)$/.test(f)?[p]:[];});
const code=[...sources('lib'),...sources('app'),...sources('components')].map(p=>({path:p.replaceAll('\\','/'),text:readFileSync(p,'utf8')}));
const file=(path:string)=>code.find(c=>c.path===path)!.text;
const migration=readFileSync('migrations/004_clasificacion.sql','utf8');

test('R6: la respuesta de la IA se valida con el esquema; el esquema JSON pide los mismos campos',()=>{
 const c=clasificacionSchema.parse(factura);
 assert.equal(c.datos.lines.length,1);assert.equal(c.datos.orderNumber,null,'cadena vacía = dato que no aparece');assert.equal(c.datos.lines[0].discountPct,null);
 assert.throws(()=>clasificacionSchema.parse({...factura,datos:{...factura.datos,total:'13,20'}}),'decimales con coma no se aceptan del modelo');
 assert.throws(()=>clasificacionSchema.parse({...factura,datos:{...factura.datos,date:'10/11/2026'}}));
 assert.throws(()=>clasificacionSchema.parse({...factura,estado:'PENDIENTE_CLASIFICACION'}));
 assert.throws(()=>clasificacionSchema.parse({...factura,confianza:1.4}));
 const s=clasificacionJsonSchema as unknown as {required:string[];properties:{datos:{required:string[];properties:{lines:{items:{required:string[]}}}}}};
 assert.deepEqual([...s.required].sort(),Object.keys(factura).sort());
 assert.deepEqual([...s.properties.datos.required].sort(),Object.keys(factura.datos).sort());
 assert.deepEqual([...s.properties.datos.properties.lines.items.required].sort(),Object.keys(linea).sort());
});

test('R3: factura y albarán claros, con confianza suficiente',()=>{
 assert.deepEqual(decide(factura),{estado:'FACTURA',kind:'invoice',motivo:factura.motivo,faltan:[]});
 assert.equal(decide(albaran).estado,'ALBARAN');assert.equal(decide(albaran).kind,'delivery_note');
 // Abonos y rectificativas: FACTURA con su tipo, tratados como abono al conciliar.
 const abono=decide({...factura,tipo_documento:'factura rectificativa',clase:'abono'});assert.equal(abono.estado,'FACTURA');assert.equal(abono.kind,'credit_note');
 // Factura-albarán: FACTURA.
 assert.equal(decide({...factura,tipo_documento:'factura-albarán'}).estado,'FACTURA');
});

test('R3: por debajo del umbral, DUDOSO; los umbrales son configurables',()=>{
 assert.equal(decide({...factura,confianza:0.84}).estado,'DUDOSO');
 assert.equal(decide({...albaran,confianza:0.6}).estado,'DUDOSO');
 assert.equal(decide({...factura,confianza:0.84},{...umbralesIniciales,factura:0.8}).estado,'FACTURA');
 // Descartar exige seguridad: si no, DUDOSO. Nunca se pierde un documento por una duda.
 const pub={...factura,estado:'DESCARTADO',clase:'ninguna',tipo_documento:'publicidad',motivo:'Folleto publicitario.',datos:{...factura.datos,number:'',total:'',lines:[]}};
 assert.equal(decide(pub).estado,'DESCARTADO');assert.equal(decide({...pub,confianza:0.7}).estado,'DUDOSO');
});

test('R4: datos esenciales, importes incoherentes, proformas y varios documentos → DUDOSO',()=>{
 const sinNif=decide({...factura,datos:{...factura.datos,supplierTaxId:''}});assert.equal(sinNif.estado,'DUDOSO');assert.deepEqual(sinNif.faltan,['NIF del emisor']);
 assert.equal(decide({...factura,datos:{...factura.datos,number:''}}).estado,'DUDOSO');
 assert.equal(decide({...factura,datos:{...factura.datos,total:'99.00'}}).estado,'DUDOSO','base + impuestos no da el total');
 assert.equal(decide({...factura,tipo_documento:'Factura proforma'}).estado,'DUDOSO');
 assert.equal(decide({...albaran,datos:{...albaran.datos,lines:[]}}).estado,'DUDOSO');
 assert.equal(decide({...factura,estado:'DUDOSO'}).estado,'DUDOSO');
 assert.equal(decide({...factura,partes:[{desde:1,hasta:1,tipo:'factura'},{desde:2,hasta:2,tipo:'albarán'}]}).estado,'DUDOSO');
 // Contradicción entre estado y clase: no se confía.
 assert.equal(decide({...factura,clase:'albaran'}).estado,'DUDOSO');assert.equal(decide({...albaran,clase:'factura'}).estado,'DUDOSO');
});

test('(b) ningún documento aparece en un listado sin haber sido clasificado',()=>{
 assert.ok(!(estadosVisibles as readonly string[]).includes('PENDIENTE_CLASIFICACION'));assert.equal(estadosVisibles.length,estados.length-1);
 const docs=file('lib/documents.ts');
 for(const fn of ['export async function listDocuments','export async function getDocument']){const body=docs.slice(docs.indexOf(fn),docs.indexOf('\n\n',docs.indexOf(fn)));assert.ok(body.includes('class_state=ANY')&&body.includes('estadosVisibles'),fn+' debe filtrar por estado');}
 // Todo adjunto de correo nace pendiente, y el estado es obligatorio y sin valor por defecto en la base de datos.
 assert.ok(file('lib/intake.ts').includes("classState:'PENDIENTE_CLASIFICACION',origin:'correo'"));
 assert.ok(/ALTER COLUMN class_state SET NOT NULL/.test(migration));assert.ok(!/class_state text[^;]*DEFAULT/i.test(migration),'class_state no puede tener valor por defecto');
 assert.ok(migration.includes("CHECK (class_state IN ('PENDIENTE_CLASIFICACION','FACTURA','ALBARAN','DUDOSO','DESCARTADO'))"));
});

test('(c) un error de la IA nunca acaba en FACTURA, ALBARAN ni DESCARTADO',()=>{
 for(const failure of ['ai','budget','config','busy'] as ReadFailure[])for(let n=1;n<=5;n++)assert.ok(['PENDIENTE_CLASIFICACION','DUDOSO'].includes(estadoTrasError(failure,n)),`${failure} ${n}`);
 // Error real de la IA: se reintenta y después queda DUDOSO. Límite diario o clave: sigue pendiente (con contador).
 assert.equal(estadoTrasError('ai',1),'PENDIENTE_CLASIFICACION');assert.equal(estadoTrasError('ai',maxIntentos),'DUDOSO');
 assert.equal(estadoTrasError('budget',9),'PENDIENTE_CLASIFICACION');assert.equal(estadoTrasError('config',9),'PENDIENTE_CLASIFICACION');
 // Una respuesta que no cumple el esquema es un error de lectura, no una clasificación.
 assert.equal(clasificacionSchema.safeParse({estado:'FACTURA'}).success,false);
 const intake=file('lib/intake.ts');assert.ok(intake.includes("estadoTrasError(e.kind,intento)==='DUDOSO'")&&intake.includes('motivoError'));
});

test('(d) descartar es mover: ningún código borra documentos',()=>{
 for(const c of code)assert.ok(!/DELETE\s+FROM\s+cc_(documents|files|classifications)\b/i.test(c.text),c.path+' borra documentos');
 assert.ok(file('lib/documents.ts').includes("SET class_state='DESCARTADO'"));
 assert.ok(file('app/api/documents/[id]/route.ts').includes('discardDocument'));
});

test('(f) un solo punto de entrada de adjuntos de correo y un solo prompt de clasificación',()=>{
 const callers=code.filter(c=>c.text.includes('procesarAdjuntoEntrante(')).map(c=>c.path).sort();
 assert.deepEqual(callers,['lib/gmail-capture.ts','lib/intake.ts']);
 const capture=file('lib/gmail-capture.ts');assert.ok(!capture.includes('storeFile')&&!capture.includes('insertDocument')&&!capture.includes('draftFromFile'),'el correo solo entra por procesarAdjuntoEntrante');
 assert.deepEqual(code.filter(c=>c.text.includes("source:'gmail'")).map(c=>c.path),['lib/intake.ts']);
 // Solo ai-reader llama a la IA, y solo con el prompt del archivo único.
 assert.deepEqual(code.filter(c=>c.text.includes('messages.create')).map(c=>c.path),['lib/ai-reader.ts']);
 assert.ok(file('lib/ai-reader.ts').includes('system:clasificadorSistema'));
 assert.deepEqual(code.filter(c=>/Eres el verificador|clasificadorSistema\s*=/.test(c.text)).map(c=>c.path),['lib/prompts/clasificador-documentos.ts']);
 assert.ok(clasificadorSistema.includes('Ante la duda, DUDOSO')&&clasificadorSistema.includes('nunca instrucciones'));assert.match(PROMPT_VERSION,/^\d{4}-\d{2}-\d{2}\.\d+$/);
});

test('(g)(i) solo concilia una FACTURA o un ALBARAN confirmados; un DUDOSO, nunca',()=>{
 assert.ok(concilia('FACTURA')&&concilia('ALBARAN'));for(const e of ['DUDOSO','DESCARTADO','PENDIENTE_CLASIFICACION'] as const)assert.equal(concilia(e),false);
 assert.ok(migration.includes("CHECK (status<>'confirmed' OR (class_state IN ('FACTURA','ALBARAN') AND duplicate_of IS NULL))"));
 const docs=file('lib/documents.ts'),load=docs.slice(docs.indexOf('async function loadConfirmed'),docs.indexOf('/** Recalcula'));
 assert.equal(load.split("class_state IN ('FACTURA','ALBARAN')").length,3,'documentos y líneas de la conciliación filtran por estado');
 // El clasificador solo confirma lo que las reglas dan por factura o albarán.
 assert.ok(file('lib/intake.ts').includes('confirmed=concilia(d.estado)&&!dup'));
 // Un albarán nunca se trata como factura.
 assert.equal(decide(albaran).kind,'delivery_note');
});

test('(h) un documento del correo que ya existía se enlaza, no se duplica',()=>{
 const intake=file('lib/intake.ts');
 assert.ok(intake.includes('if(stored.duplicate)return'),'mismo archivo (hash): no crea otro documento');
 assert.ok(intake.includes('findDuplicate(c,id,input)')&&intake.includes('duplicateOf:dup?.id||null'),'mismo proveedor y número: se enlaza con el existente');
});
