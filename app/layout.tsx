import type {Metadata,Viewport} from 'next';
import './sentidino-fonts.css';
import './sentidino-foundation.css';
import './globals.css';
export const metadata:Metadata={title:'Control de compras · Sentidiño',description:'Conciliación de facturas de proveedor con albaranes',robots:{index:false,follow:false}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#f4f6f9'};
// Tema antes del primer pintado: claro por defecto, oscuro si el usuario lo eligió.
const themeInit=`(function(){try{document.documentElement.setAttribute("data-theme",localStorage.getItem("cc-theme")==="dark"?"dark":"light");}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeInit}}/></head><body>{children}</body></html>;}
