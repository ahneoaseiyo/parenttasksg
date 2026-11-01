import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openTaskStore } from "./taskStore.js";

const seed = {
  id:"task_test",centreId:"centre_a",parentUserId:"parent_one",child:"Test child",
  level:"K1",title:"Bring paper",category:"Things to bring",status:"Not done",
  priority:"High",dueLabel:"Tomorrow"
};

test("SQLite task updates survive closing and reopening", () => {
  const dir = mkdtempSync(join(tmpdir(),"parenttask-db-"));
  const path = join(dir,"tasks.sqlite");
  try {
    let store = openTaskStore(path,[seed]);
    assert.equal(store.list("centre_a","parent_one").length,1);
    store.update(seed.id,{status:"Done"});
    store.close();
    store = openTaskStore(path,[seed]);
    assert.equal(store.get(seed.id).status,"Done");
    assert.equal(store.list("centre_a","other_parent").length,0);
    assert.equal(store.list("centre_b").length,0);
    assert.equal(store.list("centre_a").length,1);
    store.close();
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("SQLite schema initialization is repeatable and does not duplicate seeded tasks", () => {
  const dir = mkdtempSync(join(tmpdir(),"parenttask-db-"));
  try {
    const path = join(dir,"tasks.sqlite");
    const first = openTaskStore(path,[seed]);
    first.close();
    const second = openTaskStore(path,[seed]);
    assert.equal(second.list("centre_a").length,1);
    assert.throws(()=>second.update(seed.id,{centreId:"centre_b"}),TypeError);
    second.close();
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
