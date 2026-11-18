'use client';
import {ExternalLink,ShieldAlert} from 'lucide-react';
import {Modal} from './ui';
export type DriveIssue='api'|'denied';
// Instrucciones paso a paso cuando Google rechaza la conexión (Drive o Gmail) por un ajuste pendiente en Google Cloud
// (portado de Recepciones-IA). Se abre sola al volver de Google con ese error y también desde el aviso rojo.
const LIBRARIES={drive:'https://console.cloud.google.com/apis/library/drive.googleapis.com',gmail:'https://console.cloud.google.com/apis/library/gmail.googleapis.com'};
const CONSENT='https://console.cloud.google.com/apis/credentials/consent';
export default function DriveHelp({issue,onClose,service='drive'}:{issue:DriveIssue;onClose:()=>void;service?:'drive'|'gmail'}){
 const api=issue==='api',gmail=service==='gmail',library=LIBRARIES[service],apiName=gmail?'Gmail API':'Google Drive API',back=gmail?'Ajustes → Gmail → Conectar Gmail':'Ajustes → Google Drive → Conectar';
 return <Modal title={api?'Falta activar '+apiName:'Google no permite usar '+(gmail?'Gmail':'Drive')+' con esta cuenta'} onClose={onClose}><div className="form-stack">
  <div className="wizard-card warn"><ShieldAlert size={20}/><div><strong>{api?'Es un ajuste único en Google Cloud':'Falta dar acceso a esta cuenta en Google Cloud'}</strong><p className="muted">{api?'La app está bien configurada; solo hay que habilitar una opción en el proyecto de Google. Lo hace una vez quien administra la app.':'El proyecto de Google está en modo de pruebas y solo deja entrar a las cuentas que se añaden a mano.'}</p></div></div>
  {api?<ol className="help-steps">
   <li>Abre esta dirección con la cuenta de Google que administra el proyecto:<a className="btn small" href={library} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Abrir {apiName} en Google Cloud</a><code className="help-url">{library}</code></li>
   <li>Arriba, en el selector de proyectos, comprueba que está elegido <strong>el proyecto de la app</strong> (el que contiene el GOOGLE_CLIENT_ID). Si tienes varios proyectos, este es el paso donde es fácil equivocarse.</li>
   <li>Pulsa el botón azul <strong>Habilitar</strong>.{!gmail&&<> Haz lo mismo con <strong>Google Sheets API</strong> (para la hoja de registro).</>}</li>
   <li>Espera uno o dos minutos; Google tarda un poco en aplicarlo.</li>
   <li>Vuelve a la app y repite <strong>{back}</strong>.</li>
  </ol>:<ol className="help-steps">
   <li>Abre esta dirección con la cuenta de Google que administra el proyecto:<a className="btn small" href={CONSENT} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Abrir la pantalla de consentimiento</a><code className="help-url">{CONSENT}</code></li>
   <li>Comprueba arriba que está elegido <strong>el proyecto de la app</strong>.</li>
   <li>En <strong>Público → Usuarios de prueba</strong>, pulsa <strong>Añadir usuarios</strong> y escribe la cuenta de Google que quieres conectar.</li>
   <li>Guarda, vuelve a la app y repite <strong>{back}</strong>.</li>
  </ol>}
  <button type="button" className="btn primary" onClick={onClose}>Entendido</button>
 </div></Modal>;
}
