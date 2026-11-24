/* ============================================================
   Quiz Craft — teacher features
   Uses shared top-level state from app.js and student.js.
   Keep this as a classic script (not type="module").
   ============================================================ */

let teacherStatsAutoLoadOwner='';
function loadTeacherIntegrationState(){
  const teacher=currentTeacherSession();
  if(el.teacherCodeLabel)el.teacherCodeLabel.textContent='Mã GV: '+(teacher?window.quizCraftSession.teacherId:'Chưa đăng nhập');
  if(!teacher){teacherExamCatalog=[];teacherSelectedExamIds=null;teacherCatalogOwner='';teacherClassSelectionInitialized=false;if(el.teacherExamMulti)el.teacherExamMulti.replaceChildren();if(el.teacherClassMulti)el.teacherClassMulti.replaceChildren();if(el.teacherExamCatalogCount)el.teacherExamCatalogCount.textContent='Đăng nhập giáo viên để tải danh sách đề của tài khoản.';}
  if(el.sheetConnectionStatus)el.sheetConnectionStatus.textContent=teacher?'Đã kết nối. Tài khoản giáo viên đã xác thực.':'Kết nối Google Sheets tự động; hãy đăng nhập tài khoản giáo viên để mở thống kê.';
  if(teacher&&teacherStatsAutoLoadOwner!==window.quizCraftSession.teacherId){teacherStatsAutoLoadOwner=window.quizCraftSession.teacherId;setTeacherStatsLoading('Vui lòng chờ, đang tải danh sách đề...');setTimeout(()=>loadTeacherStats(),0);}else if(!teacher)teacherStatsAutoLoadOwner='';
}
function appsScriptJsonpDirect(params){if(window.__qcSupabaseBridge){const sb=window.__qcSupabaseBridge(params);if(sb)return sb;}
  return new Promise((resolve,reject)=>{
    let endpoint;try{endpoint=new URL(appsScriptUrl);}catch(e){return reject(new Error('URL Apps Script không hợp lệ.'));}
    const callback='quizCraftCallback_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
    const script=document.createElement('script');let settled=false;
    const cleanup=()=>{if(settled)return;settled=true;clearTimeout(timer);delete window[callback];script.remove();};
    const timer=setTimeout(()=>{cleanup();reject(new Error('Apps Script không phản hồi. Hãy kiểm tra quyền triển khai Web App.'));},15000);
    window[callback]=data=>{cleanup();resolve(data);};
    Object.entries({...params,callback}).forEach(([key,value])=>endpoint.searchParams.set(key,String(value??'')));
    script.onerror=()=>{cleanup();reject(new Error('Không tải được Apps Script.'));};
    script.src=endpoint.toString();document.head.append(script);
  });
}
function qcIsGitHubPages(){return /(^|\.)github\.io$/i.test(String(location.hostname||''));}
function qcAppUrl(path){return new URL(String(path||'').replace(/^\/+/,''),document.baseURI).toString();}
async function appsScriptJsonp(params){
  if(params && ['requestOtp','verifyOtp','registerExam','deleteProject'].includes(params.action)) return appsScriptJsonpDirect(params);
  // GitHub Pages không có Netlify Function /api/quizcraft; gọi Apps Script/Supabase trực tiếp.
  if(!qcIsGitHubPages()&&(location.protocol==='http:'||location.protocol==='https:')){
    try{
      const response=await fetch(qcAppUrl('api/quizcraft'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params)});
      if(response.ok)return await response.json();
    }catch(error){}
  }
  return appsScriptJsonpDirect(params);
}
async function qcApiPost(params){
  if(qcIsGitHubPages()){
    throw new Error('GitHub Pages không hỗ trợ API /api/quizcraft để xuất link trực tuyến. Hãy dùng “Tải file học sinh” để tạo HTML độc lập; link sẽ dùng đường dẫn tương đối của repository.');
  }
  const response=await fetch(qcAppUrl('api/quizcraft'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params)});
  let data;try{data=await response.json();}catch(e){throw new Error('API hosting trả về dữ liệu không hợp lệ.');}
  if(!response.ok)throw new Error(data&&data.error||'Không kết nối được API hosting.');
  return data;
}
function currentTeacherSession(){const s=window.quizCraftSession;if(!s)return null;if(!s.teacherId)s.teacherId=TEACHER_CODE;if(!s.sessionToken)s.sessionToken='SB-SESS-'+(s.uuid||Date.now());s.role='GIAOVIEN';return s;}
function teacherApiParams(extra){const s=currentTeacherSession();if(!s)throw new Error('Hãy đăng nhập bằng tài khoản giáo viên.');return {...extra,teacherId:s.teacherId,sessionToken:s.sessionToken,guestId:s.guestId};}

