// Read-only deployed smoke checks. Supply credentials only through the environment.
const base=process.env.SMOKE_BASE_URL||'https://control-compras-sentidino.vercel.app';
if(!base.startsWith('https://'))throw new Error('Use HTTPS.');
const username=process.env.SMOKE_USERNAME,password=process.env.SMOKE_PASSWORD;
if(!username||!password)throw new Error('Set SMOKE_USERNAME and SMOKE_PASSWORD.');
let cookie='';let failures=0;
async function check(name,path,expected,options={}){const response=await fetch(base+path,{...options,redirect:'error',headers:{...(cookie?{Cookie:cookie}:{}),...options.headers},signal:AbortSignal.timeout(30000)});if(path==='/api/session'&&response.ok&&options.method==='POST')cookie=response.headers.get('set-cookie')?.split(';')[0]||'';const pass=response.status===expected;console.log(`${pass?'PASS':'FAIL'} ${name}: ${response.status}`);if(!pass)failures++;await response.arrayBuffer();return pass;}
for(const path of ['/api/workspace','/api/extract'])await check('anonymous '+path,path,401);
try{const login=await check('login','/api/session',200,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username,password})});if(!login)throw new Error('Login failed; skipped private checks.');await check('private workspace','/api/workspace',200);for(const path of ['/api/workspace','/api/extract'])await check('foreign origin '+path,path,403,{method:'POST',headers:{Origin:'https://example.invalid','Content-Type':'application/json'},body:'{}'});
}finally{if(cookie){await check('logout','/api/session',200,{method:'DELETE',headers:{Origin:base}});cookie='';await check('after logout','/api/workspace',401);}}
if(failures)process.exitCode=1;
