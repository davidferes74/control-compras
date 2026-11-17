# Lectura asistida Claude · 16/11/2026

ANTHROPIC_API_KEY se lee solo en servidor. Modelo inicial claude-haiku-5-5, configurable con ANTHROPIC_MODEL. API Messages mediante HTTPS, salida JSON restringida y validación Zod posterior. Referencias consultadas: https://platform.claude.com/docs/en/models/overview , https://platform.claude.com/docs/en/build-with-claude/structured-outputs y https://platform.claude.com/docs/en/build-with-claude/pdf-support .

Una foto JPG/PNG/WebP o un PDF por lectura, 3 MB máximo, PDF máximo 10 páginas sin contraseña. Firma del formato comprobada; pdf-lib verifica páginas. Endpoint privado, mismo origen. Máximo 10 intentos diarios por organización, 6000 tokens de salida por intento, 45 s de timeout, sin reintentos automáticos ni escalado a modelos caros. El límite diario cuenta fallos para contener consumo. Día UTC de la base de datos.

El original y la extracción se conservan en Neon con acceso autenticado por organización. Es un archivo provisional para piloto, no Drive. La huella incluye contenido, tipo, modelo y versión de extracción; una respuesta completa se reutiliza sin llamar otra vez a IA. Una reserva SQL impide llamadas duplicadas simultáneas. Pendientes de más de 2 minutos permiten reintentar; no se garantiza ausencia de cargos duplicados ante respuesta perdida del proveedor.

La lectura no crea productos ni confirma recepciones. Cada línea debe asignarse manualmente al catálogo; las unidades requieren verificación, no conversión automática. Datos ausentes quedan vacíos. Mostrar evidencia transcrita y página; no son citas certificadas. Revisión obligatoria antes de guardar. Errores/truncamiento no generan albaranes. Múltiples lotes de un mismo producto siguen limitados por H1: no agruparlos si implica perder trazabilidad.

Pendiente: benchmark real, aprendizaje por diseño, OCR local previo, presupuesto monetario configurable, detección visual de calidad, edición completa y multipágina por fotos, archivo Drive y limpieza/retención. No afirmar precisión ni ahorro general a partir de una prueba sintética. El hash evita releer un archivo idéntico; no es aprendizaje del diseño.

## Ampliación 17/11/2026
- Contrato de salida `extract-v2`: se añaden `documentType` y `typeEvidence`. Los prompts viven en lib/extraction.ts (`extractionSystem`, `extractionTask`, `labelSystem`, `labelTask`).
- Un documento `other` o `unknown` puede venir sin líneas; factura, albarán y abono deben traer al menos una.
- Etiquetas: `POST /api/label` con `file` (JPG, PNG o WebP, 3 MB) y `mode` (`lot` o `serial`). Respuesta: code, lot, serial, expiry, evidence, doubts. Máximo 800 tokens de salida. Comparte el límite diario con la lectura de documentos.