function selectedMultiValues(node){
  if(!node)return[];
  if(node.matches&&node.matches('.multi-check-list'))return Array.from(node.querySelectorAll('input[type="checkbox"]:checked')).map(input=>input.value).filter(Boolean);
  return[].slice.call(node.selectedOptions||[]).map(o=>o.value).filter(Boolean);
}
function fillMultiSelect(node,items,key,label,previous){
  if(!node)return;
  node.replaceChildren();
  (items||[]).forEach(item=>{
    const value=String(item[key]??'');if(!value)return;
    const wrapper=document.createElement('label');wrapper.className='multi-check-item';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=value;
    checkbox.checked=previous===null?true:(previous||[]).includes(value);
    const text=document.createElement('span');text.textContent=label(item);
    wrapper.append(checkbox,text);node.append(wrapper);
  });
  if(!node.children.length){const empty=document.createElement('p');empty.className='field-help';empty.textContent='Chưa có dữ liệu phù hợp.';node.append(empty);}
}
function renderTeacherExamOptions(){
  const node=el.teacherExamMulti;if(!node)return;
  const all=Array.isArray(teacherExamCatalog)?teacherExamCatalog:[];
  const classFilter=String(el.teacherExamClassFilter&&el.teacherExamClassFilter.value||'');
  const sort=String(el.teacherExamSort&&el.teacherExamSort.value||'date');
  const idsOf=x=>Array.isArray(x.examIds)&&x.examIds.length?x.examIds.map(String):[String(x.examId||'')].filter(Boolean);
  const classesOf=x=>Array.from(new Set([x.classCode,...(Array.isArray(x.takenClasses)?x.takenClasses:[])].filter(Boolean).map(String)));
  const visible=all.filter(x=>!classFilter||classesOf(x).includes(classFilter));
  visible.sort((a,b)=>{
    if(sort==='class')return classesOf(a).join(',').localeCompare(classesOf(b).join(','),'vi')||String(a.title||'').localeCompare(String(b.title||''),'vi');
    if(sort==='name')return String(a.title||'').localeCompare(String(b.title||''),'vi');
    return String(b.createdAt||'').localeCompare(String(a.createdAt||''));
  });
  const selected=new Set(teacherSelectedExamIds||[]);node.replaceChildren();
  visible.forEach(x=>{
    const wrapper=document.createElement('label');wrapper.className='multi-check-item';
    const ids=idsOf(x),groupValue=String(x.groupKey||x.examId||ids[0]);
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=groupValue;checkbox.checked=ids.some(id=>selected.has(id));
    const text=document.createElement('span');text.textContent=String(x.title||'Đề chưa đặt tên').trim()+(x.classCode?' · Lớp '+x.classCode:'');
    wrapper.append(checkbox,text);node.append(wrapper);
  });
  if(!visible.length){const empty=document.createElement('p');empty.className='field-help';empty.textContent=classFilter?'Không có đề nào thuộc lớp này.':'Tài khoản này chưa tạo đề nào.';node.append(empty);}
  if(el.teacherExamCatalogCount)el.teacherExamCatalogCount.textContent='Có '+all.length+' dự án · đang hiển thị '+visible.length+' · đã chọn '+visible.filter(x=>idsOf(x).some(id=>selected.has(id))).length+'. Mỗi dự án chỉ hiện một lần.';
}
function captureTeacherExamSelection(){
  const node=el.teacherExamMulti;if(!node)return;
  const boxes=Array.from(node.querySelectorAll('input[type="checkbox"]'));
  const idsVisible=new Set();boxes.forEach(input=>{const group=teacherExamCatalog.find(x=>String(x.groupKey||x.examId)===input.value);(group&&Array.isArray(group.examIds)?group.examIds:[group&&group.examId].filter(Boolean)).forEach(id=>idsVisible.add(String(id)));});
  const chosen=new Set(selectedMultiValues(node));teacherSelectedExamIds=(teacherSelectedExamIds||[]).filter(id=>!idsVisible.has(String(id)));
  boxes.forEach(input=>{if(!chosen.has(input.value))return;const group=teacherExamCatalog.find(x=>String(x.groupKey||x.examId)===input.value);(group&&Array.isArray(group.examIds)?group.examIds:[group&&group.examId].filter(Boolean)).forEach(id=>teacherSelectedExamIds.push(String(id)));});
  teacherSelectedExamIds=[...new Set(teacherSelectedExamIds)];
}
function teacherStudentIdentity(row){
  const stableId=String(row&& (row.studentId??row.studentKey??row.student_id??row.id_hs??row.id) || '').trim();
  if(stableId)return 'id:'+stableId;
  const name=String(row&&row.studentName||'').normalize('NFC').trim().toLocaleLowerCase().replace(/\s+/g,' ');
  const klass=String(row&&row.classCode||'').normalize('NFC').trim().toLocaleLowerCase();
  return 'name:'+name+'|class:'+klass;
}
function buildTeacherRankingRows(rows){
  const grouped=new Map();
  (Array.isArray(rows)?rows:[]).forEach(row=>{
    const key=teacherStudentIdentity(row);
    const history=Array.isArray(row.attemptHistory)?row.attemptHistory.slice():[];
    if(!history.length&&row.submittedAt){
      history.push({score:Number(row.latestScore??row.score??0),maxScore:Number(row.maxScore)||10,durationSeconds:Number(row.elapsedSeconds)||0,submittedAt:row.submittedAt,examId:row.examId||'',examTitle:row.examTitle||''});
    }
    const count=Math.max(1,Number(row.attemptCount)||history.length||1);
    const average=Number(row.averageScore??row.latestScore??row.score??0)||0;
    const best=Number(row.highestScore??row.latestScore??row.score??0)||0;
    const worst=Number(row.lowestScore??row.latestScore??row.score??0)||0;
    let bestAttempt=null;
    history.forEach(attempt=>{
      if(!bestAttempt||Number(attempt.score||0)>Number(bestAttempt.score||0)||(
        Number(attempt.score||0)===Number(bestAttempt.score||0)&&Number(attempt.durationSeconds||0)<Number(bestAttempt.durationSeconds||0)
      ))bestAttempt=attempt;
    });
    if(!grouped.has(key))grouped.set(key,{
      studentId:String(row.studentId??row.studentKey??''),studentName:row.studentName||'Học sinh',
      classCodes:new Set(),examIds:new Set(),examTitles:new Set(),attemptCount:0,weightedTotal:0,
      highestScore:best,lowestScore:worst,maxScore:Number(row.maxScore)||10,
      fastestTimeSeconds:Number(row.fastestTimeSeconds??row.elapsedSeconds)||0,
      slowestTimeSeconds:Number(row.slowestTimeSeconds??row.elapsedSeconds)||0,
      bestAttemptDurationSeconds:Number(bestAttempt?.durationSeconds??row.elapsedSeconds)||0,
      submittedAt:row.submittedAt||'',attemptHistory:[],historyKeys:new Set()
    });
    const item=grouped.get(key);
    if(row.classCode)item.classCodes.add(String(row.classCode));
    if(row.examId)item.examIds.add(String(row.examId));
    if(row.examTitle)item.examTitles.add(String(row.examTitle));
    item.attemptCount+=count;
    item.weightedTotal+=average*count;
    item.maxScore=Math.max(item.maxScore,Number(row.maxScore)||10);
    const previousBestScore=item.highestScore;
    item.highestScore=Math.max(item.highestScore,best);
    item.lowestScore=Math.min(item.lowestScore,worst);
    const fast=Number(row.fastestTimeSeconds??row.elapsedSeconds)||0;
    const slow=Number(row.slowestTimeSeconds??row.elapsedSeconds)||0;
    if(item.fastestTimeSeconds===0||fast>0&&fast<item.fastestTimeSeconds)item.fastestTimeSeconds=fast;
    item.slowestTimeSeconds=Math.max(item.slowestTimeSeconds,slow);
    const rowBestDuration=Number(bestAttempt?.durationSeconds??row.elapsedSeconds)||0;
    if(best>previousBestScore||(best===previousBestScore&&rowBestDuration>0&&(!item.bestAttemptDurationSeconds||rowBestDuration<item.bestAttemptDurationSeconds)))item.bestAttemptDurationSeconds=rowBestDuration;
    const submitted=String(row.submittedAt||'');
    if(submitted&&(!item.submittedAt||new Date(submitted).getTime()>new Date(item.submittedAt).getTime()))item.submittedAt=submitted;
    history.forEach((attempt,index)=>{
      const attemptKey=String(attempt.attemptId||'')||[
        attempt.submittedAt||'',attempt.examId||row.examId||'',attempt.score??'',attempt.durationSeconds??'',index
      ].join('|');
      if(item.historyKeys.has(attemptKey))return;
      item.historyKeys.add(attemptKey);
      item.attemptHistory.push({...attempt,examId:attempt.examId||row.examId||'',examTitle:attempt.examTitle||row.examTitle||''});
    });
  });
  return Array.from(grouped.values()).map(item=>{
    const classes=Array.from(item.classCodes);
    const exams=Array.from(item.examTitles);
    item.attemptHistory.sort((a,b)=>new Date(a.submittedAt||0)-new Date(b.submittedAt||0));
    return {
      studentId:item.studentId,studentName:item.studentName,
      classCode:classes.join(', ')||'—',examId:item.examIds.size===1?Array.from(item.examIds)[0]:'',
      examTitle:exams.length===1?exams[0]:(exams.length+' đề thi'),
      score:item.highestScore,latestScore:item.highestScore,highestScore:item.highestScore,
      lowestScore:item.lowestScore,averageScore:item.attemptCount?item.weightedTotal/item.attemptCount:0,
      maxScore:item.maxScore,attemptCount:item.attemptCount,
      elapsedSeconds:item.bestAttemptDurationSeconds,fastestTimeSeconds:item.fastestTimeSeconds,
      slowestTimeSeconds:item.slowestTimeSeconds,submittedAt:item.submittedAt,
      attemptHistory:item.attemptHistory
    };
  });
}
function buildTeacherComparisonGroups(rows,mode){
  const source=Array.isArray(rows)?rows:[];
  const buckets=new Map();
  source.forEach(row=>{
    const rawKey=mode==='exam'?(row.examId??row.examTitle??''):(row.classCode??'');
    const key=String(rawKey|| (mode==='exam'?'Chưa xác định đề':'Chưa phân lớp')).trim();
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key).push(row);
  });
  return Array.from(buckets.entries()).map(([key,items])=>{
    // Một học sinh chỉ đóng góp một điểm trong mỗi nhóm; lấy điểm cao nhất
    // của học sinh đó qua các đề/lượt thi đã chọn để tránh đếm lặp.
    const uniqueStudents=new Map();
    items.forEach(item=>{
      const identity=teacherStudentIdentity(item);
      const score=Number(item.highestScore??item.latestScore??item.score??0)||0;
      const current=uniqueStudents.get(identity);
      if(!current||score>current.bestScore){
        uniqueStudents.set(identity,{bestScore:score,submittedAt:item.submittedAt||current?.submittedAt||''});
      }else if(item.submittedAt&&(!current.submittedAt||new Date(item.submittedAt).getTime()>new Date(current.submittedAt).getTime())){
        current.submittedAt=item.submittedAt;
      }
    });
    const students=Array.from(uniqueStudents.values());
    const scores=students.map(item=>item.bestScore);
    const validDates=students.map(item=>{
      const stamp=item.submittedAt?new Date(item.submittedAt).getTime():0;
      return Number.isFinite(stamp)?stamp:0;
    });
    const first=items[0]||{};
    return {
      key,
      name:mode==='exam'?String(first.examTitle||key):String(first.className||first.classCode||key),
      studentCount:students.length,
      average:scores.length?scores.reduce((sum,value)=>sum+value,0)/scores.length:0,
      highest:scores.length?Math.max(...scores):0,
      lowest:scores.length?Math.min(...scores):0,
      lastSubmission:validDates.length?Math.max(...validDates):0
    };
  });
}
function buildTeacherGradeBands(rows){
  const bands=[
    {name:'Yếu',min:0,max:5},
    {name:'Trung bình',min:5,max:6.5},
    {name:'Khá',min:6.5,max:8},
    {name:'Giỏi',min:8,max:9},
    {name:'Xuất sắc',min:9,max:10.1}
  ];
  const scores=(Array.isArray(rows)?rows:[]).map(row=>Number(row.latestScore??row.score??row.averageScore)).filter(Number.isFinite);
  return bands.map(band=>{
    const count=scores.filter(score=>score>=band.min&&score<band.max).length;
    return {...band,count,percent:scores.length?count/scores.length*100:0};
  });
}
function renderTeacherAnalytics(response){
  const rows=Array.isArray(response.rows)?response.rows:[];
  const summary=response.summary||{};
  // Older API responses (including the Supabase bridge) may return empty
  // comparison arrays even though the student result rows are present.
  const suppliedBands=Array.isArray(summary.gradeBands)?summary.gradeBands:[];
  const bands=rows.length?buildTeacherGradeBands(rows):suppliedBands;
  const byClass=buildTeacherComparisonGroups(rows,'class');
  const byExam=buildTeacherComparisonGroups(rows,'exam');
  const rankingRows=buildTeacherRankingRows(rows);
  el.classAverage.textContent=Number(summary.average||0).toFixed(2);
  el.classStudentCount.textContent=String(summary.studentCount||0);
  const bandIds={'Yếu':'classWeakPct','Trung bình':'classAveragePct','Khá':'classGoodPct','Giỏi':'classVeryGoodPct','Xuất sắc':'classExcellentPct'};
  Object.keys(bandIds).forEach(name=>{const b=bands.find(x=>x.name===name);$(bandIds[name]).textContent=(b?Number(b.percent||0):0).toFixed(1)+'%';});
  el.classStatsSummary.hidden=false;
  el.classGradeBars.replaceChildren();
  bands.forEach(b=>{
    const row=document.createElement('div');row.className='sheet-grade-row';
    const label=document.createElement('span');label.textContent=b.name;
    const track=document.createElement('span');track.className='sheet-grade-track';
    const fill=document.createElement('i');fill.className='sheet-grade-fill';fill.style.width=Math.max(0,Math.min(100,Number(b.percent)||0))+'%';track.append(fill);
    const value=document.createElement('strong');value.textContent=(Number(b.percent)||0).toFixed(1)+'%';row.append(label,track,value);el.classGradeBars.append(row);
  });
  el.classGradeBars.hidden=!bands.length;

  const compareBy=el.teacherCompareBy?el.teacherCompareBy.value:'class';
  let groups=(compareBy==='exam'?byExam:byClass).slice();
  const sort=el.teacherSortSelect?el.teacherSortSelect.value:'latest';
  if(sort==='count')groups.sort((a,b)=>Number(b.studentCount)-Number(a.studentCount));
  else if(sort==='avgHigh')groups.sort((a,b)=>Number(b.average)-Number(a.average));
  else if(sort==='scoreHigh')groups.sort((a,b)=>Number(b.highest)-Number(a.highest));
  else if(sort==='scoreLow')groups.sort((a,b)=>Number(a.lowest)-Number(b.lowest));
  else groups.sort((a,b)=>Number(b.lastSubmission)-Number(a.lastSubmission));
  if(el.teacherCompareTitle)el.teacherCompareTitle.textContent=compareBy==='exam'?'So sánh giữa các đề':'So sánh giữa các lớp';
  renderTeacherChart(groups,summary,bands,rankingRows);

  const examRows=byExam;
  if(el.teacherExamBreakdownBody){el.teacherExamBreakdownBody.replaceChildren();examRows.forEach(g=>{const tr=document.createElement('tr');[g.name,g.studentCount,Number(g.average||0).toFixed(2),Number(g.highest||0).toFixed(2),Number(g.lowest||0).toFixed(2)].forEach(v=>{const td=document.createElement('td');td.textContent=String(v);tr.append(td);});el.teacherExamBreakdownBody.append(tr);});}
  if(el.teacherExamBreakdownWrap)el.teacherExamBreakdownWrap.hidden=!examRows.length;

  el.classResultsBody.replaceChildren();
  rows.forEach(result=>{
    const tr=document.createElement('tr');
    [result.studentName,result.classCode,result.examTitle||result.examId,Number(result.latestScore??result.score??0).toFixed(2),Number(result.averageScore||0).toFixed(2),String(result.attemptCount||0)+' lần thi',formatDurationSeconds(result.elapsedSeconds),formatSheetDate(result.submittedAt)].forEach(value=>{
      const td=document.createElement('td');td.textContent=String(value==null?'':value);tr.append(td);
    });
    el.classResultsBody.append(tr);
  });
  el.classResultsWrap.hidden=!rows.length;
}
function formatSheetDate(value){if(!value)return '—';const d=new Date(value);return isNaN(d.getTime())?String(value):d.toLocaleString('vi-VN');}
function formatDurationSeconds(value){const n=Math.max(0,Math.floor(Number(value)||0));const minutes=Math.floor(n/60),seconds=n%60;return minutes>0?minutes+' phút '+String(seconds).padStart(2,'0')+' giây':seconds+' giây';}
function showTeacherRankingDetail(item){
  const old=document.getElementById('teacherRankingDetail');if(old)old.remove();
  const overlay=document.createElement('div');overlay.className='teacher-ranking-detail';overlay.id='teacherRankingDetail';
  const card=document.createElement('section');card.className='teacher-ranking-detail-card';
  const head=document.createElement('div');head.className='teacher-ranking-detail-head';
  let escapeHandler=null;
  const closeDetail=()=>{
    overlay.remove();
    if(escapeHandler)document.removeEventListener('keydown',escapeHandler);
  };
  const title=document.createElement('h2');title.textContent='Thống kê học sinh: '+(item.studentName||'Học sinh');title.style.margin='0';
  const close=document.createElement('button');close.type='button';close.className='icon-button';close.textContent='×';close.setAttribute('aria-label','Đóng');
  close.addEventListener('click',closeDetail);head.append(title,close);
  const subtitle=document.createElement('p');subtitle.className='field-help';subtitle.textContent='Lớp '+(item.classCode||'—')+' · '+(item.examTitle||item.examId||'Đề thi');

  const history=(Array.isArray(item.attemptHistory)?item.attemptHistory:[]).slice();
  if(!history.length&&item.submittedAt){
    history.push({score:Number(item.latestScore??item.score??0),maxScore:Number(item.maxScore)||10,durationSeconds:Number(item.elapsedSeconds)||0,submittedAt:item.submittedAt});
  }
  const sortedHistory=history.slice().sort((a,b)=>new Date(a.submittedAt||0)-new Date(b.submittedAt||0));
  const validDates=sortedHistory.map(a=>new Date(a.submittedAt)).filter(d=>!isNaN(d.getTime()));
  const firstDate=validDates.length?validDates[0]:null;
  const lastDate=validDates.length?validDates[validDates.length-1]:null;
  const dateText=d=>d?d.toLocaleDateString('vi-VN'):'Chưa có dữ liệu';
  const durationText=value=>{
    const n=Math.max(0,Math.floor(Number(value)||0)),m=Math.floor(n/60),s=n%60;
    return m>0?m+' phút '+s+' giây':s+' giây';
  };
  const durations=history.map(a=>Math.max(0,Math.floor(Number(a.durationSeconds)||0)));
  const totalDuration=durations.reduce((sum,value)=>sum+value,0);
  const fastest=durations.length?Math.min(...durations):Number(item.fastestTimeSeconds)||0;
  const slowest=durations.length?Math.max(...durations):Number(item.slowestTimeSeconds)||0;
  const latestDuration=Number(item.elapsedSeconds)||0;
  const averageScore=Number(item.averageScore??item.score??0);
  const highestScore=item.highestScore!=null?Number(item.highestScore):averageScore;
  const lowestScore=item.lowestScore!=null?Number(item.lowestScore):averageScore;
  const attemptCount=Number(item.attemptCount)||history.length||1;
  const maxScore=Math.max(1,Number(item.maxScore)||10);

  const actions=document.createElement('div');actions.className='teacher-ranking-detail-actions';
  const moreBtn=document.createElement('button');moreBtn.type='button';moreBtn.className='bank-collapse-btn';moreBtn.textContent='Thống kê kĩ hơn';
  const captureBtn=document.createElement('button');captureBtn.type='button';captureBtn.className='bank-collapse-btn';captureBtn.textContent='Chụp ảnh';
  actions.append(moreBtn,captureBtn);

  const content=document.createElement('div');content.className='teacher-ranking-detail-content';
  const grid=document.createElement('div');grid.className='teacher-ranking-detail-grid';
  const statDefinitions=[
    {key:'attempts',value:attemptCount+' lần thi',label:'Số lần thi',detail:'Đã ghi nhận '+attemptCount+' lượt thi trong các đề đang được chọn.'},
    {key:'firstDate',value:dateText(firstDate),label:'Ngày thi đầu',detail:firstDate?'Lượt thi đầu tiên được ghi nhận vào '+firstDate.toLocaleString('vi-VN')+'.':'Chưa có ngày thi đầu trong dữ liệu lịch sử.'},
    {key:'lastDate',value:dateText(lastDate),label:'Ngày thi cuối',detail:lastDate?'Lượt thi gần nhất được ghi nhận vào '+lastDate.toLocaleString('vi-VN')+'.':'Chưa có ngày thi cuối trong dữ liệu lịch sử.'},
    {key:'fastest',value:durationText(fastest),label:'Thời gian thi thấp nhất',detail:'Lượt làm nhanh nhất có thời lượng '+durationText(fastest)+'.'},
    {key:'slowest',value:durationText(slowest),label:'Thời gian thi cao nhất',detail:'Lượt làm lâu nhất có thời lượng '+durationText(slowest)+'.'},
    {key:'totalTime',value:durationText(totalDuration),label:'Tổng thời gian thi',detail:'Tổng thời lượng của '+history.length+' lượt thi có dữ liệu thời gian là '+durationText(totalDuration)+'.'},
    {key:'highest',value:highestScore.toFixed(2)+'/10',label:'Điểm cao nhất',detail:'Điểm cao nhất trong các lượt thi là '+highestScore.toFixed(2)+'/10.'},
    {key:'lowest',value:lowestScore.toFixed(2)+'/10',label:'Điểm thấp nhất',detail:'Điểm thấp nhất trong các lượt thi là '+lowestScore.toFixed(2)+'/10.'},
    {key:'average',value:averageScore.toFixed(2)+'/10',label:'Điểm trung bình',detail:'Điểm trung bình của học sinh là '+averageScore.toFixed(2)+'/10.'}
  ];
  const statButtons=[];
  statDefinitions.forEach(def=>{
    const button=document.createElement('button');button.type='button';button.className='teacher-ranking-detail-stat';button.dataset.statKey=def.key;button.setAttribute('aria-expanded','false');
    const strong=document.createElement('strong');strong.textContent=def.value;
    const span=document.createElement('span');span.textContent=def.label;
    const expanded=document.createElement('small');expanded.className='teacher-stat-expanded';expanded.textContent=def.detail;
    button.append(strong,span,expanded);grid.append(button);statButtons.push(button);
  });
  const setExpandedStat=selected=>{
    const active=selected&&selected.classList.contains('is-expanded')?null:selected;
    statButtons.forEach(button=>{
      const isActive=button===active;
      button.classList.toggle('is-expanded',isActive);
      button.classList.toggle('is-shrunk',!!active&&button!==active);
      button.setAttribute('aria-expanded',String(isActive));
    });
  };
  statButtons.forEach(button=>button.addEventListener('click',()=>setExpandedStat(button)));

  const detail=document.createElement('section');detail.className='teacher-ranking-extra';detail.hidden=true;
  const chartTools=document.createElement('div');chartTools.className='teacher-chart-tools';
  const chartLabel=document.createElement('label');chartLabel.textContent='Kiểu thống kê';
  const chartSelect=document.createElement('select');chartSelect.id='teacherStudentChartType';
  [['table','Thống kê bảng'],['column','Biểu đồ cột (X–Y)'],['line','Biểu đồ đường'],['pie','Biểu đồ tròn']].forEach(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;chartSelect.append(option);});
  chartLabel.append(chartSelect);chartTools.append(chartLabel);
  const chartCard=document.createElement('div');chartCard.className='teacher-ranking-extra-card teacher-student-chart-card';
  const chartHeading=document.createElement('h3');chartHeading.textContent='Kết quả qua từng lượt thi';
  const chartHost=document.createElement('div');chartHost.className='teacher-student-chart-host';
  chartCard.append(chartHeading,chartHost);
  const historyCard=document.createElement('div');historyCard.className='teacher-ranking-extra-card teacher-history-card';
  const historyHeading=document.createElement('h3');historyHeading.textContent='Lịch sử từng lần thi';
  historyCard.append(historyHeading);
  if(history.length){
    const wrap=document.createElement('div');wrap.className='teacher-history-table-wrap';
    const table=document.createElement('table');table.className='teacher-history-table';
    const thead=document.createElement('thead'),headRow=document.createElement('tr');
    const historyHasExam=new Set(history.map(a=>String(a.examId||a.examTitle||'')).filter(Boolean)).size>1;
    (historyHasExam?['Lần','Đề thi','Ngày thi','Điểm','Thời lượng']:['Lần','Ngày thi','Điểm','Thời lượng']).forEach(label=>{const th=document.createElement('th');th.textContent=label;headRow.append(th);});
    thead.append(headRow);table.append(thead);
    const tbody=document.createElement('tbody');
    sortedHistory.slice().reverse().forEach((attempt,index)=>{
      const tr=document.createElement('tr');
      const attemptDate=attempt.submittedAt?new Date(attempt.submittedAt):null;
      const values=[
        String(history.length-index),
        ...(historyHasExam?[String(attempt.examTitle||attempt.examId||'—')]:[]),
        attemptDate&&!isNaN(attemptDate.getTime())?attemptDate.toLocaleString('vi-VN'):'—',
        Number(attempt.score||0).toFixed(2)+'/'+(Number(attempt.maxScore)||maxScore),
        durationText(attempt.durationSeconds)
      ];
      values.forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td);});
      tbody.append(tr);
    });
    table.append(tbody);wrap.append(table);historyCard.append(wrap);
  }else{
    const note=document.createElement('p');note.className='field-help';note.textContent='API hiện chỉ trả về số liệu tổng hợp, chưa cung cấp danh sách từng lượt thi.';historyCard.append(note);
  }
  detail.append(chartTools,chartCard,historyCard);

  const bottomControls=document.createElement('div');bottomControls.className='teacher-ranking-detail-bottom';
  const closeBottomBtn=document.createElement('button');closeBottomBtn.type='button';closeBottomBtn.className='bank-collapse-btn';closeBottomBtn.textContent='Đóng bảng';
  closeBottomBtn.addEventListener('click',closeDetail);
  bottomControls.append(closeBottomBtn);

  content.append(grid,detail);
  card.append(head,subtitle,actions,content,bottomControls);overlay.append(card);

  const renderStudentChart=()=>{
    chartHost.replaceChildren();
    const mode=chartSelect.value;
    const points=sortedHistory.map((a,index)=>({
      label:'Lần '+(index+1),
      score:Number(a.score)||0,
      max:Math.max(1,Number(a.maxScore)||maxScore),
      date:a.submittedAt||'',
      duration:Math.max(0,Number(a.durationSeconds)||0)
    }));
    if(!points.length){
      const note=document.createElement('p');note.className='field-help';note.textContent='Chưa có dữ liệu từng lượt thi để vẽ biểu đồ.';chartHost.append(note);return;
    }
    if(mode==='table'){
      const wrap=document.createElement('div');wrap.className='teacher-history-table-wrap';
      const table=document.createElement('table');table.className='teacher-history-table';
      const thead=document.createElement('thead'),trh=document.createElement('tr');
      ['Trục X · Lượt thi','Ngày thi','Trục Y · Điểm','Thời lượng'].forEach(label=>{const th=document.createElement('th');th.textContent=label;trh.append(th);});
      thead.append(trh);table.append(thead);const tbody=document.createElement('tbody');
      points.slice().reverse().forEach(p=>{
        const tr=document.createElement('tr');
        const date=p.date?new Date(p.date):null;
        [p.label,date&&!isNaN(date.getTime())?date.toLocaleString('vi-VN'):'—',p.score.toFixed(2)+'/'+p.max,durationText(p.duration)].forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td);});
        tbody.append(tr);
      });
      table.append(tbody);wrap.append(table);chartHost.append(wrap);return;
    }
    if(mode==='pie'){
      const bands=[
        {name:'Dưới 5',min:0,max:5,count:0,color:'#ef4444'},
        {name:'5 đến dưới 6,5',min:5,max:6.5,count:0,color:'#f59e0b'},
        {name:'6,5 đến dưới 8',min:6.5,max:8,count:0,color:'#eab308'},
        {name:'8 đến dưới 9',min:8,max:9,count:0,color:'#22c55e'},
        {name:'Từ 9 trở lên',min:9,max:Infinity,count:0,color:'#3b82f6'}
      ];
      points.forEach(p=>{const score10=p.score/p.max*10;const band=bands.find(b=>score10>=b.min&&score10<b.max);if(band)band.count++;});
      const total=bands.reduce((sum,b)=>sum+b.count,0);let offset=0;const stops=[];
      bands.forEach(b=>{if(!b.count)return;const start=offset/total*100;offset+=b.count;stops.push(b.color+' '+start+'% '+(offset/total*100)+'%');});
      const row=document.createElement('div');row.className='teacher-student-pie-layout';
      const pie=document.createElement('div');pie.className='teacher-student-pie';pie.style.background=stops.length?'conic-gradient('+stops.join(',')+')':'var(--line)';
      const legend=document.createElement('div');legend.className='teacher-student-pie-legend';
      bands.filter(b=>b.count).forEach(b=>{const line=document.createElement('div');line.className='teacher-student-pie-legend-row';const sw=document.createElement('i');sw.style.background=b.color;const label=document.createElement('span');label.textContent=b.name;const count=document.createElement('strong');count.textContent=b.count+' lượt ('+(b.count/total*100).toFixed(1)+'%)';line.append(sw,label,count);legend.append(line);});
      row.append(pie,legend);chartHost.append(row);return;
    }
    // SVG plot: X = attempt number, Y = score.
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 760 340');svg.setAttribute('class','teacher-student-xy-chart');svg.setAttribute('role','img');svg.setAttribute('aria-label',mode==='column'?'Biểu đồ cột điểm theo lượt thi':'Biểu đồ đường điểm theo lượt thi');
    const left=58,right=730,top=24,bottom=278,span=Math.max(1,points.length);
    const yMax=Math.max(10,...points.map(p=>p.max));
    const ticks=[0,.25,.5,.75,1];
    ticks.forEach(tick=>{
      const y=bottom-(bottom-top)*tick,line=document.createElementNS(ns,'line');
      line.setAttribute('x1',left);line.setAttribute('x2',right);line.setAttribute('y1',y);line.setAttribute('y2',y);line.setAttribute('stroke','var(--line)');line.setAttribute('stroke-dasharray','4 4');svg.append(line);
      const label=document.createElementNS(ns,'text');label.setAttribute('x',8);label.setAttribute('y',y+4);label.setAttribute('class','teacher-line-label');label.textContent=(yMax*tick).toFixed(tick===0?0:1);svg.append(label);
    });
    const xFor=i=>left+(right-left)*(points.length===1?.5:i/(points.length-1));
    const yFor=p=>bottom-Math.max(0,Math.min(yMax,p.score/p.max*yMax))/yMax*(bottom-top);
    if(mode==='column'){
      const slot=(right-left)/Math.max(1,points.length),barWidth=Math.max(8,Math.min(46,slot*.58));
      points.forEach((p,i)=>{
        const x=xFor(i)-barWidth/2,y=yFor(p),rect=document.createElementNS(ns,'rect');
        rect.setAttribute('x',x);rect.setAttribute('y',y);rect.setAttribute('width',barWidth);rect.setAttribute('height',bottom-y);rect.setAttribute('rx','5');rect.setAttribute('fill','var(--primary)');svg.append(rect);
        const val=document.createElementNS(ns,'text');val.setAttribute('x',x+barWidth/2);val.setAttribute('y',y-8);val.setAttribute('text-anchor','middle');val.setAttribute('class','teacher-line-label');val.textContent=p.score.toFixed(1);svg.append(val);
        const xLabel=document.createElementNS(ns,'text');xLabel.setAttribute('x',x+barWidth/2);xLabel.setAttribute('y',bottom+22);xLabel.setAttribute('text-anchor','middle');xLabel.setAttribute('class','teacher-line-label');xLabel.textContent=String(i+1);svg.append(xLabel);
      });
    }else{
      const poly=document.createElementNS(ns,'polyline');poly.setAttribute('points',points.map((p,i)=>xFor(i)+','+yFor(p)).join(' '));poly.setAttribute('fill','none');poly.setAttribute('stroke','var(--primary)');poly.setAttribute('stroke-width','4');poly.setAttribute('stroke-linecap','round');poly.setAttribute('stroke-linejoin','round');svg.append(poly);
      points.forEach((p,i)=>{
        const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',xFor(i));circle.setAttribute('cy',yFor(p));circle.setAttribute('r','6');circle.setAttribute('fill','var(--accent)');svg.append(circle);
        const val=document.createElementNS(ns,'text');val.setAttribute('x',xFor(i));val.setAttribute('y',yFor(p)-12);val.setAttribute('text-anchor','middle');val.setAttribute('class','teacher-line-label');val.textContent=p.score.toFixed(1);svg.append(val);
        const xLabel=document.createElementNS(ns,'text');xLabel.setAttribute('x',xFor(i));xLabel.setAttribute('y',bottom+22);xLabel.setAttribute('text-anchor','middle');xLabel.setAttribute('class','teacher-line-label');xLabel.textContent=String(i+1);svg.append(xLabel);
      });
    }
    const xAxis=document.createElementNS(ns,'text');xAxis.setAttribute('x',(left+right)/2);xAxis.setAttribute('y','326');xAxis.setAttribute('text-anchor','middle');xAxis.setAttribute('class','teacher-line-label');xAxis.textContent='X · Lượt thi';svg.append(xAxis);
    const yAxis=document.createElementNS(ns,'text');yAxis.setAttribute('x','15');yAxis.setAttribute('y','15');yAxis.setAttribute('class','teacher-line-label');yAxis.textContent='Y · Điểm';svg.append(yAxis);
    chartHost.append(svg);
  };
  chartSelect.addEventListener('change',renderStudentChart);
  moreBtn.addEventListener('click',()=>{
    detail.hidden=!detail.hidden;
    moreBtn.textContent=detail.hidden?'Thống kê kĩ hơn':'Thu gọn chi tiết';
    if(!detail.hidden){renderStudentChart();detail.scrollIntoView({behavior:'smooth',block:'nearest'});}
  });

  captureBtn.addEventListener('click',async()=>{
    const originalMax=card.style.maxHeight,originalOverflow=card.style.overflow,originalHeight=card.style.height;
    const wasContentHidden=content.hidden,wasDetailHidden=detail.hidden;
    try{
      if(typeof window.html2canvas!=='function'){
        await new Promise((resolve,reject)=>{
          const script=document.createElement('script');script.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';script.onload=resolve;script.onerror=()=>reject(new Error('Không tải được thư viện chụp ảnh.'));document.head.append(script);
        });
      }
      content.hidden=false;detail.hidden=false;renderStudentChart();
      card.style.maxHeight='none';card.style.height='auto';card.style.overflow='visible';
      const canvas=await window.html2canvas(card,{backgroundColor:getComputedStyle(document.body).getPropertyValue('--surface')||'#151a27',scale:2,useCORS:true,windowWidth:Math.max(card.scrollWidth,window.innerWidth),windowHeight:Math.max(card.scrollHeight,window.innerHeight)});
      const link=document.createElement('a');const safeName=String(item.studentName||'hoc-sinh').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'')||'hoc-sinh';
      link.download='Quiz-Craft-thong-ke-'+safeName+'.png';link.href=canvas.toDataURL('image/png');link.click();toast('Đã chụp bảng thống kê học sinh.');
    }catch(error){toast(error.message||'Không thể chụp ảnh thống kê.');}
    finally{content.hidden=wasContentHidden;detail.hidden=wasDetailHidden;card.style.maxHeight=originalMax;card.style.overflow=originalOverflow;card.style.height=originalHeight;}
  });
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeDetail();});
  escapeHandler=e=>{if(e.key==='Escape')closeDetail();};
  document.addEventListener('keydown',escapeHandler);
  document.body.append(overlay);
}

