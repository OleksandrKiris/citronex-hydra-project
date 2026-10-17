import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html = await readFile(process.env.HYDRA_INDEX_SOURCE || new URL('../index.html', import.meta.url),'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
// Read leaf-label text and attributes from the real static markup. This is not a browser renderer.
const markup = html.slice(html.indexOf('<body>'), html.indexOf('<script>'));
const markupNodes = [...markup.matchAll(/<([a-z][\w-]*)\b([^>]*)>([^<]*)/g)].map(([,tag,attributes,text]) => ({
  tag, text: text.trim(), attrs: Object.fromEntries([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,key,value]) => [key,value]))
}));
// Execute real language initialization and registered handlers, excluding visual startup.
const startup = source.slice(0,source.indexOf('    setLang(initial);')) + '\nsetLang(initial); globalThis.api = {setLang, closeIntro, rememberLocation, clearLastLocation};';
assert.ok(startup.length > 10000 && !startup.includes('    enhanceFrontend();'));
function run({language='ru',stored='pl',blocked=false,browser='pl-PL',historyBlocked=false,stateBlocked=false,lastLocation=''}={}) {
  const nodes=new Map();
  function node(key) {
    if(!nodes.has(key))nodes.set(key,{value:'',textContent:'',dataset:{},attrs:{},events:{},paused:true,
      classList:{toggle(){},remove(){},add(){}},
      setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},getAttribute(k){return this.attrs[k]||'';},
      addEventListener(k,v){this.events[k]=v;},pause(){this.paused=true;},load(){},focus(){this.focused=true;}
    });
    return nodes.get(key);
  }
  const elements=markupNodes.map((entry,index)=>{
    const n=node(entry.attrs.id ? '#'+entry.attrs.id : 'markup:'+index);
    n.attrs={...entry.attrs};n.textContent=entry.text;n.tag=entry.tag;
    if(entry.attrs['data-base'])n.dataset.base=entry.attrs['data-base'];
    return n;
  });
  const hasClass=(element,name)=>(element.attrs.class||'').split(/\s+/).includes(name);
  const links=elements.filter(n=>hasClass(n,'training-link'));
  const catalog=elements.find(n=>hasClass(n,'catalog-link'));
  const cards=elements.find(n=>hasClass(n,'cards'));
  const translated=elements.filter(n=>n.attrs['data-i18n']);
  const location=new URL(`https://oleksandrkiris.github.io/citronex-hydra-project/?section=training${language ? '&lang='+language : ''}#locations`);
  const document={documentElement:{},body:{classList:{remove(){}}},querySelector:node,
    querySelectorAll(s){return s==='.training-link'?links:s==='.catalog-link'?[catalog]:s==='[data-i18n]'?translated:s==='[data-i18n-label]'?elements.filter(n=>n.attrs['data-i18n-label']):[];},addEventListener(){}};
  const writes=[];
  const storage={getItem(key){if(blocked)throw Error('SecurityError');return key==='hydraLastLocationV1'?lastLocation:stored;},removeItem(key){if(blocked)throw Error('SecurityError');writes.push([key,null]);},setItem(k,v){if(blocked)throw Error('QuotaExceededError');writes.push([k,v]);}};
  const c=vm.createContext({document,window:{},location,URL,URLSearchParams,navigator:{language:browser,languages:[browser]},
    localStorage:storage,history:{get state(){if(stateBlocked)throw Error('SecurityError');return null;},replaceState(_state,_title,url){if(historyBlocked)throw Error('SecurityError');location.href=url.toString();}}});
  vm.runInContext(startup,c);
  return {c,document,location,links,catalog,cards,translated,nodes,writes};
}
function accessibleLabel(element,nodes) {
  if(element.attrs['aria-labelledby'])return element.attrs['aria-labelledby'].split(/\s+/).map(id=>{
    const label=nodes.get('#'+id);assert.ok(label,`Missing label target ${id}`);return label.textContent;
  }).join(' ');
  return element.attrs['aria-label']||element.textContent;
}
for(const language of ['pl','en','ua','ru','az','es','fil','id','ne','ka','tr','hy']) {
  test(`${language}: language and card-region names follow the translated labels`,()=>{
    const f=run({language});
    const expected=key=>f.translated.find(n=>n.attrs['data-i18n']===key).textContent;
    assert.equal(accessibleLabel(f.nodes.get('#langSelect'),f.nodes),expected('languageLabel'));
    assert.equal(accessibleLabel(f.cards,f.nodes),expected('startTitle'));
    f.c.api.setLang('en');
    assert.equal(accessibleLabel(f.nodes.get('#langSelect'),f.nodes),'Language');
    assert.equal(accessibleLabel(f.cards,f.nodes),expected('startTitle'));
  });
  test(`${language}: training links identify their cities without losing the translated action`,()=>{
    const f=run({language});
    const cities={'citronex-siechnice-szkolenie':'Siechnice','citronex-ryczywol-szkolenie':'Ryczywół','citronex-zgorzelec-bogatynia-szkolenie':'Zgorzelec / Bogatynia'};
    const names=[];
    for(const [repo,city] of Object.entries(cities)){
      const link=f.links.find(n=>new URL(n.href).pathname===`/${repo}/`);
      const name=accessibleLabel(link,f.nodes);names.push(name);
      assert.equal(name,`${link.textContent} ${city}`);
      assert.equal(new URL(link.href).searchParams.get('lang'),['ka','tr','hy'].includes(language)?'en':language);
    }
    assert.equal(new Set(names).size,3);
  });
}
test('all accessible label references identify one real markup node',()=>{
  const ids=markupNodes.map(n=>n.attrs.id).filter(Boolean);
  for(const n of markupNodes)for(const id of (n.attrs['aria-labelledby']||'').split(/\s+/).filter(Boolean))assert.equal(ids.filter(value=>value===id).length,1,id);
});
for(const language of ['pl','en','ua','ru','az','es','fil','id','ne','ka','tr','hy'])test(`${language}: blocked storage keeps language, location links, catalog mapping and context`,()=>{
  const f=run({language,blocked:true});
  assert.equal(f.document.documentElement.lang,language==='ua'?'uk':language);
  for(const link of f.links)assert.equal(new URL(link.href).searchParams.get('lang'),['ka','tr','hy'].includes(language)?'en':language);
  assert.equal(new URL(f.catalog.href).searchParams.get('lang'),language==='ua'?'uk':language==='tr'?'en':language);
  f.c.api.setLang('ua');
  assert.equal(f.location.searchParams.get('lang'),'ua');
  assert.equal(f.location.searchParams.get('section'),'training');
  assert.equal(f.location.hash,'#locations');
  assert.doesNotThrow(()=>f.c.api.closeIntro());
  assert.equal(f.nodes.get('#introModal').hidden,true);
});
test('URL beats stored preference; supported browser language survives blocked storage',()=>{
  assert.equal(run({language:'uk'}).document.documentElement.lang,'uk');
  assert.equal(run({language:'ka',stored:'ru'}).document.documentElement.lang,'ka');
  assert.equal(run({language:'',stored:'es'}).document.documentElement.lang,'es');
  assert.equal(run({language:'',blocked:true,browser:'uk-UA'}).document.documentElement.lang,'uk');
  assert.equal(run({language:'',blocked:true,browser:'ka-GE'}).document.documentElement.lang,'ka');
});
test('normal storage persists the selected language',()=>{
  const f=run({language:'ru'});f.c.api.setLang('en');
  assert.deepEqual(f.writes,[['hydraLang','ru'],['hydraLang','en']]);
});
test('fallback status exists once in real markup, hidden by default, before navigation',()=>{
  const notices=markupNodes.filter(n=>n.attrs.id==='languageFallback');
  assert.equal(notices.length,1);
  assert.equal(notices[0].attrs.role,'status');
  assert.equal(notices[0].attrs.lang,'en');
  assert.match(markup,/<p\b[^>]*id="languageFallback"[^>]*\bhidden\b[^>]*><\/p>/);
  assert.ok(markup.indexOf('id="languageFallback"')<markup.indexOf('<nav'));
});
for(const language of ['ka','KA','tr','hy'])test(`${language}: native HYDRA and honest English handoff with no invented audio`,()=>{
  const expected=language.toLowerCase(), f=run({language,stored:'ru',blocked:true});
  assert.equal(f.nodes.get('#languageFallback').hidden,true);
  assert.equal(f.nodes.get('#externalLanguageNotice').hidden,false);
  assert.equal(f.document.documentElement.lang,expected);
  assert.equal(f.location.searchParams.get('lang'),expected);
  assert.equal(f.location.searchParams.get('section'),'training');
  assert.equal(f.location.hash,'#locations');
  assert.equal(f.nodes.get('#introScript').textContent.length>60,true);
  assert.equal(f.nodes.get('#playIntro').hidden,true);
  assert.equal(f.nodes.get('#audioStatus').hidden,false);
  assert.equal(f.nodes.get('#introAudio').attrs.src,undefined);
  for(const link of f.links)assert.equal(new URL(link.href).searchParams.get('lang'),'en');
  assert.equal(new URL(f.catalog.href).searchParams.get('lang'),expected==='tr'?'en':expected);
});
test('three full native locales match keys, no missing/blank labels or silent Polish fallback',()=>{
  const f=run({language:'ka'});
  const dictionaries=vm.runInContext('translations',f.c);
  const baseline=Object.keys(dictionaries.en).sort();
  for(const lang of ['ka','tr','hy']){
    const keys=Object.keys(dictionaries[lang]).filter(key=>!['externalNotice','textOnlyIntro'].includes(key)).sort();
    assert.deepEqual(keys,baseline);
    for(const [key,value] of Object.entries(dictionaries[lang]))assert.ok(typeof value==='string'&&value.trim(),lang+':'+key);
    assert.match(dictionaries[lang].externalNotice,/English|ინგლისურად|İngilizce|անգլերեն/);
  }
});
test('unrecognized language uses a fixed notice without reflecting URL text',()=>{
  const f=run({language:encodeURIComponent('<img src=x onerror=alert(1)>')});
  const notice=f.nodes.get('#languageFallback');
  assert.equal(notice?.hidden,false);
  assert.equal(notice.textContent,'This language is not available here. Showing English (EN). You can choose another language above.');
});
test('supported languages, Ukrainian alias and stored preference show no fallback notice',()=>{
  for(const language of ['pl','ru','ua','uk','en','az','es','fil','id','ne','ka','tr','hy','']){
    const f=run({language,stored:'ru'});
    assert.equal(f.nodes.get('#languageFallback')?.hidden,true,language);
  }
});
test('manual language change dismisses fallback even after switching back to English',()=>{
  const f=run({language:'xx'});
  const select=f.nodes.get('#langSelect');
  select.value='ua';select.events.change();
  assert.equal(f.nodes.get('#languageFallback').hidden,true);
  assert.equal(f.document.documentElement.lang,'uk');
  assert.equal(new URL(f.catalog.href).searchParams.get('lang'),'uk');
  for(const link of f.links)assert.equal(new URL(link.href).searchParams.get('lang'),'ua');
  select.value='en';select.events.change();
  assert.equal(f.nodes.get('#languageFallback').hidden,true);
});

