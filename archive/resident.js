(() => {
 const policy='https://www.gov.cn/zhengce/zhengceku/202406/P020240628324071721796.pdf';
 const passenger=['6.18','附件 1 · WLTC，两排及以下、整备质量超过 1415 kg 的节能乘用车。','街区通行','等红灯时，街灯一盏盏落在风挡上。','等候'];
 const motor={
 truck:['22.7','2025 年表 3.1 · 最大设计总质量超过 16 吨、至 20 吨的货车。','货物配送','车厢门扣好，它才放心穿过下一个路口。','稳运'],
 bus:['27.6','2025 年表 3.5 · 最大设计总质量超过 14.5 吨、至 16.5 吨的城市客车。','站点接驳','每次停靠，都给晚到的人多留一眼。','停靠'],
 coach:['19.6','2025 年表 3.3 · 最大设计总质量超过 14.5 吨、至 16.5 吨的客车。','城际客运','天刚亮，它已经记起下一座城。','巡行'],
 sedan:passenger,suv:passenger};
 window.residentProfile=(kind,obj)=>{
 if(obj&&window.ArchiveCatalog.studyKind(obj)){
   const [role,story,note]=window.streetStudyInfo(obj),driving=kind==='van'||kind==='mpv',powered=kind==='camera-pole';
   return {role,story,note,value:driving?'动力 → 车轮':powered?'电 → 影像':kind==='bike-rack'?'停放':'被动结构',unit:'使用阶段 / 机能示意',mood:driving?'稳行':powered?'值守':'静候',source:'现场记录',url:null};
 }
 const item=motor[kind];
 if(item){const [value,note,role,story,mood]=item;return {value,note:note+' 仅作同类参照。',role,story,mood,unit:'节能车型限值示例 · L/100 km',source:'车船税优惠技术要求',url:policy};}
 if(kind==='streetlight')return {value:'电 → 光',unit:'照明能耗 / LED 参照',note:'灯具配光与驱动电源效率，会影响照亮路面所需的电量。',role:'夜间照明',story:'白天它安静站着，夜里把街角留给归来的人。',mood:'守夜',source:'美国能源部 · LED Basics',url:'https://www.energy.gov/cmei/ssl/led-basics'};
 return {value:'电 → 动力',unit:'电驱动原理 / 同类参照',note:'以电驱车辆为例，储存在电池中的电能供给驱动电机。',role:'短途出行',story:'路口一放行，它便轻轻起步。',mood:'轻行',source:'美国能源部 · Electricity Basics',url:'https://afdc.energy.gov/fuels/electricity-basics'};
 };
})();