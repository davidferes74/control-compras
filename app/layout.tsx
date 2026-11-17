import type {Metadata,Viewport} from 'next';
import './sentidino-fonts.css';
import './sentidino-foundation.css';
import './globals.css';
export const metadata:Metadata={title:'Recepciones-IA · Control de entradas',description:'Recepción de mercancía y conciliación documental',robots:{index:false,follow:false}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#f4f6f9'};
// Tema inicial antes del primer pintado (sin parpadeo). Claro por defecto; oscuro solo si el usuario lo eligió en esta app.
const themeInit=`(function(){try{var t=localStorage.getItem("ria-theme")==="dark"?"dark":"light";document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","light");}try{if(sessionStorage.getItem("ria-intro-vista"))document.documentElement.classList.add("intro-skip");}catch(e){}})();`;
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeInit}}/></head><body>{children}</body></html>;}
