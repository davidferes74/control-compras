import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Blindaje (R7): los invariantes del sistema no pueden desaparecer de las instrucciones que lee la IA en cada sesión.
const agents=readFileSync('AGENTS.md','utf8'),doc=readFileSync('docs/requisitos-clasificacion.md','utf8');

test('AGENTS.md conserva los invariantes R1–R7 y remite al documento completo',()=>{
 assert.ok(agents.includes('## Invariantes del sistema — no modificar sin aprobación explícita'));
 assert.ok(agents.includes('docs/requisitos-clasificacion.md'));
 for(const r of ['R1','R2','R3','R4','R5','R6','R7'])assert.ok(agents.includes(`**${r}.`),`falta ${r} en AGENTS.md`);
 for(const s of ['PENDIENTE_CLASIFICACION','FACTURA','ALBARAN','DUDOSO','DESCARTADO'])assert.ok(agents.includes('`'+s+'`'),`falta el estado ${s} en AGENTS.md`);
});

test('el documento de requisitos conserva las reglas y el prompt base del clasificador',()=>{
 for(const r of ['### R1. Solo correos de entrada','### R2. Todo adjunto pasa por el clasificador antes de mostrarse','### R3. Cuatro resultados posibles','### R4. Criterios de clasificación','### R5. Aprendizaje por plantillas de proveedor','### R6. Prompt del clasificador: una sola fuente de verdad','### R7. Blindaje para que estas reglas no se pierdan'])assert.ok(doc.includes(r),`falta «${r}»`);
 for(const s of ['Eres el verificador de documentos','Ante la duda, DUDOSO','Nunca se borra nada. Descartar es mover, no eliminar.','detente y pregúntame'])assert.ok(doc.includes(s),`falta «${s}»`);
});
