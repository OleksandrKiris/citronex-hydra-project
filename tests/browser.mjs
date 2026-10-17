// Authorized CI only; no public deployment, external requests or submissions.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Use the authorized CI browser runner');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE);
const root = process.cwd(), output = resolve(process.env.BROWSER_REPORT);
await mkdir(output, { recursive: true });
const report = { head: process.env.TESTED_HEAD, base: process.env.TESTED_BASE,
  checkout: execFileSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).trim(), files:{}, results:[],
  limits:['320px is an emulated viewport, not a physical phone.',
    'External training sites and audio playback are not tested; all external requests are blocked.',
    'Offline starts only after the shell installs. History/storage faults are injected browser tests.'] };
for(const file of ['index.html','sw.js','manifest.webmanifest']) {
  const data = await readFile(join(root,file));
  const original = execFileSync('git',['show',`${report.head}:${file}`]);
  assert.ok(data.equals(original), file);
  report.files[file] = {bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};
}
let previous = false;
const old = Object.fromEntries(['index.html','sw.js'].map(file=>[file,
  execFileSync('git',['show',`${report.base}:${file}`])]));
const server = createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)) {res.writeHead(405).end();return;}
  const url=new URL(req.url,'http://localhost');
  const path=url.pathname.replace(/^\/citronex-hydra-project\//,'')||'index.html';
  if(!['index.html','sw.js','manifest.webmanifest'].includes(path)&&!/^assets\/brand\/[\w.-]+$/.test(path)) {res.writeHead(404).end();return;}
  try {const bytes=previous&&old[path]?old[path]:await readFile(join(root,path));
    res.writeHead(200,{'Content-Type':path.endsWith('.html')?'text/html':path.endsWith('.js')?'text/javascript':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'application/manifest+json','Cache-Control':'no-store'});res.end(bytes);
  } catch {res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(4173,'127.0.0.1',resolve));
const base='http://127.0.0.1:4173/citronex-hydra-project/';
let browser;
try {
  browser=await chromium.launch({headless:true});report.browser=browser.version();
  const context=async(viewport,mode='')=>{
    const ctx=await browser.newContext({viewport,locale:'pl-PL'});
    await ctx.route('**/*',route=>{
      const request=route.request();
      return ['GET','HEAD'].includes(request.method())&&new URL(request.url()).origin===new URL(base).origin?route.continue():route.abort();
    });
    await ctx.addInitScript(mode=>{
      if(mode==='history'||mode==='both')history.replaceState=()=>{throw new DOMException('Test denial','SecurityError');};
      if(mode==='state')Object.defineProperty(history,'state',{get(){throw new DOMException('Test denial','SecurityError');}});
      if(mode==='both')Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Test denial','SecurityError');}});
      if(mode==='corrupt')localStorage.setItem('hydraLang','{broken');
    },mode);
    return ctx;
  };
  const check=async(page,lang)=>{
    await page.waitForFunction(lang=>document.documentElement.lang===(lang==='ua'?'uk':lang),lang);
    assert.equal(await page.locator('#langSelect').inputValue(),lang);
    for(const link of await page.locator('.training-link').all())assert.equal(new URL(await link.getAttribute('href')).searchParams.get('lang'),['ka','tr','hy'].includes(lang)?'en':lang);
    assert.equal(new URL(await page.locator('.catalog-link').getAttribute('href')).searchParams.get('lang'),lang==='ua'?'uk':lang==='tr'?'en':lang);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  };
  for(const width of [1280,320])for(const mode of ['', 'history','state','both','corrupt']) {
    const ctx=await context({width,height:900},mode);const page=await ctx.newPage();const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await ctx.tracing.start({screenshots:true,snapshots:true});
    try {
      await page.goto(base+'?lang=xx&section=training#locations');await check(page,'en');
      assert.equal(await page.locator('#languageFallback').isVisible(),true);
      assert.match(await page.locator('#languageFallback').innerText(),/not available here/);
      const select=page.locator('#langSelect');await select.focus();
      await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
      await check(page,'ua');assert.equal(await select.evaluate(el=>el===document.activeElement),true);
      assert.equal(await page.locator('#languageFallback').isVisible(),false);
      for(const lang of ['pl','ru','en','az','es','fil','id','ne','ua','ka','tr','hy']){
         await select.selectOption(lang);await check(page,lang);
         if(['ka','tr','hy'].includes(lang)){
           assert.equal(await page.locator('#externalLanguageNotice').isVisible(),true);
           await page.locator('#reopenIntro').click();
           assert.equal(await page.locator('#introScript').isVisible(),true);
           assert.equal(await page.locator('#playIntro').isVisible(),false);
           assert.equal(await page.locator('#audioStatus').isVisible(),true);
           assert.equal(await page.locator('#introClose').evaluate(el=>el===document.activeElement),true);
           await page.keyboard.press('Escape');
           assert.equal(await page.locator('#introModal').isVisible(),false);
           assert.equal(await page.locator('#reopenIntro').evaluate(el=>el===document.activeElement),true);
           if(width===320&&!mode)await page.screenshot({path:join(output,`locale-${lang}-320.png`)});
         }
       }
       await select.selectOption('ua');await check(page,'ua');
      await page.screenshot({path:join(output,`${width}-${mode||'normal'}.png`)});
      await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
      await ctx.setOffline(true);await page.reload();await check(page,['history','state','both'].includes(mode)?'en':'ua');
      assert.equal(await page.evaluate(()=>navigator.onLine),false);
      await select.selectOption('ua');await check(page,'ua');
      await ctx.setOffline(false);
      // Same-origin route/Back without following any external service.
      await page.goto(base+'?lang=pl');await check(page,'pl');await page.goBack();
      await check(page,['history','state','both'].includes(mode)?'en':'ua');
      assert.equal(new URL(page.url()).searchParams.get('section'),'training');
      assert.equal(new URL(page.url()).hash,'#locations');
      if(['history','state','both'].includes(mode))assert.equal(await page.locator('#languageFallback').isVisible(),true);
      assert.deepEqual(errors,[]);
      report.results.push({viewport:{width,height:900},mode:mode||'normal',status:'passed',steps:['unknown-language fallback','keyboard','12 languages/routes','native text-only guide','offline reload','Back']});
    } finally {await ctx.tracing.stop({path:join(output,`${width}-${mode||'normal'}-trace.zip`)});await ctx.close();}
  }
  // Upgrade the real old shell/worker, preserving previous non-secret preferences.
  previous=true;
  const ctx=await context({width:320,height:900});const page=await ctx.newPage();
  try {
    await page.goto(base+'?lang=ua');await check(page,'ua');
    await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
    await page.evaluate(()=>{localStorage.setItem('unrelated-test-key','preserve');localStorage.setItem('hydraIntroAudioSeenV3','1');});
    previous=false;
    await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});
    await page.waitForFunction(async()=> {const names=await caches.keys();return names.includes('citronex-hydra-srzb-20261017-locales3')&&!names.includes('citronex-hydra-srzb-20261017-history2');});
    await page.reload();await check(page,'ua');
    await ctx.setOffline(true);await page.reload();await check(page,'ua');
    assert.equal(await page.evaluate(()=>localStorage.getItem('unrelated-test-key')),'preserve');
    assert.equal(await page.evaluate(()=>localStorage.getItem('hydraIntroAudioSeenV3')),'1');
    assert.equal(await page.evaluate(()=>localStorage.getItem('hydraLang')),'ua');
    await page.screenshot({path:join(output,'upgrade-offline.png')});
    report.results.push({scenario:'previous-worker-upgrade/offline/preferences',status:'passed'});
  } finally {await ctx.close();}
  report.status='passed';
} catch(error) {report.status='failed';report.error=error.stack;process.exitCode=1;}
finally {await browser?.close();await new Promise(resolve=>server.close(resolve));await writeFile(join(output,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
