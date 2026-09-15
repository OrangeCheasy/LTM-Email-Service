import type { MessageListItem } from "./mailTypes";

type CachedMailbox={savedAt:number;messages:MessageListItem[];unreadCount:number;draftCount:number};
const PREFIX="ltm-mail-cache:v1:";
const MAX_AGE_MS=24*60*60*1000;
function key(accountId:string,folder:string,query:string){return `${PREFIX}${encodeURIComponent(accountId)}:${encodeURIComponent(folder)}:${encodeURIComponent(query.trim().toLowerCase())}`}
export function readMailCache(accountId:string,folder:string,query:string):CachedMailbox|null{try{const raw=localStorage.getItem(key(accountId,folder,query));if(!raw)return null;const value=JSON.parse(raw) as CachedMailbox;if(!value||!Array.isArray(value.messages)||Date.now()-value.savedAt>MAX_AGE_MS){localStorage.removeItem(key(accountId,folder,query));return null}return value}catch{return null}}
export function writeMailCache(accountId:string,folder:string,query:string,value:Omit<CachedMailbox,"savedAt">){try{localStorage.setItem(key(accountId,folder,query),JSON.stringify({...value,savedAt:Date.now()}))}catch{}}
export function clearAccountMailCache(accountId:string){try{const prefix=`${PREFIX}${encodeURIComponent(accountId)}:`;for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k?.startsWith(prefix))localStorage.removeItem(k)}}catch{}}
export function clearAllMailCache(){try{for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k?.startsWith(PREFIX))localStorage.removeItem(k)}}catch{}}
