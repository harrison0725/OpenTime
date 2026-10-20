function addTask(){
 const name=$('taskName').value.trim(),due=$('taskDue').value,mins=+$('taskMinutes').value,priority=+$('taskPriority').value;
 const splitMode=$('splitMode').value;
 const splitCount=Math.max(1,+$('splitCount').value||1);
 const splitMinutes=Math.max(15,+$('splitMinutes').value||15);
 if(!name||!due||mins<=0){alert('Add a task, due date, and estimated time.');return}
 if(new Date(due)<=new Date()){alert('The due date must be in the future.');return}
 if(splitMode==='custom' && splitCount*splitMinutes<mins){
   alert(`That custom split only covers ${splitCount*splitMinutes} minutes, but the task needs ${mins}. Increase the number of sessions or minutes per session.`);
   return;
 }
 if(splitMode==='custom' && mins<splitCount*15){
   alert(`To create exactly ${splitCount} sessions, the task needs at least ${splitCount*15} total minutes (15 minutes minimum per session).`);
   return;
 }
 state.tasks.push({id:id(),name,due,minutes:mins,priority,done:false,splitMode,splitCount,splitMinutes});
 $('taskName').value='';$('taskMinutes').value=60;$('splitMode').value='auto';updateSplitControls();buildSchedule();
}
function addBusy(){
 const date=$('busyDate').value,name=$('busyName').value.trim()||'Busy',start=$('busyStart').value,end=$('busyEnd').value;
 if(!date||toMin(end)<=toMin(start)){alert('Choose a date and valid time range.');return}
 const cand={start:toMin(start),end:toMin(end)};
 for(const b of fixedForDate(date)){if(overlap(cand,b)){alert('That overlaps something already on the calendar.');return}}
 state.busy.push({id:id(),date,name,start,end});$('busyName').value='';buildSchedule();
}
function addProtected(){
 const date=$('freeDate').value,name=$('freeName').value.trim()||'Protected time',start=$('freeStart').value,end=$('freeEnd').value;
 if(!date||toMin(end)<=toMin(start)){alert('Choose a date and valid time range.');return}
 const cand={start:toMin(start),end:toMin(end)};
 for(const b of fixedForDate(date)){if(overlap(cand,b)){alert('That overlaps something already on the calendar.');return}}
 state.protected.push({id:id(),date,name,start,end});$('freeName').value='';buildSchedule();
}
function addWeekly(){
 const kind=$('weeklyType').value;
 const name=$('weeklyName').value.trim();
 const day=+$('weeklyDay').value;
 const start=$('weeklyStart').value;
 const end=$('weeklyEnd').value;
 if(!name){alert('Give the weekly routine a name.');return}
 if(toMin(end)<=toMin(start)){alert('End time must be after start time.');return}
 const cand={start:toMin(start),end:toMin(end)};
 const clash=state.weekly.some(w=>+w.day===day && overlap(cand,{start:toMin(w.start),end:toMin(w.end)}));
 if(clash){alert('That overlaps another weekly routine on the same day.');return}
 const visibleConflict=dayList().some(d=>{
   if(d.getDay()!==day)return false;
   const ds=ymd(d);
   return [...state.busy.filter(b=>b.date===ds).map(b=>({start:toMin(b.start),end:toMin(b.end)})),...state.protected.filter(b=>b.date===ds).map(b=>({start:toMin(b.start),end:toMin(b.end)})),...state.pinned.filter(p=>p.date===ds).map(p=>({start:p.start,end:p.end}))].some(b=>overlap(cand,b));
 });
 if(visibleConflict){alert('That weekly routine conflicts with an existing item in the visible week. Move or remove the conflicting item first.');return}
 state.weekly.push({id:id(),kind,name,day,start,end});
 $('weeklyName').value='';buildSchedule();
}
function deleteWeekly(idv){state.weekly=state.weekly.filter(w=>w.id!==idv);buildSchedule();}
function toggleTask(taskId){const t=state.tasks.find(x=>x.id===taskId);if(!t)return;t.done=!t.done;if(t.done)state.pinned=state.pinned.filter(p=>p.taskId!==taskId);buildSchedule();}
function deleteTask(taskId){state.tasks=state.tasks.filter(t=>t.id!==taskId);state.pinned=state.pinned.filter(p=>p.taskId!==taskId);buildSchedule()}
function deleteBusy(idv){state.busy=state.busy.filter(x=>x.id!==idv);buildSchedule()}
function deleteProtected(idv){state.protected=state.protected.filter(x=>x.id!==idv);buildSchedule()}
function pinAutoBlock(b,date,newStart=null){
 const t=state.tasks.find(x=>x.id===b.taskId);if(!t)return;
 const dur=b.end-b.start,start=newStart??b.start,end=start+dur;
 if(!validPlacement(date,start,end,null,b.taskId)){alert('That spot conflicts with another block, is outside your work window, or falls after the task deadline.');return}
 state.pinned.push({id:id(),taskId:b.taskId,date,start,end,manual:true});buildSchedule();
}
function movePinned(pinId,newDate,newStart){
 const p=state.pinned.find(x=>x.id===pinId);if(!p)return;const dur=p.end-p.start,end=newStart+dur;
 if(!validPlacement(newDate,newStart,end,pinId,p.taskId)){alert('That spot conflicts with another block, is outside your work window, or falls after the task deadline.');return}
 p.date=newDate;p.start=newStart;p.end=end;buildSchedule();
}
function unpin(pinId){state.pinned=state.pinned.filter(p=>p.id!==pinId);buildSchedule()}
function resizePinned(pinId,edge,newMinute){
 const p=state.pinned.find(x=>x.id===pinId);if(!p)return;
 let ns=p.start,ne=p.end;
 if(edge==='top')ns=Math.min(newMinute,p.end-15);else ne=Math.max(newMinute,p.start+15);
 ns=Math.round(ns/15)*15;ne=Math.round(ne/15)*15;
 const task=state.tasks.find(t=>t.id===p.taskId);if(!task){buildSchedule();return}
 if(taskMinutesPinnedExcluding(p.taskId,pinId)+(ne-ns)>task.minutes){alert('That resize would schedule more time than this task requires.');buildSchedule();return}
 if(!validPlacement(p.date,ns,ne,pinId,p.taskId)){alert('That resize would overlap something, leave your work window, or extend past the task deadline.');buildSchedule();return}
 p.start=ns;p.end=ne;buildSchedule();
}
function dragData(e,obj){e.dataTransfer.setData('text/plain',JSON.stringify(obj));e.dataTransfer.effectAllowed='move'}
function onDrop(e,date,min){e.preventDefault();let data;try{data=JSON.parse(e.dataTransfer.getData('text/plain'))}catch{return}const start=Math.round(min/15)*15;if(data.kind==='auto')pinAutoBlock(data.block,date,start);if(data.kind==='pin')movePinned(data.pinId,date,start);}
let resizeCtx=null;
function beginResize(e,pinId,edge,date){e.preventDefault();e.stopPropagation();resizeCtx={pinId,edge,date,timeline:$('timeline'),startY:e.clientY};document.addEventListener('pointermove',resizeMove);document.addEventListener('pointerup',resizeEnd,{once:true});}
function resizeMove(e){if(!resizeCtx)return;const rect=resizeCtx.timeline.getBoundingClientRect(),wake=toMin(state.settings.wake);let min=wake+(e.clientY-rect.top)/PPM;min=Math.round(min/15)*15;const p=state.pinned.find(x=>x.id===resizeCtx.pinId);if(!p)return;let ns=p.start,ne=p.end;if(resizeCtx.edge==='top')ns=Math.min(min,p.end-15);else ne=Math.max(min,p.start+15);const el=document.querySelector(`[data-pin="${resizeCtx.pinId}"]`);if(!el)return;const top=(ns-wake)*PPM,h=(ne-ns)*PPM;el.style.top=top+'px';el.style.height=Math.max(22,h-2)+'px';}
function resizeEnd(e){if(!resizeCtx)return;const rect=resizeCtx.timeline.getBoundingClientRect(),wake=toMin(state.settings.wake);let min=wake+(e.clientY-rect.top)/PPM;min=Math.round(min/15)*15;const c=resizeCtx;resizeCtx=null;document.removeEventListener('pointermove',resizeMove);resizePinned(c.pinId,c.edge,min);}
