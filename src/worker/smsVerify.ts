const VERIFY_BASE="https://verify.twilio.com/v2";

function configured(env:Env){return Boolean(env.TWILIO_API_KEY&&env.TWILIO_API_SECRET&&env.TWILIO_VERIFY_SERVICE_SID&&env.SMS_RECIPIENT_E164)}
function authHeader(env:Env){return `Basic ${btoa(`${env.TWILIO_API_KEY}:${env.TWILIO_API_SECRET}`)}`}
function validRecipient(value:string|undefined){return Boolean(value&&/^\+[1-9]\d{7,14}$/.test(value))}

export function smsSecondFactorConfigured(env:Env){return configured(env)&&validRecipient(env.SMS_RECIPIENT_E164)}

export async function startSmsVerification(env:Env){if(!smsSecondFactorConfigured(env))throw new Error("SMS verification is not configured");const body=new URLSearchParams({To:env.SMS_RECIPIENT_E164!,Channel:"sms"});const response=await fetch(`${VERIFY_BASE}/Services/${encodeURIComponent(env.TWILIO_VERIFY_SERVICE_SID!)}/Verifications`,{method:"POST",headers:{Authorization:authHeader(env),"Content-Type":"application/x-www-form-urlencoded"},body});if(!response.ok)throw new Error("Could not send SMS verification code");const payload=await response.json<{sid?:string}>();if(!payload.sid||!/^VE[0-9a-fA-F]{32}$/.test(payload.sid))throw new Error("SMS verification provider returned an invalid challenge");return payload.sid}

export async function checkSmsVerification(env:Env,verificationSid:string,code:string){if(!smsSecondFactorConfigured(env))return false;if(!/^VE[0-9a-fA-F]{32}$/.test(verificationSid)||!/^\d{4,10}$/.test(code))return false;const body=new URLSearchParams({VerificationSid:verificationSid,Code:code});const response=await fetch(`${VERIFY_BASE}/Services/${encodeURIComponent(env.TWILIO_VERIFY_SERVICE_SID!)}/VerificationCheck`,{method:"POST",headers:{Authorization:authHeader(env),"Content-Type":"application/x-www-form-urlencoded"},body});if(!response.ok)return false;const payload=await response.json<{status?:string;valid?:boolean}>();return payload.status==="approved"&&payload.valid===true}
