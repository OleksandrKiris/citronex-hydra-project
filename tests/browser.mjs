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
           // Visibility alone permits offscreen/clipped text. Wait for the actual
           // smooth scroll to put the whole short guide in the usable viewport.
           await page.waitForFunction(()=>{
             const el=document.querySelector('#introScript'), r=el.getBoundingClientRect();
             const v=window.visualViewport;
             let left=v?.offsetLeft||0, top=v?.offsetTop||0;
             let right=left+(v?.width||innerWidth), bottom=top+(v?.height||innerHeight);
             for(let p=el.parentElement;p;p=p.parentElement){
               const s=getComputedStyle(p), b=p.getBoundingClientRect();
               if(/auto|scroll|hidden|clip/.test(s.overflowY)){top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}
               if(/auto|scroll|hidden|clip/.test(s.overflowX)){left=Math.max(left,b.left);right=Math.min(right,b.right);}
             }
             return r.width>0&&r.height>0&&r.left>=left-1&&r.right<=right+1&&r.top>=top-1&&r.bottom<=bottom+1;
           },null,{timeout:5000});
           const guide=await page.locator('#introScript').evaluate(el=>{
             const r=el.getBoundingClientRect(), hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
             return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},viewport:{width:innerWidth,height:innerHeight},unobscured:el===hit||el.contains(hit)};
           });
           assert.equal(guide.unobscured,true);
           if(width===320&&!mode)await page.screenshot({path:join(output,`guide-${lang}-320.png`)});
           assert.equal(await page.locator('#introModal').getAttribute('aria-modal'),'true');
           const focusIds=await page.locator('#introModal button:not([hidden]):not(:disabled)').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length>0).map(n=>n.id||n.dataset.langChoice));
           assert.equal(focusIds[0],'introClose');
           assert.equal(focusIds.at(-1),'continueIntro');
           assert.ok(!focusIds.includes('playIntro'),'Hidden audio action must not receive focus');
           const focused=()=>page.evaluate(()=>{
             const el=document.activeElement;
             return {inside:document.querySelector('#introModal').contains(el),id:el.id||el.dataset.langChoice};
           });
           // Exercise every native browser Tab stop, including both boundaries.
           for(let i=1;i<=focusIds.length;i++){
             await page.keyboard.press('Tab');
             assert.deepEqual(await focused(),{inside:true,id:focusIds[i%focusIds.length]});
           }
           for(let i=1;i<=focusIds.length;i++){
             await page.keyboard.press('Shift+Tab');
             assert.deepEqual(await focused(),{inside:true,id:focusIds[(focusIds.length-i)%focusIds.length]});
           }
           report.results.push({scenario:'native-guide-read-and-keyboard-close',lang,viewport:{width,height:900},mode:mode||'normal',guide,tabStops:focusIds.length,forwardCycle:'passed',reverseCycle:'passed'});
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
      report.results.push({viewport:{width,height:900},mode:mode||'normal',status:'passed',steps:['unknown-language fallback','keyboard','12 languages/routes','native guide in viewport','Tab/Shift+Tab modal cycles','Escape and focus return','offline reload','Back']});
    } finally {await ctx.tracing.stop({path:join(output,`${width}-${mode||'normal'}-trace.zip`)});await ctx.close();}
  }
  // Real keyboard activation; cancel external navigation at document bubble only,
  // after the product's source-link handler. No external training is requested.
  for(const width of [1280,320])for(const mode of ['', 'history','state','both','corrupt']) {
    const ctx=await context({width,height:900},mode), page=await ctx.newPage();
    try {
      await page.goto(base+'?lang=ua');
      assert.equal(await page.locator('#lastLocation').isVisible(),false);
      await page.evaluate(()=>document.addEventListener('click',event=>{
        if(event.target.closest('a.training-link'))event.preventDefault();
      }));
      for(const id of ['siechniceTraining','ryczywolTraining','zgorzelecBogatyniaTraining']){
        await page.locator('#'+id).focus();await page.keyboard.press('Enter');
        await page.waitForFunction(()=>!document.querySelector('#lastLocation').hidden);
        assert.equal(await page.locator('#lastLocationLink').getAttribute('href'),await page.locator('#'+id).getAttribute('href'));
      }
      if(mode!=='both')assert.equal(await page.evaluate(()=>localStorage.getItem('hydraLastLocationV1')),'zgorzelecBogatyniaTraining');
      await page.locator('#langSelect').selectOption('ka');
      assert.equal(new URL(await page.locator('#lastLocationLink').getAttribute('href')).searchParams.get('lang'),'en');
      // Keyboard move from visible resume action to explicit clear control.
      await page.locator('#lastLocationLink').focus();await page.keyboard.press('Tab');
      assert.equal(await page.locator('#clearLastLocation').evaluate(el=>el===document.activeElement),true);
      await page.locator('.hydra-page-loader').waitFor({state:'hidden'});
      await page.locator('#lastLocation').scrollIntoViewIfNeeded();
      const resumeView=await page.locator('#lastLocationLink').evaluate(el=>{
        const r=el.getBoundingClientRect(), hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
        return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,unobscured:hit===el||el.contains(hit)};
      });
      assert.equal(resumeView.inside,true);assert.equal(resumeView.unobscured,true);
      const panelReadability=[];
      for(const language of ['pl','ru','ua','en','az','es','fil','id','ne','ka','tr','hy']){
        await page.locator('#langSelect').selectOption(language);
        const layout=await page.locator('#lastLocation').evaluate(panel=>{
          const p=panel.getBoundingClientRect();
          const measure=id=>{
            const el=document.querySelector(id), r=el.getBoundingClientRect(), style=getComputedStyle(el);
            const range=document.createRange();range.selectNodeContents(el);
            const lines=new Set([...range.getClientRects()].filter(r=>r.width>0).map(r=>Math.round(r.top))).size;
            return {width:r.width,height:r.height,lines,overflow:el.scrollWidth>el.clientWidth+1};
          };
          return {panelWidth:p.width,panelHeight:p.height,heading:measure('#lastLocationTitle'),clear:measure('#clearLastLocation')};
        });
        for(const [name,measure] of [['heading',layout.heading],['clear',layout.clear]]){
          assert.ok(measure.width>=200&&measure.width>=layout.panelWidth*.8,`${width}/${language} ${name} full text column: ${JSON.stringify(layout)}`);
          assert.equal(measure.overflow,false);
          assert.ok(measure.lines>=1&&measure.lines<=(name==='heading'?4:3),`${language} ${name} must wrap in readable lines`);
        }
        assert.ok(layout.panelHeight<360,`${language}: last-location panel must not become a tall icon-column layout`);
        panelReadability.push({language,...layout});
      }
      await page.locator('#langSelect').selectOption('ka');
      await page.locator('#lastLocation').scrollIntoViewIfNeeded();
      await page.screenshot({path:join(output,`last-location-${width}-${mode||'normal'}.png`)});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.reload();
      assert.equal(await page.locator('#lastLocation').isVisible(),mode!=='both');
      if(mode!=='both'){
        assert.equal(await page.locator('#lastLocationLink').getAttribute('href'),await page.locator('#zgorzelecBogatyniaTraining').getAttribute('href'));
        await page.goto(base+'?lang=pl');await page.goBack();
        assert.equal(await page.locator('#lastLocationLink').getAttribute('href'),await page.locator('#zgorzelecBogatyniaTraining').getAttribute('href'));
        await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
        await ctx.setOffline(true);await page.reload();
        assert.equal(await page.locator('#lastLocation').isVisible(),true);
        await page.locator('#lastLocationLink').focus();await page.keyboard.press('Tab');await page.keyboard.press('Space');
        assert.equal(await page.locator('#lastLocation').isVisible(),false);
        assert.equal(await page.locator('#langSelect').evaluate(el=>el===document.activeElement),true);
        assert.equal(await page.evaluate(()=>localStorage.getItem('hydraLastLocationV1')),null);
        await page.reload();assert.equal(await page.locator('#lastLocation').isVisible(),false);
      }
      report.results.push({scenario:'last-location-keyboard-language-reload-Back-clear',viewport:{width,height:900},mode:mode||'normal',status:'passed',resumeView,panelReadability,limits:mode==='both'?'in-memory only; denied storage loses location on reload':'external href inspected, training not opened'});
    } finally {await ctx.close();}
  }
  for(const value of ['unknown','{"id":"siechniceTraining"}','https://evil.example/']){
    const ctx=await context({width:320,height:900}), page=await ctx.newPage();
    try {
      await ctx.addInitScript(value=>localStorage.setItem('hydraLastLocationV1',value),value);
      await page.goto(base+'?lang=ru');assert.equal(await page.locator('#lastLocation').isVisible(),false);
      assert.equal(await page.locator('#lastLocationLink').getAttribute('href'),null);
      await check(page,'ru');
      report.results.push({scenario:'invalid-location-does-not-change-routes',value,status:'passed'});
    } finally {await ctx.close();}
  }
  // Upgrade the real old shell/worker, preserving previous non-secret preferences.
  previous=true;
  const ctx=await context({width:320,height:900});const page=await ctx.newPage();
  await ctx.tracing.start({screenshots:true,snapshots:true});
  const upgradeEvents=[];
  page.on('requestfailed',request=>upgradeEvents.push({url:request.url(),failure:request.failure()}));
  try {
    await page.goto(base+'?lang=ua');await check(page,'ua');
    await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
    await page.evaluate(()=>{localStorage.setItem('unrelated-test-key','preserve');localStorage.setItem('hydraIntroAudioSeenV3','1');});
    previous=false;
    await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});
    await page.waitForFunction(async()=> {const names=await caches.keys();return names.includes('citronex-hydra-srzb-20261017-last-location2')&&!names.includes('citronex-hydra-srzb-20261017-locales3');});
    // Cache deletion happens before clients.claim: wait for activation readiness,
    // not just a cache name, before testing a controlled upgrade/offline reload.
    await page.waitForFunction(async()=>{
      const registration=await navigator.serviceWorker.ready;
      return registration.active?.state==='activated'&&navigator.serviceWorker.controller?.state==='activated';
    });
    const upgradedShell=await page.evaluate(async()=>{
      const cache=await caches.open('citronex-hydra-srzb-20261017-last-location2');
      const shell=await cache.match('./index.html');return shell?await shell.text():null;
    });
    assert.equal(upgradedShell,await readFile(join(root,'index.html'),'utf8'));
    await page.reload();await check(page,'ua');
    await ctx.setOffline(true);await page.reload();await check(page,'ua');
    assert.equal(await page.evaluate(()=>localStorage.getItem('unrelated-test-key')),'preserve');
    assert.equal(await page.evaluate(()=>localStorage.getItem('hydraIntroAudioSeenV3')),'1');
    assert.equal(await page.evaluate(()=>localStorage.getItem('hydraLang')),'ua');
    await page.screenshot({path:join(output,'upgrade-offline.png')});
    report.results.push({scenario:'previous-worker-upgrade/offline/preferences',status:'passed'});
  } finally {report.upgradeEvents=upgradeEvents;await ctx.tracing.stop({path:join(output,'upgrade-trace.zip')});await ctx.close();}
  report.status='passed';
} catch(error) {report.status='failed';report.error=error.stack;process.exitCode=1;}
finally {await browser?.close();await new Promise(resolve=>server.close(resolve));await writeFile(join(output,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
