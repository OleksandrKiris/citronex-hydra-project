// Authorized CI only; no public deployment, external requests or submissions.
import assert from 'node:assert/strict';
import {upgradeSource} from './upgrade-source.mjs';
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
const runtimePaths=["index.html", "sw.js", "manifest.webmanifest", "assets/brand/primserv-logo.svg", "assets/brand/primserv-icon-192.png", "assets/brand/primserv-icon-512.png"];
const current=Object.fromEntries(runtimePaths.map(p=>[p,execFileSync('git',['show',`${report.head}:${p}`])]));
const previousFiles=Object.fromEntries(runtimePaths.map(p=>[p,execFileSync('git',['show',`${report.base}:${p}`])]));
const upgrade=upgradeSource(report.base,current,previousFiles,(ref,p)=>execFileSync('git',['show',`${ref}:${p}`]));
const old=upgrade.files;report.upgradeLineage={ref:upgrade.ref,eventBase:report.base,eventBaseRuntimeEqual:upgrade.eventBaseRuntimeEqual,kind:upgrade.kind};
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
  const checkSelectedGuide=async(page,language,location)=>{
    const link=page.locator('#selectedGuideLink');const url=new URL(await link.getAttribute('href'));
    assert.equal(url.origin,'https://oleksandrkiris.github.io');assert.equal(url.pathname,'/citronex-dragon-guide/');
    assert.equal(url.searchParams.get('lang'),language);assert.equal(url.searchParams.get('location'),location);
    assert.equal(url.searchParams.get('welcome'),'1');assert.equal(url.hash,'');
    assert.deepEqual([...url.searchParams.keys()].sort(),['lang','location','welcome']);
    assert.equal(await page.locator('#selectedGuide').isVisible(),true);
    assert.ok((await page.locator('#selectedGuideSteps').innerText()).length>20);
    assert.equal(await page.locator('#selectedGuideFallback').isVisible(),['ka','tr','hy'].includes(language));
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
        await checkSelectedGuide(page,'ua',({siechniceTraining:'siechnice',ryczywolTraining:'ryczywol',zgorzelecBogatyniaTraining:'zgorzelec_bogatynia'})[id]);
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
        await checkSelectedGuide(page,language,'zgorzelec_bogatynia');
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
      await page.locator('#selectedGuideLink').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#copyRoute').evaluate(el=>el===document.activeElement),true);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('.training-link').first().evaluate(el=>el===document.activeElement),true);
      await page.locator('#selectedGuide').scrollIntoViewIfNeeded();
      const guideLayout=await page.locator('#selectedGuide').evaluate(el=>{
        const p=el.getBoundingClientRect();
        return {panelWidth:p.width,items:[...el.children].filter(n=>!n.hidden).map(n=>{const r=n.getBoundingClientRect();return {id:n.id,width:r.width,inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,overflow:n.scrollWidth>n.clientWidth+1};})};
      });
      for(const item of guideLayout.items){assert.ok(item.width>=200&&item.width>=guideLayout.panelWidth*.8);assert.equal(item.inside,true);assert.equal(item.overflow,false);}
      if(!mode)await page.screenshot({path:join(output,`selected-guide-${width}.png`)});

      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.reload();
      assert.equal(await page.locator('#lastLocation').isVisible(),mode!=='both');
      assert.equal(await page.locator('#selectedGuide').isVisible(),mode!=='both');
      if(mode!=='both'){
        await checkSelectedGuide(page,await page.locator('#langSelect').inputValue(),'zgorzelec_bogatynia');
        assert.equal(await page.locator('#lastLocationLink').getAttribute('href'),await page.locator('#zgorzelecBogatyniaTraining').getAttribute('href'));
        await page.goto(base+'?lang=pl');await page.goBack();
        await checkSelectedGuide(page,await page.locator('#langSelect').inputValue(),'zgorzelec_bogatynia');
        assert.equal(await page.locator('#lastLocationLink').getAttribute('href'),await page.locator('#zgorzelecBogatyniaTraining').getAttribute('href'));
        await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
        await ctx.setOffline(true);await page.reload();
        assert.equal(await page.locator('#lastLocation').isVisible(),true);
        await checkSelectedGuide(page,await page.locator('#langSelect').inputValue(),'zgorzelec_bogatynia');
        await page.locator('#lastLocationLink').focus();await page.keyboard.press('Tab');await page.keyboard.press('Space');
        assert.equal(await page.locator('#lastLocation').isVisible(),false);
        assert.equal(await page.locator('#langSelect').evaluate(el=>el===document.activeElement),true);
        assert.equal(await page.evaluate(()=>localStorage.getItem('hydraLastLocationV1')),null);
        await page.reload();assert.equal(await page.locator('#lastLocation').isVisible(),false);
      }
      report.results.push({scenario:'last-location-keyboard-language-reload-Back-clear',viewport:{width,height:900},mode:mode||'normal',status:'passed',resumeView,panelReadability,guideLayout,selectedGuide:'all 3 sites / 12 requested languages / keyboard / reload / Back / offline',limits:mode==='both'?'in-memory only; denied storage loses location on reload':'external href inspected, training not opened'});
    } finally {await ctx.close();}
  }
  for(const value of ['unknown','{"id":"siechniceTraining"}','https://evil.example/']){
    const ctx=await context({width:320,height:900}), page=await ctx.newPage();
    try {
      await ctx.addInitScript(value=>localStorage.setItem('hydraLastLocationV1',value),value);
      await page.goto(base+'?lang=ru');assert.equal(await page.locator('#lastLocation').isVisible(),false);
      assert.equal(await page.locator('#lastLocationLink').getAttribute('href'),null);
      assert.equal(await page.locator('#selectedGuide').isVisible(),false);
      assert.equal(await page.locator('#selectedGuideLink').getAttribute('href'),null);
      assert.equal(await page.locator('#locationUrl').inputValue(),'');
      assert.equal(await page.locator('#locationShare').isVisible(),false);
      await check(page,'ru');
      report.results.push({scenario:'invalid-location-does-not-change-routes',value,status:'passed'});
    } finally {await ctx.close();}
  }
  // Inject only the Clipboard API boundary: no actual operating-system clipboard
  // read/write or external destination navigation is performed by these tests.
  for(const width of [1280,320])for(const clipboardMode of ['accepted','rejected','unavailable'])for(const mode of ['', 'both']){
    const ctx=await context({width,height:900},mode), page=await ctx.newPage();
    try {
      await ctx.addInitScript(clipboardMode=>{
        window.__clipboardWrites=[];
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:clipboardMode==='unavailable'?undefined:{writeText:async value=>{
          window.__clipboardWrites.push(value);
          if(clipboardMode==='rejected')throw new DOMException('Injected permission denial','NotAllowedError');
        }}});
      },clipboardMode);
      await page.goto(base+'?lang=ua&person=must-not-copy#progress');
      await page.evaluate(()=>document.addEventListener('click',event=>{
        if(event.target.closest('a.training-link'))event.preventDefault();
      }));
      await page.locator('#ryczywolTraining').focus();await page.keyboard.press('Enter');
      await page.locator('.hydra-page-loader').waitFor({state:'hidden'});
      await page.locator('#langSelect').selectOption('ka');
      await page.locator('#copyLocation').focus();await page.keyboard.press('Enter');
      await page.waitForFunction(()=>Boolean(document.querySelector('#locationCopyStatus').textContent));
      const expected=await page.locator('#ryczywolTraining').getAttribute('href');
      assert.equal(await page.locator('#locationUrl').inputValue(),expected);
      assert.equal(new URL(expected).search,'?lang=en');assert.equal(new URL(expected).hash,'');
      assert.equal(await page.locator('#locationUrl').getAttribute('readonly'),'');
      assert.equal(await page.locator('#locationUrlLabel').getAttribute('for'),'locationUrl');
      assert.equal(await page.locator('#locationCopyStatus').getAttribute('role'),'status');
      assert.deepEqual(await page.evaluate(()=>window.__clipboardWrites),clipboardMode==='unavailable'?[]:[expected]);
      if(clipboardMode==='accepted')assert.equal(await page.locator('#copyLocation').evaluate(el=>el===document.activeElement),true);
      else {
        assert.equal(await page.locator('#locationUrl').evaluate(el=>el===document.activeElement&&el.selectionStart===0&&el.selectionEnd===el.value.length),true);
        assert.ok((await page.locator('#locationCopyStatus').innerText()).length>20);
      }
      await page.locator('#locationShare').scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>{
        const r=document.querySelector('#locationShare').getBoundingClientRect();
        return r.top>=0&&r.bottom<=innerHeight;
      });
      const copyLayout=await page.locator('#locationShare').evaluate(el=>{
        const field=el.querySelector('input'), r=field.getBoundingClientRect(), hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
        return {width:r.width,inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,unobscured:hit===field};
      });
      assert.ok(copyLayout.width>=200);assert.equal(copyLayout.inside,true);assert.equal(copyLayout.unobscured,true);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      if(!mode)await page.screenshot({path:join(output,`copy-${clipboardMode}-${width}.png`)});
      await page.locator('#langSelect').selectOption('ua');
      assert.equal(new URL(await page.locator('#locationUrl').inputValue()).search,'?lang=ua');
      assert.equal(await page.locator('#locationCopyStatus').innerText(),'');
      await page.reload();assert.equal(await page.locator('#locationShare').isVisible(),false);
      assert.equal(await page.locator('#lastLocation').isVisible(),mode!=='both');
      await page.goto(base+'?lang=pl');await page.goBack();
      if(!mode){
        await page.locator('#copyLocation').focus();await page.keyboard.press('Enter');
        await page.waitForFunction(()=>Boolean(document.querySelector('#locationCopyStatus').textContent));
        assert.equal(await page.locator('#locationUrl').inputValue(),await page.locator('#ryczywolTraining').getAttribute('href'));
        await page.locator('#clearLastLocation').click();assert.equal(await page.locator('#locationUrl').inputValue(),'');
        assert.equal(await page.locator('#locationShare').isVisible(),false);
      }
      report.results.push({scenario:'copy-public-location',width,clipboardMode,storage:mode||'normal',copyLayout,status:'passed',limit:'Clipboard boundary injected; OS clipboard not exercised'});
    }finally{await ctx.close();}
  }
  // New route text runs on actual shell in the existing authorized CI browser.
  for(const width of [1280,320])for(const clipboardMode of ['accepted','rejected','unavailable','syncThrow'])for(const mode of ['', 'both']){
    const ctx=await context({width,height:900},mode),page=await ctx.newPage();
    try{
      await ctx.addInitScript(mode=>{window.__routeWrites=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:mode==='unavailable'?undefined:{writeText(value){window.__routeWrites.push(value);if(mode==='syncThrow')throw Error('sync fixture');return mode==='rejected'?Promise.reject(Error('denied fixture')):Promise.resolve();}}});},clipboardMode);
      await page.goto(base+'?lang=ka&person=must-not-copy#progress');
      await page.evaluate(()=>document.addEventListener('click',e=>{if(e.target.closest('a.training-link'))e.preventDefault();}));
      await page.locator('#ryczywolTraining').focus();await page.keyboard.press('Enter');await page.locator('.hydra-page-loader').waitFor({state:'hidden'});
      await page.locator('#copyRoute').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>Boolean(document.querySelector('#routeCopyStatus').textContent));
      const payload=await page.locator('#routeText').inputValue(),urls=payload.match(/https:\/\/\S+/g);
      assert.equal(payload.split('\n')[0],'Ryczywół');assert.equal(payload.split('\n').length,5);
      assert.equal(urls[0],await page.locator('#selectedGuideLink').getAttribute('href'));assert.equal(urls[1],await page.locator('#ryczywolTraining').getAttribute('href'));
      assert.equal(new URL(urls[0]).searchParams.get('lang'),'ka');assert.equal(new URL(urls[1]).search,'?lang=en');assert.ok(!payload.includes('must-not-copy')&&!payload.includes('#progress'));
      assert.equal(await page.locator('#routeText').getAttribute('readonly'),'');
      assert.deepEqual(await page.evaluate(()=>window.__routeWrites),clipboardMode==='unavailable'?[]:[payload]);
      assert.equal(await page.locator(clipboardMode==='accepted'?'#copyRoute':'#routeText').evaluate(el=>el===document.activeElement),true);
      if(clipboardMode!=='accepted')assert.equal(await page.locator('#routeText').evaluate(el=>el.selectionStart===0&&el.selectionEnd===el.value.length),true);
      await page.locator('#routeText').scrollIntoViewIfNeeded();
      const layout=await page.locator('#routeText').evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===el};});
      assert.ok(layout.width>=200&&layout.height>=190);assert.equal(layout.inside,true);assert.equal(layout.hit,true);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      if(!mode)await page.screenshot({path:join(output,`route-${clipboardMode}-${width}.png`)});
      await ctx.setOffline(true);await page.reload();await check(page,'ka');
      assert.equal(await page.locator('#routeShare').isVisible(),false);
      if(!mode){await page.locator('#copyRoute').click();await page.waitForFunction(()=>Boolean(document.querySelector('#routeCopyStatus').textContent));assert.equal(await page.locator('#routeText').inputValue(),payload);}
      report.results.push({scenario:'copy-public-route-text',width,clipboardMode,storage:mode||'normal',layout,status:'passed',limit:'Injected clipboard boundary; no OS clipboard certification'});
    }finally{await ctx.close();}
  }
  for(const width of [1280,320])for(const change of ['link-to-route','route-to-link','language','site','clear','pagehide'])for(const outcome of ['fulfil','reject']){
    const ctx=await context({width,height:900}),page=await ctx.newPage();
    try{
      await ctx.addInitScript(()=>{localStorage.setItem('hydraLastLocationV1','siechniceTraining');let calls=0;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText(){if(calls++===0)return new Promise((resolve,reject)=>{window.__settleCopy=ok=>ok?resolve():reject(Error('late fixture'));});return Promise.resolve();}}});});
      await page.goto(base+'?lang=ka');
      await page.locator(change==='link-to-route'?'#copyLocation':'#copyRoute').click();
      if(change==='link-to-route'||change==='route-to-link'){await page.locator(change==='link-to-route'?'#copyRoute':'#copyLocation').click();await page.waitForFunction(()=>document.querySelector('#routeCopyStatus').textContent||document.querySelector('#locationCopyStatus').textContent);}
      else if(change==='language')await page.locator('#langSelect').selectOption('tr');
      else if(change==='site'){await page.evaluate(()=>document.addEventListener('click',e=>{if(e.target.closest('a.training-link'))e.preventDefault();}));await page.locator('#ryczywolTraining').click();await page.locator('.hydra-page-loader').waitFor({state:'hidden'});}
      else if(change==='clear')await page.locator('#clearLastLocation').click();
      else await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
      // Stop any smooth scroll from the current user action before stale settlement.
      await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo({top:0,behavior:'instant'});});
      const snapshot=()=>page.evaluate(()=>({statuses:['locationCopyStatus','routeCopyStatus'].map(id=>document.getElementById(id).textContent),busy:['copyLocation','copyRoute'].map(id=>document.getElementById(id).getAttribute('aria-busy')),focus:document.activeElement.id,scrollY,fields:['locationUrl','routeText'].map(id=>document.getElementById(id).value)}));
      const before=await snapshot();await page.evaluate(ok=>window.__settleCopy(ok),outcome==='fulfil');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.deepEqual(await snapshot(),before);
      report.results.push({scenario:'shared-copy-stale-ui',width,change,outcome,status:'passed',limit:'Old OS write is not cancelled; only stale UI effects suppressed'});
    }finally{await ctx.close();}
  }
  // Upgrade the real old shell/worker, preserving previous non-secret preferences.
  // All declared copy-route locales on the real shell; public fixtures only.
  report.localizedRoutes=[];
  for(const width of [320,1280])for(const lang of ['pl','ru','ua','en','az','es','fil','id','ne','ka','tr','hy']){
    const ctx=await context({width,height:900}),page=await ctx.newPage();
    try{
      await ctx.addInitScript(()=>{window.__rejectRoute=false;window.__copied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText(value){window.__copied.push(value);return window.__rejectRoute?Promise.reject(Error('denied fixture')):Promise.resolve();}}});});
      await page.goto(base+`?lang=${lang}&person=fixture-must-not-copy#private`);await check(page,lang);
      await page.evaluate(()=>document.addEventListener('click',e=>{if(e.target.closest('a.training-link'))e.preventDefault();}));
      await page.locator('.hydra-page-loader').waitFor({state:'hidden'});
      for(const [id,name,location] of [['siechniceTraining','Siechnice','siechnice'],['zgorzelecBogatyniaTraining','Zgorzelec / Bogatynia','zgorzelec_bogatynia'],['ryczywolTraining','Ryczyw\u00f3\u0142','ryczywol']]){
        await page.locator('#'+id).focus();await page.keyboard.press('Enter');
        for(const outcome of ['accepted','rejected']){
          await page.evaluate(reject=>window.__rejectRoute=reject,outcome==='rejected');
          await page.locator('#copyRoute').click();await page.waitForFunction(()=>Boolean(document.querySelector('#routeCopyStatus').textContent));
          const payload=await page.locator('#routeText').inputValue(),lines=payload.split('\n'),urls=payload.match(/https:\/\/\S+/g);
          assert.equal(lines[0],name);assert.equal(lines.length,['ka','tr','hy'].includes(lang)?5:4);assert.equal(urls.length,2);
          const guide=new URL(urls[0]),training=new URL(urls[1]);assert.equal(guide.origin,'https://oleksandrkiris.github.io');assert.equal(guide.pathname,'/citronex-dragon-guide/');assert.equal(guide.searchParams.get('lang'),lang);assert.equal(guide.searchParams.get('location'),location);assert.equal(guide.searchParams.get('welcome'),'1');
          assert.equal(urls[0],await page.locator('#selectedGuideLink').getAttribute('href'));assert.equal(urls[1],await page.locator('#'+id).getAttribute('href'));assert.equal(training.search,'?lang='+(['ka','tr','hy'].includes(lang)?'en':lang));assert(!payload.includes('fixture-must-not-copy')&&!payload.includes('#private'));
          assert.equal(await page.locator('#routeText').getAttribute('readonly'),'');assert.equal(await page.locator('#copyRoute').getAttribute('aria-busy'),'false');
          assert.equal(await page.evaluate(()=>window.__copied.at(-1)),payload);
          if(outcome==='rejected')assert(await page.locator('#routeText').evaluate(el=>document.activeElement===el&&el.selectionStart===0&&el.selectionEnd===el.value.length));
          const button=page.locator('#copyRoute'),status=page.locator('#routeCopyStatus'),field=page.locator('#routeText');
          const row={width,lang,location,outcome,payload,button:await button.innerText(),label:await page.locator('#routeTextLabel').innerText(),status:await status.innerText()};
          assert(row.button.length>3&&row.label.length>3&&row.status.length>3);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
          if(id==='ryczywolTraining'){
            for(const [part,el] of [['button',button],['label',page.locator('#routeTextLabel')],['status',status]]){await el.scrollIntoViewIfNeeded();await page.waitForFunction(id=>{const el=document.getElementById(id),r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;},await el.getAttribute('id'));const geometry=await el.evaluate(el=>{const r=el.getBoundingClientRect();const range=document.createRange();range.selectNodeContents(el);return {inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,lines:[...range.getClientRects()].filter(r=>r.width>0).map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom,hit:el.contains(document.elementFromPoint(Math.min(innerWidth-1,(r.left+r.right)/2),(r.top+r.bottom)/2))}))};});assert(geometry.inside&&geometry.lines.length&&geometry.lines.every(l=>l.hit));row[part+'Geometry']=geometry;await el.screenshot({path:join(output,`route-locale-${lang}-${width}-${outcome}-${part}.png`)});}
            await field.scrollIntoViewIfNeeded();for(const edge of ['top','bottom']){await field.evaluate((el,edge)=>{el.scrollTop=edge==='top'?0:el.scrollHeight;},edge);await field.screenshot({path:join(output,`route-locale-${lang}-${width}-${outcome}-${edge}.png`)});}
          }
          report.localizedRoutes.push(row);
        }
      }
    }finally{await ctx.close();}
  }
  assert.equal(report.localizedRoutes.length,144);
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
    await page.waitForFunction(async()=> {const names=await caches.keys();return names.includes('citronex-hydra-srzb-20261018-copy-route1')&&!names.includes('citronex-hydra-srzb-20261018-selected-guide1');});
    // Cache deletion happens before clients.claim: wait for activation readiness,
    // not just a cache name, before testing a controlled upgrade/offline reload.
    await page.waitForFunction(async()=>{
      const registration=await navigator.serviceWorker.ready;
      return registration.active?.state==='activated'&&navigator.serviceWorker.controller?.state==='activated';
    });
    const upgradedShell=await page.evaluate(async()=>{
      const cache=await caches.open('citronex-hydra-srzb-20261018-copy-route1');
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
