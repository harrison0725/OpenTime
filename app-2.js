function buildSchedule(){
 syncSettings();if(!validateSettings())return;

 // Remove manual blocks that became invalid after preference changes.
 state.pinned=state.pinned.filter(p=>validPlacement(p.date,p.start,p.end,p.id,p.taskId));

 const days=dayList();
 const schedule={};
 const remaining={};
 const dailyPlan={};

 state.tasks.filter(t=>!t.done).forEach(t=>{
   remaining[t.id]=dueMinutes(t);
   dailyPlan[t.id]={};
 });

 // Start every day with fixed commitments and manual/pinned work.
 for(const day of days){
   const ds=ymd(day);
   schedule[ds]=fixedForDate(ds).sort((a,b)=>a.start-b.start);
 }

 // -------- WEEKLY DISTRIBUTION PHASE --------
 // Decide how much of each task belongs on EACH DAY before placing exact times.
 // This prevents one day's timeline from consuming the whole assignment.
 for(const t of state.tasks.filter(t=>!t.done)){
   let rem=remaining[t.id];
   if(rem<=0)continue;

   const due=new Date(t.due);
   const eligible=days.filter(d=>{
     const dayStart=new Date(d);dayStart.setHours(0,0,0,0);
     const ds=ymd(d);
     return dayStart<=due&&taskCanUseDate(t,ds);
   });

   if(!eligible.length)continue;

   // Automatic mode keeps a one-day buffer when possible.
   // Custom mode honors the user's exact requested session count across every
   // eligible day up to the deadline.
   let workDays=eligible.slice();
   if(t.splitMode!=='custom'){
     if(workDays.length>=3) workDays=workDays.slice(0,-1);
     if(!workDays.length) workDays=eligible.slice(0,1);
   }

   let desiredSessions;
   let targetSessionMinutes;

   if(t.splitMode==='custom'){
     const requestedTotal=Math.max(1,+t.splitCount||1);
     const pinnedCount=pinnedSessionsForTask(t.id).length;
     desiredSessions=Math.max(0,requestedTotal-pinnedCount);
     targetSessionMinutes=Math.max(15,+t.splitMinutes||state.settings.block);

     if(desiredSessions>eligible.length){
       desiredSessions=eligible.length;
     }

     if(desiredSessions===0) continue;
   }else{
     if(rem<=Math.max(state.settings.block,45)){
       desiredSessions=1;
       targetSessionMinutes=rem;
     }else{
       desiredSessions=Math.min(workDays.length,Math.max(2,Math.ceil(rem/state.settings.block)));
       targetSessionMinutes=state.settings.block;
     }
   }

   const pinnedDates=new Set(pinnedSessionsForTask(t.id).map(p=>p.date));
   let sourceDays=t.splitMode==='custom'
     ? eligible.filter(d=>!pinnedDates.has(ymd(d)))
     : workDays;

   if(!sourceDays.length) sourceDays=t.splitMode==='custom'?eligible:workDays;
   const chosen=[];
   if(desiredSessions===1){
     chosen.push(sourceDays[Math.min(1,sourceDays.length-1)]);
   }else{
     for(let i=0;i<desiredSessions;i++){
       const idx=Math.floor(i*(sourceDays.length)/desiredSessions);
       const d=sourceDays[Math.min(idx,sourceDays.length-1)];
       if(!chosen.some(x=>ymd(x)===ymd(d))) chosen.push(d);
     }
     if(chosen.length<desiredSessions){
       for(const d of sourceDays){
         if(chosen.length>=desiredSessions)break;
         if(!chosen.some(x=>ymd(x)===ymd(d)))chosen.push(d);
       }
     }
   }

   let left=rem;
   for(let i=0;i<chosen.length&&left>0;i++){
     const sessionsLeft=chosen.length-i;
     let amount;

     if(t.splitMode==='custom'){
       const reserveForLater=Math.max(0,(sessionsLeft-1)*15);
       const maxNow=Math.max(15,left-reserveForLater);
       amount=Math.min(targetSessionMinutes,maxNow);
       if(sessionsLeft===1) amount=left;
     }else{
       amount=Math.ceil((left/sessionsLeft)/15)*15;
       amount=Math.min(left,Math.max(15,amount));
       if(i<chosen.length-1) amount=Math.min(amount,targetSessionMinutes);
     }

     dailyPlan[t.id][ymd(chosen[i])]=amount;
     left-=amount;
   }

   if(left>0&&chosen.length){
     const ds=ymd(chosen[chosen.length-1]);
     dailyPlan[t.id][ds]=(dailyPlan[t.id][ds]||0)+left;
   }
 }

 for(const day of days){
   const ds=ymd(day),ws=effectiveWorkStartForDate(ds),we=toMin(state.settings.workEnd);

   const todaysTasks=state.tasks
     .filter(t=>!t.done&&(dailyPlan[t.id]?.[ds]||0)>0&&taskCanUseDate(t,ds))
     .sort((a,b)=>scoreTask(b,day)-scoreTask(a,day));

   for(const t of todaysTasks){
     let leftToday=dailyPlan[t.id][ds]||0;
     const deadline=Math.min(we,taskDeadlineMinuteOnDate(t,ds));
     if(deadline<=ws)continue;

     const occupied=schedule[ds].slice().sort((a,b)=>a.start-b.start);
     let gaps=[],cursor=ws;
     for(const b of occupied){
       if(b.end<=ws||b.start>=deadline)continue;
       const bs=Math.max(ws,b.start),be=Math.min(deadline,b.end+((b.type==='task'||b.type==='weeklytask')?state.settings.breakMins:0));
       if(cursor<bs)gaps.push([cursor,bs]);
       cursor=Math.max(cursor,be);
     }
     if(cursor<deadline)gaps.push([cursor,deadline]);

     if(state.settings.preferEvening&&!state.settings.preferMorning)gaps.sort((a,b)=>b[0]-a[0]);
     else gaps.sort((a,b)=>a[0]-b[0]);

     if(t.splitMode==='custom'){
       const needed=leftToday;
       const fitting=gaps.find(([s,e])=>e-s>=needed);
       if(fitting){
         const blockStart=state.settings.preferEvening&&!state.settings.preferMorning?fitting[1]-needed:fitting[0];
         schedule[ds].push({type:'task',taskId:t.id,name:t.name,start:blockStart,end:blockStart+needed,pinned:false,auto:true,spread:true});
         remaining[t.id]-=needed;
       }
       continue;
     }

     for(let i=0;i<gaps.length&&leftToday>0;i++){
       let [s,e]=gaps[i],avail=e-s;
       while(leftToday>0&&avail>=Math.min(15,leftToday)){
         let use=Math.min(leftToday,state.settings.block,avail);
         if(leftToday>=15){
           use=Math.floor(use/15)*15;
           if(use<15&&avail>=15)use=15;
         }else{
           use=Math.min(leftToday,avail);
         }
         if(use<=0)break;
         const blockStart=state.settings.preferEvening&&!state.settings.preferMorning?e-use:s;
         schedule[ds].push({type:'task',taskId:t.id,name:t.name,start:blockStart,end:blockStart+use,pinned:false,auto:true,spread:true});
         leftToday-=use;
         remaining[t.id]-=use;
         if(state.settings.preferEvening&&!state.settings.preferMorning){
           e=blockStart-state.settings.breakMins;
           avail=e-s;
         }else{
           s=blockStart+use+state.settings.breakMins;
           avail=e-s;
         }
       }
     }
   }

   schedule[ds].sort((a,b)=>a.start-b.start);
 }

 state._schedule=schedule;
 state._remaining=remaining;
 state._dailyPlan=dailyPlan;
 persist();
 render();
}
