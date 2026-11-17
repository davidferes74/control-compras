'use client';
import {statusInfo,type Kind} from './lib';
export const go=(hash:string)=>{window.location.hash=hash;};
export function Badge({tone='neutral',children}:{tone?:string;children:React.ReactNode}){return <span className={'badge '+tone}>{children}</span>;}
export function StatusBadge({item}:{item:{kind:Kind;status:string;matchStatus:string|null}}){if(item.status==='draft')return <Badge tone="draft">Por revisar</Badge>;if(item.kind==='credit_note')return <Badge>Revisión manual</Badge>;const s=item.matchStatus?statusInfo[item.matchStatus]:null;return s?<Badge tone={s.tone}>{s.label}</Badge>:<Badge>Sin conciliar</Badge>;}
export function PageHead({eyebrow,title,children}:{eyebrow:string;title:string;children?:React.ReactNode}){return <header className="page-head"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>{children&&<div className="page-actions">{children}</div>}</header>;}
export function Empty({title,text}:{title:string;text:string}){return <div className="empty"><strong>{title}</strong><p>{text}</p></div>;}
