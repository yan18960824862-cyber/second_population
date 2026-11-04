/* Shared functional groups. Original four source categories remain intact. */
(function(){
 const groups=[
  {id:'passenger',label:'乘用车辆',color:'#e47b9c'},
  {id:'freight',label:'货运车辆',color:'#df9b78'},
  {id:'transit',label:'公共交通',color:'#d4a66d'},
  {id:'facility',label:'道路设施',color:'#83bcc0'},
  {id:'rider',label:'骑手 / 行人',color:'#c08bb4'},
  {id:'delivery',label:'配送骑手',color:'#c77ca3'}
 ];
 function groupIndex(o){const en=String(o.labelEn||'').toUpperCase();if(o.category==='vehicle')return /TRUCK|VAN/.test(en)?1:/BUS|COACH/.test(en)?2:0;if(o.category==='person')return /DELIVERY/.test(en)||/外卖|配送/.test(o.label)?5:4;return 3;}
 const rules={groups,groupIndex};if(typeof module!=='undefined')module.exports=rules;else window.CensusVisualRules=rules;
})();