function renderTeacherChart(groups,summary,bands,rows){
  const wrap=el.teacherCompareWrap,host=el.teacherCompareChart,kind=el.teacherChartSelect?el.teacherChartSelect.value:'bar';
  if(!wrap||!host)return;host.replaceChildren();wrap.hidden=false;
  if(kind==='ranking'){
    const ranked=(Array.isArray(rows)?rows:[]).slice().sort((a,b)=>Number(b.highestScore??b.latestScore??b.score??0)-Number(a.highestScore??a.latestScore??a.score??0)||Number(a.elapsedSeconds||0)-Number(b.elapsedSeconds||0)||Number(b.averageScore||0)-Number(a.averageScore||0)||String(a.studentName||'').localeCompare(String(b.studentName||''),'vi'));
    if(!ranked.length){host.textContent='Chưa có học sinh nộp bài để xếp hạng.';return;}
    const avatar=(name)=>{const v=String(name||'HS').trim(),parts=v.split(/\s+/).filter(Boolean),initial=(parts.length>1?parts[0][0]+parts[parts.length-1][0]:v.slice(0,2)).toLocaleUpperCase(),hash=Array.from(v).reduce((h,c)=>(h*31+c.charCodeAt(0))|0,0),colors=['#245c77','#5b4b8a','#28735c','#8a583e','#8a4265','#52617d'],bg=colors[Math.abs(hash)%colors.length],svg='<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="'+bg+'"/><text x="48" y="58" text-anchor="middle" font-family="Arial" font-size="31" font-weight="700" fill="#fff">'+initial.replace(/[&<>"']/g,'')+'</text></svg>';return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg);};
    const formatTime=(v)=>{const n=Math.max(0,Math.floor(Number(v)||0));return Math.floor(n/60)+' phút '+String(n%60).padStart(2,'0')+' giây';};
    const makeCard=(item,rank)=>{const card=document.createElement('article');card.className='qc-ranking-podium-card rank-'+rank;card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label','Xem thống kê '+(item.studentName||'học sinh'));card.addEventListener('click',()=>showTeacherRankingDetail(item));card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showTeacherRankingDetail(item);}});const medal=document.createElement('span');medal.className='qc-ranking-medal';medal.textContent=['🥇','🥈','🥉'][rank-1];const img=document.createElement('img');img.className='qc-ranking-avatar';img.alt='Avatar '+(item.studentName||'học sinh');img.src=avatar(item.studentName);const name=document.createElement('strong');name.className='qc-ranking-name';name.textContent=item.studentName||'Học sinh';const klass=document.createElement('span');klass.className='qc-ranking-meta';klass.textContent='Lớp '+(item.classCode||'—');const score=document.createElement('b');score.className='qc-ranking-score';score.textContent=Number(item.highestScore??item.latestScore??item.score??0).toFixed(2)+'/10';const info=document.createElement('small');info.textContent=(Number(item.attemptCount||0)>1?Number(item.attemptCount)+' lần thi · ':'TB '+Number(item.averageScore||0).toFixed(2)+' · ')+(Number(item.attemptCount||0)>1?'TB '+Number(item.averageScore||0).toFixed(2):formatTime(item.elapsedSeconds));card.append(medal,img,name,klass,score,info);return card;};
    const podium=document.createElement('div');podium.className='qc-ranking-podium';[ranked[1],ranked[0],ranked[2]].forEach((item)=>{if(item)podium.append(makeCard(item,ranked.indexOf(item)+1));});host.append(podium);
    if(ranked.length>3){const rest=document.createElement('div');rest.className='qc-ranking-rest';ranked.slice(3).forEach((item,index)=>{const row=document.createElement('div');row.className='qc-ranking-row';row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-label','Xem thống kê '+(item.studentName||'học sinh'));row.addEventListener('click',()=>showTeacherRankingDetail(item));row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showTeacherRankingDetail(item);}});const rank=document.createElement('strong');rank.textContent='#'+(index+4);const img=document.createElement('img');img.className='qc-ranking-avatar small';img.alt='Avatar '+(item.studentName||'học sinh');img.src=avatar(item.studentName);const name=document.createElement('strong');name.className='qc-ranking-name';name.textContent=item.studentName||'Học sinh';const klass=document.createElement('span');klass.textContent='Lớp '+(item.classCode||'—');const score=document.createElement('b');score.className='qc-ranking-score';score.textContent=Number(item.highestScore??item.latestScore??item.score??0).toFixed(2)+'/10';const time=document.createElement('small');time.textContent=(Number(item.attemptCount||0)>1?Number(item.attemptCount)+' lần thi · ':'')+'TB '+Number(item.averageScore||0).toFixed(2);row.append(rank,img,name,klass,score,time);rest.append(row);});host.append(rest);}return;
  }
  if(kind==='pie'){
    const total=(bands||[]).reduce((a,b)=>a+(Number(b.count)||0),0);
    const colors=['#ef4444','#f59e0b','#facc15','#22c55e','#3b82f6'];let offset=0,stops=[];
    (bands||[]).forEach((b,i)=>{const pct=total?(Number(b.count)||0)/total*100:0;stops.push(colors[i%colors.length]+' '+offset+'% '+(offset+pct)+'%');offset+=pct;});
    const pie=document.createElement('div');pie.className='teacher-pie';pie.style.background=stops.length?'conic-gradient('+stops.join(',')+')':'var(--line)';host.append(pie);
    const legend=document.createElement('div');legend.className='teacher-pie-legend';
    (bands||[]).forEach((b,i)=>{const row=document.createElement('div');row.className='teacher-pie-legend-row';const sw=document.createElement('i');sw.className='teacher-pie-swatch';sw.style.background=colors[i%colors.length];const name=document.createElement('span');name.textContent=b.name;const value=document.createElement('strong');value.textContent=(Number(b.percent)||0).toFixed(1)+'% ('+(Number(b.count)||0)+')';row.append(sw,name,value);legend.append(row);});host.append(legend);return;
  }
  if(kind==='line'){
    if(!groups.length){host.textContent='Chưa có dữ liệu để vẽ biểu đồ.';return;}
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 720 250');svg.setAttribute('class','teacher-line-svg');
    const left=42,right=690,top=22,bottom=190,span=Math.max(1,groups.length-1);
    [0,2.5,5,7.5,10].forEach(v=>{const y=bottom-v/10*(bottom-top),line=document.createElementNS(ns,'line');line.setAttribute('x1',left);line.setAttribute('x2',right);line.setAttribute('y1',y);line.setAttribute('y2',y);line.setAttribute('stroke','var(--line)');line.setAttribute('stroke-dasharray','3 4');svg.append(line);const t=document.createElementNS(ns,'text');t.setAttribute('x',4);t.setAttribute('y',y+4);t.setAttribute('class','teacher-line-label');t.textContent=String(v);svg.append(t);});
    const points=groups.map((g,i)=>{const x=left+(right-left)*(groups.length===1?.5:i/span),y=bottom-Math.max(0,Math.min(10,Number(g.average)||0))/10*(bottom-top);return {x,y,g};});
    const poly=document.createElementNS(ns,'polyline');poly.setAttribute('points',points.map(p=>p.x+','+p.y).join(' '));poly.setAttribute('fill','none');poly.setAttribute('stroke','var(--primary)');poly.setAttribute('stroke-width','4');poly.setAttribute('stroke-linecap','round');poly.setAttribute('stroke-linejoin','round');svg.append(poly);
    points.forEach((p,i)=>{const c=document.createElementNS(ns,'circle');c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);c.setAttribute('r','6');c.setAttribute('fill','var(--accent)');svg.append(c);const t=document.createElementNS(ns,'text');t.setAttribute('x',p.x);t.setAttribute('y',Math.min(232,bottom+22));t.setAttribute('text-anchor','middle');t.setAttribute('class','teacher-line-label');t.textContent=String(p.g.name).slice(0,16);svg.append(t);const v=document.createElementNS(ns,'text');v.setAttribute('x',p.x);v.setAttribute('y',p.y-11);v.setAttribute('text-anchor','middle');v.setAttribute('class','teacher-line-label');v.textContent=Number(p.g.average||0).toFixed(2);svg.append(v);});host.append(svg);return;
  }
  if(kind==='table'){
    const table=document.createElement('table');table.className='sheet-results-table';const thead=document.createElement('thead'),hr=document.createElement('tr');['Nhóm','Số học sinh','Điểm TB','Cao nhất','Thấp nhất'].forEach(x=>{const th=document.createElement('th');th.textContent=x;hr.append(th);});thead.append(hr);const tbody=document.createElement('tbody');
    groups.forEach(g=>{const tr=document.createElement('tr');[g.name,g.studentCount,Number(g.average||0).toFixed(2),Number(g.highest||0).toFixed(2),Number(g.lowest||0).toFixed(2)].forEach(x=>{const td=document.createElement('td');td.textContent=String(x);tr.append(td);});tbody.append(tr);});table.append(thead,tbody);host.append(table);return;
  }
  if(!groups.length){host.textContent='Chưa có dữ liệu để so sánh.';return;}
  groups.forEach(g=>{
    const row=document.createElement('div');row.className='teacher-compare-row';
    const label=document.createElement('span');label.className='teacher-compare-label';label.textContent=g.name;
    const track=document.createElement('span');track.className='teacher-compare-track';
    const fill=document.createElement('i');fill.className='teacher-compare-fill';fill.style.width=Math.max(0,Math.min(100,(Number(g.average)||0)*10))+'%';track.append(fill);
    const value=document.createElement('strong');value.className='teacher-compare-value';value.textContent=Number(g.average||0).toFixed(2)+' / 10';row.append(label,track,value);
    const note=document.createElement('small');note.style.gridColumn='2 / 4';note.style.color='var(--muted)';note.textContent=(Number(g.studentCount)||0)+' học sinh · cao nhất '+Number(g.highest||0).toFixed(2)+' · thấp nhất '+Number(g.lowest||0).toFixed(2);row.append(note);host.append(row);
  });
}
function setTeacherStatsLoading(message){
  const status=el.classStatsStatus;
  if(!status)return;
  status.replaceChildren();
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  const wrap=document.createElement('span');wrap.className='qc-loading-status';
  const spinner=document.createElement('span');spinner.className='qc-spinner';
  spinner.setAttribute('aria-hidden','true');
  const label=document.createElement('span');label.textContent=message||'Vui lòng chờ, đang tải dữ liệu...';
  wrap.append(spinner,label);status.append(wrap);
}
async function loadTeacherStats(){
  const session=currentTeacherSession();
  if(!session){toast('Hãy đăng nhập bằng tài khoản giáo viên để xem thống kê.');return;}
  setTeacherStatsLoading('Vui lòng chờ, đang tải danh sách đề và kết quả...');el.loadExamStatsBtn.disabled=true;
  try{
    const oldClasses=selectedMultiValues(el.teacherClassMulti);
    if(teacherCatalogOwner!==session.teacherId){teacherCatalogOwner=session.teacherId;teacherExamCatalog=[];teacherSelectedExamIds=null;teacherClassSelectionInitialized=false;}
    const catalog=await appsScriptJsonp(teacherApiParams({action:'catalog'}));
    if(!catalog||!catalog.ok)throw new Error(catalog&&catalog.error||'Không tải được danh sách đề.');
    teacherExamCatalog=Array.isArray(catalog.exams)?catalog.exams:[];
    const validExamIds=new Set(teacherExamCatalog.flatMap(x=>Array.isArray(x.examIds)&&x.examIds.length?x.examIds:[x.examId]).filter(Boolean).map(String));
    if(teacherSelectedExamIds===null)teacherSelectedExamIds=[...validExamIds];
    else teacherSelectedExamIds=teacherSelectedExamIds.filter(id=>validExamIds.has(id));
    renderTeacherExamOptions();
    const examIds=teacherSelectedExamIds.slice();
    if(!examIds.length){
      teacherClassSelectionInitialized=false;
      if(el.teacherClassMulti)el.teacherClassMulti.replaceChildren();
      if(el.teacherExamClassFilter){el.teacherExamClassFilter.replaceChildren();const allOpt=document.createElement('option');allOpt.value='';allOpt.textContent='Tất cả lớp';el.teacherExamClassFilter.append(allOpt);}
      el.classStatsSummary.hidden=true;el.classGradeBars.hidden=true;el.classResultsWrap.hidden=true;
      if(el.teacherCompareWrap)el.teacherCompareWrap.hidden=true;
      if(el.teacherExamBreakdownWrap)el.teacherExamBreakdownWrap.hidden=true;
      el.classStatsStatus.textContent='Chưa chọn đề. Hãy chọn ít nhất một đề để xem lớp đã làm và thống kê.';
      return;
    }
    const selectedCatalog=await appsScriptJsonp(teacherApiParams({action:'catalog',examIds:JSON.stringify(examIds)}));
    if(!selectedCatalog||!selectedCatalog.ok)throw new Error(selectedCatalog&&selectedCatalog.error||'Không tải được danh sách lớp của các đề đã chọn.');
    const classes=Array.isArray(selectedCatalog.classes)?selectedCatalog.classes:[];
    const classOptions=classes.map(x=>({classCode:x.classCode,className:x.className||x.classCode,submissionCount:x.submissionCount||0}));
    if(el.teacherExamClassFilter){
      const oldFilter=el.teacherExamClassFilter.value;el.teacherExamClassFilter.replaceChildren();
      const allOpt=document.createElement('option');allOpt.value='';allOpt.textContent='Tất cả lớp';el.teacherExamClassFilter.append(allOpt);
      classOptions.forEach(x=>{const o=document.createElement('option');o.value=x.classCode;o.textContent=x.className+' · '+x.classCode;el.teacherExamClassFilter.append(o);});
      el.teacherExamClassFilter.value=[...el.teacherExamClassFilter.options].some(o=>o.value===oldFilter)?oldFilter:'';
      renderTeacherExamOptions();
    }
    fillMultiSelect(el.teacherClassMulti,classOptions,'classCode',x=>x.className+' ('+x.submissionCount+' lượt)',teacherClassSelectionInitialized?oldClasses:null);teacherClassSelectionInitialized=true;
    const classCodes=selectedMultiValues(el.teacherClassMulti);
    setTeacherStatsLoading('Vui lòng chờ, đang tổng hợp thống kê...');
    const response=await appsScriptJsonp(teacherApiParams({action:'stats',examIds:JSON.stringify(examIds),classCodes:JSON.stringify(classCodes),sortBy:el.teacherSortSelect.value}));
    if(!response||!response.ok)throw new Error(response&&response.error||'Không đọc được thống kê.');
    teacherExamRows=Array.isArray(response.rows)?response.rows:[];
    renderTeacherAnalytics(response);
    el.classStatsStatus.textContent='Đã tải '+(catalog.examCount==null?teacherExamCatalog.length:catalog.examCount)+' đề thuộc giáo viên '+session.teacherId+'.';
  }catch(error){el.classStatsSummary.hidden=true;el.classGradeBars.hidden=true;el.classResultsWrap.hidden=true;if(el.teacherCompareWrap)el.teacherCompareWrap.hidden=true;el.classStatsStatus.textContent=error.message||'Không thể tải dữ liệu.';toast('Lỗi thống kê: '+(error.message||'không thể kết nối.'));}
  finally{el.loadExamStatsBtn.disabled=false;}
}

/* ==================== Teacher settings, publishing and exports ==================== */
function soundLabel(){el.settingsSoundBtn.textContent=t(soundOn?'actions.soundOn':'actions.soundOff');}
function questionCounts(){return TYPES.reduce((o,type)=>(o[type]=questions.filter(q=>q.type===type).length,o),{});}
function pointField(type){return el['point'+(type==='truefalse'?'Truefalse':type[0].toUpperCase()+type.slice(1))];}
function createProjectId(){
  const random=window.crypto&&typeof crypto.randomUUID==='function'?crypto.randomUUID().replace(/-/g,''):Date.now().toString(36)+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
  return 'project-'+random;
}
function createUniqueAssignmentId(){
  const random=window.crypto&&typeof crypto.randomUUID==='function'?crypto.randomUUID().replace(/-/g,'').toUpperCase():Date.now().toString(36).toUpperCase()+Math.random().toString(36).slice(2,12).toUpperCase()+Math.random().toString(36).slice(2,12).toUpperCase();
  return 'QC-'+random;
}
function isDuplicateExamIdError(message){return /trùng|duplicate|already\s+(?:exists|in\s+use|used)|\bexists\b|đã tồn tại|đã được sử dụng|mã đề.*tồn tại/i.test(String(message||''));}
function readExportPoints(){
  return Object.fromEntries(TYPES.map(type=>[type,Math.max(0,Number(pointField(type).value)||0)]));
}
function allocatedExportPoints(values,counts=questionCounts()){
  return TYPES.reduce((sum,type)=>sum+(counts[type]||0)*(Number(values[type])||0),0);
}
function writePointValue(type,value){
  const safe=Math.max(0,Number.isFinite(value)?value:0);
  pointField(type).value=String(Number(safe.toFixed(6)));
}
function rebalance(editedType){
  const index=TYPES.indexOf(editedType);
  if(index<0)return;
  const counts=questionCounts();
  if(!counts[editedType])return;

  const values=readExportPoints();
  const maxScore=Math.max(1,Number(el.maxScoreInput.value)||10);
  const previousTypes=TYPES.slice(0,index);
  const fixedBefore=previousTypes.reduce((sum,type)=>sum+(counts[type]||0)*values[type],0);
  const editedCount=counts[editedType];
  const maxAllowed=Math.max(0,(maxScore-fixedBefore)/editedCount);

  // Keep earlier categories fixed. Cap this edit only if it would exceed the scale.
  if(values[editedType]>maxAllowed){
    values[editedType]=maxAllowed;
    writePointValue(editedType,maxAllowed);
  }

  const fixedThroughEdited=fixedBefore+editedCount*values[editedType];
  const downstream=TYPES.slice(index+1).filter(type=>counts[type]>0);
  if(!downstream.length)return;

  let remaining=Math.max(0,maxScore-fixedThroughEdited);
  let weights=downstream.map(type=>Math.max(0,counts[type]*values[type]));
  let weightTotal=weights.reduce((sum,value)=>sum+value,0);
  if(weightTotal<=0){
    weights=downstream.map(type=>counts[type]);
    weightTotal=weights.reduce((sum,value)=>sum+value,0);
  }

  downstream.forEach((type,i)=>{
    const allocation=i===downstream.length-1
      ?remaining
      :remaining*(weights[i]/weightTotal);
    writePointValue(type,allocation/counts[type]);
    remaining=Math.max(0,remaining-allocation);
    weightTotal-=weights[i];
  });
}
function rebalanceEssayForMaxScore(){
  const counts=questionCounts();
  const values=readExportPoints();
  const nonEssay=TYPES.filter(type=>type!=="essay")
    .reduce((sum,type)=>sum+(counts[type]||0)*values[type],0);
  const essayCount=counts.essay||0;
  const requestedMax=Math.max(0,Number(el.maxScoreInput.value)||0);
  if(essayCount>0){
    const essayPoint=Math.max(0,(requestedMax-nonEssay)/essayCount);
    writePointValue('essay',essayPoint);
  }
}
function finalizeMaxScoreEdit(){
  const counts=questionCounts();
  const values=readExportPoints();
  const nonEssay=TYPES.filter(type=>type!=="essay")
    .reduce((sum,type)=>sum+(counts[type]||0)*values[type],0);
  const requested=Math.max(1,Number(el.maxScoreInput.value)||10);
  if(counts.essay&&requested<nonEssay){
    el.maxScoreInput.value=String(Number(nonEssay.toFixed(6)));
  }
  rebalanceEssayForMaxScore();
}
function updateMaxScoreFromPoints(){
  const total=allocatedExportPoints(readExportPoints());
  el.maxScoreInput.value=String(Number(Math.max(1,total).toFixed(6)));
}
function openSettings(){el.themeSelect.value=document.body.dataset.theme||'dark';soundLabel();el.settingsModal.hidden=false;}
function saveSettings(){applyTheme(el.themeSelect.value);savePrefs();el.settingsModal.hidden=true;toast(t('settings.saved'));}
function syncLockScheduleUI(){
  const isLocked=!!el.examLockModeInput&&el.examLockModeInput.value==='LOCKED';
  if(el.examLockScheduleField)el.examLockScheduleField.hidden=!isLocked;
  if(el.examLockUntilInput){el.examLockUntilInput.disabled=!isLocked;el.examLockUntilInput.required=isLocked;}
}
function toLocalDateTimeInput(value){
  if(!value)return '';
  const d=new Date(value);if(Number.isNaN(d.getTime()))return '';
  return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
function parseScheduledLock(lockMode,raw){
  if(lockMode!=='LOCKED')return '';
  if(!raw)throw new Error('Hãy chọn thời điểm tự động khóa.');
  const d=new Date(raw);
  if(Number.isNaN(d.getTime()))throw new Error('Thời điểm khóa không hợp lệ.');
  if(d.getTime()<=Date.now())throw new Error('Thời điểm khóa phải ở tương lai.');
  return d.toISOString();
}
function renderMultiExportProjects(){
  if(!el.multiExportList)return;
  el.multiExportList.replaceChildren();
  const eligible=projects.map(project=>({project,items:exportableQuestionList(project.questions)})).filter(entry=>entry.items.length>0);
  if(!eligible.length){
    const empty=document.createElement('p');empty.className='field-help';empty.style.margin='8px';
    empty.textContent='Chưa có dự án nào chứa câu hỏi hợp lệ để xuất.';
    el.multiExportList.append(empty);
  }
  eligible.forEach(({project,items})=>{
    const label=document.createElement('label');label.className='multi-check-item';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.className='multi-export-project-check';checkbox.value=String(project.id);checkbox.checked=String(project.id)===String(activeProjectId);
    const title=document.createElement('span');title.textContent=(project.name||project.meta?.title||'Dự án không tên')+' · '+items.length+' câu';
    label.append(checkbox,title);el.multiExportList.append(label);
  });
  updateMultiExportCount();
}
function updateMultiExportCount(){
  if(!el.multiExportList||!el.multiExportCount)return;
  const boxes=[...el.multiExportList.querySelectorAll('.multi-export-project-check')];
  const selected=boxes.filter(box=>box.checked).length;
  if(el.multiExportSelectAll){el.multiExportSelectAll.checked=boxes.length>0&&selected===boxes.length;el.multiExportSelectAll.indeterminate=selected>0&&selected<boxes.length;}
  el.multiExportCount.textContent=boxes.length
    ?'Đã chọn '+selected+' / '+boxes.length+' đề. '+(selected>=1?'Sẵn sàng xuất '+selected+' đề trong một file.':'Chọn ít nhất 1 đề để xuất.')
    :'Không có đề nào đủ nội dung để xuất.';
  if(el.saveSettingsBtnExport&&el.multiExportModeInput?.checked)el.saveSettingsBtnExport.textContent=selected>=1?'Xuất '+selected+' đề trong một file':'Xuất đề đã chọn';
  if(el.exportProjectJsonBtn){
    el.exportProjectJsonBtn.textContent=el.multiExportModeInput?.checked
      ?(selected>=1?'Xuất JSON gồm '+selected+' đề':'Xuất JSON các đề đã chọn')
      :'Xuất JSON để chuyển dự án';
  }
}
function selectedMultiExportProjects(){
  const ids=new Set(el.multiExportList?[...el.multiExportList.querySelectorAll('.multi-export-project-check:checked')].map(box=>String(box.value)):[]);
  return projects.filter(project=>ids.has(String(project.id))&&exportableQuestionList(project.questions).length>0);
}
async function openExportModal(){
  await save();
  const activeQuestionCount=exportableQuestionList(questions).length;
  const exportableProjectCount=projects.filter(project=>exportableQuestionList(project.questions).length>0).length;
  if(activeQuestionCount===0&&exportableProjectCount<1)return toast('Chưa có đề nào chứa câu hỏi hợp lệ để xuất. Hãy thêm ít nhất một câu hỏi.');
  const forceMultiExport=activeQuestionCount===0;
  if(el.multiExportModeInput)el.multiExportModeInput.checked=forceMultiExport;
  if(el.multiExportPanel)el.multiExportPanel.hidden=!forceMultiExport;
  el.exportTitleInput.value=meta.title||t('export.defaultName');
  el.exportClassInput.value=settings.classCode||'';
  el.teacherDisplayNameInput.value=settings.teacherDisplayName||((currentTeacherSession()||{}).name||'');
  el.examPasswordInput.value='';el.examPasswordInput.type='password';if(el.toggleTeacherExamPasswordBtn){el.toggleTeacherExamPasswordBtn.classList.remove('is-visible');el.toggleTeacherExamPasswordBtn.setAttribute('aria-label','Hiện mật khẩu');el.toggleTeacherExamPasswordBtn.title='Hiện mật khẩu';}
  el.examAccessModeInput.value='PUBLIC';
  el.examLockModeInput.value='UNLOCKED';
  el.examLockUntilInput.value='';
  syncLockScheduleUI();
  el.updateExamAccessBtn.hidden=!settings.assignmentId;
  el.saveSettingsBtnExport.textContent=settings.assignmentId?'Cập nhật đề và tải file học sinh':'Tải file học sinh';
  el.antiCheatInput.checked=false;
  el.antiCopyInput.checked=false;
  el.antiScreenshotInput.checked=false;
  el.requireStudentEmailInput.checked=false;
  el.durationInput.value=settings.duration;el.maxScoreInput.value=settings.maxScore;
  el.answerRevealMode.value='submit';
  $('allowRetakeInput').checked=true;
  $('shuffleExamInput').checked=false;
  TYPES.forEach(type=>pointField(type).value=settings.points[type]);
  renderMultiExportProjects();
  if(el.saveSettingsBtnExport)el.saveSettingsBtnExport.textContent=forceMultiExport?'Xuất bộ nhiều đề':(settings.assignmentId?'Cập nhật đề và tải file học sinh':'Tải file học sinh');
  el.exportModal.hidden=false;el.exportTitleInput.focus();
}
function saveExportSettings(delivery){
  if(!currentTeacherSession()){toast('Hãy đăng nhập tài khoản giáo viên trước khi xuất đề để liên kết đúng mã giáo viên và lưu thống kê.');return;}
  const title=el.exportTitleInput.value.trim()||t('export.defaultName');
  const exportClassCode=String(el.exportClassInput.value||'').normalize('NFC').trim();
  if(exportClassCode.length>30||/[\u0000-\u001f\u007f<>]/.test(exportClassCode)){toast('Tên lớp tối đa 30 ký tự và không chứa ký tự điều khiển.');el.exportClassInput.focus();return;}
  const lockMode=['LOCKED','LOCKED_NOW'].includes(el.examLockModeInput.value)?el.examLockModeInput.value:'UNLOCKED';
  let lockedUntil='';
  try{lockedUntil=parseScheduledLock(lockMode,String(el.examLockUntilInput.value||'').trim());}
  catch(error){toast(error.message);if(lockMode==='LOCKED')el.examLockUntilInput.focus();return;}
  settings={...settings,duration:Math.max(0,Math.min(600,Number(el.durationInput.value)||0)),
    maxScore:Math.max(1,Number(el.maxScoreInput.value)||10),
    answerReveal:['per-question','none'].includes(el.answerRevealMode.value)?el.answerRevealMode.value:'submit',
    allowRetake:$('allowRetakeInput').checked,shuffle:$('shuffleExamInput').checked,
    classCode:exportClassCode,teacherDisplayName:String(el.teacherDisplayNameInput.value||'').normalize('NFC').trim(),accessMode:el.examAccessModeInput.value==='PRIVATE'?'PRIVATE':'PUBLIC',
    lockMode:lockMode,lockAt:lockedUntil,antiCheat:!!el.antiCheatInput.checked,
    antiCopy:!!el.antiCopyInput.checked,antiScreenshot:!!el.antiScreenshotInput.checked,
    requireStudentEmail:!!el.requireStudentEmailInput.checked,
    points:Object.fromEntries(TYPES.map(type=>[type,Math.max(0,Number(pointField(type).value)||0)]))};
  const examPassword=String(el.examPasswordInput.value||'');
  if(examPassword.length>128)return toast('Mật khẩu tối đa 128 ký tự.');
  const exportOptions={teacherDisplayName:settings.teacherDisplayName||'',examPassword:examPassword};
  if(el.multiExportModeInput&&el.multiExportModeInput.checked){
    if(delivery==='online'){toast('Chế độ nhiều đề hiện xuất thành một file HTML để tải về.');return;}
    const selected=selectedMultiExportProjects();
    if(selected.length<1){toast('Hãy chọn ít nhất 1 đề có nội dung hợp lệ để xuất.');return;}
    awaitExportMultiple(title,exportOptions,selected);
    return;
  }
  if(exportableQuestionList(questions).length===0){
    toast('Đề hiện tại chưa có câu hỏi hợp lệ nên không thể xuất. Hãy thêm ít nhất một câu hỏi có nội dung.');
    return;
  }
  awaitExport(title,delivery==='online'?'online':'download',exportOptions);
}
async function updateExamAccessOnly(){
  if(!currentTeacherSession())return toast('Hãy đăng nhập giáo viên trước.');
  if(!settings.assignmentId)return toast('Dự án chưa từng xuất đề. Hãy xuất đề một lần trước.');
  const teacher=currentTeacherSession();
  const mode=el.examAccessModeInput.value==='PRIVATE'?'PRIVATE':'PUBLIC';
  const lockMode=['LOCKED','LOCKED_NOW'].includes(el.examLockModeInput.value)?el.examLockModeInput.value:'UNLOCKED';
  let lockedUntil='';
  try{lockedUntil=parseScheduledLock(lockMode,String(el.examLockUntilInput.value||'').trim());}
  catch(error){toast(error.message);if(lockMode==='LOCKED')el.examLockUntilInput.focus();return;}
  const classCode=String(el.exportClassInput.value||'').normalize('NFC').trim();
  if(classCode.length>30||/[\u0000-\u001f\u007f<>]/.test(classCode)){toast('Tên lớp tối đa 30 ký tự và không chứa ký tự điều khiển.');el.exportClassInput.focus();return;}
  const register=examId=>appsScriptJsonp(teacherApiParams({action:'registerExam',examId:examId,
    projectKey:activeProjectId,examTitle:el.exportTitleInput.value.trim()||meta.title||projectName,
    classCode:classCode,questionCount:questions.length,maxScore:settings.maxScore||10,
    teacherName:String(el.teacherDisplayNameInput.value||'').trim()||teacher.name||'',teacherEmail:teacher.email||'',emailRequired:!!el.requireStudentEmailInput.checked,
    antiCopy:!!el.antiCopyInput.checked,antiScreenshot:!!el.antiScreenshotInput.checked,
    accessMode:mode,lockMode:lockMode,lockAt:lockedUntil,lockAtMs:lockedUntil?Date.parse(lockedUntil):0,lockedUntil:'',clearLock:true}));
  try{
    el.updateExamAccessBtn.disabled=true;
    const belongsToThisExam=String(settings.assignmentOwnerId||'')===String(teacher.teacherId||'')&&String(settings.projectKey||'')===String(activeProjectId||'');
    let examId=belongsToThisExam?settings.assignmentId:createUniqueAssignmentId();
    let result=null;
    for(let attempt=0;attempt<5;attempt++){
      result=await register(examId);
      if(result&&result.ok)break;
      const message=String(result&&result.error||'');
      if(!isDuplicateExamIdError(message))break;
      examId=createUniqueAssignmentId();
    }
    if(!result||!result.ok)throw new Error(result&&result.error||'Không cập nhật được đề.');
    settings.assignmentId=examId;settings.assignmentOwnerId=String(teacher.teacherId||'');
    settings.classCode=classCode;settings.accessMode=mode;settings.lockMode=lockMode;
    settings.lockAt=lockedUntil;delete settings.lockedUntil;settings.projectKey=activeProjectId;
    settings.antiCopy=!!el.antiCopyInput.checked;settings.antiScreenshot=!!el.antiScreenshotInput.checked;
    settings.requireStudentEmail=!!el.requireStudentEmailInput.checked;
    await save();toast('Đã cập nhật lớp, quyền truy cập và lịch khóa bài.');
  }catch(e){toast(e.message||'Không cập nhật được đề.');}
  finally{el.updateExamAccessBtn.disabled=false;}
}
async function awaitExport(title,delivery,exportOptions={}){
  try{
    const items=exportableQuestionList(questions);
    if(!items.length)throw new Error('Đề chưa có câu hỏi hợp lệ nên không thể xuất.');
    await save();
    const result=await exportStudentFile(items,title,{...settings,...exportOptions,examPassword:delivery==='online'?'':String(exportOptions.examPassword||''),theme:document.body.dataset.theme||'dark',publishOnline:delivery==='online'});
    el.exportModal.hidden=true;
    if(delivery==='online'){
      try{await navigator.clipboard.writeText(result);}catch(e){}
      await window.prompt('Link bài tập trực tuyến (đã thử sao chép vào clipboard):',result);
      toast('Đã tạo link bài tập trực tuyến.');
    }else{toast(t('export.success'));if(window.__qcExportRegistrationWarning){setTimeout(()=>toast(window.__qcExportRegistrationWarning),900);window.__qcExportRegistrationWarning='';}}
  }catch(e){toast((e&&e.message)?'Không xuất được: '+e.message:t('export.failed'));}
}

/* ==================== Submit question (editor) ==================== */
async function submitQuestion(event){
  event.preventDefault();
  clearTimeout(draftTimer);draftTimer=0;
  const prompt=el.questionText.value.trim(),type=el.questionType.value,
        level=el.questionLevel.value==='custom'?el.questionLevelCustom.value.trim():el.questionLevel.value;
  if(!prompt&&!questionMediaList().length)return toast(t('errors.completeForm'));
  let q;
  if(type==='multiple'){
    const slots=optionSlots(),filled=slots.filter(x=>hasChoice(x.text,x.media));
    if(filled.length<2||filled.length>4)return toast(t('errors.completeOptions'));
    const selected=Number(el.correctAnswer.value);
    const answer=filled.findIndex(x=>slots.indexOf(x)===selected);
    if(answer<0)return toast(t('errors.completeOptions'));
    q=normalize({id:editingId||'q-'+Date.now(),type,level,prompt,
      options:filled.map(x=>x.text),optionMedia:filled.map(x=>x.media),
      explanations:filled.map(x=>x.explanation),
      media:{type:el.questionMediaFile.dataset.mediaUrl?'image':'none',url:el.questionMediaFile.dataset.mediaUrl||''},mediaItems:questionMediaList(),
      answer,explanation:el.explanation.value,explanationMedia:readMediaList(el.explanationMediaFiles)});
  }else if(type==='truefalse'){
    const stmts=tfSlots();if(stmts.filter(s=>s.text).length<2)return toast(t('errors.completeTF'));
    q=normalize({id:editingId||'q-'+Date.now(),type,level,prompt,statements:stmts,
      media:{type:el.questionMediaFile.dataset.mediaUrl?'image':'none',url:el.questionMediaFile.dataset.mediaUrl||''},mediaItems:questionMediaList(),
      explanation:el.explanation.value,explanationMedia:readMediaList(el.explanationMediaFiles)});
  }else{
    const answer=el.textAnswer.value.trim();
    if(type==='short'&&!answer)return toast(t('errors.completeAnswer'));
    q=normalize({id:editingId||'q-'+Date.now(),type,level,prompt,answer,
      media:{type:el.questionMediaFile.dataset.mediaUrl?'image':'none',url:el.questionMediaFile.dataset.mediaUrl||''},mediaItems:questionMediaList(),
      explanation:el.explanation.value,explanationMedia:readMediaList(el.explanationMediaFiles)});
  }
  if(editingId){const idx=questions.findIndex(x=>x.id===editingId);if(idx>=0)questions[idx]=q;toast(t('messages.updated'));}
  else{questions.push(q);toast(t('messages.added'));}
  touchRecentQuestion(q.id);
  clearTimeout(draftTimer);draftTimer=0;editorDirty=false;
  await save();await store.removeItem(DKEY).catch(()=>{});renderBank();resetForm();
}

/* ==================== Export project JSON (để chuyển dự án) ==================== */
function downloadProjectJson(){
  const multiMode=!!el.multiExportModeInput?.checked;
  const selected=multiMode?selectedMultiExportProjects():[];
  if(multiMode&&!selected.length)return toast('Hãy chọn ít nhất 1 đề hợp lệ trong danh sách trước khi xuất JSON.');
  if(!multiMode&&!questions.length)return toast(t('export.empty'));

  const title=String(el.exportTitleInput?.value||meta.title||projectName||'Bộ câu hỏi').trim()||'Bộ câu hỏi';
  const exportSettings={
    duration:Math.max(0,Math.min(600,Number(el.durationInput?.value??settings.duration)||0)),
    maxScore:Math.max(1,Number(el.maxScoreInput?.value??settings.maxScore)||10),
    answerReveal:['per-question','none'].includes(el.answerRevealMode?.value)?el.answerRevealMode.value:(settings.answerReveal||'submit'),
    allowRetake:el.allowRetakeInput?!!el.allowRetakeInput.checked:settings.allowRetake!==false,
    shuffle:el.shuffleExamInput?!!el.shuffleExamInput.checked:!!settings.shuffle,
    points:el.pointMultiple?readExportPoints():{...settings.points},
    antiCheat:el.antiCheatInput?!!el.antiCheatInput.checked:!!settings.antiCheat,
    antiCopy:el.antiCopyInput?!!el.antiCopyInput.checked:!!settings.antiCopy,
    antiScreenshot:el.antiScreenshotInput?!!el.antiScreenshotInput.checked:!!settings.antiScreenshot,
    requireStudentEmail:el.requireStudentEmailInput?!!el.requireStudentEmailInput.checked:!!settings.requireStudentEmail
  };

  let packageData;
  let exportCount=questions.length;
  if(multiMode){
    const multiProjects=selected.map(({id,name,meta:projectMeta,settings:projectSettings,questions:projectQuestions},index)=>{
      const projectTitle=String(projectMeta?.title||name||('Đề '+(index+1))).trim()||('Đề '+(index+1));
      return {
        id:String(id||''),
        name:projectTitle,
        meta:{...(projectMeta&&typeof projectMeta==='object'?projectMeta:{}),title:projectTitle},
        settings:{...(projectSettings&&typeof projectSettings==='object'?projectSettings:{}),...exportSettings},
        questions:exportableQuestionList(projectQuestions)
      };
    }).filter(project=>project.questions.length>0);
    if(!multiProjects.length)return toast('Không có đề hợp lệ để xuất JSON.');
    exportCount=multiProjects.reduce((sum,project)=>sum+project.questions.length,0);
    packageData={
      format:'quiz-craft-multi-project',
      version:1,
      exportedAt:new Date().toISOString(),
      title:title,
      projects:multiProjects
    };
  }else{
    packageData={
      format:'quiz-craft-project',
      version:1,
      exportedAt:new Date().toISOString(),
      project:{name:title,meta:{title,description:String(meta.description||'')},settings:exportSettings},
      questions:questions.map(q=>normalize(q))
    };
  }

  try{
    const json=JSON.stringify(packageData,null,2);
    const blob=new Blob([json],{type:'application/json;charset=utf-8'});
    if(blob.size>150*1024*1024){toast('JSON lớn hơn 150 MB nên không thể nhập lại trong Quiz Craft. Hãy giảm dung lượng media rồi xuất lại.');return;}
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    const fileBase=title.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase()||'quiz-craft-project';
    link.href=url;link.download=(multiMode?fileBase+'-'+selected.length+'-de':fileBase)+'.json';document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    const size=(blob.size/1024/1024).toFixed(2);
    toast(multiMode
      ?'Đã xuất JSON gồm '+selected.length+' đề · '+exportCount+' câu hỏi · '+size+' MB. Có thể nhập lại bằng mục “Nhập đề tự động (JSON)”.'
      :'Đã xuất JSON · '+questions.length+' câu hỏi · '+size+' MB. Có thể nhập bằng mục “Nhập đề tự động (JSON)”.');
  }catch(error){toast('Không thể xuất JSON: '+(error.message||'Lỗi dữ liệu.'));}
}


/* ==================== Teacher authentication and JSON import ==================== */
/* ==================== Auth ==================== */
function authModeSet(mode){
  authMode=['register','forgot'].includes(mode)?mode:'login';
  const reg=authMode==='register',forgot=authMode==='forgot';
  el.authTitle.textContent=reg?'Tạo tài khoản giáo viên':forgot?'Khôi phục mật khẩu':'Đăng nhập bằng Gmail';
  el.authIntro.textContent=reg?'Tạo tài khoản giáo viên bằng tên, email và mật khẩu. Email cần xác minh OTP một lần.':forgot?'Nhập email để nhận OTP, sau đó đặt mật khẩu mới.':'Đăng nhập bằng email và mật khẩu. Tài khoản sẽ được ghi nhớ trên thiết bị này.';
  el.authSubmit.textContent=reg?'Xác minh và tạo tài khoản':forgot?'Xác minh OTP và đổi mật khẩu':'Đăng nhập';
  el.authSwitch.hidden=forgot;el.authSwitch.textContent=reg?'Đã có tài khoản? Đăng nhập':'Chưa có tài khoản? Đăng ký';
  el.nameField.hidden=!reg;el.authName.required=reg;
  el.otpField.hidden=!reg&&!forgot;el.sendOtpBtn.hidden=!reg&&!forgot;
  el.forgotPasswordBtn.hidden=reg||forgot;
  el.authPassword.required=true;
  el.authPasswordLabel.textContent=forgot?'Mật khẩu mới':'Mật khẩu';
  el.authPassword.autocomplete=authMode==='login'?'current-password':'new-password';
  el.authPassword.placeholder=forgot||reg?'Tối thiểu 8 ký tự':'Nhập mật khẩu';
  if(!reg&&!forgot&&!el.authEmail.value){try{el.authEmail.value=localStorage.getItem(AUTH_EMAIL_KEY)||'';}catch(e){}}
  el.authOtp.value='';el.authPassword.value='';if(el.authName)el.authName.value='';
  el.authError.hidden=true;otpRequestId='';
}
function authButton(session){el.authBtn.textContent=session?.name?session.name+' · '+t('auth.logoutButton'):t('auth.loginButton');}
function getGuestId(){try{let id=localStorage.getItem('quiz-craft-guest-id-v1');if(!id){id='GUEST-'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random());localStorage.setItem('quiz-craft-guest-id-v1',id);}return id;}catch(e){return 'GUEST-'+Date.now().toString(36)+Math.random().toString(36).slice(2);}}
async function sendAuthOtp(){
  try{
    const email=el.authEmail.value.trim().toLowerCase(),name=el.authName.value.trim(),password=el.authPassword.value;
    if(!email)throw new Error('Hãy nhập email hợp lệ.');
    if(authMode==='register'&&!name)throw new Error('Hãy nhập tên hiển thị.');
    if(password.length<8||password.length>128)throw new Error('Mật khẩu phải có từ 8 đến 128 ký tự.');
    const purpose=authMode==='register'?'register':'reset_password';
    const result=await appsScriptJsonp({action:'requestOtp',email,role:'GIAOVIEN',purpose,displayName:name,guestId:getGuestId()});
    if(!result||!result.ok)throw new Error(result&&result.error||'Không gửi được OTP.');
    otpRequestId=result.otpId;el.otpField.hidden=false;el.authOtp.focus();toast('Đã gửi OTP đến email. Mã có hiệu lực 5 phút.');
  }catch(e){el.authError.textContent=e.message||'Không gửi được OTP.';el.authError.hidden=false;}
}
async function loadSession(){
  let saved=null;
  try{
    const raw=await store.getItem(SKEY);saved=raw?JSON.parse(raw):null;
    if(saved&&saved.sessionToken){
      let live;
      try{live=await appsScriptJsonp({action:'session',sessionToken:saved.sessionToken,guestId:saved.guestId||''});}
      catch(networkError){window.quizCraftSession=saved;authButton(saved);return;}
      if(live&&live.ok&&live.authenticated){
        window.quizCraftSession={...saved,...live.session,sessionToken:saved.sessionToken};
        if(live.session.role==='GIAOVIEN')TEACHER_CODE=live.session.teacherId||TEACHER_CODE;
        await store.setItem(SKEY,JSON.stringify(window.quizCraftSession));authButton(window.quizCraftSession);return;
      }
      await store.removeItem(SKEY);
    }
    window.quizCraftSession=null;authButton(null);
  }catch(e){
    if(saved&&saved.sessionToken){window.quizCraftSession=saved;authButton(saved);return;}
    window.quizCraftSession=null;authButton(null);
  }
}
async function authSubmit(event){
  event.preventDefault();
  const email=el.authEmail.value.trim().toLowerCase(),password=el.authPassword.value,enteredName=el.authName.value.trim(),guestId=getGuestId();
  try{
    if(!email)throw new Error('Hãy nhập email.');
    if(authMode==='login'){
      if(!password)throw new Error('Hãy nhập mật khẩu.');
      const result=await appsScriptJsonp({action:'login',email,password,guestId});
      if(!result||!result.ok)throw new Error(result&&result.error||'Email hoặc mật khẩu không đúng.');
      const session={...result.session,sessionToken:result.sessionToken,guestId:result.session.guestId||guestId};
      await store.setItem(SKEY,JSON.stringify(session));window.quizCraftSession=session;try{localStorage.setItem(AUTH_EMAIL_KEY,email);}catch(e){}
      if(session.role==='GIAOVIEN')TEACHER_CODE=session.teacherId||TEACHER_CODE;
      authButton(session);el.authModal.hidden=true;loadTeacherIntegrationState();toast('Đăng nhập thành công.');return;
    }
    if(password.length<8||password.length>128)throw new Error('Mật khẩu phải có từ 8 đến 128 ký tự.');
    if(!otpRequestId)throw new Error('Hãy nhấn “Gửi mã OTP” trước.');
    const purpose=authMode==='register'?'register':'reset_password';
    const result=await appsScriptJsonp({action:'verifyOtp',email,role:'GIAOVIEN',purpose,otpId:otpRequestId,otp:el.authOtp.value.trim(),password,displayName:enteredName,guestId});
    if(!result||!result.ok)throw new Error(result&&result.error||'OTP không hợp lệ.');
    otpRequestId='';
    if(result.passwordReset){authModeSet('login');el.authEmail.value=email;toast('Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới.');return;}
    const session={...result.session,sessionToken:result.sessionToken,guestId:result.session.guestId||guestId};
    await store.setItem(SKEY,JSON.stringify(session));window.quizCraftSession=session;try{localStorage.setItem(AUTH_EMAIL_KEY,email);}catch(e){}
    if(session.role==='GIAOVIEN')TEACHER_CODE=session.teacherId||TEACHER_CODE;
    authButton(session);el.authModal.hidden=true;loadTeacherIntegrationState();toast('Tạo tài khoản và đăng nhập thành công.');
  }catch(e){el.authError.textContent=e.message||'Không thể xác thực tài khoản.';el.authError.hidden=false;}
}
function onGoogleTeacherCredential(response){
  const credential=String(response&&response.credential||'');
  if(!credential){toast('Google không trả về mã xác thực.');return;}
  appsScriptJsonp({action:'googleLogin',idToken:credential,role:'GIAOVIEN',guestId:getGuestId()}).then(async result=>{
    if(!result||!result.ok)throw new Error(result&&result.error||'Đăng nhập Google thất bại.');
    const session={...result.session,sessionToken:result.sessionToken,guestId:result.session.guestId||getGuestId()};
    await store.setItem(SKEY,JSON.stringify(session));window.quizCraftSession=session;
    if(session.teacherId)TEACHER_CODE=session.teacherId;
    authButton(session);el.authModal.hidden=true;el.closeAuthBtn.hidden=false;loadTeacherIntegrationState();toast('Đăng nhập Google thành công.');
  }).catch(error=>{if(el.authError){el.authError.textContent=error.message||'Không thể đăng nhập Google.';el.authError.hidden=false;}});
}
function initGoogleTeacherAuth(){
  if(!el.googleAuthMount||!el.googleAuthNote)return;
  if(!GOOGLE_CLIENT_ID||GOOGLE_CLIENT_ID.indexOf('.apps.googleusercontent.com')<0){el.googleAuthNote.textContent='Login';return;}
  const render=()=>{
    if(!window.google||!google.accounts||!google.accounts.id)return false;
    google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:onGoogleTeacherCredential,auto_select:false});
    google.accounts.id.renderButton(el.googleAuthMount,{type:'standard',shape:'rectangular',theme:'outline',size:'large',text:'continue_with',locale:'vi',width:280});
    el.googleAuthNote.textContent='Đăng nhập an toàn bằng tài khoản Google.';return true;
  };
  let attempts=0;const wait=()=>{if(render()||attempts++>30)return;setTimeout(wait,250);};wait();
}

async function logout(){if(!await window.confirm('Bạn có chắc chắn muốn đăng xuất khỏi tài khoản này không?'))return;try{const s=window.quizCraftSession;if(s&&s.sessionToken)await appsScriptJsonp({action:'logout',sessionToken:s.sessionToken,guestId:s.guestId||''});await store.removeItem(SKEY);window.quizCraftSession=null;authButton(null);el.settingsModal.hidden=true;loadTeacherIntegrationState();toast(t('auth.loggedOut'));}catch(e){toast(t('auth.failed'));}}

/* ==================== Automatic JSON import ==================== */
let pendingJsonQuestions=[];
let pendingJsonProject=null;
let pendingJsonProjectSets=[];
let pendingJsonSkipped=0;
let pendingJsonSkipDetails=[];
function setCreationMode(mode){
  const automatic=mode==='auto';
  el.manualQuestionEditor.hidden=automatic;el.autoJsonPanel.hidden=!automatic;
  el.manualModeBtn.classList.toggle('button-primary',!automatic);el.manualModeBtn.classList.toggle('button-ghost',automatic);
  el.autoModeBtn.classList.toggle('button-primary',automatic);el.autoModeBtn.classList.toggle('button-ghost',!automatic);
  el.manualModeBtn.setAttribute('aria-pressed',String(!automatic));el.autoModeBtn.setAttribute('aria-pressed',String(automatic));
}
function normalizeImportedQuestion(raw,index){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Dữ liệu câu hỏi không hợp lệ.');
  // Hỗ trợ các cách ghi loại câu phổ biến mà AI đôi khi tự thay đổi.
  const typeKey=String(raw.type||raw.questionType||raw.question_type||raw.loai||raw.loaiCau||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const aliases={
    multiple:'multiple',multiplechoice:'multiple',mcq:'multiple',choice:'multiple',tracnghiem:'multiple',cauhoitracnghiem:'multiple',
    truefalse:'truefalse',trueorfalse:'truefalse',tf:'truefalse',dungsai:'truefalse',dungsa:'truefalse',
    short:'short',shortanswer:'short',shortresponse:'short',traloi:'short',traloingan:'short',
    essay:'essay',subjective:'essay',longanswer:'essay',tuluan:'essay'
  };
  let type=aliases[typeKey];
  if(!type){
    if(Array.isArray(raw.statements)||Array.isArray(raw.assertions))type='truefalse';
    else if(Array.isArray(raw.options)||Array.isArray(raw.choices)||Array.isArray(raw.answers))type='multiple';
  }
  if(!type)throw new Error('Không nhận diện được loại câu hỏi.');
  const prompt=String(raw.prompt??raw.question??raw.questionText??raw.question_text??raw.content??raw.stem??raw.text??'').trim();
  const explanation=String(raw.explanation??raw.solution??raw.rationale??raw.giaiThich??raw.giai_thich??'');
  const legacyMedia=validMedia(raw.media);
  const mediaItems=(Array.isArray(raw.mediaItems)?raw.mediaItems:Array.isArray(raw.media_items)?raw.media_items:[]).map(validMedia).filter(x=>x.url);
  if(!mediaItems.length&&legacyMedia.url)mediaItems.push(legacyMedia);
  const questionMedia=legacyMedia.url?legacyMedia:(mediaItems[0]||{type:'none',url:''});
  if(!prompt&&!questionMedia.url)throw new Error('Thiếu nội dung câu hỏi.');
  const q={id:'json-'+Date.now()+'-'+index+'-'+Math.random().toString(36).slice(2,7),type,prompt,level:String(raw.level??raw.difficulty??''),explanation,explanationMedia:(Array.isArray(raw.explanationMedia)?raw.explanationMedia:[]).map(validMedia).filter(x=>x.url),imageSuggestion:String(raw.imageSuggestion??raw.image_suggestion??''),media:questionMedia,mediaItems};
  if(type==='multiple'){
    const sourceOptions=raw.options??raw.choices??raw.answers;
    if(!Array.isArray(sourceOptions)||sourceOptions.length<2||sourceOptions.length>4)throw new Error('Trắc nghiệm cần từ 2 đến 4 lựa chọn.');
    q.options=sourceOptions.map(x=>String(x&&typeof x==='object'?(x.text??x.label??x.content??x.value??''):x??'').trim());
    q.optionMedia=Array.from({length:q.options.length},(_,i)=>validMedia(raw.optionMedia?.[i]??raw.option_media?.[i]));
    q.explanations=Array.from({length:q.options.length},(_,i)=>String((raw.explanations??raw.optionExplanations??raw.option_explanations)?.[i]??''));
    if(q.options.some((x,i)=>!x&&!q.optionMedia[i].url))throw new Error('Có lựa chọn bị trống.');
    let answer=raw.answer??raw.correctAnswer??raw.correct_answer??raw.answerIndex??raw.answer_index??raw.correctOption??raw.correct_option??raw.key;
    if(answer&&typeof answer==='object')answer=answer.index??answer.value??answer.text??answer.option;
    if(typeof answer==='string'){
      const a=answer.trim();const letter=a.match(/(?:^|\b)([A-D])(?:\b|$)/i);
      if(letter)answer=letter[1].toUpperCase().charCodeAt(0)-65;
      else if(q.options.includes(a))answer=q.options.indexOf(a);
      else if(/^\d+$/.test(a))answer=Number(a);
    }
    if(answer===undefined||answer===null||answer==='')throw new Error('Câu trắc nghiệm chưa có đáp án hợp lệ; câu này được bỏ qua để tránh chấm sai.');
    q.answer=Number(answer);if(!Number.isInteger(q.answer)||q.answer<0||q.answer>=q.options.length)throw new Error('Đáp án trắc nghiệm không hợp lệ; câu này được bỏ qua để tránh chấm sai.')
  }else if(type==='truefalse'){
    const sourceStatements=raw.statements??raw.assertions;
    if(!Array.isArray(sourceStatements)||sourceStatements.length<2||sourceStatements.length>4)throw new Error('Đúng/sai cần từ 2 đến 4 phát biểu.');
    const toBoolean=value=>{
      if(typeof value==='boolean')return value;
      if(value===1||String(value).trim().toLowerCase()==='true'||String(value).trim().toLowerCase()==='đúng')return true;
      if(value===0||String(value).trim().toLowerCase()==='false'||String(value).trim().toLowerCase()==='sai')return false;
      return null;
    };
    q.statements=sourceStatements.map((st,j)=>{
      const text=String(st&&typeof st==='object'?(st.text??st.statement??st.content??st.prompt??''):st??'').trim();
      const correct=toBoolean(st&&typeof st==='object'?(st.correct??st.isCorrect??st.is_correct??st.answer):null);
      if(!text||correct===null)throw new Error('Phát biểu '+(j+1)+' thiếu nội dung hoặc đáp án đúng/sai; câu này được bỏ qua.');
      return{text,correct:correct===true,media:(Array.isArray(st?.media)?st.media:[]).map(validMedia).filter(x=>x.url)};
    });
  }else{
    q.answer=String(raw.answer??raw.sampleAnswer??raw.sample_answer??raw.modelAnswer??raw.model_answer??'').trim();
    if(type==='short'&&!q.answer)throw new Error('Câu trả lời ngắn chưa có đáp án; câu này được bỏ qua.')
  }
  const normalized=normalize(q);if(!valid(normalized))throw new Error('Dữ liệu câu hỏi chưa đủ để tạo câu hỏi.');return normalized;
}
function extractJsonCandidate(source){
  let text=String(source||'').replace(/^\uFEFF/,'').trim();
  // Bỏ hàng rào Markdown nếu AI vẫn trả về ```json ... ```
  text=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  // Nếu AI thêm lời dẫn, lấy vùng JSON đầu tiên có cân bằng ngoặc.
  const start=text.search(/[\[{]/);
  if(start>0)text=text.slice(start);
  if(start<0)throw new Error('Không tìm thấy object hoặc mảng JSON. Hãy yêu cầu AI chỉ xuất JSON.');
  let quote=false,escape=false,depth=0,end=-1;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quote){if(escape){escape=false;continue;}if(c==='\\'){escape=true;continue;}if(c==='"')quote=false;continue;}
    if(c==='"'){quote=true;continue;}
    if(c==='{'||c==='[')depth++;
    else if(c==='}'||c===']'){depth--;if(depth===0){end=i+1;break;}}
  }
  if(end>0)text=text.slice(0,end);
  return text.trim();
}
function repairCommonJsonTypos(source){
  let out='',inside=false,escape=false;
  for(let i=0;i<source.length;i++){
    const c=source[i];
    if(!inside){out+=c;if(c==='"')inside=true;continue;}
    if(escape){out+=c;escape=false;continue;}
    if(c==='\\'){out+=c;escape=true;continue;}
    if(c==='"'){
      // Một guillemet au milieu d'une phrase (ex. "un "mot" dans la phrase")
      // n'est pas un terminateur JSON si le prochain token ne peut pas suivre une valeur.
      let j=i+1;while(j<source.length&&/\s/.test(source[j]))j++;
      const next=source[j];
      if(next===','||next===':'||next==='}'||next===']'||next===undefined){out+=c;inside=false;}
      else out+='\\'+c;
      continue;
    }
    out+=c;
  }
  // Xóa dấu phẩy thừa ngay trước ] hoặc } nhưng không đụng vào nội dung chuỗi.
  let cleaned='',inString=false,esc=false;
  for(let i=0;i<out.length;i++){
    const c=out[i];
    if(inString){cleaned+=c;if(esc)esc=false;else if(c==='\\')esc=true;else if(c==='"')inString=false;continue;}
    if(c==='"'){inString=true;cleaned+=c;continue;}
    if(c===','){let j=i+1;while(j<out.length&&/\s/.test(out[j]))j++;if(out[j]===']'||out[j]==='}')continue;}
    cleaned+=c;
  }
  return cleaned;
}
function parseFlexibleJson(source){
  const candidate=extractJsonCandidate(source);
  try{return JSON.parse(candidate);}
  catch(firstError){
    const repaired=repairCommonJsonTypos(candidate);
    if(repaired!==candidate){try{return JSON.parse(repaired);}catch(secondError){}}
    // Nếu JSON tổng bị lỗi cú pháp ở một phần tử, thử tách từng object trong mảng questions.
    const salvaged=salvageQuestionObjects(repaired||candidate);
    if(salvaged.projects?.length)return {format:'quiz-craft-multi-project',projects:salvaged.projects,__salvaged:true,__salvagedSkipped:Math.max(0,salvaged.total-salvaged.validCount)};
    if(salvaged.items.length)return {questions:salvaged.items,__salvaged:true,__salvagedSkipped:Math.max(0,salvaged.total-salvaged.items.length)};
    throw firstError;
  }
}
function salvageQuestionObjects(source){
  const projectMatch=source.match(/"(?:projects|deThi|de_thi)"\s*:\s*\[/i);
  const questionPattern=/"(?:questions|cauHoi|cau_hoi|items)"\s*:\s*\[/ig;
  const matches=[...source.matchAll(questionPattern)];
  const extractObjects=(arrayStart)=>{
    let inString=false,escape=false,arrayDepth=1,objectDepth=0,itemStart=-1,total=0;
    const items=[];
    for(let i=arrayStart+1;i<source.length;i++){
      const c=source[i];
      if(inString){if(escape){escape=false;continue;}if(c==='\\'){escape=true;continue;}if(c==='"')inString=false;continue;}
      if(c==='"'){inString=true;continue;}
      if(c==='{'&&arrayDepth===1){if(objectDepth===0)itemStart=i;objectDepth++;continue;}
      if(c==='}'&&objectDepth>0){objectDepth--;if(objectDepth===0&&itemStart>=0){total++;const piece=source.slice(itemStart,i+1);try{const repaired=repairCommonJsonTypos(piece);const parsed=JSON.parse(repaired);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))items.push(parsed);}catch(e){}itemStart=-1;}continue;}
      if(objectDepth===0){if(c==='[')arrayDepth++;else if(c===']'){arrayDepth--;if(arrayDepth===0)break;}}
    }
    return {items,total};
  };
  if(matches.length){
    const projects=[];let total=0,validCount=0;
    for(const match of matches){
      const keyEnd=match.index+match[0].length-1;const extracted=extractObjects(keyEnd);total+=extracted.total;validCount+=extracted.items.length;
      if(!extracted.items.length)continue;
      if(projectMatch&&match.index>projectMatch.index){
        const before=source.slice(projectMatch.index,match.index);
        const names=[...before.matchAll(/"(?:name|projectName|projectTitle|title)"\s*:\s*"((?:\\.|[^"\\])*)"/gi)];
        const codes=[...before.matchAll(/"(?:examCode|exam_code|formCode|form_code|maDe|ma_de|maDeThi|ma_de_thi|mã đề|Mã đề)"\s*:\s*"((?:\\.|[^"\\])*)"/gi)];
        const decode=value=>{try{return JSON.parse('"'+value+'"');}catch(e){return value;}};
        const name=names.length?decode(names[names.length-1][1]):'Đề được khôi phục';
        const code=codes.length?decode(codes[codes.length-1][1]):'';
        projects.push({name,examCode:code,questions:extracted.items});
      }else{
        projects.push(...[]);
      }
    }
    if(projectMatch&&projects.length)return {items:[],projects,total,validCount};
    const flat=matches.length?matches.reduce((all,match)=>all.concat(extractObjects(match.index+match[0].length-1).items),[]):[];
    return {items:flat,total,validCount:flat.length};
  }
  // Hỗ trợ trường hợp JSON gốc là một mảng câu hỏi, không có key questions.
  const first=source.search(/[\[]/);if(first>=0){const extracted=extractObjects(first);if(extracted.items.length)return {...extracted,validCount:extracted.items.length};}
  return {items:[],projects:[],total:0,validCount:0};
}
function importedExamCode(value){
  if(!value||typeof value!=='object')return '';
  const raw=value.examCode??value.exam_code??value.formCode??value.form_code??value.maDe??value.ma_de??value.maDeThi??value.ma_de_thi??value['mã đề']??value['Mã đề']??value['mã đề thi']??value.codeDe??value.code_de??'';
  return String(raw??'').trim();
}
function normalizeQuestionRows(rows,label){
  const accepted=[];const errors=[];
  rows.forEach((raw,index)=>{try{accepted.push(normalizeImportedQuestion(raw,index));}catch(error){errors.push((label?label+' · ':'')+'Câu '+(index+1)+': '+(error&&error.message||'dữ liệu không hợp lệ'));}});
  return {questions:accepted,errors};
}
function projectNameForImport(item,index,code,baseTitle){
  const explicit=String(item?.name||item?.projectName||item?.projectTitle||item?.title||'').trim();
  if(explicit){
    if(code&&!explicit.toLocaleLowerCase().includes(String(code).toLocaleLowerCase()))return explicit+' - Mã đề '+code;
    return explicit;
  }
  const base=String(baseTitle||'Đề được nhập').trim();
  return code?base+' - Mã đề '+code:(index===0?base:base+' - Phần '+(index+1));
}
function parseJsonImport(){
  const status=el.jsonImportStatus,preview=el.jsonImportPreview,apply=el.applyJsonImportBtn;
  pendingJsonQuestions=[];pendingJsonProject=null;pendingJsonProjectSets=[];pendingJsonSkipped=0;pendingJsonSkipDetails=[];
  apply.disabled=true;apply.textContent='Thêm câu hỏi vào bộ đề';preview.hidden=true;status.hidden=false;status.classList.remove('error');
  try{
    const parsed=parseFlexibleJson(el.jsonImportText.value);
    const rootCode=importedExamCode(parsed);
    const sourceTitle=String(parsed?.title||parsed?.name||parsed?.project?.name||'Đề được nhập').trim();
    let groups=[];
    const declaredProjects=Array.isArray(parsed?.projects)?parsed.projects:null;
    if(declaredProjects){
      declaredProjects.forEach((item,index)=>{
        if(!item||typeof item!=='object'||Array.isArray(item)){pendingJsonSkipped++;pendingJsonSkipDetails.push('Dự án '+(index+1)+': cấu trúc dự án không hợp lệ');return;}
        const rows=Array.isArray(item.questions)?item.questions:(Array.isArray(item.items)?item.items:[]);
        const code=importedExamCode(item)||String(item.examCode||'').trim();
        const normalized=normalizeQuestionRows(rows,String(item.name||item.title||code||('Dự án '+(index+1))));
        pendingJsonSkipped+=normalized.errors.length;pendingJsonSkipDetails.push(...normalized.errors);
        if(!normalized.questions.length){pendingJsonSkipped+=rows.length?0:1;pendingJsonSkipDetails.push('Dự án '+(index+1)+': không còn câu hỏi hợp lệ, đã bỏ qua dự án');return;}
        groups.push({name:projectNameForImport(item,index,code,sourceTitle),examCode:code,meta:item.meta&&typeof item.meta==='object'?item.meta:{},settings:item.settings&&typeof item.settings==='object'?item.settings:{},questions:normalized.questions});
      });
      pendingJsonProjectSets=groups;
    }else{
      const list=Array.isArray(parsed)?parsed:parsed?.questions;
      if(!Array.isArray(list)||!list.length)throw new Error('Không tìm thấy danh sách câu hỏi. Cần mảng câu hỏi hoặc object có thuộc tính "questions".');
      const singleProjectPackage=parsed&&parsed.format==='quiz-craft-project'&&parsed.project&&typeof parsed.project==='object'?parsed.project:null;
      const questionCodes=list.map(q=>importedExamCode(q));
      const hasQuestionCodes=questionCodes.some(Boolean);
      const effectiveCodes=questionCodes.map(code=>code||rootCode);
      const uniqueCodes=[...new Set(effectiveCodes.filter(Boolean))];
      if(hasQuestionCodes||rootCode){
        const buckets=new Map();
        list.forEach((raw,index)=>{const code=effectiveCodes[index]||'Chưa xác định mã đề';if(!buckets.has(code))buckets.set(code,[]);buckets.get(code).push({raw,index});});
        let groupIndex=0;
        for(const [code,entries] of buckets){
          const normalized=normalizeQuestionRows(entries.map(x=>x.raw),'Mã đề '+code);
          pendingJsonSkipped+=normalized.errors.length;pendingJsonSkipDetails.push(...normalized.errors);
          if(normalized.questions.length){
            groups.push({name:code==='Chưa xác định mã đề'?sourceTitle+' - Chưa xác định mã đề':projectNameForImport(parsed,groupIndex,code,sourceTitle),examCode:code==='Chưa xác định mã đề'?'':code,meta:{title:projectNameForImport(parsed,groupIndex,code,sourceTitle),description:''},settings:{},questions:normalized.questions});
            groupIndex++;
          }
        }
        pendingJsonProjectSets=groups;
      }else{
        const normalized=normalizeQuestionRows(list,'');
        pendingJsonSkipped+=normalized.errors.length;pendingJsonSkipDetails.push(...normalized.errors);
        pendingJsonQuestions=normalized.questions;
        pendingJsonProject=singleProjectPackage;
        if(pendingJsonProject&&pendingJsonQuestions.length)el.jsonImportMode.value='replace';
      }
    }
    if(parsed?.__salvaged){
      const syntaxSkipped=Number(parsed.__salvagedSkipped)||0;pendingJsonSkipped+=syntaxSkipped;
      if(syntaxSkipped)pendingJsonSkipDetails.unshift('Đã bỏ qua '+syntaxSkipped+' câu có lỗi cú pháp JSON; các câu đọc được vẫn được giữ lại.');
      else pendingJsonSkipDetails.unshift('JSON gốc có lỗi cú pháp; hệ thống đã khôi phục các câu đọc được.');
    }
    const validCount=pendingJsonProjectSets.reduce((sum,item)=>sum+item.questions.length,0)+pendingJsonQuestions.length;
    if(!validCount){
      status.textContent='Không tìm thấy câu hỏi hợp lệ để nhập. '+pendingJsonSkipped+' câu/dòng đã bị bỏ qua. Hãy kiểm tra nội dung JSON hoặc yêu cầu AI xuất lại.';
      preview.textContent=pendingJsonSkipDetails.slice(0,12).join('\n')||'Không phát hiện được object câu hỏi hợp lệ.';preview.hidden=false;return;
    }
    const previewLines=[];
    if(pendingJsonProjectSets.length){
      pendingJsonProjectSets.forEach((group,index)=>previewLines.push('Dự án '+(index+1)+': '+group.name+' · '+group.questions.length+' câu'+(group.examCode?' · Mã đề '+group.examCode:'')));
      status.textContent='Nhận diện được '+pendingJsonProjectSets.length+' mã đề/dự án riêng, tổng '+validCount+' câu hợp lệ.';
      apply.textContent='Tạo '+pendingJsonProjectSets.length+' dự án từ mã đề';
    }else{
      previewLines.push('Sẽ nhập '+pendingJsonQuestions.length+' câu vào dự án hiện tại.');
      status.textContent='Đọc được '+pendingJsonQuestions.length+' câu hợp lệ.';
    }
    if(pendingJsonSkipped){status.textContent+=' Đã tự động bỏ qua '+pendingJsonSkipped+' câu/dòng lỗi.';}
    if(pendingJsonProject){status.textContent+=' · Có thông tin dự án và media đính kèm. Đã chọn thay thế để chuyển dự án đầy đủ.';}
    if(pendingJsonSkipDetails.length)previewLines.push('Các mục đã bỏ qua (không làm hỏng phần còn lại):',...pendingJsonSkipDetails.slice(0,12));
    const listForPreview=pendingJsonProjectSets.length?pendingJsonProjectSets.flatMap(group=>group.questions.map(q=>({q,group:group.name}))):pendingJsonQuestions.map(q=>({q,group:''}));
    listForPreview.slice(0,80).forEach((entry,i)=>{const q=entry.q;previewLines.push((i+1)+'. '+(entry.group?'['+entry.group+'] ':'')+(q.type==='multiple'?'Trắc nghiệm':q.type==='truefalse'?'Đúng / Sai':q.type==='short'?'Trả lời ngắn':'Tự luận')+' — '+q.prompt+(q.imageSuggestion?' [Cần ảnh: '+q.imageSuggestion+']':''));});
    preview.textContent=previewLines.join('\n');preview.hidden=false;apply.disabled=false;
  }catch(error){
    status.classList.add('error');let detail=error.message||'Định dạng không hợp lệ.';
    if(error instanceof SyntaxError){const m=String(error.message).match(/position (\d+)/i);if(m){const pos=Number(m[1]),raw=el.jsonImportText.value,before=raw.slice(0,pos),line=before.split('\n').length,col=pos-(before.lastIndexOf('\n')+1)+1;detail+=' (gần dòng '+line+', cột '+col+').';}}
    status.textContent='Chưa đọc được cấu trúc JSON tổng thể: '+detail+' Nếu chỉ một vài câu bị sai dữ liệu, hãy thử lại sau khi hệ thống sửa JSON hoặc để AI xuất JSON chuẩn.';
  }
}
async function applyJsonImport(){
  if(!pendingJsonQuestions.length&&!pendingJsonProjectSets.length)return;
  if(pendingJsonProjectSets.length){
    const importedSets=pendingJsonProjectSets.slice();
    await save();
    const createdIds=[];const usedNames=new Set(projects.map(p=>String(p.name||'').trim().toLocaleLowerCase()));
    const defaultSettings=()=>({duration:0,maxScore:10,studentView:'single',answerReveal:'submit',allowRetake:true,shuffle:false,lockMode:'UNLOCKED',lockAt:'',classCode:'',assignmentId:'',projectKey:'',accessMode:'PUBLIC',antiCheat:false,antiCopy:false,antiScreenshot:false,requireStudentEmail:false,points:{multiple:.25,truefalse:.5,short:1,essay:2}});
    importedSets.forEach((group,index)=>{
      let name=String(group.name||'Đề nhập '+(index+1)).trim()||'Đề nhập '+(index+1),base=name,suffix=2;
      while(usedNames.has(name.toLocaleLowerCase()))name=base+' ('+(suffix++)+')';
      usedNames.add(name.toLocaleLowerCase());
      activeProjectId=createProjectId();createdIds.push(activeProjectId);projectName=name;
      questions=group.questions.slice();
      meta={title:name,description:'Dự án được tự động tạo từ JSON'+(group.examCode?' · Mã đề '+group.examCode:''),...(group.meta||{})};meta.title=name;
      settings={...defaultSettings(),...(group.settings||{}),assignmentId:'',assignmentOwnerId:'',projectKey:'',points:{...defaultSettings().points,...(group.settings?.points||{})}};
      projects.push(projectSnapshot());
    });
    const first=projects.find(project=>project.id===createdIds[0]);if(first)hydrateProject(first);
    await save();renderProjects();applyMeta();renderBank();resetForm();await clearDraft();await clearProgress();loadTeacherIntegrationState();
    const total=importedSets.reduce((sum,group)=>sum+group.questions.length,0);
    toast('Đã tự tạo '+importedSets.length+' dự án riêng với '+total+' câu hỏi'+(pendingJsonSkipped?' · Bỏ qua '+pendingJsonSkipped+' câu/dòng lỗi':'')+'.');
  }else{
    const imported=pendingJsonQuestions.slice(),projectPackage=pendingJsonProject;
    if(el.jsonImportMode.value==='replace'&&questions.length&&!await window.confirm('Thay thế toàn bộ '+questions.length+' câu hỏi hiện tại bằng '+imported.length+' câu hợp lệ từ JSON?'))return;
    if(el.jsonImportMode.value==='replace'){
      questions=[];
      if(projectPackage){
        const importedMeta=projectPackage.meta&&typeof projectPackage.meta==='object'?projectPackage.meta:{};
        meta={...meta,...importedMeta};if(projectPackage.name)projectName=String(projectPackage.name);
        const importedSettings=projectPackage.settings&&typeof projectPackage.settings==='object'?projectPackage.settings:{};
        const safeKeys=['duration','maxScore','answerReveal','allowRetake','shuffle','points','antiCheat','antiCopy','antiScreenshot','requireStudentEmail'];
        const safeSettings=Object.fromEntries(safeKeys.filter(key=>Object.prototype.hasOwnProperty.call(importedSettings,key)).map(key=>[key,importedSettings[key]]));
        settings={...settings,...safeSettings,assignmentId:'',assignmentOwnerId:'',projectKey:''};
        if(importedSettings.points&&typeof importedSettings.points==='object')settings.points={...settings.points,...importedSettings.points};
        applyMeta();renderProjects();
      }
    }
    questions.push(...imported);await save();renderProjects();await store.removeItem(DKEY).catch(()=>{});renderBank();
    toast('Đã nhập '+imported.length+' câu hỏi hợp lệ.'+(pendingJsonSkipped?' · Bỏ qua '+pendingJsonSkipped+' câu lỗi.':'')+(imported.filter(q=>q.imageSuggestion).length?' · '+imported.filter(q=>q.imageSuggestion).length+' câu cần bổ sung ảnh.':''));
  }
  pendingJsonQuestions=[];pendingJsonProject=null;pendingJsonProjectSets=[];pendingJsonSkipped=0;pendingJsonSkipDetails=[];el.applyJsonImportBtn.disabled=true;el.applyJsonImportBtn.textContent='Thêm câu hỏi vào bộ đề';el.jsonImportStatus.hidden=true;el.jsonImportPreview.hidden=true;el.jsonImportText.value='';el.jsonImportFile.value='';setCreationMode('manual');
}

