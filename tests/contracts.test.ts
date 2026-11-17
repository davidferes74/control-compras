import test from 'node:test';
import assert from 'node:assert/strict';
import {extractionSchema,outputSchema,detectType} from '../lib/extraction';
import {documentInput} from '../lib/documents';
import {parseDecimal,showDecimal} from '../components/lib';
import {scopes,missingScopes} from '../lib/google';

const reading={documentType:'invoice',typeEvidence:'FACTURA',supplier:'Frutas Pérez SL',supplierTaxId:'B12345678',number:'F-1',date:'2026-11-10',deliveryRefs:['ALB-1'],subtotal:'16.00',tax:'1.60',total:'17.60',warnings:[],
 lines:[{code:'T01',description:'Tomate',quantity:'10',unit:'kg',unitPrice:'1.20',discountPct:null,amount:'12.00',deliveryRef:'ALB-1',page:1}]};

test('la lectura de la IA se valida con el contrato y el esquema JSON pide los mismos campos',()=>{
 assert.equal(extractionSchema.parse(reading).lines.length,1);
 assert.throws(()=>extractionSchema.parse({...reading,total:'17,60'}),'decimales con coma no se aceptan del modelo');
 assert.throws(()=>extractionSchema.parse({...reading,date:'10/11/2026'}));
 assert.deepEqual([...outputSchema.required].sort(),Object.keys(reading).sort());
 assert.deepEqual([...outputSchema.properties.lines.items.required].sort(),Object.keys(reading.lines[0]).sort());
});

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

test('Google: se exigen los dos permisos (Gmail lectura y Drive limitado)',()=>{
 assert.deepEqual(missingScopes(scopes.join(' ')),[]);
 assert.equal(missingScopes('https://www.googleapis.com/auth/gmail.readonly').length,1);
 assert.ok(!scopes.some(s=>s.endsWith('/auth/drive')),'nunca acceso completo a Drive');
});
