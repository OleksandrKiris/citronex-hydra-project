import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const PRE_ROUTE='b04fc7302612affa0c2eec71ac66ebbc13912e46';
export const PINS={
  "index.html": "f24bcfd61c47b7658298aaf67654fddf948e5ec3cf2f10b1a0ea38f92d1fbb2d",
  "sw.js": "8b489e250d01717b3acaa04728b681dc57cbfd17b23605ec3f7be5fe82680f6b",
  "manifest.webmanifest": "9d48e03c60a84fab62f5fbd10f150d21009ddd8949b206e387582f11ac3ad626",
  "assets/brand/primserv-logo.svg": "1a29802a4a0065ad84e8f8dbdd5bc46dcb9b67bbecb2190de6a99464feaf5157",
  "assets/brand/primserv-icon-192.png": "4b93c4c36e29ec11fc4320703a39a06bd956e4f6dfec4a6a84ad906b6ab674e5",
  "assets/brand/primserv-icon-512.png": "6035b2a4bdea276e34d854bfdb4ee6b5c10bc5a2eb4af8682b60ac1fd6e25492"
};
const hash=b=>createHash('sha256').update(b).digest('hex');
export function upgradeSource(eventBase,current,previous,read){
 assert.match(eventBase,/^[0-9a-f]{40}$/);assert(current['sw.js']&&previous['sw.js'],'Original workers required');
 const equal=Object.keys(current).length===Object.keys(previous).length&&Object.entries(current).every(([p,b])=>previous[p]&&hash(b)===hash(previous[p]));
 const ref=equal?PRE_ROUTE:eventBase,files=equal?Object.fromEntries(Object.entries(PINS).map(([p,h])=>{const b=read(ref,p);assert.equal(hash(b),h,'Pinned pre-route source');return [p,b];})):previous;
 assert.notEqual(hash(files['sw.js']),hash(current['sw.js']),'Original workers must differ for an upgrade');
 return {ref,files,eventBase,eventBaseRuntimeEqual:equal,kind:equal?'pinned-pre-route-upgrade-identical-event-runtime':'fresh-event-base-upgrade'};
}
