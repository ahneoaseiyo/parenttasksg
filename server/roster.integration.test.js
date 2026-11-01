import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openTaskStore } from "./taskStore.js";
import { openRosterStore } from "./rosterStore.js";

test("roster persists centre-specific child links after restart",()=>{
  const dir=mkdtempSync(join(tmpdir(),"roster-test-"));
  const path=join(dir,"roster.sqlite");
  let roster;
  try {
    openTaskStore(path).close();
    roster=openRosterStore(path,[{id:"child_1",centreId:"centre_a",name:"Child A"}],
      [{centreId:"centre_a",parentUserId:"parent_1",childId:"child_1"}]);
    assert.equal(roster.ownsChild("centre_a","parent_1","child_1"),true);
    assert.equal(roster.ownsChild("centre_a","parent_2","child_1"),false);
    assert.equal(roster.ownsChild("centre_b","parent_1","child_1"),false);
    roster.close();
    roster=null;
    roster=openRosterStore(path,[],[]);
    assert.equal(roster.childrenForParent("centre_a","parent_1")[0].name,"Child A");
    assert.deepEqual(roster.childrenForParent("centre_b","parent_1"),[]);
  } finally {roster?.close();rmSync(dir,{recursive:true,force:true});}
});