for(const language of ['pl','en','ua','ru','az','es','fil','id','ne','ka','tr','hy'])test(`${language}: denied History API does not interrupt translations or routes`,()=>{
  const f=run({language,historyBlocked:true,blocked:true});
  const original=f.location.href;
  assert.equal(f.document.documentElement.lang,language==='ua'?'uk':language);
  for(const link of f.links)assert.equal(new URL(link.href).searchParams.get('lang'),['ka','tr','hy'].includes(language)?'en':language);
  f.c.api.setLang('ua');
  assert.equal(f.nodes.get('#langSelect').value,'ua');
  assert.equal(f.document.documentElement.lang,'uk');
  assert.equal(new URL(f.catalog.href).searchParams.get('lang'),'uk');
  for(const link of f.links)assert.equal(new URL(link.href).searchParams.get('lang'),'ua');
  assert.equal(accessibleLabel(f.nodes.get('#langSelect'),f.nodes),'Мова');
  assert.equal(f.location.href,original,'No navigation/reload fallback');
  assert.doesNotThrow(()=>f.c.api.closeIntro());
});
test('denied history.state still handles unknown language without breaking routes',()=>{
  const f=run({language:'xx',stateBlocked:true});
  assert.equal(f.document.documentElement.lang,'en');
  assert.match(f.nodes.get('#languageFallback').textContent,/not available here/);
  assert.equal(f.nodes.get('#languageFallback').hidden,false);
  for(const link of [...f.links,f.catalog])assert.equal(new URL(link.href).searchParams.get('lang'),'en');
  assert.match(f.nodes.get('#introAudio').src,/intro-en\.mp3/);
  assert.deepEqual(f.writes,[['hydraLang','en']]);
  assert.equal(f.location.searchParams.get('lang'),'xx');
});
test('history refusal keeps non-language URL context and saved preference',()=>{
  const f=run({language:'ru',historyBlocked:true});
  f.c.api.setLang('en');
  assert.deepEqual(f.writes,[['hydraLang','ru'],['hydraLang','en']]);
  assert.equal(f.location.searchParams.get('section'),'training');
  assert.equal(f.location.hash,'#locations');
  assert.equal(f.location.searchParams.get('lang'),'ru');
  assert.equal(f.document.documentElement.lang,'en');
});

