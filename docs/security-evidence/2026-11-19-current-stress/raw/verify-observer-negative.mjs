import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import process from 'node:process';
const rows=JSON.parse(await readFile(join(process.env.NATIVE_EVIDENCE_DIR,'webkit-stress.json'),'utf8'));
assert.equal(rows.length,1);
const target=rows[0];
assert.equal(target.case,'cpu-stop');
assert.equal(target.fixture,'cpu-loop');
assert.equal(target.caseOutcome,'failed');
assert.match(target.failure,/native-atspi\.py/);
assert.match(target.failure,/No such file|Errno 2/);
assert.ok(target.samples.length>0);
assert.match(target.unit,/^programmable-notes-preview-[0-9]+-[0-9]+\.service$/);
assert.equal(target.noLiveDescendants,undefined,'Failure must not invent a positive termination observation');
try {assert.equal((await readFile(`${target.root}/cgroup.procs`,'utf8')).trim(),'');}
catch(error){if(error.code!=='ENOENT')throw error;}
for(const [pid,prior] of Object.entries(Object.assign({},...target.samples.map(s=>s.members)))){
 try {const stat=(await readFile(`/proc/${pid}/stat`,'utf8')).split(') ').at(-1).split(' ');assert.ok(stat[19]!==prior.start||stat[0]==='Z');}
 catch(error){if(error.code!=='ENOENT'&&error.code!=='ESRCH')throw error;}
}
console.log(JSON.stringify({expectedObserverFailure:true,registeredUnits:rows.length,caseOutcome:target.caseOutcome,unit:target.unit,nativeCpuAcceptanceExecuted:false,knownDescendantsGone:true}));
