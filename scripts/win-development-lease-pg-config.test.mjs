import test from "node:test";
import assert from "node:assert/strict";
import { inspectLocalPgConfig } from "./win-development-lease-pg-config.mjs";

const local = "postgresql://test_user:dummy_password@127.0.0.1:5432/win_lease_test_disposable";

test("local PostgreSQL config clears inherited libpq routing and hidden service settings",()=>{
 const result=inspectLocalPgConfig(local,{
   PATH:"/usr/bin",HOME:"/home/test",
   PGHOSTADDR:"198.51.100.11",PGHOST:"outside.example",PGPORT:"6543",
   PGSERVICE:"production",PGSERVICEFILE:"/tmp/service.conf",
   PGOPTIONS:"-c search_path=production",PGPASSFILE:"/tmp/.pgpass",
   PGSSLMODE:"require",PGTARGETSESSIONATTRS:"read-write",
   DATABASE_URL:"postgres://remote/db",
   WIN_LEASE_TEST_DATABASE_URL:"postgres://remote/other"
 });
 const env=result.environment;
 assert.equal(env.PATH,"/usr/bin");
 assert.equal(env.PGPASSWORD,"dummy_password");
 assert.equal(Object.hasOwn(env,"PGHOSTADDR"),false);
 assert.equal(Object.hasOwn(env,"PGSERVICE"),false);
 assert.equal(Object.hasOwn(env,"PGOPTIONS"),false);
 assert.equal(env.PGSSLMODE,"disable");
 for(const key of ["PGHOST","PGPORT","PGSERVICEFILE","PGTARGETSESSIONATTRS",
                    "DATABASE_URL","WIN_LEASE_TEST_DATABASE_URL"]) {
   assert.equal(Object.hasOwn(env,key),false,key);
 }
 assert.ok(result.options.includes("127.0.0.1"));
 assert.ok(result.options.includes("win_lease_test_disposable"));
 assert.ok(!result.options.includes("outside.example"));
});

test("rejects remote, non-test, ambiguous and encoded destinations without DB calls",()=>{
 const denied=[
  "postgresql://user:pass@198.51.100.11:5432/win_lease_test_x",
  "postgresql://user:pass@db.example:5432/win_lease_test_x",
  "postgresql://user:pass@127.0.0.1:6543/win_lease_test_x",
  "postgresql://user:pass@127.0.0.1:5432/production",
  "postgresql://user:pass@127.0.0.1:5432/win_lease_test_x?hostaddr=198.51.100.11",
  "postgresql://user:pass@127.0.0.1:5432/win_lease_test_x#other",
  "postgresql://bad-user:pass@127.0.0.1:5432/win_lease_test_x",
  "postgresql://user@127.0.0.1:5432/win_lease_test_x",
  "postgresql://user:pass@127.0.0.1:5432/win_lease_test_x/extra",
  "file:///win_lease_test_x"
 ];
 for(const value of denied)
   assert.throws(()=>inspectLocalPgConfig(value,{}),/UNSAFE_POSTGRES_TEST_DESTINATION/,value);
 assert.throws(()=>inspectLocalPgConfig(null,{}),/ISOLATED_POSTGRES_TEST_DATABASE_URL_REQUIRED/);
});

test("accepts only unambiguous local disposable DB credentials",()=>{
 const result=inspectLocalPgConfig("postgresql://local_user:dummy@localhost:5432/win_lease_test_a",{});
 assert.deepEqual(result.options.slice(-6),["-p","5432","-U","local_user","-d","win_lease_test_a"]);
 assert.equal(result.environment.PGPASSWORD,"dummy");
});
