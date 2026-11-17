import type {Metadata,Viewport} from 'next';
import './sentidino-fonts.css';
import './sentidino-foundation.css';
import './globals.css';
export const metadata:Metadata={title:'Control de compras · Sentidiño',description:'Conciliación de facturas de proveedor con albaranes',robots:{index:false,follow:false}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#dbe2ec'};
// Fondo antes del primer pintado: gris azulado por defecto; claro u oscuro si el usuario lo eligió.
const themeInit=`(function(){var t="slate";try{var s=localStorage.getItem("cc-theme");if(s==="light"||s==="slate"||s==="dark")t=s;}catch(e){}document.documentElement.setAttribute("data-theme",t);})();`;
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeInit}}/></head><body>{children}</body></html>;}
