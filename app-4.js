function renderTabs(){
 const tabs=$('dayTabs');tabs.innerHTML='';const days=dayList();
 if(!state.selectedDate||!days.some(d=>ymd(d)===state.selectedDate))state.selectedDate=ymd(days[0]);
 days.forEach(d=>{const ds=ymd(d),b=document.createElement('button');b.type='button';b.className='daytab'+(ds===state.selectedDate?' active':'');b.textContent=d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});b.addEventListener('click',()=>{state.selectedDate=ds;persist();render()});tabs.appendChild(b)});
}
function renderTimeline(){
 const date=state.selectedDate,wake=toMin(state.settings.wake),sleep=toMin(state.settings.sleep),tl=$('timeline'),axis=$('timeAxis');
 const height=(sleep-wake)*PPM;tl.style.height=height+'px';axis.style.height=height+'px';tl.innerHTML='';axis.innerHTML='';
 for(let m=wake;m<=sleep;m+=60){const t=document.createElement('div');t.className='tick';t.style.top=((m-wake)*PPM)+'px';t.textContent=fmtTime(m);axis.appendChild(t)}
 for(let m=wake;m<sleep;m+=15){const s=document.createElement('div');s.className='slot';s.style.top=((m-wake)*PPM)+'px';s.style.height=(15*PPM)+'px';
   s.addEventListener('dragover',ev=>{ev.preventDefault();s.classList.add('dragover')});s.addEventListener('dragleave',()=>s.classList.remove('dragover'));s.addEventListener('drop',ev=>onDrop(ev,date,m));tl.appendChild(s)}
 const blocks=(state._schedule&&state._schedule[date])||[];
 const now=new Date(),same=ymd(now)===date,cur=now.getHours()*60+now.getMinutes();
 blocks.forEach(b=>{
   if(b.end<=wake||b.start>=sleep)return;
   const el=document.createElement('div');el.className='block '+(b.type==='weeklytask'?'task':b.type);
   if(same&&b.end<=cur)el.classList.add('past');else if(same&&b.start<=cur&&b.end>cur)el.classList.add('current');
   el.style.top=((b.start-wake)*PPM)+'px';el.style.height=Math.max(22,(b.end-b.start)*PPM-2)+'px';
   if(b.type==='task'){
     if(b.pinned){
       const pin=state.pinned.find(p=>p.taskId===b.taskId&&p.date===date&&p.start===b.start&&p.end===b.end);
       if(pin){el.dataset.pin=pin.id;el.draggable=true;el.addEventListener('dragstart',e=>dragData(e,{kind:'pin',pinId:pin.id}));
         const top=document.createElement('div');top.className='resize top';top.addEventListener('pointerdown',e=>beginResize(e,pin.id,'top',date));
         const bot=document.createElement('div');bot.className='resize bottom';bot.addEventListener('pointerdown',e=>beginResize(e,pin.id,'bottom',date));el.append(top,bot)}
     }else{el.draggable=true;el.addEventListener('dragstart',e=>dragData(e,{kind:'auto',block:b}))}
   }
   el.insertAdjacentHTML('beforeend',`<div class="btitle">${b.type==='task'||b.type==='weeklytask'?'📚 ':b.type==='protected'?'✨ ':'◻ '}${esc(b.name)}</div><div class="bmeta">${fmtTime(b.start)}–${fmtTime(b.end)} · ${b.end-b.start} min${b.type==='task'&&b.pinned?' · manual':''}${b.recurring?' · every week':''}</div>`);
   if(b.type==='task'&&b.pinned){
     const pin=state.pinned.find(p=>p.taskId===b.taskId&&p.date===date&&p.start===b.start&&p.end===b.end);
     const a=document.createElement('div');a.className='mini-actions';a.innerHTML='<button class="mini auto" type="button">Auto</button>';
     a.querySelector('.auto').addEventListener('click',()=>unpin(pin.id));el.appendChild(a);
   }
   if(b.type==='protected'&&!b.recurring){
     const a=document.createElement('div');a.className='mini-actions';a.innerHTML='<button class="mini remove" type="button">Unprotect</button>';
     a.querySelector('.remove').addEventListener('click',()=>deleteProtected(b.id));el.appendChild(a);
   }
   if(b.recurring){
     const a=document.createElement('div');a.className='mini-actions';a.innerHTML='<button class="mini remove" type="button">Remove weekly</button>';
     a.querySelector('.remove').addEventListener('click',()=>deleteWeekly(b.weeklyId));el.appendChild(a);
   }
   tl.appendChild(el);
 });
 let occ=blocks.slice().sort((a,b)=>a.start-b.start),cursor=wake;
 for(const b of occ){if(cursor<b.start&&b.start-cursor>=45){const l=document.createElement('div');l.className='free-label';l.style.top=((cursor-wake)*PPM+5)+'px';l.textContent=`free · ${b.start-cursor} min`;tl.appendChild(l)}cursor=Math.max(cursor,b.end)}
 if(cursor<sleep&&sleep-cursor>=45){const l=document.createElement('div');l.className='free-label';l.style.top=((cursor-wake)*PPM+5)+'px';l.textContent=`free · ${sleep-cursor} min`;tl.appendChild(l)}
}
function renderList(){
 const list=$('taskList');list.innerHTML='';
 if(!state.tasks.length&&!state.busy.length&&!state.protected.length&&!state.weekly.length){list.innerHTML='<div class="empty">Nothing added yet.</div>';return}
 [...state.tasks].sort((a,b)=>new Date(a.due)-new Date(b.due)).forEach(t=>{
   const rem=state._remaining?state._remaining[t.id]:t.minutes,row=document.createElement('div');row.className='taskrow'+(t.done?' done':'');
   const dueDate=new Date(t.due);
   const planned=state._dailyPlan?.[t.id]||{};
   const planEntries=Object.entries(planned).filter(([,mins])=>mins>0);
   const spreadText=planEntries.length ? planEntries.map(([ds,mins])=>`${parseYMD(ds).toLocaleDateString(undefined,{weekday:'short'})} ${mins}m`).join(' · ') : 'No automatic sessions yet';
   const manualCount=pinnedSessionsForTask(t.id).length;
   const splitLabel=t.splitMode==='custom' ? `custom: ${t.splitCount} total session${t.splitCount!==1?'s':''} × up to ${t.splitMinutes}m${manualCount?` · ${manualCount} manually placed`:''}` : `automatic split${manualCount?` · ${manualCount} manually placed`:''}`;
   row.innerHTML=`<div><div class="task-title">${esc(t.name)}</div><div class="task-meta">${t.minutes} min total · ${splitLabel} · ${Math.max(0,rem||0)} min left · ${spreadText} · due ${dueDate.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</div></div><div class="actions"><button class="iconbtn done" type="button">${t.done?'↩':'✓'}</button><button class="iconbtn del" type="button">×</button></div>`;
   row.querySelector('.done').addEventListener('click',()=>toggleTask(t.id));row.querySelector('.del').addEventListener('click',()=>deleteTask(t.id));list.appendChild(row);
 });
 [...state.busy].sort((a,b)=>a.date.localeCompare(b.date)).forEach(b=>{const row=document.createElement('div');row.className='taskrow';row.innerHTML=`<div><div class="task-title">${esc(b.name)}</div><div class="task-meta">${b.date} · ${b.start}–${b.end}</div></div><button class="iconbtn del" type="button">×</button>`;row.querySelector('.del').addEventListener('click',()=>deleteBusy(b.id));list.appendChild(row)});
 [...state.protected].sort((a,b)=>a.date.localeCompare(b.date)).forEach(b=>{const row=document.createElement('div');row.className='taskrow';row.innerHTML=`<div><div class="task-title">${esc(b.name)}</div><div class="task-meta">${b.date} · ${b.start}–${b.end} · protected</div></div><button class="iconbtn del" type="button">×</button>`;row.querySelector('.del').addEventListener('click',()=>deleteProtected(b.id));list.appendChild(row)});
 const weekdayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
 [...state.weekly].sort((a,b)=>(a.day-b.day)||a.start.localeCompare(b.start)).forEach(w=>{
   const row=document.createElement('div');row.className='taskrow';
   const label=w.kind==='task'?'Weekly task':w.kind==='commitment'?'Weekly commitment':'Weekly personal';
   row.innerHTML=`<div><div class="task-title">${esc(w.name)}</div><div class="task-meta">${weekdayNames[w.day]} · ${w.start}–${w.end} · ${label}</div><span class="chip">Repeats weekly</span></div><button class="iconbtn del" type="button">×</button>`;
   row.querySelector('.del').addEventListener('click',()=>deleteWeekly(w.id));list.appendChild(row);
 });
}
function render(){
 const today=new Date();$('todayLabel').textContent=today.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
 const active=state.tasks.filter(t=>!t.done),total=active.reduce((a,t)=>a+t.minutes,0),uns=state._remaining?Object.values(state._remaining).reduce((a,b)=>a+b,0):total;
 $('summary').textContent=`${active.length} open task${active.length!==1?'s':''}. Manual blocks stay fixed while the rest of the week reflows.`;
 $('stats').innerHTML=`<span class="stat">${active.length} open tasks</span><span class="stat">${state.weekly.length} weekly routines</span><span class="stat">${state.pinned.length} manual work blocks</span><span class="stat">${Math.floor(uns/60)}h ${uns%60}m remaining across week</span>`;
 renderTabs();renderTimeline();renderList();
 const overdue=active.filter(t=>new Date(t.due)<new Date()).length;
 const warn=$('warning');if(overdue){warn.style.display='block';warn.textContent=`${overdue} task${overdue>1?'s are':' is'} already past due.`}else if(uns>0){warn.style.display='block';warn.textContent=`${Math.floor(uns/60)}h ${uns%60}m could not be scheduled in the visible ${DAY_COUNT}-day plan before the relevant deadlines. Add available work time, reduce task duration, or adjust a deadline.`}else warn.style.display='none';
}
function defaultsForDates(){
 const d=new Date(),ds=ymd(d);$('busyDate').value=ds;$('freeDate').value=ds;$('weeklyDay').value=String(d.getDay());
 if(!$('taskDue').value){const due=new Date();due.setDate(due.getDate()+1);due.setHours(23,59,0,0);$('taskDue').value=new Date(due.getTime()-due.getTimezoneOffset()*60000).toISOString().slice(0,16)}
}
function updateSplitControls(){
 const custom=$('splitMode').value==='custom';$('customSplitControls').style.display=custom?'grid':'none';
 const total=+$('taskMinutes').value||0;const count=Math.max(1,+$('splitCount').value||1);const per=Math.max(15,+$('splitMinutes').value||15);
 if(!custom){$('splitPreview').textContent='OpenTime will choose the number and length of sessions automatically.';}
 else if(total<=0){$('splitPreview').textContent=`Custom plan: ${count} session${count!==1?'s':''}, up to ${per} minutes each.`;}
 else if(count*per<total){$('splitPreview').textContent=`Not enough capacity: this covers ${count*per} of ${total} minutes.`;}
 else if(total<count*15){$('splitPreview').textContent=`Cannot make exactly ${count} sessions: each session needs at least 15 minutes.`;}
 else{const lengths=[];let left=total;for(let i=0;i<count;i++){const sessionsLeft=count-i;const reserve=(sessionsLeft-1)*15;let use=sessionsLeft===1?left:Math.min(per,Math.max(15,left-reserve));lengths.push(use);left-=use;}$('splitPreview').textContent=`Exact ${count}-session split: ${lengths.join(' + ')} min.`;}
}
