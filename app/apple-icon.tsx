import {ImageResponse} from 'next/og';
// Icono para la pantalla de inicio del iPhone/iPad (iOS redondea las esquinas por su cuenta: aquí va a sangre).
export const size={width:180,height:180};
export const contentType='image/png';
export default function AppleIcon(){
 return new ImageResponse(
  <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'#1f5fa8'}}>
   <svg width="120" height="120" viewBox="0 0 32 32" fill="none" stroke="#ffffff" strokeLinecap="round" strokeWidth="3">
    <path d="M5 12.5h22M5 19.5h22"/>
    <path d="M12.5 5v22M19.5 5v22" opacity=".5"/>
   </svg>
  </div>,
  {...size}
 );
}
