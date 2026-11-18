'use client';
import {ExternalLink,ShieldAlert} from 'lucide-react';
import {Modal} from './ui';
export type DriveIssue='api'|'denied';
// Instrucciones paso a paso cuando Google rechaza la conexión con Drive por un ajuste pendiente en Google Cloud
// (portado de Recepciones-IA). Se abre sola al volver de Google con ese error y también desde el aviso rojo.
const LIBRARY='https://console.cloud.google.com/apis/library/drive.googleapis.com';
const CONSENT='https://console.cloud.google.com/apis/credentials/consent';
export default function DriveHelp({issue,onClose}:{issue:DriveIssue;onClose:()=>void}){
 const api=issue==='api';
 return <Modal title={api?'Falta activar Google Drive API':'Google no permite usar Drive con esta cuenta'} onClose={onClose}><div className="form-stack">
  <div className="wizard-card warn"><ShieldAlert size={20}/><div><strong>{api?'Es un ajuste único en Google Cloud':'Falta dar acceso a esta cuenta en Google Cloud'}</strong><p className="muted">{api?'La app está bien configurada; solo hay que habilitar una opción en el proyecto de Google. Lo hace una vez quien administra la app.':'El proyecto de Google está en modo de pruebas y solo deja entrar a las cuentas que se añaden a mano.'}</p></div></div>
  {api?<ol className="help-steps">
   <li>Abre esta dirección con la cuenta de Google que administra el proyecto:<a className="btn small" href={LIBRARY} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Abrir Google Drive API en Google Cloud</a><code className="help-url">{LIBRARY}</code></li>
   <li>Arriba, en el selector de proyectos, comprueba que está elegido <strong>el mismo proyecto que usas para Gmail</strong> (el que contiene el GOOGLE_CLIENT_ID de la app). Si tienes varios proyectos, este es el paso donde es fácil equivocarse.</li>
   <li>Pulsa el botón azul <strong>Habilitar</strong>. Haz lo mismo con <strong>Google Sheets API</strong> (para la hoja de registro).</li>
   <li>Espera uno o dos minutos; Google tarda un poco en aplicarlo.</li>
   <li>Vuelve a la app y repite <strong>Ajustes → Google Drive → Conectar</strong>.</li>
  </ol>:<ol className="help-steps">
   <li>Abre esta dirección con la cuenta de Google que administra el proyecto:<a className="btn small" href={CONSENT} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Abrir la pantalla de consentimiento</a><code className="help-url">{CONSENT}</code></li>
   <li>Comprueba arriba que está elegido <strong>el mismo proyecto que usas para Gmail</strong>.</li>
   <li>En <strong>Público → Usuarios de prueba</strong>, pulsa <strong>Añadir usuarios</strong> y escribe la cuenta de Google que quieres conectar.</li>
   <li>Guarda, vuelve a la app y repite <strong>Ajustes → Google Drive → Conectar</strong>.</li>
  </ol>}
  <button type="button" className="btn primary" onClick={onClose}>Entendido</button>
 </div></Modal>;
}
