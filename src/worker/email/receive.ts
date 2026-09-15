import PostalMime from "postal-mime";
import type { Address, Mailbox } from "postal-mime";
import { sendNewMailPush } from "../push";

const MAX_RAW_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENTS = 30;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_STORED_TEXT = 2 * 1024 * 1024;
const MAX_HEADER_BYTES = 256 * 1024;
const MAX_MIME_DEPTH = 30;

function htmlToText(html:string):string{return html.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi," ").replace(/<\s*br\s*\/?>/gi,"\n").replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi,"\n").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/[ \t]+/g," ").replace(/\n\s*\n\s*\n+/g,"\n\n").trim();}
const safePreview=(text:string|undefined)=>(text??"").replace(/\s+/g," ").trim().slice(0,240);
function path(id:string,now:Date,suffix:string){return `emails/${now.getUTCFullYear()}/${String(now.getUTCMonth()+1).padStart(2,"0")}/${String(now.getUTCDate()).padStart(2,"0")}/${id}/${suffix}`;}
function mailbox(a:Address|undefined):Mailbox|null{return !a||("group" in a&&a.group)?null:a as Mailbox;}
function addressList(a:Address[]|undefined):string[]{if(!a)return[];const v:string[]=[];for(const x of a){if("group" in x&&x.group){for(const m of x.group)if(m.address)v.push(m.address);}else{const m=x as Mailbox;if(m.address)v.push(m.address);}}return[...new Set(v)].slice(0,100);}
function referenceCandidates(a:string|null,b:string|null):string[]{return[...new Set([a,...(b?.match(/<[^>]+>/g)??b?.split(/\s+/)??[])].filter((x):x is string=>Boolean(x)))].reverse().slice(0,30);}
async function resolveThreadId(env:Env,a:string|null,b:string|null):Promise<string>{for(const c of referenceCandidates(a,b)){const m=await env.DB.prepare("SELECT thread_id FROM messages WHERE message_id = ?1 LIMIT 1").bind(c).first<{thread_id:string}>();if(m)return m.thread_id;}return crypto.randomUUID();}
function size(c:ArrayBuffer|Uint8Array|string):number{return typeof c==="string"?new TextEncoder().encode(c).byteLength:c.byteLength;}
function truncateUtf8(value:string,max:number):string{if(new TextEncoder().encode(value).byteLength<=max)return value;return value.slice(0,Math.floor(max/2));}

export async function receiveEmail(message:ForwardableEmailMessage,env:Env,ctx:ExecutionContext):Promise<void>{
  const raw=await new Response(message.raw).arrayBuffer();
  if(raw.byteLength>MAX_RAW_BYTES)throw new Error("Inbound message exceeds storage limit");
  const parsed=await PostalMime.parse(raw,{maxNestingDepth:MAX_MIME_DEPTH,maxHeadersSize:MAX_HEADER_BYTES});
  if(parsed.attachments.length>MAX_ATTACHMENTS)throw new Error("Inbound message has too many attachments");
  const headerMessageId=parsed.messageId?.trim()||message.headers.get("message-id")?.trim()||null;
  if(headerMessageId&&await env.DB.prepare("SELECT 1 FROM messages WHERE message_id = ?1 LIMIT 1").bind(headerMessageId).first())return;
  const id=crypto.randomUUID(),now=new Date(),nowIso=now.toISOString(),inReplyTo=parsed.inReplyTo?.trim()||message.headers.get("in-reply-to")?.trim()||null,references=parsed.references?.trim()||message.headers.get("references")?.trim()||null,threadId=await resolveThreadId(env,inReplyTo,references),key=path(id,now,"message.eml"),sender=mailbox(parsed.from),to=addressList(parsed.to),cc=addressList(parsed.cc);
  const bodyText=truncateUtf8(parsed.text?.trim()||(parsed.html?htmlToText(parsed.html):""),MAX_STORED_TEXT);
  const attachments=parsed.attachments.map(a=>({source:a,id:crypto.randomUUID(),size:size(a.content)}));
  if(attachments.some(a=>a.size>MAX_ATTACHMENT_BYTES))throw new Error("Inbound attachment exceeds storage limit");
  await env.MAIL.put(key,raw,{httpMetadata:{contentType:"message/rfc822"},customMetadata:{messageId:headerMessageId??id}});
  const rows:Array<{id:string;key:string;filename:string;mimeType:string;size:number}>=[];
  for(const a of attachments){const k=path(id,now,`attachments/${a.id}`),mime=a.source.mimeType||"application/octet-stream";await env.MAIL.put(k,a.source.content,{httpMetadata:{contentType:mime}});rows.push({id:a.id,key:k,filename:(a.source.filename||"attachment").slice(0,255),mimeType:mime.slice(0,127),size:a.size});}
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO threads (id, subject, latest_message_at, message_count, is_read) VALUES (?1, ?2, ?3, 0, 0)").bind(threadId,(parsed.subject||"(no subject)").slice(0,998),nowIso),
    env.DB.prepare(`INSERT INTO messages (id,message_id,thread_id,direction,from_address,from_name,to_addresses,cc_addresses,subject,preview,body_text,body_html,received_at,has_attachments,raw_r2_key,in_reply_to,reference_ids,delivery_status) VALUES (?1,?2,?3,'inbound',?4,?5,?6,?7,?8,?9,?10,NULL,?11,?12,?13,?14,?15,'received')`).bind(id,headerMessageId,threadId,(sender?.address||message.from).slice(0,320),sender?.name?.slice(0,320)||null,JSON.stringify(to.length?to:[message.to]),JSON.stringify(cc),(parsed.subject||"(no subject)").slice(0,998),safePreview(bodyText),bodyText,parsed.date||nowIso,rows.length?1:0,key,inReplyTo?.slice(0,998)||null,references?.slice(0,8192)||null),
    ...rows.map(a=>env.DB.prepare("INSERT INTO attachments (id,message_id,filename,content_type,size,r2_key) VALUES (?1,?2,?3,?4,?5,?6)").bind(a.id,id,a.filename,a.mimeType,a.size,a.key)),
    env.DB.prepare("UPDATE threads SET latest_message_at=?2,message_count=message_count+1,is_read=0,subject=CASE WHEN subject='' THEN ?3 ELSE subject END WHERE id=?1").bind(threadId,nowIso,(parsed.subject||"(no subject)").slice(0,998)),
  ]);
  ctx.waitUntil(sendNewMailPush(env,{id}));
  const forwardTo=env.FORWARD_TO.trim();if(forwardTo)ctx.waitUntil(message.forward(forwardTo));
}
