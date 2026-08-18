import{t as e}from"/assets/animate/rolldown-runtime.Dh6celcD.mjs";async function t(e,t,i){let a=r[e],o=a?await a(t,i):void 0,s={bodyEnd:[],bodyStart:[],headEnd:[],headStart:[]};for(let t of n){if(t.pageIds&&!t.pageIds.has(e))continue;let n=t.code(o);n&&s[t.placement].push({...t,code:n})}return s}var n,r,i,a;e((()=>{n=[{code:e=>`<style>
/* Don't overscroll page */
html, body {
  overscroll-behavior: none;
}
</style>`,id:`legacy-bodyStart-VwmjJqVZn`,loadMode:`once`,name:`Custom Code (Legacy)`,pageIds:new Set([`VwmjJqVZn`]),placement:`bodyStart`}],r={},i={bodyEnd:[],bodyStart:[`legacy-bodyStart-VwmjJqVZn`],headEnd:[],headStart:[`mRzpSAlrB`]},a={exports:{snippetsSorting:{type:`variable`,annotations:{framerContractVersion:`1`}},getSnippets:{type:`function`,annotations:{framerContractVersion:`1`}},__FramerMetadata__:{type:`variable`}}}}))();export{a as __FramerMetadata__,t as getSnippets,i as snippetsSorting};
//# sourceMappingURL=wUD4I5sNrGCPL4O862fyBJdoJ51W1BDTu72PRB-LtwQ.C81wlV-r.mjs.map