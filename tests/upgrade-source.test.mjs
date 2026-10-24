import test from 'node:test';
import assert from 'node:assert/strict';
import {upgradeSource,PRE_ROUTE} from './upgrade-source.mjs';
const ref='8d9d2632c6b91b2698fd341bc3beb55ba6a80aa2',shell=(w,b='same')=>({'sw.js':Buffer.from(w),'index.html':Buffer.from(b)});
test('runtime-changing source keeps exact fresh event base',()=>{const previous=shell('old');const r=upgradeSource(ref,shell('new','changed'),previous,()=>{throw Error('unused')});assert.equal(r.files,previous);assert.equal(r.ref,ref);assert.equal(r.eventBaseRuntimeEqual,false);});
test('identical runtime requires verified historical original bytes',()=>assert.throws(()=>upgradeSource(ref,shell('same'),shell('same'),(r,p)=>{assert.equal(r,PRE_ROUTE);return Buffer.from('altered');}),/Pinned pre-route source/));
test('changed runtime with same worker cannot claim an upgrade',()=>assert.throws(()=>upgradeSource(ref,shell('same','changed'),shell('same'),()=>{}),/must differ/));
test('missing original worker is rejected',()=>assert.throws(()=>upgradeSource(ref,{},shell('old'),()=>{}),/workers required/i));
test('a changed manifest cannot be mistaken for identical runtime',()=>{const current=shell('same'),previous=shell('same');current['manifest.webmanifest']=Buffer.from('changed');previous['manifest.webmanifest']=Buffer.from('old');assert.throws(()=>upgradeSource(ref,current,previous,()=>{}),/must differ/);});
