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
const startup = source.slice(0,source.indexOf('    setLang(initial);')) + '\nsetLang(initial); globalThis.api = {setLang, closeIntro};';
assert.ok(startup.length > 10000 && !startup.includes('    enhanceFrontend();'));
function run({language='ru',stored='pl',blocked=false,browser='pl-PL'}={}) {
  const nodes=new Map();
  function node(key) {
    if(!nodes.has(key))nodes.set(key,{value:'',textContent:'',dataset:{},attrs:{},events:{},paused:true,
      classList:{toggle(){},remove(){},add(){}},
      setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]||'';},
      addEventListener(k,v){this.events[k]=v;},pause(){this.paused=true;},load(){}
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
  const storage={getItem(){if(blocked)throw Error('SecurityError');return stored;},setItem(k,v){if(blocked)throw Error('QuotaExceededError');writes.push([k,v]);}};
  const c=vm.createContext({document,window:{},location,URL,URLSearchParams,navigator:{language:browser,languages:[browser]},
    localStorage:storage,history:{state:null,replaceState(_state,_title,url){location.href=url.toString();}}});
  vm.runInContext(startup,c);
  return {c,document,location,links,catalog,cards,translated,nodes,writes};
}
function accessibleLabel(element,nodes) {
  if(element.attrs['aria-labelledby'])return element.attrs['aria-labelledby'].split(/\s+/).map(id=>{
    const label=nodes.get('#'+id);assert.ok(label,`Missing label target ${id}`);return label.textContent;
  }).join(' ');
  return element.attrs['aria-label']||element.textContent;
}
for(const language of ['pl','en','ua','ru','az','es','fil','id','ne']) {
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
      assert.equal(new URL(link.href).searchParams.get('lang'),language);
    }
    assert.equal(new Set(names).size,3);
  });
}
test('all accessible label references identify one real markup node',()=>{
  const ids=markupNodes.map(n=>n.attrs.id).filter(Boolean);
  for(const n of markupNodes)for(const id of (n.attrs['aria-labelledby']||'').split(/\s+/).filter(Boolean))assert.equal(ids.filter(value=>value===id).length,1,id);
});
for(const language of ['pl','en','ua','ru','az','es','fil','id','ne'])test(`${language}: blocked storage keeps language, location links, catalog mapping and context`,()=>{
  const f=run({language,blocked:true});
  assert.equal(f.document.documentElement.lang,language==='ua'?'uk':language);
  for(const link of f.links)assert.equal(new URL(link.href).searchParams.get('lang'),language);
  assert.equal(new URL(f.catalog.href).searchParams.get('lang'),language==='ua'?'uk':language);
  f.c.api.setLang('ua');
  assert.equal(f.location.searchParams.get('lang'),'ua');
  assert.equal(f.location.searchParams.get('section'),'training');
  assert.equal(f.location.hash,'#locations');
  assert.doesNotThrow(()=>f.c.api.closeIntro());
  assert.equal(f.nodes.get('#introModal').hidden,true);
});
test('URL beats stored preference; supported browser language survives blocked storage',()=>{
  assert.equal(run({language:'uk'}).document.documentElement.lang,'uk');
  assert.equal(run({language:'ka',stored:'ru'}).document.documentElement.lang,'en');
  assert.equal(run({language:'',stored:'es'}).document.documentElement.lang,'es');
  assert.equal(run({language:'',blocked:true,browser:'uk-UA'}).document.documentElement.lang,'uk');
  assert.equal(run({language:'',blocked:true,browser:'ka-GE'}).document.documentElement.lang,'en');
});
test('normal storage persists the selected language',()=>{
  const f=run({language:'ru'});f.c.api.setLang('en');
  assert.deepEqual(f.writes,[['hydraLang','ru'],['hydraLang','en']]);
});
