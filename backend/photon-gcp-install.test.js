'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {privatePhotonEndpoint}=require('./place-search');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'infra/photon/gce-vm-startup.sh'),'utf8');
const provision=fs.readFileSync(path.join(root,'infra/photon/provision-gcp.sh'),'utf8');
const connect=fs.readFileSync(path.join(root,'infra/photon/connect-cloudrun.sh'),'utf8');
for(const file of ['gce-vm-startup.sh','provision-gcp.sh','connect-cloudrun.sh']){
 const p=path.join(root,'infra/photon',file);
 const test=spawnSync('bash',['-n',p],{timeout:10000,encoding:'utf8'});
 assert.equal(test.status,0,file+' bash syntax: '+test.stderr);
}
assert.match(provision,/AR_PHOTON_CONFIRM_BILLABLE/);
assert.match(provision,/e2-standard-2/);
assert.match(provision,/--no-service-account/);
assert.match(provision,/--source-ranges=10\.84\.0\.0\/24/);
assert.match(provision,/private-network-ip=\$PRIVATE_IP/);
assert.match(provision,/american-rider-photon/);
assert.match(source,/photon-1\.3\.0\.jar/);
assert.match(source,/a89707c0045e4807b2a1180e132e68e108d998709f48b6c94b98a6e281f571a5/);
assert.match(source,/photon-db-usa-1\.0-latest\.tar\.bz2/);
assert.match(source,/md5sum -c/);
assert.match(source,/photon_data/);
assert.match(source,/useradd --system/);
assert.match(connect,/AR_PHOTON_CONFIRM_SWITCH/);
assert.match(connect,/--vpc-egress=private-ranges-only/);
assert.match(connect,/AR_PLACE_SEARCH_PRIMARY=photon/);
assert.match(connect,/--tunnel-through-iap/);
const old=process.env.AR_PHOTON_PRIVATE_VPC;
try{
 delete process.env.AR_PHOTON_PRIVATE_VPC;
 assert.equal(privatePhotonEndpoint('http://10.84.0.10:2322'),null);
 process.env.AR_PHOTON_PRIVATE_VPC='1';
 assert.equal(privatePhotonEndpoint('http://10.84.0.10:2322')?.pathname,'/api');
 for (const v of ['http://127.0.0.1:2322','http://169.254.169.254:2322',
                  'http://10.84.0.10:8000','https://photon.komoot.io',
                  'http://evil.example.com:2322'])assert.equal(privatePhotonEndpoint(v),null);
}finally{
 if(old===undefined)delete process.env.AR_PHOTON_PRIVATE_VPC;
 else process.env.AR_PHOTON_PRIVATE_VPC=old;
}
console.log('PASS Photon VM installer shell syntax, no surprise bill, private-only API');