for(const lastLocation of ['unknown','{"id":"siechniceTraining"}','https://evil.example/',''])test(`invalid saved location stays hidden: ${lastLocation}`,()=>{
 const f=run({lastLocation});assert.equal(f.nodes.get('#lastLocation').hidden,true);
 assert.equal(f.nodes.get('#lastLocationLink').attrs.href,undefined);
});
for(const id of ['siechniceTraining','ryczywolTraining','zgorzelecBogatyniaTraining'])test(`remember only public ID, rebuild language and clear: ${id}`,()=>{
 const f=run({lastLocation:id,language:'ka'});
 assert.equal(f.nodes.get('#lastLocation').hidden,false);
 assert.equal(f.nodes.get('#lastLocationLink').href,f.nodes.get('#'+id).href);
 f.c.api.setLang('ua');assert.equal(new URL(f.nodes.get('#lastLocationLink').href).searchParams.get('lang'),'ua');
 f.c.api.rememberLocation(id);assert.deepEqual(f.writes.at(-1),['hydraLastLocationV1',id]);
 f.c.api.rememberLocation('https://evil.example/');assert.deepEqual(f.writes.at(-1),['hydraLastLocationV1',id]);
 f.c.api.clearLastLocation();assert.equal(f.nodes.get('#lastLocation').hidden,true);assert.equal(f.nodes.get('#langSelect').focused,true);
});
test('denied storage permits in-memory selection and explicit clear without breaking routes',()=>{
 const f=run({blocked:true,historyBlocked:true});f.c.api.rememberLocation('siechniceTraining');
 assert.equal(f.nodes.get('#lastLocation').hidden,false);f.c.api.setLang('tr');
 assert.equal(new URL(f.nodes.get('#lastLocationLink').href).searchParams.get('lang'),'en');
 assert.doesNotThrow(()=>f.c.api.clearLastLocation());assert.equal(f.nodes.get('#lastLocation').hidden,true);
});
