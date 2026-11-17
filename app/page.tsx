import {cookies} from 'next/headers';
import App from '@/components/app';
import {missingConfig,validSession,username} from '@/lib/auth';
export const dynamic='force-dynamic';
export default async function Page(){
 const missing=missingConfig();
 if(missing.length)return <main className="setup"><div className="setup-card"><p className="eyebrow">CONTROL DE COMPRAS</p><h1>Falta configurar la aplicación</h1><p>Añade estas variables en Vercel (Settings → Environment Variables, en Production y Preview) y vuelve a desplegar:</p><ul>{missing.map(m=><li key={m}><code>{m.split(' ')[0]}</code> {m.slice(m.indexOf(' ')+1)}</li>)}</ul></div></main>;
 const session=(await cookies()).get('ria_session')?.value;
 return <App initialAuthed={validSession(session)} user={username()}/>;
}
