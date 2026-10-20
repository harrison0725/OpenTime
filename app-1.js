const KEY='opentime-v06';
const $=id=>document.getElementById(id);
const defaults={
  tasks:[],busy:[],protected:[],pinned:[],weekly:[],
  settings:{wake:'07:30',sleep:'23:30',workStart:'09:00',workEnd:'20:00',block:60,breakMins:15,preferMorning:false,preferEvening:false},
  selectedDate:null
};
let state;
try{state=JSON.parse(localStorage.getItem(KEY))||defaults}catch(e){state=defaults}
state={...defaults,...state,settings:{...defaults.settings,...(state.settings||{})}};
state.tasks=Array.isArray(state.tasks)?state.tasks:[];state.busy=Array.isArray(state.busy)?state.busy:[];state.protected=Array.isArray(state.protected)?state.protected:[];state.pinned=Array.isArray(state.pinned)?state.pinned:[];state.weekly=Array.isArray(state.weekly)?state.weekly:[];

const DAY_COUNT=7, PPM=1.05;
function persist(){localStorage.setItem(KEY,JSON.stringify(state))}
function id(){return String(Date.now()+Math.random())}
function pad(n){return String(n).padStart(2,'0')}
function ymd(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function parseYMD(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,0,0,0,0)}
function toMin(t){const [h,m]=t.split(':').map(Number);return h*60+m}
function hhmm(m){m=Math.max(0,Math.min(1439,Math.round(m/15)*15));return `${pad(Math.floor(m/60))}:${pad(m%60)}`}
function fmtTime(m){let h=Math.floor(m/60),mm=m%60,ap=h>=12?'PM':'AM',hh=h%12||12;return `${hh}:${pad(mm)} ${ap}`}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function overlap(a,b){return a.start<b.end&&b.start<a.end}
function dayList(){const arr=[],d=new Date();d.setHours(0,0,0,0);for(let i=0;i<DAY_COUNT;i++){const x=new Date(d);x.setDate(d.getDate()+i);arr.push(x)}return arr}
function dueMinutes(t){return Math.max(0,t.minutes-(state.pinned.filter(p=>p.taskId===t.id).reduce((a,p)=>a+(p.end-p.start),0)))}
function pinnedSessionsForTask(taskId){return state.pinned.filter(p=>p.taskId===taskId)}
function taskDeadlineMinuteOnDate(task,date){
 const due=new Date(task.due),ds=ymd(parseYMD(date)),dueDs=ymd(due);
 if(ds<dueDs)return 1440;
 if(ds>dueDs)return -1;
 return due.getHours()*60+due.getMinutes();
}
function effectiveWorkStartForDate(date){
 let start=toMin(state.settings.workStart);
 const now=new Date();
 if(date===ymd(now)){
   const current=now.getHours()*60+now.getMinutes();
   start=Math.max(start,Math.ceil(current/15)*15);
 }
 return start;
}
function taskCanUseDate(task,date){
 const deadline=Math.min(toMin(state.settings.workEnd),taskDeadlineMinuteOnDate(task,date));
 return deadline>effectiveWorkStartForDate(date);
}
function taskMinutesPinnedExcluding(taskId,pinId=null){return state.pinned.filter(p=>p.taskId===taskId&&p.id!==pinId).reduce((a,p)=>a+(p.end-p.start),0)}
function scoreTask(t,day){
  const due=new Date(t.due);const hrs=Math.max(.25,(due-day)/36e5);
  return (t.priority*1200)/hrs + dueMinutes(t);
}
function syncSettings(){
 state.settings.wake=$('wakeTime').value;state.settings.sleep=$('sleepTime').value;state.settings.workStart=$('workStart').value;state.settings.workEnd=$('workEnd').value;
 state.settings.block=+$('blockLength').value;state.settings.breakMins=+$('breakLength').value;state.settings.preferMorning=$('preferMorning').checked;state.settings.preferEvening=$('preferEvening').checked;
}
function syncUI(){
 if(state.settings.preferMorning&&state.settings.preferEvening)state.settings.preferEvening=false;
 $('wakeTime').value=state.settings.wake;$('sleepTime').value=state.settings.sleep;$('workStart').value=state.settings.workStart;$('workEnd').value=state.settings.workEnd;
 $('blockLength').value=String(state.settings.block);$('breakLength').value=String(state.settings.breakMins);$('preferMorning').checked=!!state.settings.preferMorning;$('preferEvening').checked=!!state.settings.preferEvening;
}
function validateSettings(){
 const wake=toMin(state.settings.wake),sleep=toMin(state.settings.sleep),ws=toMin(state.settings.workStart),we=toMin(state.settings.workEnd);
 if(sleep<=wake){alert('Sleep must be after wake time in this version.');return false}
 if(ws<wake||we>sleep||we<=ws){alert('Your work window must sit inside wake and sleep time.');return false}
 return true;
}
function dateOfPinned(p){return p.date}
function fixedForDate(date){
 const dow=parseYMD(date).getDay();
 const weeklyBlocks=state.weekly.filter(w=>+w.day===dow).map(w=>{
   const blockType=w.kind==='personal'?'protected':w.kind==='commitment'?'busy':'weeklytask';
   return {
     type:blockType,
     id:w.id,
     weeklyId:w.id,
     name:w.name,
     start:toMin(w.start),
     end:toMin(w.end),
     recurring:true,
     kind:w.kind
   };
 });
 return [
  ...state.busy.filter(b=>b.date===date).map(b=>({type:'busy',id:b.id,name:b.name,start:toMin(b.start),end:toMin(b.end)})),
  ...state.protected.filter(b=>b.date===date).map(b=>({type:'protected',id:b.id,name:b.name,start:toMin(b.start),end:toMin(b.end)})),
  ...weeklyBlocks,
  ...state.pinned.filter(p=>p.date===date).map(p=>({type:'task',id:p.id,taskId:p.taskId,name:(state.tasks.find(t=>t.id===p.taskId)||{}).name||'Task',start:p.start,end:p.end,pinned:true}))
 ];
}
function validPlacement(date,start,end,ignorePinId=null,taskId=null){
 const wake=toMin(state.settings.wake),sleep=toMin(state.settings.sleep),ws=toMin(state.settings.workStart),we=toMin(state.settings.workEnd);
 if(start<wake||end>sleep||start<ws||end>we||end<=start)return false;
 if(taskId){
   const task=state.tasks.find(t=>t.id===taskId);if(!task)return false;
   const deadline=taskDeadlineMinuteOnDate(task,date);
   if(deadline<0||end>deadline||start<effectiveWorkStartForDate(date))return false;
 }
 const cand={start,end};
 for(const b of fixedForDate(date)){
   if(ignorePinId&&b.type==='task'&&b.id===ignorePinId)continue;
   if(overlap(cand,b))return false;
 }
 return true;
}
