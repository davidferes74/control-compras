import type {Metadata,Viewport} from 'next';
import './sentidino-fonts.css';
import './sentidino-foundation.css';
import './globals.css';
export const metadata:Metadata={title:'Control de compras · Sentidiño',description:'Conciliación de facturas de proveedor con albaranes',robots:{index:false,follow:false}};
// interactiveWidget: el teclado del móvil encoge la vista (Android), así las barras fijas no quedan tapadas.
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',interactiveWidget:'resizes-content',themeColor:'#dbe2ec'};
// Fondo antes del primer pintado: gris azulado por defecto; claro u oscuro si el usuario lo eligió.
// La barra de estado del móvil (theme-color) sigue al fondo elegido, no al del sistema.
const themeInit=`(function(){var t="slate";try{var s=localStorage.getItem("cc-theme");if(s==="light"||s==="slate"||s==="dark")t=s;}catch(e){}document.documentElement.setAttribute("data-theme",t);
var c={light:"#f4f6f9",slate:"#dbe2ec",dark:"#101317"};window.__ccThemeColor=function(x){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",c[x]||c.slate);};
document.addEventListener("DOMContentLoaded",function(){window.__ccThemeColor(document.documentElement.getAttribute("data-theme"));});})();`;
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeInit}}/></head><body>{children}</body></html>;}
