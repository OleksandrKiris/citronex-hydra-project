import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html = await readFile(process.env.HYDRA_INDEX_SOURCE || new URL('../index.html', import.meta.url),'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
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
  const links=['citronex-siechnice-szkolenie','citronex-ryczywol-szkolenie','citronex-zgorzelec-bogatynia-szkolenie'].map(repo=>{
    const n=node(repo);n.dataset.base=`https://oleksandrkiris.github.io/${repo}/`;return n;
  });
  const catalog=node('catalog');
  const location=new URL(`https://oleksandrkiris.github.io/citronex-hydra-project/?section=training${language ? '&lang='+language : ''}#locations`);
  const document={documentElement:{},body:{classList:{remove(){}}},querySelector:node,
    querySelectorAll(s){return s==='.training-link'?links:s==='.catalog-link'?[catalog]:[];},addEventListener(){}};
  const writes=[];
  const storage={getItem(){if(blocked)throw Error('SecurityError');return stored;},setItem(k,v){if(blocked)throw Error('QuotaExceededError');writes.push([k,v]);}};
  const c=vm.createContext({document,window:{},location,URL,URLSearchParams,navigator:{language:browser,languages:[browser]},
    localStorage:storage,history:{state:null,replaceState(_state,_title,url){location.href=url.toString();}}});
  vm.runInContext(startup,c);
  return {c,document,location,links,catalog,nodes,writes};
}
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
