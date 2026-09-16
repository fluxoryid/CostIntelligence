/* governance-extensions.js — production source-registry/provenance upgrades. */
(function(){
  'use strict';
  var se=window.HPSSourceEngine;
  if(se&&se.REGISTRY){
    se.REGISTRY.BI_REFERENCE_NONUSD={label:'Bank Indonesia — Non-USD/IDR Reference Rate',authority:100,priceRelevance:82,auditability:100,independence:100,role:'COST_DRIVER',allowed:true,note:'Official BI reference for supported non-USD currencies. Use for currency normalization, not direct product pricing.'};
    se.REGISTRY.BI_TRANSACTION={label:'Bank Indonesia — Transaction Rate Buy/Sell',authority:100,priceRelevance:72,auditability:100,independence:100,role:'COST_DRIVER',allowed:true,note:'Official transaction-rate band useful for settlement/risk analysis; do not substitute it for JISDOR or category price evidence without documented rationale.'};
    se.REGISTRY.BI_UKA={label:'Bank Indonesia — Foreign Banknote (UKA) Rate',authority:100,priceRelevance:35,auditability:100,independence:100,role:'CONTEXT',allowed:true,note:'Cash/banknote reference. Normally contextual only for procurement unless the transaction genuinely involves cash/banknotes.'};
  }

  // Replace obsolete placeholder notes while retaining deterministic source rows.
  if(window.CalcCore&&window.CalcCore.generateSources&&!window.CalcCore.__provenanceCleanupPatched){
    var original=window.CalcCore.generateSources;
    window.CalcCore.generateSources=function(input,researched){
      return original(input,researched).map(function(s){
        if(s.name==='Bank Indonesia — USD/IDR Reference Rate (JISDOR)'){
          return Object.assign({},s,{note:'Official BI JISDOR is retrieved first through the legacy official wsKursBI service; the official BI indicator page is a secondary fallback. No generic third-party market rate is silently substituted in production.'});
        }
        if(/^BPS WebAPI/.test(s.name||'')){
          return Object.assign({},s,{name:'BPS — Official CPI / Inflation / Statistical Evidence',note:'Current national inflation is retrieved from an official BPS public release when WebAPI is unavailable from the Cloudflare edge. Historical CPI uses verified official releases. Broad CPI is category-gated and must not replace a more specific price/wage/material index.'});
        }
        return s;
      });
    };
    window.CalcCore.__provenanceCleanupPatched=true;
  }
})();
