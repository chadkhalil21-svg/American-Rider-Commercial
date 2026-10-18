'use strict';
// Bound parallel provider/database work without dropping records or choosing fewer
// Operators. A queue entry is eligible only after its own Travel is independently checked.
async function forEachBounded(items,concurrency,visit){
  if(!Array.isArray(items) || !Number.isSafeInteger(concurrency) || concurrency<1 || typeof visit!=='function')
    throw new TypeError('bounded traversal requires an array, positive concurrency, and visitor');
  let cursor=0;
  const running=Array.from({length:Math.min(items.length,concurrency)}, async()=>{
    for(;;){
      const i=cursor++;
      if(i>=items.length)return;
      await visit(items[i],i);
    }
  });
  // Wait until ALL workers settle if a visitor rejects. No detached tasks in flight.
  const settled=await Promise.allSettled(running);
  const failed=settled.find(x=>x.status==='rejected');
  if(failed)throw failed.reason;
}
module.exports={forEachBounded};
