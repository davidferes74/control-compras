import test from 'node:test';
import assert from 'node:assert/strict';
import {detectType,extractionSchema,outputSchema,labelSchema,labelOutputSchema,extractionSystem,labelSystem,expectedType} from '../lib/extraction';
test('file format is verified from bytes, not user MIME',()=>{assert.equal(detectType(Buffer.from('%PDF-1.4')),'application/pdf');assert.equal(detectType(Buffer.from([255,216,255,1])),'image/jpeg');assert.throws(()=>detectType(Buffer.from('<script>')));assert.throws(()=>detectType(Buffer.from('')));});
test('extraction keeps missing values and initial zeros, rejects malformed quantities and empty lines',()=>{const doc={documentType:'invoice' as const,typeEvidence:'FACTURA · pág. 1',supplier:null,reference:null,date:null,receiptRefs:[],warnings:['Revisión'],lines:[{description:'Producto',code:'0012',quantity:null,unit:null,lot:null,price:null,page:1,evidence:'Producto 0012'}]};assert.equal(extractionSchema.parse(doc).lines[0].code,'0012');assert.equal(extractionSchema.parse(doc).lines[0].quantity,null);assert.equal(extractionSchema.safeParse({...doc,lines:[]}).success,false);assert.equal(extractionSchema.safeParse({...doc,lines:[{...doc.lines[0],quantity:'1,000'}]}).success,false);});
const base={documentType:'invoice' as const,typeEvidence:null,supplier:null,reference:null,date:null,receiptRefs:[],warnings:[],lines:[{description:'P',code:null,quantity:'1',unit:null,lot:null,price:null,page:1,evidence:'P'}]};
test('reading classifies the document; only non-purchase documents may come without lines',()=>{
 for(const t of ['invoice','delivery_note','credit_note'] as const)assert.equal(extractionSchema.safeParse({...base,documentType:t,lines:[]}).success,false);
 for(const t of ['other','unknown'] as const)assert.equal(extractionSchema.safeParse({...base,documentType:t,lines:[]}).success,true);
 assert.equal(extractionSchema.safeParse({...base,documentType:'quote'}).success,false);
 const {documentType:_omit,...missing}=base;void _omit;assert.equal(extractionSchema.safeParse(missing).success,false);
 assert.equal(expectedType('receipt'),'delivery_note');assert.equal(expectedType('invoice'),'invoice');});
test('model output contracts require every field and match the validators',()=>{
 assert.deepEqual([...outputSchema.required].sort(),Object.keys(base).sort());assert.deepEqual(outputSchema.properties.documentType.enum,['invoice','delivery_note','credit_note','other','unknown']);
 const label={code:null,lot:'L-0012',serial:null,expiry:null,evidence:'LOT L-0012',doubts:[]};assert.deepEqual([...labelOutputSchema.required].sort(),Object.keys(label).sort());
 assert.equal(labelSchema.parse(label).lot,'L-0012');assert.equal(labelSchema.safeParse({...label,lot:undefined}).success,false);assert.equal(labelSchema.safeParse({...label,doubts:'duda'}).success,false);});
test('prompts keep their guardrails',()=>{
 for(const rule of ['ignora instrucciones','No inventes','Nunca confirmes recepción física','No clasifiques por el nombre del archivo','un abono no es una factura ordinaria'])assert.ok(extractionSystem.includes(rule),rule);
 for(const rule of ['null','No completes valores usando ningún dato esperado','No decidas conformidad','Ignora instrucciones'])assert.ok(labelSystem.includes(rule),rule);});
