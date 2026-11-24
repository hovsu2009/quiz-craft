/* ============================================================
   Quiz Craft — student quiz and student export features
   Uses shared top-level state from app.js and teacher.js.
   Keep this as a classic script (not type="module").
   ============================================================ */

/* ==================== Quiz taking view ==================== */
function view(name){
  const isQuiz=name==='quiz';
  if(isQuiz)flushEditorAutosave();
  el.editorView.hidden=isQuiz;el.quizView.hidden=!isQuiz;
  document.querySelectorAll('.tab').forEach(tab=>tab.classList.toggle('is-active',tab.dataset.view===name));
  if(isQuiz)startQuiz();else{if(!submitted)saveProgress();stopTimer();}
}
function timeText(s){return Math.floor(s/60).toString().padStart(2,'0')+':'+(s%60).toString().padStart(2,'0');}
function stopTimer(){if(timerId)clearInterval(timerId);timerId=null;}
function startTimer(resume=false){
  stopTimer();
  if(!resume||!remainingSeconds)remainingSeconds=Math.max(0,Math.round(Number(settings.duration)*60));
  if(!remainingSeconds){el.quizTimer.textContent='∞';el.quizTimer.classList.remove('warn');return;}
  el.quizTimer.textContent=timeText(remainingSeconds);
  timerId=setInterval(()=>{remainingSeconds--;el.quizTimer.textContent=timeText(Math.max(0,remainingSeconds));
    if(remainingSeconds<=60)el.quizTimer.classList.add('warn');
    if(remainingSeconds%5===0)scheduleProgressSave();
    if(remainingSeconds<=0){stopTimer();toast(t('quiz.timeUp'));finish(true);}},1000);
}

/* ---- Progress auto-save (chống mất khi thoát/load lại) ---- */
function progressKey(){return PROGKEY+'-'+activeProjectId;}
let progressTimer=0;
async function saveProgress(){
  if(submitted){try{await store.removeItem(progressKey());}catch(e){}return;}
  try{await store.setItem(progressKey(),JSON.stringify({answers,essayScores,tfConfirmed,current,remainingSeconds,currentStreak,bestStreak,elapsedMs:quizElapsedBeforeResume+(quizStartTime?Date.now()-quizStartTime:0),savedAt:Date.now()}));}catch(e){}
}
function scheduleProgressSave(){clearTimeout(progressTimer);progressTimer=setTimeout(saveProgress,400);}
async function loadProgress(){try{const raw=await store.getItem(progressKey());return raw?JSON.parse(raw):null;}catch(e){return null;}}
async function clearProgress(){try{await store.removeItem(progressKey());}catch(e){}}

async function startQuiz(){
  current=0;revealed=false;submitted=false;answers={};essayScores={};tfConfirmed={};currentStreak=0;bestStreak=0;quizElapsedBeforeResume=0;quizStartTime=Date.now();
  el.quizCard.hidden=!questions.length;el.quizEmpty.hidden=!!questions.length;el.resultCard.hidden=true;
  el.resultNote.hidden=true;el.quizBottomNav.hidden=!questions.length;el.restoreBar.hidden=true;
  el.quizStreak.hidden=settings.answerReveal!=='per-question';el.quizStreak.textContent=t('quiz.streak',{count:0});
  el.quizScore.textContent=t('quiz.score');
  el.showExplanationsToggle.checked=true;
  if(questions.length){
    const saved=await loadProgress();
    const hasAnswers=saved&&saved.answers&&Object.keys(saved.answers).length>0;
    if(hasAnswers){
      el.restoreBar.hidden=false;
      el.restoreProgressBtn.onclick=()=>{
        answers=saved.answers||{};essayScores=saved.essayScores||{};tfConfirmed=saved.tfConfirmed||{};
        current=Math.max(0,Math.min(questions.length-1,Number(saved.current)||0));
        remainingSeconds=Number(saved.remainingSeconds)||0;currentStreak=saved.currentStreak||0;bestStreak=saved.bestStreak||0;
        el.quizStreak.textContent=t('quiz.streak',{count:currentStreak});
        quizElapsedBeforeResume=Math.max(0,Number(saved.elapsedMs)||0);quizStartTime=Date.now();
        if(Number(settings.duration)>0){
          if(remainingSeconds>0)startTimer(true);
          else{el.restoreBar.hidden=true;finish(true);return;}
        }
        el.restoreBar.hidden=true;renderQuiz();toast(t('messages.progressRestored'));
      };
      el.discardProgressBtn.onclick=async()=>{await clearProgress();remainingSeconds=0;startTimer();el.restoreBar.hidden=true;renderQuiz();toast(t('messages.progressDiscarded'));};
    }else startTimer();
    renderQuiz();
  }else startTimer();
}

function norm(v){
  const value=String(v??'').trim().toLocaleLowerCase().replace(/\s+/g,' ');
  const repeatedChoice=value.match(/^([a-d])\s*[.)]\s*\1\s*[.)](?:\s*.*)?$/i);
  if(repeatedChoice)return repeatedChoice[1].toLocaleLowerCase();
  const numeric=value.match(/^([+-]?)(\d+)$/);
  if(!numeric)return value;
  const digits=numeric[2].replace(/^0+(?=\d)/,'');
  if(digits==='0')return '0';
  return (numeric[1]==='-'?'-':'')+digits;
}
function tfMatchCount(q,response){
  if(!Array.isArray(response))return 0;
  let m=0;q.statements.forEach((s,j)=>{if(s.text&&response[j]===String(s.correct))m++;});return m;
}
function earnedFor(q,response,essayScore,index){
  const pts=Number(settings.points[q.type])||0;
  if(q.type==='multiple')return Number(response)===q.answer?pts:0;
  if(q.type==='truefalse'){
    if(settings.answerReveal==='per-question'&&!tfConfirmed[index])return 0;
    const total=q.statements.filter(s=>s.text).length;
    return total?(tfMatchCount(q,response)/total)*pts:0;
  }
  if(q.type==='short')return norm(response)===norm(q.answer)?pts:0;
  return Math.max(0,Math.min(pts,Number(essayScore)||0));
}
function fullyCorrect(q,response,index){
  if(q.type==='multiple')return Number(response)===q.answer;
  if(q.type==='truefalse')return (settings.answerReveal!=='per-question'||!!tfConfirmed[index])&&Array.isArray(response)&&tfMatchCount(q,response)===q.statements.filter(s=>s.text).length;
  if(q.type==='short')return norm(response)===norm(q.answer);
  return false;
}
function rawTotal(){return questions.reduce((s,q)=>s+Number(settings.points[q.type]||0),0);}
function rawEarned(){return questions.reduce((s,q,i)=>s+earnedFor(q,answers[i],essayScores[i],i),0);}
function score(){const total=rawTotal();return total?Math.min(Number(settings.maxScore),rawEarned()/total*Number(settings.maxScore)):0;}
function capture(){const input=el.quizCard.querySelector('.text-response,.essay-response');if(input)answers[current]=input.value;}
function selectedExplanation(q,value){
  if(q.type==='multiple')return q.explanations?.[Number(value)]||q.explanation||'';
  return q.explanation||'';
}
function removeFeedback(){const old=el.quizCard.querySelector('.feedback');if(old)old.remove();}
function feedbackBox(good,html){
  removeFeedback();
  const box=document.createElement('div');box.className='feedback'+(good?'':' is-wrong');
  const mark=document.createElement('span');mark.className='feedback-mark';mark.textContent=good?'✓':'×';
  const content=document.createElement('div');content.innerHTML=html;
  box.append(mark,content);
  el.quizCard.insertBefore(box,el.quizCard.querySelector('.quiz-actions')||el.quizCard.querySelector('.quiz-navigation-hint')||null);
  el.quizScore.textContent=t('quiz.liveScore',{score:score().toFixed(2),max:settings.maxScore});
}
function updateStreak(good){if(settings.answerReveal!=='per-question'){currentStreak=0;bestStreak=0;el.quizStreak.hidden=true;return;}el.quizStreak.hidden=false;if(good){currentStreak++;bestStreak=Math.max(bestStreak,currentStreak);}else currentStreak=0;el.quizStreak.textContent=t('quiz.streak',{count:currentStreak});}

function syncQuizNavigator(){
  if(!el.quizJump)return;el.quizJump.replaceChildren();
  questions.forEach((q,i)=>{const o=document.createElement('option');o.value=String(i);
    o.textContent=t('navigator.quizQuestion',{number:i+1})+(levelMark(q)?' ['+levelMark(q)+']':'');el.quizJump.append(o);});
  el.quizJump.value=String(current);
  el.quizPrevBtn.disabled=current===0;
  el.quizNextBtn.textContent=current===questions.length-1?t('actions.submit'):'Sau →';
  el.quizProgress.textContent=t('quiz.progress',{current:current+1,total:questions.length});
}

function renderQuiz(){
  const q=questions[current];if(!q){el.quizCard.hidden=true;return;}
  el.quizCard.hidden=false;syncQuizNavigator();el.quizCard.replaceChildren();
  const lab=document.createElement('div');lab.className='quiz-label';lab.textContent=t('quiz.questionLabel',{number:current+1});
  const typeTag=document.createElement('span');typeTag.className='quiz-type';typeTag.textContent=label(q.type);
  const h=document.createElement('h2');h.classList.add('rich-text');h.innerHTML=renderRichText(cleanQuestionPrompt(q.prompt)||'Quan sát hình ảnh và trả lời câu hỏi');
  el.quizCard.append(lab,typeTag,h);
  (q.mediaItems?.length?q.mediaItems:[q.media]).forEach(m=>appendMedia(el.quizCard,m,'quiz-media'));

  if(q.type==='multiple'){
    const choices=document.createElement('div');choices.className='quiz-options';
    q.options.forEach((value,i)=>{
      const btn=document.createElement('button');btn.type='button';btn.className='quiz-option';btn.dataset.answerIndex=String(i);
      const badge=document.createElement('span');badge.className='option-badge';badge.textContent=LETTERS[i];
      const wrap=document.createElement('span');
      const copy=document.createElement('span');copy.className='rich-text';copy.innerHTML=renderRichText(value);wrap.append(copy);
      appendMedia(wrap,q.optionMedia?.[i],'option-media');
      btn.append(badge,wrap);choices.append(btn);
    });
    el.quizCard.append(choices);
  }
  else if(q.type==='truefalse'){
    const hint=document.createElement('p');hint.className='quiz-navigation-hint';hint.textContent=t('quiz.tfHint');
    el.quizCard.append(hint);
    const wrap=document.createElement('div');wrap.className='tf-statements';wrap.dataset.tfGroup='1';
    const cur=Array.isArray(answers[current])?answers[current]:[];
    const confirmByQuestion=settings.answerReveal==='per-question',isConfirmed=!!tfConfirmed[current];
    q.statements.forEach((s,j)=>{
      if(!s.text)return;
      const row=document.createElement('div');row.className='tf-statement';row.dataset.stIndex=j;
      const stt=document.createElement('span');stt.className='tf-stt';stt.textContent=TF_LETTERS[j];
      const txt=document.createElement('div');txt.className='tf-st-text rich-text';txt.innerHTML=renderRichText(s.text);
      (s.media||[]).forEach(m=>appendMedia(txt,m,'option-media'));
      const note=document.createElement('small');note.hidden=true;txt.append(note);
      const tg=document.createElement('div');tg.className='tf-toggle';
      [['true',t('form.trueChoice')],['false',t('form.falseChoice')]].forEach(([val,lab0])=>{
        const b=document.createElement('button');b.type='button';b.className='tf-st-btn';b.dataset.tfIndex=j;b.dataset.tfValue=val;b.textContent=lab0;
        if(cur[j]===val)b.classList.add(val==='true'?'picked-true':'picked-false');
        if(isConfirmed||(!confirmByQuestion&&cur[j]!==undefined))b.disabled=true;
        if(isConfirmed&&cur[j]!==undefined&&cur[j]===val){
          const right=val===String(s.correct);row.classList.add(right?'correct-st':'wrong-st');
          note.hidden=false;note.className=right?'right':'wrong';note.textContent=right?'Bạn chọn đúng.':'Đáp án đúng: '+(s.correct?'Đúng':'Sai');
        }
        tg.append(b);
      });
      row.append(stt,txt,tg);wrap.append(row);
    });
    el.quizCard.append(wrap);
    if(confirmByQuestion){const confirm=document.createElement('button');confirm.type='button';confirm.className='button button-primary tf-confirm-btn';confirm.textContent=isConfirmed?'Đã xác nhận':'Xác nhận câu trả lời';confirm.disabled=isConfirmed;el.quizCard.append(confirm);}
    if(cur.some(x=>x!==undefined)&&(!confirmByQuestion||isConfirmed))showTfSummary(q,cur);
  }
  else{
    const labelNode=document.createElement('label');labelNode.className='response-label';
    labelNode.textContent=t(q.type==='short'?'quiz.shortResponseLabel':'quiz.essayResponseLabel');
    const input=document.createElement(q.type==='short'?'input':'textarea');
    input.className=q.type==='short'?'text-response':'essay-response';
    if(q.type==='short')input.type='text';
    input.value=answers[current]||'';
    input.placeholder=t(q.type==='short'?'quiz.shortPlaceholder':'quiz.essayPlaceholder');
    input.addEventListener('input',()=>{answers[current]=input.value;scheduleProgressSave();});
    labelNode.append(input);el.quizCard.append(labelNode);
  }

  const hint=document.createElement('p');hint.className='quiz-navigation-hint';
  hint.textContent=current===questions.length-1?'Kiểm tra câu trả lời rồi bấm Nộp bài ở thanh điều hướng phía dưới.':'Dùng Trước / Sau ở thanh điều hướng phía dưới để chuyển câu (không bắt buộc làm theo thứ tự).';
  el.quizCard.append(hint);
  el.quizScore.textContent=t('quiz.liveScore',{score:score().toFixed(2),max:settings.maxScore});
}

function showTfSummary(q,cur){
  const ok=tfMatchCount(q,cur);const good=ok===q.statements.filter(s=>s.text).length;
  let html='<strong>'+(good?t('feedback.correct'):t('feedback.tfPartial',{ok}))+'</strong>';
  if(!good){const right=q.statements.map((s,j)=>TF_LETTERS[j]+'. '+(s.correct?'Đúng':'Sai')).join(' · ');
    html+='<p>'+t('feedback.correctAnswer')+': '+right+'</p>';}
  if(el.showExplanationsToggle.checked&&q.explanation)html+='<p>'+t('feedback.explanation')+': '+renderRichText(q.explanation)+'</p>'+(q.explanationMedia||[]).map(m=>'<img class="option-media" src="'+escapeHtml(m.url)+'" alt="">').join('');
  feedbackBox(good,html);
}

function answerPresent(q,index){
  if(!q)return false;const v=answers[index];
  if(q.type==='multiple')return v!==undefined&&v!=='';
  if(q.type==='truefalse'){
    if(settings.answerReveal==='per-question')return !!tfConfirmed[index];
    const required=q.statements.map((s,j)=>s.text?j:-1).filter(j=>j>=0);
    return Array.isArray(v)&&required.length>0&&required.every(j=>v[j]!==undefined);
  }
  return Boolean(String(v||'').trim());
}
function incompleteQuestions(){return questions.map((q,i)=>answerPresent(q,i)?null:i+1).filter(Boolean);}
async function submitQuiz(){capture();const missing=incompleteQuestions();
  if(missing.length&&!await confirm('Bạn chưa làm xong '+missing.length+' câu ('+missing.join(', ')+'). Nộp bài tập luôn?'))return;
  finish(false);}
function stopQuestionMedia(container=el.quizCard){if(!container)return;container.querySelectorAll('audio,video').forEach(media=>{try{media.pause();}catch(e){}try{media.currentTime=0;}catch(e){}});}
function moveQuiz(delta){capture();const next=Math.max(0,Math.min(questions.length-1,current+delta));
  if(next===current)return;stopQuestionMedia();current=next;revealed=false;renderQuiz();scheduleProgressSave();}

function quizClick(event){
  const tfConfirm=event.target.closest('.tf-confirm-btn');
  if(tfConfirm){
    const q=questions[current],cur=Array.isArray(answers[current])?answers[current]:[];
    if(!cur.some(v=>v!==undefined)){toast('Hãy chọn ít nhất một phát biểu trước khi xác nhận.');return;}
    tfConfirmed[current]=true;const good=fullyCorrect(q,cur,current);
    renderQuiz();showTfSummary(q,cur);updateStreak(good);tone(good);scheduleProgressSave();return;
  }
  const tfBtn=event.target.closest('.tf-st-btn');
  if(tfBtn){
    if(settings.answerReveal==='per-question'&&tfConfirmed[current])return;
    const q=questions[current],j=Number(tfBtn.dataset.tfIndex),val=tfBtn.dataset.tfValue,row=tfBtn.closest('.tf-statement');
    answers[current]=Array.isArray(answers[current])?answers[current]:[undefined,undefined,undefined,undefined];answers[current][j]=val;
    if(settings.answerReveal==='per-question'){
      row.querySelectorAll('.tf-st-btn').forEach(b=>b.classList.remove('picked-true','picked-false'));
      tfBtn.classList.add(val==='true'?'picked-true':'picked-false');tone();scheduleProgressSave();return;
    }
    row.querySelectorAll('.tf-st-btn').forEach(b=>b.disabled=true);tfBtn.classList.add(val==='true'?'picked-true':'picked-false');
    const statement=q.statements[j],right=val===String(statement.correct),note=row.querySelector('small');
    row.classList.add(right?'correct-st':'wrong-st');note.hidden=false;note.className=right?'right':'wrong';note.textContent=right?'Bạn chọn đúng.':'Đáp án đúng: '+(statement.correct?'Đúng':'Sai');tone(right);
    const cur=answers[current],total=q.statements.filter(x=>x.text).length,picked=cur.filter(x=>x!==undefined).length;
    if(picked>=total)updateStreak(fullyCorrect(q,cur,current));showTfSummary(q,cur);scheduleProgressSave();return;
  }
  const button=event.target.closest('.quiz-option');
  if(button){
    if(revealed)return;
    const q=questions[current],value=Number(button.dataset.answerIndex);
    answers[current]=value;revealed=true;
    const good=fullyCorrect(q,value);updateStreak(good);tone(good);
    el.quizCard.querySelectorAll('.quiz-option').forEach(b=>{b.disabled=true;
      if(Number(b.dataset.answerIndex)===q.answer)b.classList.add('correct');
      if(b===button&&!good)b.classList.add('incorrect');});
    let html='<strong>'+(good?t('feedback.correct'):t('feedback.incorrect'))+'</strong>';
    if(!good)html+='<p>'+t('feedback.correctAnswer')+': '+LETTERS[q.answer]+'. '+renderRichText(choiceText(q,q.answer))+'</p>';
    if(el.showExplanationsToggle.checked){const exp=selectedExplanation(q,value);if(exp)html+='<p>'+t('feedback.explanation')+': '+renderRichText(exp)+'</p>';html+=(q.explanationMedia||[]).map(m=>'<img class="option-media" src="'+escapeHtml(m.url)+'" alt="">').join('');}
    feedbackBox(good,html);scheduleProgressSave();return;
  }
}

function finish(timeUp){
  stopQuestionMedia();stopTimer();submitted=true;if(!questions.length)return;
  timeTakenSec=Math.max(1,Math.round((quizElapsedBeforeResume+Date.now()-quizStartTime)/1000));
  clearProgress();
  el.quizCard.hidden=true;el.quizBottomNav.hidden=true;el.restoreBar.hidden=true;el.resultCard.hidden=false;
  renderResults();
  if(timeUp){el.resultNote.textContent=t('result.timeUp');el.resultNote.hidden=false;}
}
function scoreTextColor(fraction){return fraction<=.30?'#ef4444':fraction<=.75?'#eab308':'#22c55e';}
function createScoreSound(finalFraction){
  if(!soundOn||finalFraction<=0)return{update:()=>{},finish:()=>{},cancel:()=>{}};
  try{
    const C=window.AudioContext||window.webkitAudioContext;if(!C)return{update:()=>{},finish:()=>{},cancel:()=>{}};
    const ctx=new C();if(ctx.state==='suspended')ctx.resume().catch(()=>{});
    let nextTick=ctx.currentTime,closed=false;
    const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
    const pulse=(fraction,at)=>{
      const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';
      osc.frequency.setValueAtTime(230+Math.pow(clamp(fraction),.85)*650,at);
      gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.026,at+.009);
      gain.gain.exponentialRampToValueAtTime(.0001,at+.075);osc.connect(gain);gain.connect(ctx.destination);
      osc.start(at);osc.stop(at+.085);
    };
    return{
      update(fraction,progress=0){if(closed)return;const now=ctx.currentTime;if(now>=nextTick){pulse(fraction,now);nextTick=now+.11+Math.pow(clamp(progress),1.15)*.39;}},
      finish(){if(closed)return;closed=true;const now=ctx.currentTime,base=360+clamp(finalFraction)*620;
        [1,1.25,1.5].forEach((m,i)=>{const at=now+i*.075,o=ctx.createOscillator(),g=ctx.createGain();o.type='triangle';o.frequency.setValueAtTime(base*m,at);g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(.032,at+.012);g.gain.exponentialRampToValueAtTime(.0001,at+.13);o.connect(g);g.connect(ctx.destination);o.start(at);o.stop(at+.145);});
        window.setTimeout(()=>{try{ctx.close();}catch(e){}},850);},
      cancel(){if(closed)return;closed=true;try{ctx.close();}catch(e){}}
    };
  }catch(e){return{update:()=>{},finish:()=>{},cancel:()=>{}};}
}
function animateScoreNumber(node,target,maxScore,duration=5000,celebrate=true){
  if(!node)return;target=Math.max(0,Number(target)||0);maxScore=Math.max(.01,Number(maxScore)||10);
  const arc=el.resultScoreArc,circumference=2*Math.PI*94,finalFraction=Math.max(0,Math.min(1,target/maxScore)),audio=celebrate?createScoreSound(finalFraction):{update:()=>{},finish:()=>{},cancel:()=>{}};
  if(arc){arc.style.strokeDasharray=String(circumference);arc.style.strokeDashoffset=String(circumference);arc.style.stroke='url(#teacherScoreGradient)';}
  const updateVisual=(value,progress=0,withSound=true)=>{const fraction=Math.max(0,Math.min(1,value/maxScore));node.textContent=value.toFixed(2);node.style.color=scoreTextColor(fraction);
    if(arc){if(target<=0){arc.style.stroke='#ef4444';arc.style.strokeDashoffset='0';}else{arc.style.stroke='url(#teacherScoreGradient)';arc.style.strokeDashoffset=String(circumference*(1-fraction));}}
    if(withSound)audio.update(fraction,progress);};
  const complete=()=>{updateVisual(target,1,false);if(celebrate&&target>0){launchScoreFireworks(el.resultScoreRing);audio.finish();}else audio.cancel();resultAnimationFrame=0;};
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){complete();return;}
  if(resultAnimationFrame)cancelAnimationFrame(resultAnimationFrame);let started=0;
  function frame(now){if(!started)started=now;const progress=Math.min(1,(now-started)/duration),eased=1-Math.pow(1-progress,3.6),value=target*eased;updateVisual(value,progress);
    if(progress<1)resultAnimationFrame=requestAnimationFrame(frame);else complete();}
  resultAnimationFrame=requestAnimationFrame(frame);
}
function animatePieSweep(node){if(!node||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;try{node.animate([{transform:'rotate(-360deg)'},{transform:'rotate(0deg)'}],{duration:1450,easing:'cubic-bezier(.16,1,.3,1)'});}catch(e){}}
function launchScoreFireworks(container){if(!container)return;container.style.position='relative';container.querySelector('.score-fireworks')?.remove();const layer=document.createElement('div');layer.className='score-fireworks';layer.setAttribute('aria-hidden','true');const colors=['#ef4444','#f97316','#facc15','#84cc16','#22c55e','#38bdf8','#a78bfa','#fb7185'];for(let i=0;i<64;i++){const angle=Math.PI*2*i/64+(i%4)*.035,distance=66+(i%8)*13,particle=document.createElement('span');particle.style.setProperty('--spark-x',Math.cos(angle)*distance+'px');particle.style.setProperty('--spark-y',(Math.sin(angle)*distance+35)+'px');particle.style.setProperty('--spark-r',(240+(i%5)*130)+'deg');particle.style.setProperty('--spark-color',colors[i%colors.length]);particle.style.setProperty('--spark-w',(5+(i%3)*2)+'px');particle.style.setProperty('--spark-h',(9+(i%4)*2)+'px');particle.style.setProperty('--spark-delay',(i%8)*.025+'s');layer.append(particle);}container.append(layer);window.setTimeout(()=>layer.remove(),2300);}
function renderResults(){
  const finalScore=score();
  const correct=questions.filter((q,i)=>q.type!=='essay'&&fullyCorrect(q,answers[i],i)).length;
  el.resultTitle.textContent='Kết quả của bạn';el.resultScoreCaption.textContent='/ '+settings.maxScore+' điểm';
  const firstResultRender=!resultAnimationStarted;animateScoreNumber(el.resultScoreValue,finalScore,settings.maxScore,firstResultRender?5000:900,firstResultRender);resultAnimationStarted=true;
  el.resultCopy.textContent=t(finalScore>=Number(settings.maxScore)*.7?'result.good':'result.keepTrying',
    {percent:Math.round(finalScore/Number(settings.maxScore)*100),correct,total:questions.length});
  el.resultStats.replaceChildren();
  const mm=Math.floor(timeTakenSec/60),ss=timeTakenSec%60;
  const timeStr=String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');
  const resultStats=[['result.correctStat',String(correct)],['result.rawStat',rawEarned().toFixed(2)+' / '+rawTotal().toFixed(2)],['Thời gian làm',timeStr]];
  if(settings.answerReveal==='per-question')resultStats.push(['result.streakStat',String(bestStreak)]);
  resultStats.forEach(([key,value])=>{
    const st=document.createElement('div');st.className='result-stat';
    const strong=document.createElement('strong');strong.textContent=value;
    const small=document.createElement('span');small.textContent=key.startsWith('result.')?t(key):key;
    st.append(strong,small);el.resultStats.append(st);
  });
  const essayList=questions.map((q,i)=>({q,i})).filter(x=>x.q.type==='essay');
  el.essayReview.hidden=!essayList.length;el.essayReviewList.replaceChildren();
  essayList.forEach(({q,i})=>{
    const item=document.createElement('div');item.className='essay-review-item';
    const p=document.createElement('strong');p.innerHTML=renderRichText(q.prompt||'Câu hỏi bằng hình ảnh');
    const resp=document.createElement('p');resp.innerHTML=renderRichText(answers[i]||t('result.noAnswer'));
    const input=document.createElement('input');input.type='number';input.min='0';input.max=String(settings.points.essay);input.step='.05';
    input.value=String(essayScores[i]||0);
    input.addEventListener('input',()=>{essayScores[i]=Math.max(0,Math.min(settings.points.essay,Number(input.value)||0));renderResults();});
    const point=document.createElement('label');point.textContent=t('result.essayPoint',{max:settings.points.essay});point.append(input);
    item.append(p,resp,point);el.essayReviewList.append(item);
  });

  /* ---- Biểu đồ theo mức độ ---- */
  const levelStats={};
  questions.forEach((q,i)=>{
    const lv=String(q.level||'').trim();if(!lv)return;
    const pts=Number(settings.points[q.type])||0, earned=earnedFor(q,answers[i],essayScores[i],i);
    const ok=q.type!=='essay'&&fullyCorrect(q,answers[i],i);
    if(!levelStats[lv])levelStats[lv]={earned:0,max:0,correct:0,total:0};
    levelStats[lv].earned+=earned;levelStats[lv].max+=pts;levelStats[lv].total++;if(ok)levelStats[lv].correct++;
  });
  const entries=Object.entries(levelStats);
  el.resultCharts.hidden=!entries.length;
  if(entries.length){
    const palette=['#ef4444','#f59e0b','#facc15','#84cc16','#22c55e'];
    const totalEarned=entries.reduce((s,e)=>s+e[1].earned,0);
    if(totalEarned>0){
      let cursor=0;
      const stops=entries.map(([k,v],i)=>{const start=cursor/totalEarned*100;cursor+=v.earned;return palette[i%palette.length]+' '+start+'% '+(cursor/totalEarned*100)+'%';});
      el.resultPie.style.background='conic-gradient('+stops.join(',')+')';
    }else el.resultPie.style.background='var(--line)';
    el.resultPie.setAttribute('aria-label','Điểm theo mức độ: '+entries.map(([k,v])=>levelName(k)+' '+v.earned.toFixed(1)).join(', '));animatePieSweep(el.resultPie);
    el.resultLegend.replaceChildren();
    entries.forEach(([k,v],i)=>{
      const lg=document.createElement('div');lg.className='legend-item';
      const sw=document.createElement('span');sw.className='legend-swatch';sw.style.background=palette[i%palette.length];
      const tx=document.createElement('span');
      tx.textContent=levelName(k)+' · '+Math.round(v.earned/Math.max(totalEarned,.01)*100)+'% điểm đạt ('+v.earned.toFixed(1)+'/'+v.max.toFixed(1)+'đ)';
      lg.append(sw,tx);el.resultLegend.append(lg);
    });
    el.resultBars.replaceChildren();
    const maxTotal=Math.max(...entries.map(e=>e[1].total),1);
    entries.forEach(([k,v],i)=>{
      const row=document.createElement('div');row.className='bar-row';
      const lb=document.createElement('span');lb.textContent=levelName(k);
      const track=document.createElement('div');track.className='bar-track';
      const fill=document.createElement('span');fill.className='bar-fill';fill.style.width='0%';
      fill.style.background=palette[i%palette.length];
      track.append(fill);requestAnimationFrame(()=>{fill.style.width=(v.total?Math.round(v.correct/v.total*100):0)+'%';});
      const num=document.createElement('strong');num.textContent=v.correct+'/'+v.total+' · '+(v.total?Math.round(v.correct/v.total*100):0)+'%';
      row.append(lb,track,num);el.resultBars.append(row);
    });
  }

  /* ---- Xem lại câu chưa đúng ---- */
  const wrong=questions.map((q,i)=>({q,i})).filter(x=>x.q.type!=='essay'&&answerPresent(x.q,x.i)&&!fullyCorrect(x.q,answers[x.i],x.i));
  el.wrongReview.hidden=!wrong.length;el.wrongReviewList.replaceChildren();
  wrong.forEach(({q,i})=>{
    const item=document.createElement('div');item.className='wrong-item';
    const head=document.createElement('strong');head.innerHTML='Câu '+(i+1)+'. '+renderRichText(cleanQuestionPrompt(q.prompt)||'Câu hỏi bằng hình ảnh');
    item.append(head);
    const a=answers[i];
    if(q.type==='multiple'){
      const row=document.createElement('div');row.className='w-row';
      row.innerHTML='Bạn chọn: <span class="no">'+LETTERS[Number(a)]+'. '+renderRichText(choiceText(q,Number(a)))+'</span> · Đáp án đúng: <span class="ok">'+LETTERS[q.answer]+'. '+renderRichText(choiceText(q,q.answer))+'</span>';
      item.append(row);
    }else if(q.type==='truefalse'){
      const arr=Array.isArray(a)?a:[];
      q.statements.forEach((s,j)=>{
        if(!s.text)return;
        const row=document.createElement('div');row.className='w-row';
        const pick=arr[j]===undefined?'(chưa trả lời)':(arr[j]==='true'?'Đúng':'Sai');
        const right=s.correct?'Đúng':'Sai';
        const cls=arr[j]===String(s.correct)?'ok':'no';
        row.innerHTML=TF_LETTERS[j]+'. '+renderRichText(s.text.slice(0,70))+' — Bạn: <span class="'+cls+'">'+pick+'</span> · Đúng: <b>'+right+'</b>';
        item.append(row);
      });
    }else{
      const row=document.createElement('div');row.className='w-row';
      row.innerHTML='Bạn: <span class="no">'+renderRichText(String(a||''))+'</span> · Đáp án: <span class="ok">'+renderRichText(q.answer)+'</span>';
      item.append(row);
    }
    if(q.explanation){const ex=document.createElement('div');ex.className='w-row';ex.innerHTML='Giải thích: '+renderRichText(q.explanation);item.append(ex);}
    el.wrongReviewList.append(item);
  });
}

function tone(){
  if(!soundOn)return;try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
    const c=new C(),o=c.createOscillator(),g=c.createGain(),now=c.currentTime;o.type='sine';o.frequency.setValueAtTime(460,now);
    g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.032,now+.012);g.gain.exponentialRampToValueAtTime(.0001,now+.105);
    o.connect(g);g.connect(c.destination);o.start(now);o.stop(now+.12);setTimeout(()=>c.close(),250);
  }catch(e){}
}

/* ==================== Standalone student exam file ==================== */
/* ==================== Export student file (HTML độc lập) ==================== */
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderRichText(input){
  const source=String(input??'');
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const elementSymbols='Ac Al Am Ar As At Au B Ba Be Bh Bi Bk Br C Ca Cd Ce Cf Cl Cm Cn Co Cr Cs Cu Db Ds Dy Er Es Eu F Fe Fl Fm Fr Ga Gd Ge H He Hf Hg Ho Hs I In Ir K Kr La Li Lr Lu Lv Mc Md Mg Mn Mo Mt N Na Nb Nd Ne Nh Ni No Np O Og Os P Pa Pb Pd Pm Po Pr Pt Pu Ra Rb Re Rf Rg Rh Rn Ru S Sb Sc Se Sg Si Sm Sn Sr Ta Tb Tc Te Th Ti Tl Tm Ts U V W Xe Y Yb Zn Zr'.split(' ').sort((a,b)=>b.length-a.length);
  const isLetter=ch=>!!ch&&/[A-Za-zÀ-ỹ]/u.test(ch);
  const isWord=ch=>!!ch&&/[A-Za-zÀ-ỹ0-9_]/u.test(ch);
  function balancedEnd(text,start){let depth=0;for(let k=start;k<text.length;k++){if(text[k]==='(')depth++;else if(text[k]===')'){depth--;if(depth===0)return k;}}return -1;}
  function formulaAt(start){
    if(source[start-1]&&/[A-Za-zÀ-ỹ_]/u.test(source[start-1]))return null;
    function sequence(pos,inGroup){
      let i=pos,html='',atoms=0,hasSub=false;
      while(i<source.length){
        if(source[i]===')'&&inGroup)break;
        if(source[i]==='('){
          const inner=sequence(i+1,true);
          if(!inner||!inner.atoms||source[inner.end]!==')')break;
          i=inner.end+1;
          let sub='';
          if(source[i]==='_'){
            const m=source.slice(i+1).match(/^(?:\{([^}]+)\}|([a-z]|[0-9]+))/);
            if(m){sub=m[1]||m[2];i+=m[0].length+1;}
          }else{
            const m=source.slice(i).match(/^\d+/);
            if(m){sub=m[0];i+=m[0].length;}
            else if(/[xyzmn]/.test(source[i]||'')&&(!source[i+1]||/[A-Z()\s+.,;:!?]/.test(source[i+1]))){sub=source[i];i++;}
          }
          html+='('+inner.html+')'+(sub?'<sub>'+esc(sub)+'</sub>':'');
          atoms+=inner.atoms;hasSub=hasSub||inner.hasSub||!!sub;
        }else{
          let symbol='';
          for(const candidate of elementSymbols){if(source.startsWith(candidate,i)){symbol=candidate;break;}}
          if(!symbol)break;
          i+=symbol.length;
          let sub='';
          if(source[i]==='_'){
            const m=source.slice(i+1).match(/^(?:\{([^}]+)\}|([a-z]|[0-9]+))/);
            if(m){sub=m[1]||m[2];i+=m[0].length+1;}
          }else{
            const m=source.slice(i).match(/^\d+/);
            if(m){sub=m[0];i+=m[0].length;}
            else if(/[xyzmn]/.test(source[i]||'')&&(!source[i+1]||/[A-Z()\s+.,;:!?]/.test(source[i+1]))){sub=source[i];i++;}
          }
          html+=esc(symbol)+(sub?'<sub>'+esc(sub)+'</sub>':'');
          atoms++;hasSub=hasSub||!!sub;
        }
        if(source[i]==='('||/[A-Z]/.test(source[i]||''))continue;
        break;
      }
      return {end:i,html,atoms,hasSub};
    }
    const parsed=sequence(start,false);if(!parsed||!parsed.atoms)return null;
    let end=parsed.end,charge='';
    if(source[end]==='^'){
      const m=source.slice(end).match(/^\^\s*(?:\{([^}]+)\}|(\d*[+-]|[+-]))/);
      if(m){charge=m[1]||m[2];end+=m[0].length;}
    }else if(source[end]==='+'||source[end]==='-'||source[end]==='−'){
      charge=source[end];end++;
    }
    if(!(parsed.atoms>=2||parsed.hasSub||charge))return null;
    if(isLetter(source[end]))return null;
    return {end,html:'<span class="rich-chem">'+parsed.html+(charge?'<sup>'+esc(charge)+'</sup>':'')+'</span>'};
  }
  function readOperand(pos){
    const start=pos;
    if(source[pos]==='('){const end=balancedEnd(source,pos);if(end<0)return null;const inner=source.slice(pos+1,end);if(!/[A-Za-z0-9]/.test(inner)||!/^[A-Za-z0-9+*/^().\-\s]+$/.test(inner))return null;return {start,end:end+1,text:source.slice(pos,end+1),inner};}
    const m=source.slice(pos).match(/^(?:[A-Za-z]|\d+|\d+[A-Za-z]|[A-Za-z]\d+)/);
    if(!m)return null;
    return {start,end:pos+m[0].length,text:m[0],inner:null};
  }
  function fractionAt(start){
    if(isWord(source[start-1]))return null;
    const top=readOperand(start);if(!top)return null;
    let slash=top.end;while(source[slash]===' ')slash++;
    if(source[slash]!=='/')return null;
    let bottomStart=slash+1;while(source[bottomStart]===' ')bottomStart++;
    const bottom=readOperand(bottomStart);if(!bottom)return null;
    if(isWord(source[bottom.end]))return null;
    const topHtml=renderRichText(top.inner!==null?top.inner:top.text);
    const bottomHtml=renderRichText(bottom.inner!==null?bottom.inner:bottom.text);
    return {end:bottom.end,html:'<span class="rich-frac" role="math"><span class="rich-frac-num">'+topHtml+'</span><span class="rich-frac-den">'+bottomHtml+'</span></span>'};
  }
  function powerAt(start){
    const m=source.slice(start).match(/^(\([^()\r\n]+\)|[A-Za-z][A-Za-z0-9]*|\d+)\s*\^\s*(?:\{([^}]+)\}|([A-Za-z0-9+\-]+))/);
    if(!m)return null;
    const end=start+m[0].length;if(isLetter(source[end]))return null;
    const base=renderRichText(m[1]),power=esc(m[2]||m[3]);
    return {end,html:'<span class="rich-math">'+base+'<sup>'+power+'</sup></span>'};
  }
  let out='';
  for(let i=0;i<source.length;){
    const arrows=[['<-->' ,'⇌'],['<=>','⇔'],['-->','⟶'],['->','→'],['<-','←']];
    let arrow=null;
    for(const [token,symbol] of arrows){if(source.startsWith(token,i)){arrow={end:i+token.length,html:'<span class="rich-arrow">'+symbol+'</span>'};break;}}
    if(arrow){out+=arrow.html;i=arrow.end;continue;}
    const frac=fractionAt(i);if(frac){out+=frac.html;i=frac.end;continue;}
    const chem=formulaAt(i);if(chem){out+=chem.html;i=chem.end;continue;}
    const power=powerAt(i);if(power){out+=power.html;i=power.end;continue;}
    if(source[i]==='_'&&/[A-Za-z0-9]/.test(source[i+1]||'')){
      const m=source.slice(i).match(/^_([A-Za-z0-9]+)/);
      if(m&&out){out+='<sub>'+esc(m[1])+'</sub>';i+=m[0].length;continue;}
    }
    out+=source[i]==='\n'?'<br>':esc(source[i]);i++;
  }
  return out;
}
function safeJson(value){return JSON.stringify(value).replace(/</g,'\\u003c');}
function qcPasswordFallbackHash(value){
  const text=String(value==null?'':value);let a=2166136261>>>0,b=2246822519>>>0;
  for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,16777619)>>>0;b=Math.imul(b^(c+i),3266489917)>>>0;}
  return a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0');
}
async function qcPasswordHash(value){
  const text=String(value==null?'':value);
  try{if(window.crypto&&window.crypto.subtle&&window.TextEncoder){const bytes=new TextEncoder().encode(text),digest=await window.crypto.subtle.digest('SHA-256',bytes);return 'sha256:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}}catch(e){}
  return 'fallback:'+qcPasswordFallbackHash(text);
}
function exportMediaListHtml(items){return (Array.isArray(items)?items:[]).map(raw=>{const m=validMedia(raw);if(!m.url)return '';const src=escapeHtml(m.url);return m.type==='video'?'<video class="media" controls preload="metadata" src="'+src+'"></video>':m.type==='audio'?'<audio class="media-audio" controls preload="metadata" src="'+src+'"></audio>':'<img class="media" src="'+src+'" alt="">';}).join('');}
async function awaitExportMultiple(packTitle,exportOptions={},selectedProjects=[]){
  try{
    await save();
    const teacher=currentTeacherSession();
    if(!teacher)throw new Error('Hãy đăng nhập tài khoản giáo viên trước khi xuất bộ đề.');
    const chosen=selectedProjects.map(project=>({project,items:exportableQuestionList(project.questions)})).filter(entry=>entry.items.length>0);
    if(chosen.length<1)throw new Error('Cần ít nhất 1 đề có câu hỏi hợp lệ.');
    const commonConfig={...settings,...exportOptions,returnHtml:true,publishOnline:false,
      projectKey:'',assignmentId:'',assignmentOwnerId:'',
      points:{...(settings.points||{})}};
    const packExams=[];
    const registrationNotes=[];
    el.saveSettingsBtnExport.disabled=true;
    el.saveSettingsBtnExport.textContent='Đang đóng gói 0/'+chosen.length+' đề...';
    for(let index=0;index<chosen.length;index++){
      const {project,items:projectItems}=chosen[index];
      const projectSettings=project.settings||{};
      const childTitle=String(project.meta?.title||project.name||('Đề '+(index+1))).trim()||('Đề '+(index+1));
      const config={...commonConfig,
        projectKey:String(project.id),
        assignmentId:String(projectSettings.assignmentId||''),
        assignmentOwnerId:String(projectSettings.assignmentOwnerId||''),
        savedProjectKey:String(projectSettings.projectKey||''),
        examPassword:String(exportOptions.examPassword||'')};
      const generated=await exportStudentFile(projectItems,childTitle,config);
      if(!generated||!generated.html)throw new Error('Không tạo được nội dung cho đề: '+childTitle);
      if(window.__qcExportRegistrationWarning)registrationNotes.push(childTitle+': '+window.__qcExportRegistrationWarning);
      project.settings={...(project.settings||{}),
        duration:commonConfig.duration,maxScore:commonConfig.maxScore,
        answerReveal:commonConfig.answerReveal,allowRetake:commonConfig.allowRetake,shuffle:commonConfig.shuffle,
        classCode:commonConfig.classCode,teacherDisplayName:commonConfig.teacherDisplayName,
        accessMode:commonConfig.accessMode,lockMode:commonConfig.lockMode,lockAt:commonConfig.lockAt||'',
        antiCheat:commonConfig.antiCheat,antiCopy:commonConfig.antiCopy,antiScreenshot:commonConfig.antiScreenshot,
        requireStudentEmail:commonConfig.requireStudentEmail,points:{...(commonConfig.points||{})},
        assignmentId:generated.assignmentId,assignmentOwnerId:String(teacher.teacherId||''),projectKey:String(project.id)};
      packExams.push({title:childTitle,html:generated.html,questionCount:projectItems.length,
        passwordRequired:!!commonConfig.examPassword,allowRetake:!!commonConfig.allowRetake});
      el.saveSettingsBtnExport.textContent='Đang đóng gói '+(index+1)+'/'+chosen.length+' đề...';
    }
    const activeUpdated=projects.find(project=>String(project.id)===String(activeProjectId));
    if(activeUpdated&&activeUpdated.settings){
      settings={...settings,...activeUpdated.settings,points:{...(settings.points||{}),...(activeUpdated.settings.points||{})}};
      await save();
      if(el.updateExamAccessBtn)el.updateExamAccessBtn.hidden=!settings.assignmentId;
    }
    await store.setItem(PRKEY,JSON.stringify(projects));
    const html=buildMultiExamPackageHtml(packExams,packTitle||'Bộ đề Quiz Craft');
    const blob=new Blob([html],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;
    const fileBase=String(packTitle||'bo-de-quiz-craft').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase()||'bo-de-quiz-craft';
    link.download=fileBase+'-bo-de.html';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
    el.exportModal.hidden=true;renderProjects();toast('Đã xuất '+packExams.length+' đề trong một file HTML.');
    if(registrationNotes.length)setTimeout(()=>toast('Một số đề chưa đồng bộ được thống kê trực tuyến. File vẫn đã xuất.'),900);
  }catch(error){toast('Không xuất được bộ đề: '+(error&&error.message||'lỗi không xác định'));}
  finally{if(el.saveSettingsBtnExport){el.saveSettingsBtnExport.disabled=false;updateMultiExportCount();if(!el.multiExportModeInput?.checked)el.saveSettingsBtnExport.textContent=settings.assignmentId?'Cập nhật đề và tải file học sinh':'Tải file học sinh';}}
}

function buildMultiExamPackageHtml(exams,packTitle){
  const packId='qc-pack-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
  const payload=JSON.stringify(exams).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const safePackTitle=escapeHtml(packTitle||'Bộ đề Quiz Craft');
  const script=String.raw`(function(){
const PACK_EXAMS=${payload};
const PACK_ID=${JSON.stringify(packId)};
const frame=document.getElementById('packFrame');
const frameSection=document.getElementById('packStart');
const picker=document.getElementById('packPicker');
const examSelect=document.getElementById('packExamSelect');
const startExamBtn=document.getElementById('packStartExamBtn');
const selectedMeta=document.getElementById('packSelectedMeta');
const greeting=document.getElementById('packGreeting');
const countNode=document.getElementById('packProgressCount');
const profileKey='quizcraft-pack-profile-'+PACK_ID;
let profile=null;
let completed={};
let preferredExamIndex=null;
function readStored(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')||fallback;}catch(e){return fallback;}}
function writeStored(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch(e){}}
function completionKey(){return 'quizcraft-pack-completed-'+PACK_ID+'-'+encodeURIComponent((profile&&profile.name||'')+'|'+(profile&&profile.klass||''));}
function loadCompleted(){completed=readStored(completionKey(),{});if(!completed||typeof completed!=='object')completed={};}
function saveCompleted(){writeStored(completionKey(),completed);}
function childDocument(index,captureProfile){
  const exam=PACK_EXAMS[index];
  const profileJson=JSON.stringify(profile||null).replace(/</g,'\\u003c');
  const autoStart=!!profile&&!captureProfile&&!exam.passwordRequired;
  const boot='<scr'+'ipt>window.__QC_PACK_CAPTURE_PROFILE='+!!captureProfile+';window.__QC_PACK_PROFILE='+profileJson+';window.__QC_PACK_AUTOSTART='+autoStart+';window.__QC_PACK_NEEDS_PASSWORD='+!!exam.passwordRequired+';window.__QC_PACK_INDEX='+index+';window.__QC_PACK_TOTAL_EXAMS='+PACK_EXAMS.length+';window.__QC_PACK_ID='+JSON.stringify(PACK_ID)+';</scr'+'ipt>';
  let doc=String(exam.html||'');
  doc=doc.replace(/<head[^>]*>/i,function(head){return head+boot;});
  const hook='<scr'+'ipt>(function(){\n'+
  'var capture=!!window.__QC_PACK_CAPTURE_PROFILE;var form=document.getElementById("identityForm");\n'+
  'function profileReady(){try{return !(typeof settings!=="undefined"&&settings.requireEmail&&(!studentAccountSession));}catch(e){return true;}}\n'+
  'if(capture&&form){var pw=document.getElementById("examPasswordWrap"),pf=document.getElementById("examPasswordInput");if(pw)pw.hidden=true;if(pf)pf.required=false;var title=form.querySelector("h2"),note=form.querySelector("p");if(title)title.textContent="Thông tin học sinh";if(note)note.textContent="Đăng nhập nếu được yêu cầu, sau đó nhập họ tên và lớp để chọn đề thi.";var sent=false;var sendProfile=function(){if(sent||!profileReady())return false;var name=(document.getElementById("studentName")||{}).value||"";var klass=(document.getElementById("studentClass")||{}).value||"";try{if(typeof studentAccountSession!=="undefined"&&studentAccountSession&&studentAccountSession.name)name=studentAccountSession.name;}catch(e){}name=String(name).trim().replace(/\\s+/g," ");klass=String(klass).trim();if(!name||!klass)return false;sent=true;window.parent.postMessage({type:"QC_PACK_PROFILE",profile:{name:name,klass:klass}},"*");return true;};document.addEventListener("submit",function(ev){if(ev.target!==form||!profileReady())return;ev.preventDefault();ev.stopImmediatePropagation();sendProfile();},true);if(typeof window.startStudent==="function"){var originalStartStudent=window.startStudent;window.startStudent=function(ev){if(profileReady()){if(ev&&typeof ev.preventDefault==="function")ev.preventDefault();sendProfile();return;}return originalStartStudent.apply(this,arguments);};}}\n'+
  'if(!capture&&window.__QC_PACK_PROFILE){var p=window.__QC_PACK_PROFILE;var ni=document.getElementById("studentName"),ci=document.getElementById("studentClass");if(ni)ni.value=p.name||"";if(ci&&!ci.readOnly)ci.value=p.klass||"";var form2=document.getElementById("identityForm");var title2=form2&&form2.querySelector("h2"),note2=form2&&form2.querySelector("p");if(title2)title2.textContent="Bắt đầu đề thi";if(note2)note2.textContent=window.__QC_PACK_NEEDS_PASSWORD?"Thông tin học sinh đã được điền. Nhập mật khẩu đề thi nếu được yêu cầu.":"Đang mở đề thi...";if(window.__QC_PACK_AUTOSTART&&form2){Promise.resolve(window.quizCraftAuthReady).then(function(){setTimeout(function(){try{form2.requestSubmit();}catch(e){form2.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));}},350);});}}\n'+
  'var totalExams=Number(window.__QC_PACK_TOTAL_EXAMS||1);var result=document.getElementById("studentResultScreen");var next=document.getElementById("qcPackNextExamBtn");if(next){next.hidden=totalExams<=1;next.addEventListener("click",function(){if(totalExams>1)window.parent.postMessage({type:"QC_PACK_NEXT",index:window.__QC_PACK_INDEX},"*");});}function reportDone(){if(!result||result.hidden)return;if(next&&totalExams>1)next.hidden=false;if(result.dataset.qcPackReported==="1")return;result.dataset.qcPackReported="1";window.parent.postMessage({type:"QC_PACK_COMPLETED",index:window.__QC_PACK_INDEX},"*");}if(result){var qcPackResultObserver=new MutationObserver(reportDone);qcPackResultObserver.observe(result,{attributes:true,attributeFilter:["hidden","class","style"]});setTimeout(reportDone,250);}\n'+
  '})();</scr'+'ipt>';
  doc=doc.replace('class=\"student-result-actions\">','class=\"student-result-actions\"><button type=\"button\" id=\"qcPackNextExamBtn\" class=\"primary\" hidden>Làm đề khác</button>');
  doc=doc.replace(/<[/]body>/i,hook+'</body>');
  return doc;
}
function updateSelectedExam(){
  if(!examSelect||!PACK_EXAMS.length)return;
  const index=Number(examSelect.value);
  const exam=PACK_EXAMS[index];
  if(!exam)return;
  const done=!!completed[index];
  if(selectedMeta){
    selectedMeta.textContent=(done?'✓ Đã hoàn thành':'○ Chưa làm')+' · '+(Number(exam.questionCount)||0)+' câu'+(exam.passwordRequired?' · Đề thi có mật khẩu':'');
    selectedMeta.classList.toggle('is-done',done);
  }
  if(startExamBtn){
    const cannotRetake=done&&exam.allowRetake===false;
    startExamBtn.disabled=cannotRetake;
    startExamBtn.textContent=cannotRetake?'Đề này đã hoàn thành':(done?'Làm lại đề đã chọn':'Bắt đầu làm đề');
  }
}
function openSelectedExam(){
  if(!examSelect||!PACK_EXAMS.length)return;
  const index=Number(examSelect.value);
  if(!Number.isInteger(index)||index<0||index>=PACK_EXAMS.length)return;
  picker.hidden=true;
  frameSection.hidden=false;
  frame.srcdoc=childDocument(index,false);
}
function showPicker(preserveCompletion){
  if(!profile)return;
  // A single-exam package should open directly after student confirmation.
  if(PACK_EXAMS.length===1){
    picker.hidden=true;
    frameSection.hidden=false;
    frame.srcdoc=childDocument(0,false);
    return;
  }
  if(!preserveCompletion)loadCompleted();
  frameSection.hidden=true;picker.hidden=false;
  if(greeting)greeting.textContent='Xin chào '+profile.name+' · '+profile.klass+'. Chọn đề thi trong danh sách bên dưới.';
  if(examSelect){
    examSelect.replaceChildren();
    let doneCount=0;
    PACK_EXAMS.forEach(function(exam,index){
      const done=!!completed[index];if(done)doneCount++;
      const option=document.createElement('option');
      option.value=String(index);
      option.textContent=(index+1)+'. '+(exam.title||('Đề '+(index+1)))+' · '+(done?'Đã làm':'Chưa làm')+' · '+(Number(exam.questionCount)||0)+' câu'+(exam.passwordRequired?' · Có mật khẩu':'');
      if(done){option.style.color='#6ee7a2';option.style.fontWeight='800';if(exam.allowRetake===false)option.disabled=true;}
      examSelect.append(option);
    });
    examSelect.disabled=!PACK_EXAMS.length;
    if(startExamBtn)startExamBtn.disabled=!PACK_EXAMS.length;
    if(PACK_EXAMS.length){let target=Number.isInteger(preferredExamIndex)&&preferredExamIndex>=0&&preferredExamIndex<PACK_EXAMS.length?preferredExamIndex:PACK_EXAMS.findIndex(function(_,i){return !completed[i];});if(target<0)target=0;examSelect.value=String(target);preferredExamIndex=null;}
    if(countNode)countNode.textContent='Đã hoàn thành '+doneCount+' / '+PACK_EXAMS.length+' đề';
    updateSelectedExam();
  }
}
function launchProfileForm(){
  profile=null;try{localStorage.removeItem(profileKey);}catch(e){}
  picker.hidden=true;frameSection.hidden=false;
  if(PACK_EXAMS.length)frame.srcdoc=childDocument(0,true);
}
window.addEventListener('message',function(event){
  if(event.source!==frame.contentWindow||!event.data||typeof event.data!=='object')return;
  const message=event.data;
  if(message.type==='QC_PACK_PROFILE'){
    const incoming=message.profile||{};
    profile={name:String(incoming.name||'').trim(),klass:String(incoming.klass||'').trim()};
    if(!profile.name||!profile.klass)return;
    writeStored(profileKey,profile);showPicker();
  }else if(message.type==='QC_PACK_COMPLETED'){
    completed[String(message.index)]=true;saveCompleted();
  }else if(message.type==='QC_PACK_NEXT'){
    const finishedIndex=Number(message.index);
    if(Number.isInteger(finishedIndex)&&finishedIndex>=0&&finishedIndex<PACK_EXAMS.length){completed[String(finishedIndex)]=true;saveCompleted();}
    preferredExamIndex=PACK_EXAMS.findIndex(function(_,i){return !completed[i];});
    if(preferredExamIndex<0)preferredExamIndex=0;
    showPicker(true);
  }
});
if(examSelect)examSelect.addEventListener('change',updateSelectedExam);
if(startExamBtn)startExamBtn.addEventListener('click',openSelectedExam);
profile=readStored(profileKey,null);
if(profile&&profile.name&&profile.klass)showPicker();else launchProfileForm();
})();`;
  return '<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+safePackTitle+'</title><!-- CSS moved to css/styles.css (style block 5) --></head><body><main class="pack-main"><section id="packStart"><iframe allow="clipboard-read; clipboard-write" class="pack-frame" id="packFrame" title="Bài thi Quiz Craft"></iframe></section><section class="pack-picker" hidden id="packPicker"><h2>Chọn đề thi</h2><p id="packGreeting"></p><label class="pack-select-label" for="packExamSelect">Chọn đề thi muốn làm</label><select aria-label="Chọn đề thi để làm" class="pack-exam-select" id="packExamSelect"></select><div class="pack-selected-meta" id="packSelectedMeta"></div><div class="pack-picker-actions"><button class="pack-start-exam" id="packStartExamBtn" type="button">Bắt đầu làm đề</button><span class="pack-progress" id="packProgressCount"></span></div></section></main><script>'+script+'<\/script></body></html>';
}

async function exportStudentFile(items,title,config){
  const points=config.points||settings.points,max=Number(config.maxScore)||10,duration=Number(config.duration)||0,
        studentView='single',answerReveal=config.answerReveal||'submit',allowRetake=!!config.allowRetake,shuffleEnabled=!!config.shuffle,assignedClassCode=String(config.classCode||'').normalize('NFC').trim(),teacherDisplayName=String(config.teacherDisplayName||'').normalize('NFC').trim(),examPassword=String(config.examPassword||''),examPasswordHash=examPassword?{sha256:(await qcPasswordHash(examPassword)).replace(/^sha256:/,''),fallback:qcPasswordFallbackHash(examPassword)}:null,antiCheatEnabled=!!config.antiCheat,antiCopyEnabled=!!config.antiCopy,antiScreenshotEnabled=!!config.antiScreenshot,requireStudentEmail=!!config.requireStudentEmail,theme='dark';
  const safeTitle=escapeHtml(title||'Bài tập');
  const teacherMetaParts=[];if(teacherDisplayName)teacherMetaParts.push('Giáo viên: '+escapeHtml(teacherDisplayName));if(assignedClassCode)teacherMetaParts.push('Lớp: '+escapeHtml(assignedClassCode));
  const teacherMetaHtml=teacherMetaParts.length?'<p class="student-exam-meta">'+teacherMetaParts.join(' · ')+'</p>':'';
  const stableProjectKey=String(config.projectKey||activeProjectId||createProjectId()).slice(0,100);
  const teacherSession=currentTeacherSession();
  if(!teacherSession)throw new Error('Phiên giáo viên đã hết hạn. Hãy đăng nhập lại trước khi xuất đề.');
  let assignmentId=String(config.returnHtml?(config.assignmentId||''):(config.assignmentId||settings.assignmentId||'')).trim();
  const assignmentOwnerId=String(config.returnHtml?(config.assignmentOwnerId||''):(config.assignmentOwnerId||settings.assignmentOwnerId||''));
  const savedProjectKey=String(config.returnHtml?(config.savedProjectKey||''):(config.projectKey||settings.projectKey||''));
  // Reuse only this teacher's ID for this exact project; copied/legacy IDs are replaced.
  if(!assignmentId||/^qc-project-/i.test(assignmentId)||assignmentOwnerId!==String(teacherSession.teacherId||'')||savedProjectKey!==stableProjectKey)assignmentId=createUniqueAssignmentId();
  const registerExam=examId=>appsScriptJsonp(teacherApiParams({action:'registerExam',examId:examId,projectKey:stableProjectKey,examTitle:title||'Bài tập',classCode:assignedClassCode,questionCount:items.length,maxScore:max,teacherName:teacherDisplayName||teacherSession.name||'',teacherEmail:teacherSession.email||'',emailRequired:!!config.requireStudentEmail,antiCopy:!!config.antiCopy,antiScreenshot:!!config.antiScreenshot,accessMode:config.accessMode||'PUBLIC',lockMode:config.lockMode||'UNLOCKED',lockAt:config.lockMode==='LOCKED'?(config.lockAt||''):'',lockAtMs:config.lockMode==='LOCKED'&&config.lockAt?Date.parse(config.lockAt):0,lockedUntil:'',clearLock:true}));
  let registrationWarning='';
  try{
    let registered=null;
    for(let attempt=0;attempt<5;attempt++){
      registered=await registerExam(assignmentId);
      if(registered&&registered.ok)break;
      const message=String(registered&&registered.error||'');
      if(!isDuplicateExamIdError(message))break;
      assignmentId=createUniqueAssignmentId();
    }
    if(!registered||!registered.ok){
      const message=String(registered&&registered.error||'Không đăng ký được đề lên Google Sheets.');
      if(isDuplicateExamIdError(message))assignmentId=createUniqueAssignmentId();
      throw new Error(message);
    }
  }catch(error){
    if(config.publishOnline)throw error;
    registrationWarning='File vẫn được xuất bằng mã đề riêng, nhưng chưa đồng bộ được mã đề lên Google Sheets: '+(error&&error.message||'lỗi kết nối')+'. Thống kê trực tuyến có thể chưa hoạt động cho đến khi đăng ký lại.';
  }
  if(!config.returnHtml){
    settings.assignmentId=assignmentId;settings.assignmentOwnerId=String(teacherSession.teacherId||'');settings.projectKey=stableProjectKey;settings.accessMode=config.accessMode||'PUBLIC';settings.lockMode=config.lockMode||'UNLOCKED';settings.lockAt=settings.lockMode==='LOCKED'?(config.lockAt||''):'';delete settings.lockedUntil;settings.classCode=assignedClassCode;await save();
    if(el.updateExamAccessBtn)el.updateExamAccessBtn.hidden=false;
  }
  window.__qcExportRegistrationWarning=registrationWarning;
  const normalizedItems=items.map(normalize);
  const shuffleList=list=>{for(let i=list.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}return list;};
  if(shuffleEnabled){
    normalizedItems.forEach(q=>{
      if(q.type==='multiple'){
        const paired=q.options.map((text,i)=>({text,media:q.optionMedia[i],explanation:q.explanations[i],correct:i===q.answer}));
        shuffleList(paired);q.options=paired.map(x=>x.text);q.optionMedia=paired.map(x=>x.media);q.explanations=paired.map(x=>x.explanation);q.answer=paired.findIndex(x=>x.correct);
      }else if(q.type==='truefalse'){
        const filled=shuffleList(q.statements.filter(x=>x.text));q.statements=[...filled,...Array.from({length:4-filled.length},()=>({text:'',correct:false}))];
      }
    });
    shuffleList(normalizedItems);
  }
  const data=safeJson(normalizedItems);
  const itemHtml=normalizedItems.map((q,i)=>{
    const mark=levelMark(q),prefix=(i+1)+(mark?' ['+escapeHtml(mark)+']':'')+'.',
          image=exportMediaListHtml(q.mediaItems?.length?q.mediaItems:[q.media]),
          expJson=escapeHtml(JSON.stringify(q.explanations||[]));
    if(q.type==='multiple'){
      const answerText=escapeHtml(choiceText(q,q.answer));
      const opts=q.options.map((o,n)=>{
        const om=validMedia(q.optionMedia?.[n]).url?'<img class="option-media" src="'+validMedia(q.optionMedia[n]).url+'">':'';
        return '<label class="choice"><input type="radio" name="q'+i+'" value="'+n+'"><span><span>'+LETTERS[n]+'. '+renderRichText(cleanOptionLabel(o,n))+'</span>'+om+'</span></label>';
      }).join('');
      return '<fieldset class="question-card" data-card data-index="'+i+'" data-type="multiple" data-level="'+escapeHtml(q.level||'')+'" data-points="'+points.multiple+'" data-answer="'+q.answer+'" data-answer-text="'+answerText+'" data-exp="'+expJson+'" data-exp-media="'+escapeHtml(JSON.stringify(q.explanationMedia||[]))+'"><legend><span class="question-heading">'+prefix+' '+renderRichText(cleanQuestionPrompt(q.prompt)||'Quan sát hình ảnh và trả lời câu hỏi')+'</span><button type="button" class="star-button" data-star="'+i+'" aria-pressed="false">☆</button></legend>'+image+'<div class="choices">'+opts+'</div><div class="feedback" hidden></div></fieldset>';
    }
    if(q.type==='truefalse'){
      const ansArr=q.statements.map(s=>s.correct);
      const rows=q.statements.map((s,j)=>{
        if(!s.text)return '';
        return '<div class="tf-st" data-st-index="'+j+'"><span class="tf-stt">'+TF_LETTERS[j]+'</span><span class="tf-st-text">'+renderRichText(s.text)+exportMediaListHtml(s.media)+'</span><span class="tf-toggle"><label><input type="radio" name="q'+i+'_s'+j+'" value="true"> Đúng</label><label><input type="radio" name="q'+i+'_s'+j+'" value="false"> Sai</label></span><small class="tf-st-note"></small></div>';
      }).join('');
      return '<fieldset class="question-card" data-card data-index="'+i+'" data-type="truefalse" data-level="'+escapeHtml(q.level||'')+'" data-points="'+points.truefalse+'" data-answer="'+escapeHtml(JSON.stringify(ansArr))+'" data-exp="'+escapeHtml(JSON.stringify([q.explanation||'']))+'" data-exp-media="'+escapeHtml(JSON.stringify(q.explanationMedia||[]))+'"><legend><span class="question-heading">'+prefix+' '+renderRichText(cleanQuestionPrompt(q.prompt)||'Quan sát hình ảnh và trả lời câu hỏi')+'</span><button type="button" class="star-button" data-star="'+i+'" aria-pressed="false">☆</button></legend>'+image+'<div class="tf-statements">'+rows+'</div>'+(answerReveal==='per-question'?'<button type="button" class="confirm-answer tf-confirm-answer" data-confirm="'+i+'">Xác nhận câu trả lời</button>':'')+'<div class="feedback" hidden></div></fieldset>';
    }
    const isShort=q.type==='short';
    return '<fieldset class="question-card" data-card data-index="'+i+'" data-type="'+q.type+'" data-level="'+escapeHtml(q.level||'')+'" data-points="'+points[q.type]+'" data-answer="'+escapeHtml(q.answer||'')+'" data-exp="'+escapeHtml(JSON.stringify([q.explanation||'']))+'" data-exp-media="'+escapeHtml(JSON.stringify(q.explanationMedia||[]))+'"><legend><span class="question-heading">'+prefix+' '+renderRichText(cleanQuestionPrompt(q.prompt)||'Quan sát hình ảnh và trả lời câu hỏi')+'</span><button type="button" class="star-button" data-star="'+i+'" aria-pressed="false">☆</button></legend>'+image+'<label class="response-label">'+(isShort?'Câu trả lời của bạn':'Bài tự luận của bạn')+(isShort?'<input class="short" type="text" name="q'+i+'">':'<textarea name="q'+i+'" rows="5"></textarea>')+'</label>'+(answerReveal==='per-question'?'<button type="button" class="confirm-answer" data-confirm="'+i+'">Xác nhận</button>':'')+'<div class="feedback" hidden></div></fieldset>';
  }).join('');

  let css=':root{font-family:Inter,system-ui,sans-serif;color:#18302e}*{box-sizing:border-box}[hidden]{display:none!important}.identity-gate[hidden]{display:none!important}body{margin:0;background:linear-gradient(135deg,#f4fbf8,#fff9ef);min-height:100vh}main{width:min(1180px,100%);margin:auto;padding:22px 16px 56px}.head,.sheet,.navigator{background:#fff;border:1px solid #dcebe4;border-radius:22px;box-shadow:0 16px 40px rgba(24,48,46,.09)}.head{padding:26px;margin-bottom:16px}.head h1{margin:0 0 6px;font:700 clamp(28px,5vw,44px) Georgia,serif}.head p{margin:0;color:#687b75}.toolbar{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;align-items:center}.toolbar label{font-size:13px;font-weight:750;color:#48615a}.toolbar select,.toolbar button,.submit-button,.sound-button{min-height:44px;border:1px solid #cfe2da;border-radius:11px;background:#fff;padding:0 13px;font:inherit;cursor:pointer}.toolbar select{margin-left:6px}.submit-button{background:#1d7a67!important;color:#fff!important;border-color:#1d7a67;font-weight:800}.timer{padding:8px 11px;border-radius:99px;background:#eef8f4;color:#1d7a67;font-weight:800}.streak-pill{padding:8px 11px;border-radius:99px;background:#edf4ff;color:#245b9b;font-weight:800}.dark .streak-pill{background:#1a2b45;color:#93c5fd}.layout{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:16px;align-items:start}.sheet{padding:24px}.question-card{border:0;border-bottom:1px solid #e2ece7;padding:0 0 22px;margin:0 0 22px}.question-card:last-child{border-bottom:0;margin-bottom:0}.question-card legend{width:100%;display:flex;gap:12px;align-items:flex-start;margin-bottom:14px;font-family:Inter,"Segoe UI",Arial,sans-serif;font-size:clamp(18px,2.4vw,22px);font-weight:750;line-height:1.4;letter-spacing:normal;overflow-wrap:anywhere}.question-heading{flex:1;font-family:inherit}.star-button{flex:none;width:40px;height:40px;border:1px solid #d5e4de;border-radius:50%;background:#fff;color:#a18a39;font-size:22px;line-height:1;cursor:pointer}.star-button:hover,.star-button.is-starred{background:#fff5c7;border-color:#d8b83d}.media{display:block;max-width:100%;max-height:260px;border-radius:14px;margin:8px 0 14px}.choices{display:grid;gap:9px}.choice{display:flex;gap:10px;align-items:flex-start;padding:12px;border:1px solid #dfeae5;border-radius:12px;background:#fbfdfc;cursor:pointer;transition:.2s}.choice:hover{border-color:#1d7a67;background:#eef8f4}.choice.correct{border-color:#238052;background:#e9f8ef}.choice.incorrect{border-color:#bd5252;background:#fff0ef}.choice input{margin-top:4px;accent-color:#1d7a67}.option-media{display:block;max-width:180px;max-height:110px;margin-top:8px;border-radius:8px}.tf-statements{display:grid;gap:10px}.tf-st{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 13px;border:1px solid #dfeae5;border-radius:13px;background:#fbfdfc}.tf-stt{width:26px;height:26px;display:grid;place-items:center;border-radius:8px;background:#edf6f2;color:#1d7a67;font-size:11.5px;font-weight:800}.tf-st-text{font-size:13.5px;line-height:1.45}.tf-st-note{grid-column:2;display:block;margin-top:4px;font-size:11px;color:#687b75}.tf-st-note.right{color:#227a52;font-weight:700}.tf-st-note.wrong{color:#b85454;font-weight:700}.tf-st.correct-st{border-color:#238052;background:#e9f8ef}.tf-st.wrong-st{border-color:#bd5252;background:#fff0ef}.tf-toggle{display:inline-flex;gap:6px;flex:none}.tf-toggle label{display:inline-flex;align-items:center;gap:5px;padding:7px 11px;border:1px solid #cfe2da;border-radius:9px;background:#fff;font-size:12px;font-weight:700;cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation}.tf-toggle input{margin:0;accent-color:#1d7a67;-webkit-user-select:none;user-select:none}.response-label{display:grid;gap:8px;font-weight:750}.response-label input,.response-label textarea{width:100%;border:1px solid #cfe2da;border-radius:11px;padding:12px;font:inherit;resize:vertical}.feedback{margin-top:13px;padding:13px 15px;border-radius:12px;background:#eef8f4;color:#1d6959;line-height:1.5}.feedback.wrong{background:#fff0ef;color:#954545}.feedback strong{display:block;margin-bottom:3px}.navigator{padding:16px;position:sticky;top:16px}.navigator h2{font-size:16px;margin:0 0 12px}.nav-list{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.nav-button{min-height:42px;border:1px solid #d7e6df;border-radius:10px;background:#f9fcfa;color:#17252b!important;font-weight:850;cursor:pointer;position:relative;transition:background .18s,border-color .18s,transform .18s}.nav-button:hover{border-color:#1d7a67}.nav-button.is-answered{background:#d9f7e4;border-color:#55ad78;color:#145c35!important}.nav-button.is-flagged:not(.is-review-correct):not(.is-review-wrong):not(.is-review-pending){background:#fff0a8;border-color:#e0b52b;color:#624700!important}.nav-button.is-flagged:after{content:"★";position:absolute;right:4px;top:1px;color:#946b00;font-size:11px}.nav-help{display:block;margin:11px 0 0;color:#6b7d77;font-size:12px}.single-nav{display:flex;justify-content:space-between;gap:10px;margin-top:18px}.all-submit{display:none;width:100%;margin-top:20px}.confirm-answer{margin-top:12px;min-height:40px;padding:0 15px;border:1px solid #1d7a67;border-radius:10px;background:#1d7a67;color:#fff;font-weight:800;cursor:pointer}.confirm-answer:disabled{opacity:.65;cursor:default}.all-mode .single-nav{display:none}.all-mode .all-submit{display:block}.single-nav button{flex:1;min-height:44px;border:1px solid #cfe2da;border-radius:11px;background:#fff;cursor:pointer}.single-nav button:last-child{background:#1d7a67;color:#fff;border-color:#1d7a67}.result{margin-top:18px;padding:16px;border-radius:12px;background:#eef8f4;font-size:17px}.muted{color:#687b75;font-size:13px}.identity-gate{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:18px;background:rgba(10,18,25,.62);backdrop-filter:blur(8px)}.identity-card{width:min(440px,100%);padding:26px;border-radius:22px;background:#fff;border:1px solid #dcebe4;box-shadow:0 22px 70px rgba(7,28,20,.3)}.identity-card h2{margin:0 0 8px}.identity-card p{color:#687b75}.identity-card label{display:grid;gap:6px;margin:14px 0;font-weight:750}.identity-card input{width:100%;padding:12px;border:1px solid #cfe2da;border-radius:11px;font:inherit}.resume-hint{padding:10px 12px;border-radius:10px;background:#eaf8ef;color:#227a52;font-size:12.5px;line-height:1.5}.student-badge{margin-left:auto;color:#48615a;font-weight:750}.dark{color:#fff;background:linear-gradient(135deg,#03050a,#111827 46%,#1f2937)}.dark .head,.dark .sheet,.dark .navigator,.dark .identity-card{background:#151a27;border-color:#30384c;color:#fff}.dark .head p,.dark .muted,.dark .identity-card p,.dark .student-badge,.dark .tf-st-text,.dark .tf-st-note{color:#c5cad6}.dark .choice,.dark .star-button,.dark .toolbar select,.dark .toolbar button,.dark .single-nav button,.dark .sound-button,.dark .tf-st,.dark .tf-toggle label{background:#111827;color:#fff;border-color:#44516b}.dark .choice:hover{border-color:#7dd3fc;background:#1a2638}.dark .choice.correct,.dark .tf-st.correct-st{background:#153425;border-color:#6ee7a2}.dark .choice.incorrect,.dark .tf-st.wrong-st,.dark .feedback.wrong{background:#351d26;border-color:#ff8d8d}.dark .feedback{background:#153425;color:#d9ffe8}.dark .identity-card input{background:#0b0d14;color:#fff;border-color:#44516b}.dark .resume-hint{background:#153425;color:#a6f4c5}@media(max-width:760px){.layout{grid-template-columns:1fr}.navigator{position:static;order:-1}.nav-list{grid-template-columns:repeat(6,1fr)}.sheet{padding:18px}.tf-st{grid-template-columns:26px minmax(0,1fr)}.tf-toggle{grid-column:1/-1}}';

  css += `

.rich-text{line-height:1.65;overflow-wrap:anywhere}.rich-chem,.rich-math{font-family:"Cambria Math","STIX Two Math",Georgia,serif;white-space:nowrap}.rich-chem sub,.rich-math sub{font-size:.72em;line-height:0;vertical-align:sub}.rich-chem sup,.rich-math sup{font-size:.72em;line-height:0;vertical-align:super}.rich-frac{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;vertical-align:middle;line-height:1.05;margin:0 .14em;font-family:"Cambria Math","STIX Two Math",Georgia,serif;font-size:.96em;white-space:nowrap}.rich-frac-num{display:block;border-bottom:1.35px solid currentColor;padding:0 .18em .08em}.rich-frac-den{display:block;padding:.07em .18em 0}.rich-arrow{display:inline-block;padding:0 .08em;font-weight:650;white-space:nowrap}

.student-score-wrap{position:relative;display:grid;width:min(218px,66vw);aspect-ratio:1;place-items:center;margin:8px auto 0;overflow:visible;isolation:isolate}
.student-score-ring{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);overflow:visible}
.student-score-track,.student-score-arc{fill:none;stroke-width:15}
.student-score-track{stroke:#344155}
.student-score-arc{stroke:url(#studentScoreGradient);stroke-linecap:round;stroke-dasharray:603.19;stroke-dashoffset:603.19;filter:drop-shadow(0 2px 6px rgba(34,197,94,.22))}
.student-score{position:relative;z-index:1;margin:0;color:#ef4444;font:700 clamp(38px,8vw,64px)/1 Georgia,serif;letter-spacing:-.055em;font-variant-numeric:tabular-nums}
.student-score-wrap .score-fireworks{left:50%;top:50%}
.student-column-fill{background:linear-gradient(0deg,#ef4444 0%,#facc15 52%,#22c55e 100%)!important}
.student-result-screen{position:relative;overflow:hidden;max-width:1000px;margin:26px auto 0;padding:clamp(20px,4vw,38px);border:1px solid #dcebe4;border-radius:24px;background:#fff;box-shadow:0 18px 48px rgba(24,48,46,.10);text-align:center}
.student-score-wrap{position:relative;display:inline-block;min-width:180px}
.student-score-wrap .score-fireworks{left:50%;top:50%}
.student-column-fill{height:0;transition:height 1.15s cubic-bezier(.16,1,.3,1)}
@media(prefers-reduced-motion:reduce){.student-column-fill{transition:none!important}}
.result-kicker{margin:0 0 10px;color:#1d7a67;font-size:12px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
.student-score{margin:0;color:#18302e;font:700 clamp(56px,11vw,100px)/1 Georgia,serif;letter-spacing:-.055em}
.student-score-caption{margin:9px 0 0;color:#687b75;font-size:15px;font-weight:750}
.student-result-message{max-width:620px;margin:15px auto 0;color:#687b75;line-height:1.6}
.student-result-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:26px 0}
.student-result-stat{padding:16px 10px;border:1px solid #e1ece7;border-radius:15px;background:#f5faf7}
.student-result-stat strong{display:block;color:#1d7a67;font:700 25px Georgia,serif}
.student-result-stat span{display:block;margin-top:5px;color:#687b75;font-size:11px;font-weight:750}
.student-result-charts{display:grid;grid-template-columns:1fr 1fr;gap:15px;text-align:left}
.student-chart-card{min-width:0;padding:20px;border:1px solid #e1ece7;border-radius:17px;background:#fbfdfc}
.student-chart-card h3{margin:0 0 18px;color:#18302e;font:600 19px Georgia,serif}
.student-pie-layout{display:grid;grid-template-columns:minmax(130px,180px) minmax(0,1fr);gap:16px;align-items:center}
.student-pie{width:min(100%,180px);aspect-ratio:1;border-radius:50%;position:relative;margin:auto;box-shadow:inset 0 0 0 1px rgba(24,48,46,.06)}
.student-pie:after{content:"";position:absolute;inset:25%;border-radius:50%;background:#fbfdfc;box-shadow:0 0 0 1px #e1ece7}
.student-pie-center{position:absolute;z-index:1;inset:0;display:grid;place-items:center;text-align:center;color:#18302e;font-weight:900;font-size:20px}
.student-pie-center small{display:block;color:#687b75;font-size:10px;font-weight:700}
.student-pie-legend{display:grid;gap:10px}
.student-legend-row{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:8px;align-items:center;color:#53665f;font-size:12px}
.student-legend-swatch{width:10px;height:10px;border-radius:3px}
.student-legend-row strong{color:#18302e;font-size:12px}
.student-column-chart{min-height:225px;display:flex;align-items:stretch;justify-content:space-around;gap:9px;padding:12px 4px 0;border-bottom:1px solid #dce7e1;background:repeating-linear-gradient(to top,transparent 0,transparent 48px,#e9f0ec 49px,#e9f0ec 50px)}
.student-column{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:7px;text-align:center}
.student-column-value{min-height:16px;color:#53665f;font-size:10px;font-weight:800;white-space:nowrap}
.student-column-track{height:150px;width:min(100%,48px);display:flex;align-items:flex-end;overflow:hidden;border-radius:9px 9px 3px 3px;background:#edf3ef}
.student-column-fill{display:block;width:100%;min-height:3px;border-radius:8px 8px 0 0;background:#1d7a67;transition:height 1.15s cubic-bezier(.16,1,.3,1)}
.student-column-label{min-height:30px;max-width:100%;color:#53665f;font-size:10px;font-weight:750;overflow-wrap:anywhere}
.student-column-note{color:#82918b;font-size:9.5px;white-space:nowrap}
.student-result-footnote{margin:20px 0 0;padding:13px 15px;border-radius:12px;background:#f2f7f4;color:#53665f;font-size:12.5px;line-height:1.6;text-align:left}
body.dark .student-result-screen{background:#151a27;border-color:#2c3549}
body.dark .student-score,body.dark .student-pie-center,body.dark .student-legend-row strong,body.dark .student-chart-card h3{color:#f2f5fa}
body.dark .student-score-caption,body.dark .student-result-message,body.dark .student-legend-row,body.dark .student-column-label,body.dark .student-column-value{color:#a9b2c4}
body.dark .student-result-stat,body.dark .student-chart-card,body.dark .student-result-footnote{background:#111827;border-color:#2c3549;color:#cbd5e1}
body.dark .student-result-stat strong{color:#7dd3fc}
body.dark .student-pie:after{background:#111827;border-color:#2c3549}
body.dark .student-column-chart{border-color:#384358;background:repeating-linear-gradient(to top,transparent 0,transparent 48px,#293449 49px,#293449 50px)}
body.dark .student-column-track{background:#293449}
body:not(.dark) .student-score-track{stroke:#e5e7eb}

.student-score-wrap{position:relative;display:grid;width:min(218px,66vw);aspect-ratio:1;place-items:center;margin:8px auto 0;overflow:visible;isolation:isolate}
.score-fireworks{position:absolute;left:50%;top:50%;width:0;height:0;z-index:8;pointer-events:none;overflow:visible}
.score-fireworks span{position:absolute;left:0;top:0;display:block;width:var(--spark-w,8px);height:var(--spark-h,13px);border-radius:2px;background:var(--spark-color);opacity:0;animation:score-firework 1.8s cubic-bezier(.12,.72,.24,1) var(--spark-delay,0s) both}
@keyframes score-firework{0%{opacity:0;transform:translate(-50%,-50%) rotate(0deg) scale(.5)}12%{opacity:1}100%{opacity:0;transform:translate(calc(-50% + var(--spark-x)),calc(-50% + var(--spark-y))) rotate(var(--spark-r,360deg)) scale(.8)}}

.student-score-ring{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);overflow:visible}
.student-score-track,.student-score-arc{fill:none;stroke-width:15}
.student-score-track{stroke:#344155}
.student-score-arc{stroke:url(#studentScoreGradient);stroke-linecap:round;stroke-dasharray:603.19;stroke-dashoffset:603.19;filter:drop-shadow(0 2px 6px rgba(34,197,94,.22))}
.student-score{position:relative;z-index:1;margin:0;color:#ef4444;font:700 clamp(38px,8vw,64px)/1 Georgia,serif;letter-spacing:-.055em;font-variant-numeric:tabular-nums}
.student-score-wrap .score-fireworks{left:50%;top:50%}
.student-column-fill{background:linear-gradient(0deg,#ef4444 0%,#facc15 52%,#22c55e 100%)!important}

.nav-button.is-review-correct{background:#dcfce7;border-color:#16a34a;color:#166534}
.nav-button.is-review-wrong{background:#fee2e2;border-color:#dc2626;color:#991b1b}
.nav-button.is-review-pending{background:#fef3c7;border-color:#d97706;color:#92400e}
.review-legend{display:grid;gap:7px;margin-top:12px;padding:11px 12px;border:1px solid #dce7e1;border-radius:11px;background:#f8faf9;color:#53665f;font-size:11.5px}
.review-legend-row{display:flex;align-items:center;gap:7px}
.review-legend-swatch{width:11px;height:11px;flex:none;border-radius:3px}
.back-results-button{margin:0 0 18px;min-height:38px;padding:0 13px;border:1px solid #cfe2da;border-radius:10px;background:#f8fbf9;color:#35564b;font:700 12px Inter,system-ui,sans-serif;cursor:pointer}
.student-result-actions{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin:22px 0 0}
.student-result-actions button{min-height:44px;padding:0 17px;border:1px solid #cfe2da;border-radius:11px;background:#fff;color:#315b4d;font:800 13px Inter,system-ui,sans-serif;cursor:pointer}
.student-result-actions .primary{background:#1d7a67;color:#fff;border-color:#1d7a67}
body.dark .review-legend{background:#111827;border-color:#2c3549;color:#cbd5e1}
body.dark .back-results-button,body.dark .student-result-actions button{background:#111827;border-color:#384358;color:#dbeafe}
body.dark .student-result-actions .primary{background:#0f766e;border-color:#0f766e;color:#fff}

.choice{transition:transform .22s ease,box-shadow .22s ease,border-color .22s ease,background .22s ease}
.choice:hover{transform:translateY(-2px) scale(1.006);box-shadow:0 10px 24px rgba(29,122,103,.14)}
.choice:active{transform:scale(.995)}
.tf-toggle label{transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
.tf-toggle label:hover{transform:translateY(-2px);box-shadow:0 7px 16px rgba(29,122,103,.13)}
.nav-button{transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
.nav-button:hover{transform:translateY(-2px);box-shadow:0 7px 16px rgba(29,122,103,.13)}
.student-chart-card{transition:transform .28s cubic-bezier(.2,.8,.2,1),box-shadow .28s ease,border-color .28s ease}
.student-chart-card:hover{transform:translateY(-5px) scale(1.012);box-shadow:0 18px 38px rgba(0,0,0,.18);border-color:#7dd3fc}
.student-pie{cursor:pointer;transform-origin:50% 50%;animation:qcPieRotate 34s linear infinite;animation-play-state:paused;transition:filter .25s ease}
.student-pie:hover{animation-play-state:running;filter:drop-shadow(0 10px 16px rgba(29,122,103,.22))}
.student-pie-center{animation:qcPieRotateReverse 34s linear infinite;animation-play-state:paused}
.student-pie:hover .student-pie-center{animation-play-state:running}
@keyframes qcPieRotate{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes qcPieRotateReverse{from{transform:rotate(0deg)}to{transform:rotate(-360deg)}}
.qc-loading-status{display:inline-flex;align-items:center;gap:9px;color:#1d7a67;font-weight:750}
.qc-spinner{display:inline-block;flex:0 0 17px;width:17px;height:17px;border:2.5px solid rgba(29,122,103,.22);border-top-color:#1d7a67;border-radius:50%;animation:qcStudentSpinner .8s linear infinite}
@keyframes qcStudentSpinner{to{transform:rotate(360deg)}}
.student-column{cursor:pointer;transition:transform .24s ease}
.student-column:hover{transform:translateY(-5px) scale(1.055)}
.student-column-track{transition:box-shadow .25s ease,filter .25s ease}
.student-column:hover .student-column-track{box-shadow:0 10px 20px rgba(34,197,94,.18);filter:saturate(1.15)}
.student-legend-row{border-radius:8px;padding:4px 6px;margin:-4px -6px;transition:transform .2s ease,background .2s ease}
.student-legend-row:hover{transform:translateX(4px);background:rgba(125,211,252,.09)}
.student-result-stat{transition:transform .22s ease,box-shadow .22s ease}
.student-result-stat:hover{transform:translateY(-3px);box-shadow:0 10px 22px rgba(0,0,0,.13)}
@media(prefers-reduced-motion:reduce){.choice,.tf-toggle label,.nav-button,.student-chart-card,.student-pie,.student-column,.student-column-track,.student-legend-row,.student-result-stat{transition:none!important}.student-pie,.student-pie-center,.qc-spinner{animation:none!important}}

.anti-cheat-overlay{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:20px;background:rgba(3,7,18,.88);backdrop-filter:blur(10px)}
.anti-cheat-overlay[hidden]{display:none!important}
.anti-cheat-card{width:min(100%,440px);padding:26px;border:1px solid rgba(255,255,255,.16);border-radius:22px;background:#111827;color:#f9fafb;box-shadow:0 25px 80px rgba(0,0,0,.45);text-align:center}
.anti-cheat-card h2{margin:0 0 10px;font:700 24px Georgia,serif}
.anti-cheat-card p{color:#cbd5e1;line-height:1.6}
.anti-cheat-countdown{display:block;margin:18px 0;font-size:38px;font-weight:900;font-variant-numeric:tabular-nums;color:#fbbf24}
.anti-cheat-card form{display:grid;gap:10px;text-align:left}
.anti-cheat-card form label{display:grid;gap:6px;font-size:13px}
.anti-cheat-card form input{width:100%;height:44px;padding:0 12px;border:1px solid #475569;border-radius:10px;background:#1f2937;color:#f9fafb}
.anti-cheat-card form button{height:46px;border:0;border-radius:11px;background:#16a085;color:#fff;font-weight:800;cursor:pointer}
.anti-cheat-error{color:#fca5a5!important;font-size:13px}
body.result-mode .toolbar{display:none}
@media(max-width:700px){.student-result-charts{grid-template-columns:1fr}.student-result-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:420px){.student-pie-layout{grid-template-columns:1fr}.student-pie{width:160px}.student-pie-legend{grid-template-columns:1fr 1fr}.student-chart-card{padding:15px}}


/* Student result leaderboard — compact podium inspired by the teacher ranking */
.student-result-screen{max-width:960px;padding:clamp(16px,3vw,30px);border-radius:20px}
.student-leaderboard-card{width:100%;min-width:0;margin:14px 0 0;padding:15px;border:1px solid #303b52;border-radius:16px;background:linear-gradient(150deg,#101522,#0b0e16);color:#f2f5fa;text-align:left;box-shadow:0 10px 28px rgba(0,0,0,.20)}
.student-leaderboard-card h3{margin:0 0 7px;color:#f2f5fa;font:600 18px Georgia,serif;letter-spacing:-.01em}
.student-leaderboard-status{margin:0 0 10px;color:#a9b2c4;font-size:11px;line-height:1.5}
.student-leaderboard-list{display:grid;gap:8px;min-width:0}
.student-leaderboard-podium{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;align-items:end;margin:12px 0 14px}
.student-podium-card{display:grid;justify-items:center;align-content:start;gap:6px;min-width:0;min-height:150px;padding:11px 7px;border:1px solid #3a465e;border-radius:15px;background:#0b0e16;color:#f2f5fa;text-align:center;box-shadow:0 8px 20px rgba(0,0,0,.16)}
.student-podium-card.rank-1{min-height:190px;padding-top:14px;border-color:#c49b31;background:linear-gradient(180deg,#3a321d 0%,#111521 75%);transform:translateY(-8px)}
.student-podium-card.rank-2{min-height:168px;border-color:#8d9bb2}
.student-podium-card.rank-3{min-height:154px;border-color:#a9795c}
.student-podium-medal{display:inline-block;font-size:25px;line-height:1.1;transform-origin:50% 65%;animation:student-medal-float 2.2s ease-in-out infinite}
.student-podium-card.rank-1 .student-podium-medal{animation-delay:-.35s}
.student-podium-card.rank-3 .student-podium-medal{animation-delay:-.7s}
@keyframes student-medal-float{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-5px) rotate(2deg)}}
.student-leaderboard-avatar{display:block;width:54px;height:54px;max-width:100%;object-fit:cover;border-radius:50%;border:3px solid #3d4c68;box-shadow:0 4px 12px rgba(0,0,0,.24)}
.student-leaderboard-avatar.small{width:36px;height:36px;border-width:2px}
.student-leaderboard-name{display:block;max-width:100%;min-width:0;color:#f2f5fa;font-size:12px;font-weight:850;line-height:1.3;overflow-wrap:anywhere}
.student-leaderboard-meta{display:block;max-width:100%;min-width:0;color:#a9b2c4;font-size:10px;line-height:1.35;overflow-wrap:anywhere}
.student-leaderboard-score{display:block;color:#65c9f4;font-size:16px;font-weight:900;line-height:1.2;white-space:nowrap;font-variant-numeric:tabular-nums}
.student-podium-card small{display:block;max-width:100%;color:#a9b2c4;font-size:9.5px;line-height:1.35;overflow-wrap:anywhere}
.student-leaderboard-rest{display:grid;gap:6px;min-width:0}
.student-leaderboard-row{display:grid;grid-template-columns:28px 36px minmax(0,1fr) auto;grid-template-rows:auto auto;align-items:center;gap:3px 9px;min-width:0;padding:9px 10px;border:1px solid #303b52;border-radius:11px;background:#0b0e16;color:#f2f5fa}
.student-leaderboard-row>strong:first-child{grid-column:1;grid-row:1/3;color:#e1e7f0;font-size:14px}
.student-leaderboard-row .student-leaderboard-avatar{grid-column:2;grid-row:1/3}
.student-leaderboard-row .student-leaderboard-name{grid-column:3;grid-row:1}
.student-leaderboard-row .student-leaderboard-meta{grid-column:3;grid-row:2;white-space:normal}
.student-leaderboard-row .student-leaderboard-score{grid-column:4;grid-row:1/3;font-size:15px}
.dark .student-leaderboard-card{background:linear-gradient(150deg,#101522,#0b0e16);border-color:#303b52;color:#f2f5fa}
.dark .student-leaderboard-card h3,.dark .student-leaderboard-name{color:#f2f5fa}
.dark .student-leaderboard-status,.dark .student-leaderboard-meta,.dark .student-podium-card small{color:#a9b2c4}
.dark .student-podium-card{background:#0b0e16;border-color:#3a465e;color:#f2f5fa}
.dark .student-podium-card.rank-1{background:linear-gradient(180deg,#3a321d 0%,#111521 75%);border-color:#c49b31}
.dark .student-podium-card.rank-2{border-color:#8d9bb2}
.dark .student-podium-card.rank-3{border-color:#a9795c}
.dark .student-leaderboard-row{background:#0b0e16;border-color:#303b52;color:#f2f5fa}
.dark .student-leaderboard-score{color:#65c9f4}
@media(max-width:700px){
  .student-result-screen{padding:16px;border-radius:17px}
  .student-leaderboard-card{padding:12px}
  .student-leaderboard-podium{gap:6px}
  .student-podium-card{padding:9px 5px;gap:5px}
  .student-podium-card.rank-1{min-height:172px}
  .student-podium-card.rank-2{min-height:154px}
  .student-podium-card.rank-3{min-height:142px}
  .student-leaderboard-avatar{width:46px;height:46px}
  .student-leaderboard-row{grid-template-columns:25px 33px minmax(0,1fr) auto;gap:3px 7px;padding:8px}
}
@media(max-width:420px){
  .student-leaderboard-card{padding:10px}
  .student-leaderboard-podium{gap:4px}
  .student-podium-card{padding:8px 3px}
  .student-podium-card.rank-1{min-height:158px}
  .student-podium-card.rank-2{min-height:144px}
  .student-podium-card.rank-3{min-height:132px}
  .student-leaderboard-avatar{width:40px;height:40px;border-width:2px}
  .student-podium-medal{font-size:22px}
  .student-leaderboard-name{font-size:11px}
  .student-leaderboard-meta,.student-podium-card small{font-size:9px}
  .student-leaderboard-score{font-size:13px}
  .student-leaderboard-row{grid-template-columns:22px 30px minmax(0,1fr) auto;gap:3px 6px}
  .student-leaderboard-row .student-leaderboard-avatar{width:30px;height:30px}
  .student-leaderboard-row .student-leaderboard-score{font-size:12px}
}
@media(prefers-reduced-motion:reduce){.student-podium-medal{animation:none!important}}


/* Mobile student quiz typography: compact but comfortably readable */
@media(max-width:560px){
  .sheet{padding:14px}
  .question-card{padding-bottom:16px;margin-bottom:16px}
  .question-card legend{
    font-size:15px!important;
    line-height:1.42!important;
    margin-bottom:10px!important;
    gap:8px!important;
  }
  .star-button{width:32px;height:32px;font-size:18px}
  .choice{padding:10px;font-size:13px;line-height:1.45;gap:8px}
  .tf-st{padding:9px 10px;gap:8px}
  .tf-st-text{font-size:12.5px;line-height:1.45}
  .tf-toggle label{font-size:11px;padding:6px 9px}
  .response-label{font-size:12.5px}
  .feedback{font-size:12px;padding:10px 12px}
}
@media(max-width:380px){
  .sheet{padding:12px}
  .question-card legend{font-size:14px!important}
  .choice{font-size:12.5px}
}

  `;


  css += "\n.password-control{position:relative;display:flex;align-items:center;width:100%}.password-control>input{padding-right:50px!important}.password-eye-button{position:absolute;right:7px;top:50%;transform:translateY(-50%);display:grid;place-items:center;width:34px;height:34px;padding:0;border:0;border-radius:9px;background:transparent;color:#687b75;font-size:18px;line-height:1;cursor:pointer}.password-eye-button:hover,.password-eye-button.is-visible{background:#eaf4ef;color:#1d7a67}.student-exam-password{margin:0 0 4px}.student-exam-password .student-auth-error{margin:7px 0 0}\n";
  css+=String.raw`
.student-exam-meta{margin:5px 0 10px;color:#91a4bd;font-size:13px;font-weight:700;letter-spacing:.01em}.dark .student-exam-meta{color:#a8bfdc}body.anti-copy,body.anti-copy *{-webkit-user-select:none!important;user-select:none!important}body.anti-copy input,body.anti-copy textarea{user-select:text!important;-webkit-user-select:text!important}.privacy-shield{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;background:#101827;color:#f8fafc;text-align:center;padding:28px;font:700 20px system-ui}.privacy-shield[hidden]{display:none!important}.student-auth-section{margin:0 0 16px;padding:16px;border:1px solid #dcebe4;border-radius:16px;background:#f6fbf8}.student-auth-section h3{margin:0 0 10px}.student-auth-section label{display:grid;gap:6px;margin:10px 0;font-weight:750}.student-auth-section input{width:100%;min-height:42px;padding:9px 11px;border:1px solid #cfe2da;border-radius:10px;font:inherit}.student-auth-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.student-auth-actions button,.student-auth-submit{min-height:40px;padding:0 13px;border:1px solid #cfe2da;border-radius:10px;background:#fff;color:#315b4d;font:700 12px system-ui;cursor:pointer}.student-auth-submit{background:#1d7a67!important;color:#fff!important;border-color:#1d7a67!important}.student-auth-error{margin:8px 0;color:#b42318;font-size:12px}.student-account-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 14px;padding:10px 12px;border:1px solid #cfe2da;border-radius:12px;background:#f6fbf8;color:#315b4d;font-size:12px;font-weight:750}.student-account-bar button{min-height:34px;padding:0 10px;border:1px solid #c65c5c;border-radius:9px;background:#fff;color:#b42318;font:700 12px system-ui;cursor:pointer}.dark .student-account-bar{background:#111827;border-color:#44516b;color:#dce7f3}.dark .student-account-bar button{background:#271a20;border-color:#8c4a54;color:#ffb7bf}.student-auth-open{width:100%;margin:0 0 12px;min-height:40px;padding:0 12px;border:1px solid #cfe2da;border-radius:10px;background:#f4faf7;color:#1d6959;font:700 12px system-ui;cursor:pointer}.identity-form[hidden],.student-auth-section[hidden]{display:none!important}`;
  css += "\n.dark .student-auth-section{background:#f6fbf8!important;border-color:#cfe2da!important;color:#18302e!important;box-shadow:0 14px 38px rgba(0,0,0,.20)}\n.dark .student-auth-section h3,.dark .student-auth-section label,.dark .student-auth-section span{color:#18302e!important}\n.dark .student-auth-section input{background:#fff!important;color:#111827!important;border-color:#c5d8d0!important;opacity:1!important}\n.dark .student-auth-section input::placeholder{color:#64748b!important;opacity:1}\n.dark .student-auth-section input:focus{outline:3px solid rgba(29,122,103,.18);border-color:#1d7a67!important}\n.dark .student-auth-actions button{background:#fff!important;color:#24564b!important;border-color:#cfe2da!important}\n.dark .student-auth-section .student-auth-submit{background:#1d7a67!important;color:#fff!important;border-color:#1d7a67!important}\n.dark .student-auth-section .student-auth-error{color:#b42318!important}\n.qc-footer{width:min(1180px,calc(100% - 32px));margin:18px auto 28px;padding:22px 22px 26px;border-top:1px solid #dce7e1;display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;color:#687b75;font-size:12px}.qc-footer-brand{display:flex;flex-direction:column;gap:4px}.qc-footer-brand strong{font-size:14px;letter-spacing:.12em;color:#18302e}.qc-footer nav{display:flex;gap:12px 18px;flex-wrap:wrap}.qc-footer a{color:inherit;text-decoration:none}.qc-footer a:hover{color:#1d7a67;text-decoration:underline}.dark .qc-footer{border-color:#30384c;color:#c5cad6}.dark .qc-footer-brand strong{color:#f8fafc}.dark .qc-footer a{color:#c5cad6}.dark .qc-footer a:hover{color:#7dd3fc}\n@media(max-width:760px){.qc-footer{width:calc(100% - 24px);padding:18px 8px 24px;align-items:flex-start}.qc-footer nav{gap:10px 14px}}\n";
  const js=
  "var assignmentId="+safeJson(assignmentId)+",teacherId="+safeJson(TEACHER_CODE)+",appsScriptUrl="+safeJson(appsScriptUrl)+",assignedClassCode="+safeJson(assignedClassCode)+",requiredExamPasswordHash="+safeJson(examPasswordHash)+",questions="+data+",settings={points:"+safeJson(points)+",maxScore:"+max+",duration:"+duration+",view:"+safeJson(studentView)+",reveal:"+safeJson(answerReveal)+",allowRetake:"+allowRetake+",antiCheat:"+antiCheatEnabled+",antiCopy:"+antiCopyEnabled+",antiScreenshot:"+antiScreenshotEnabled+",requireEmail:"+requireStudentEmail+",lockMode:"+safeJson(config.lockMode||'UNLOCKED')+",lockAt:"+safeJson(config.lockMode==='LOCKED'?(config.lockAt||''):'')+",accessMode:"+safeJson(config.accessMode||'PUBLIC')+"};"+
  qcPasswordFallbackHash.toString()+";"+qcPasswordHash.toString()+";"+
  "var examPasswordWrap=document.querySelector('#examPasswordWrap'),examPasswordField=document.querySelector('#examPasswordInput');if(examPasswordWrap){examPasswordWrap.hidden=!requiredExamPasswordHash;if(examPasswordField)examPasswordField.required=!!requiredExamPasswordHash;}"+
  "var studentExamPasswordToggle=document.querySelector('#toggleStudentExamPasswordBtn');if(examPasswordField&&studentExamPasswordToggle){studentExamPasswordToggle.addEventListener('click',function(){var reveal=examPasswordField.type==='password';examPasswordField.type=reveal?'text':'password';studentExamPasswordToggle.classList.toggle('is-visible',reveal);studentExamPasswordToggle.setAttribute('aria-label',reveal?'Ẩn mật khẩu':'Hiện mật khẩu');studentExamPasswordToggle.title=reveal?'Ẩn mật khẩu':'Hiện mật khẩu';});}"+
"var mode=settings.view,reveal=settings.reveal,current=0,submitted=false,reviewMode=false,flagged=new Set(),locked=new Set(),timer=settings.duration*60,clock=null,soundOn=true,elapsedSeconds=0;"+
"var root=document.querySelector('.questions'),cards=[].slice.call(document.querySelectorAll('[data-card]')),nav=document.querySelector('.nav-list'),viewMode=document.querySelector('#viewMode'),statusEl=document.querySelector('#status'),resultEl=document.querySelector('#result'),prevBtn=document.querySelector('#prev'),nextBtn=document.querySelector('#next'),submitBtn=document.querySelector('#submit'),submitAllBtn=document.querySelector('#submitAll'),timerNode=document.querySelector('#timer'),examLayout=document.querySelector('#examLayout'),studentResultScreen=document.querySelector('#studentResultScreen'),studentScore=document.querySelector('#studentScore'),studentScoreArc=document.querySelector('#studentScoreArc'),studentScoreWrap=document.querySelector('#studentScoreWrap'),studentScoreCaption=document.querySelector('#studentScoreCaption'),studentResultMessage=document.querySelector('#studentResultMessage'),studentResultStats=document.querySelector('#studentResultStats'),studentPie=document.querySelector('#studentPie'),studentPieCenter=document.querySelector('#studentPieCenter'),studentPieLegend=document.querySelector('#studentPieLegend'),studentColumnChart=document.querySelector('#studentColumnChart'),studentResultFootnote=document.querySelector('#studentResultFootnote'),studentHeaderNote=document.querySelector('#studentHeaderNote'),streakNode=document.querySelector('#streak'),reviewLegend=document.querySelector('#reviewLegend'),navHelp=document.querySelector('#navHelp'),reviewAnswersBtn=document.querySelector('#reviewAnswersBtn'),retakeStudentBtn=document.querySelector('#retakeStudentBtn'),backToResultsBtn=document.querySelector('#backToResultsBtn');if(streakNode)streakNode.hidden=reveal!=='per-question';"+
"function card(i){return cards[i];}"+
"function stopCardMedia(f){if(!f)return;f.querySelectorAll('audio,video').forEach(function(m){try{m.pause();}catch(e){}try{m.currentTime=0;}catch(e){}});}"+
"function stopAllQuestionMedia(){cards.forEach(function(f){stopCardMedia(f);});}"+
"var renderRichText="+renderRichText.toString()+";"+
"function textHtml(v){return renderRichText(v);}"+
"function tfAnswers(f){var out=[];for(var j=0;j<4;j++){var c=f.querySelector('input[name=\"q'+f.dataset.index+'_s'+j+'\"]:checked');out.push(c?c.value:undefined);}return out;}"+
"function valueOf(i){var f=card(i);if(f.dataset.type==='truefalse')return tfAnswers(f);var r=f.querySelector('input:checked'),t=f.querySelector('input[type=text],textarea');return r?r.value:t?t.value:'';}"+
"function answered(i){var f=card(i),v=valueOf(i);if(f.dataset.type==='truefalse'){if(reveal==='per-question')return locked.has(i);return [].slice.call(f.querySelectorAll('.tf-st')).every(function(row){return v[Number(row.dataset.stIndex)]!==undefined;});}return String(v).trim()!=='';}"+
"function normalizeShortAnswer(v){var s=String(v==null?'':v).trim().toLocaleLowerCase().replace(/\\s+/g,' '),choice=s.match(/^([a-d])\\s*[.)]\\s*\\1\\s*[.)](?:\\s*.*)?$/i);if(choice)return choice[1].toLocaleLowerCase();var m=s.match(/^([+-]?)(\\d+)$/);if(!m)return s;var digits=m[2].replace(/^0+(?=\\d)/,'');if(digits==='0')return '0';return (m[1]==='-'?'-':'')+digits;}"+
"function shortAnswerMatches(a,b){return normalizeShortAnswer(a)===normalizeShortAnswer(b);}"+
"function tfCorrect(f,v){try{var ans=JSON.parse(f.dataset.answer);}catch(e){return 0;}var m=0;[].slice.call(f.querySelectorAll('.tf-st')).forEach(function(row){var j=Number(row.dataset.stIndex);if(v[j]===String(ans[j]))m++;});return m;}"+
"function earned(i){var f=card(i),pts=Number(f.dataset.points)||0,v=valueOf(i);if(f.dataset.type==='essay')return 0;if(f.dataset.type==='truefalse'){if(reveal==='per-question'&&!locked.has(i))return 0;var total=f.querySelectorAll('.tf-st').length;return total?(tfCorrect(f,v)/total)*pts:0;}if(f.dataset.type==='short')return shortAnswerMatches(v,f.dataset.answer)?pts:0;return v===f.dataset.answer?pts:0;}"+
"function fullyCorrect(i){var f=card(i),v=valueOf(i);if(f.dataset.type==='truefalse'){if(reveal==='per-question'&&!locked.has(i))return false;var total=f.querySelectorAll('.tf-st').length;return total>0&&tfCorrect(f,v)===total;}if(f.dataset.type==='essay')return false;if(f.dataset.type==='short')return shortAnswerMatches(v,f.dataset.answer);return v===f.dataset.answer;}"+
"function streakStats(){if(reveal!=='per-question')return{current:0,best:0};var last=-1;cards.forEach(function(f,i){if(answered(i))last=i;});var run=0,best=0;for(var i=0;i<=last;i++){if(answered(i)&&fullyCorrect(i))run++;else run=0;if(run>best)best=run;}return{current:run,best:best};}"+
"function updateStreak(){var stats=streakStats();if(streakNode){streakNode.hidden=reveal!=='per-question';if(reveal==='per-question')streakNode.textContent='Chuỗi đúng: '+stats.current;}return stats;}"+
"function showTimer(){if(!timerNode)return;timerNode.textContent=settings.duration?(String(Math.max(0,Math.floor(timer/60))).padStart(2,'0')+':'+String(Math.max(0,timer%60)).padStart(2,'0')):'Thời gian: Không giới hạn';}"+
"function updateNav(){cards.forEach(function(f,i){var b=nav.querySelectorAll('[data-jump]')[i];if(!b)return;var done=answered(i),essay=f.dataset.type==='essay';b.classList.toggle('is-answered',done);b.classList.toggle('is-flagged',flagged.has(i));b.classList.toggle('is-review-correct',reviewMode&&!essay&&fullyCorrect(i));b.classList.toggle('is-review-wrong',reviewMode&&!essay&&done&&!fullyCorrect(i));b.classList.toggle('is-review-pending',reviewMode&&(essay||!done));b.textContent=String(i+1);});if(prevBtn)prevBtn.disabled=current===0;if(nextBtn){nextBtn.disabled=false;nextBtn.textContent=reviewMode?(current===cards.length-1?'Cuối':'Sau'):(current===cards.length-1?'Nộp bài':'Sau');nextBtn.classList.toggle('submit-button',!reviewMode&&current===cards.length-1);}if(statusEl)statusEl.textContent=(reviewMode?'Đang xem lại · ':'Đã làm ')+cards.filter(function(_,i){return answered(i);}).length+'/'+cards.length+' câu';if(navHelp)navHelp.hidden=reviewMode;if(reviewLegend)reviewLegend.hidden=!reviewMode;updateStreak();}"+
"function setMode(m){mode=m;if(viewMode)viewMode.value=mode;document.body.classList.toggle('all-mode',mode==='all');cards.forEach(function(f,i){f.hidden=mode==='single'&&i!==current;});if(submitBtn)submitBtn.hidden=mode==='all';if(mode==='all'&&!mediaActiveCard)mediaActiveCard=card(current);updateNav();var target=card(current);if(target){if(mode==='all')target.scrollIntoView({behavior:'smooth',block:'start'});else target.scrollIntoView({block:'nearest'});}}"+
"var mediaScrollRaf=0,mediaActiveCard=null;function checkVisibleQuestionMedia(){mediaScrollRaf=0;if(mode!=='all'||submitted||reviewMode)return;var line=window.innerHeight*.42,chosen=card(current),best=Infinity;cards.forEach(function(f){var r=f.getBoundingClientRect(),d=line<r.top?r.top-line:line>r.bottom?line-r.bottom:0;if(d<best){best=d;chosen=f;}});if(chosen&&chosen!==mediaActiveCard){if(mediaActiveCard)stopCardMedia(mediaActiveCard);mediaActiveCard=chosen;}}window.addEventListener('scroll',function(){if(!mediaScrollRaf)mediaScrollRaf=requestAnimationFrame(checkVisibleQuestionMedia);},{passive:true});"+
"function showFeedback(i,force){if(reveal==='none')return;var f=card(i),box=f.querySelector('.feedback');box.innerHTML='';box.hidden=true;if(!force&&!answered(i))return;if(f.dataset.type==='essay'){box.innerHTML='<p>Câu tự luận cần được tự xem và chấm.</p>';box.hidden=false;return;}var good=fullyCorrect(i),html='';if(f.dataset.type==='truefalse'){var total=f.querySelectorAll('.tf-st').length,ok=tfCorrect(f,valueOf(i));html='<strong>'+(good?'Chính xác!':'Đúng '+ok+'/'+total+' phát biểu.')+'</strong>';if(!good){try{var ans=JSON.parse(f.dataset.answer);var right=[].slice.call(f.querySelectorAll('.tf-st')).map(function(row){var j=Number(row.dataset.stIndex);return String.fromCharCode(97+j)+'. '+(ans[j]?'Đúng':'Sai');}).join(' · ');html+='<p>Đáp án đúng: '+right+'</p>';}catch(e){}}f.querySelectorAll('.tf-st').forEach(function(row,j){var c=row.querySelector('input:checked'),note=row.querySelector('.tf-st-note');try{var arr=JSON.parse(f.dataset.answer),j=Number(row.dataset.stIndex),right=c&&String(arr[j])===c.value;if(c){row.classList.add(right?'correct-st':'wrong-st');note.textContent=right?'Bạn chọn đúng.':'Đáp án đúng: '+(arr[j]?'Đúng':'Sai');note.className='tf-st-note '+(right?'right':'wrong');}else if(reviewMode){note.textContent='Chưa trả lời · Đáp án: '+(arr[j]?'Đúng':'Sai');note.className='tf-st-note wrong';}}catch(e){}});}else{html='<strong>'+(good?'Chính xác!':'Chưa đúng.')+'</strong>';if(!good)html+='<p>Đáp án đúng: '+(f.dataset.type==='multiple'?String.fromCharCode(65+Number(f.dataset.answer))+'. '+textHtml(f.dataset.answerText):f.dataset.answer==='true'?'Đúng':textHtml(f.dataset.answer))+'</p>';if(f.dataset.type==='multiple'||f.dataset.type==='truefalse'){f.querySelectorAll('.choice').forEach(function(c){var inp=c.querySelector('input');if(inp.value===f.dataset.answer)c.classList.add('correct');if(inp.checked&&!good)c.classList.add('incorrect');});}}try{var exps=JSON.parse(f.dataset.exp||'[]'),exp='';if(f.dataset.type==='multiple'){var v=valueOf(i);exp=exps[Number(v)]||exps[Number(f.dataset.answer)]||'';}else exp=exps[0]||'';if(exp)html+='<p>Giải thích: '+textHtml(exp)+'</p>';try{var ims=JSON.parse(f.dataset.expMedia||'[]');html+=ims.map(function(m){return '<img class=\"media\" src=\"'+m.url+'\" alt=\"\">';}).join('');}catch(e){}}catch(e){}box.innerHTML=html;box.classList.toggle('wrong',!good);box.hidden=false;}"+
"function handleChange(i){if(locked.has(i))return;updateNav();saveProgress();}"+
"function go(i){var next=Math.max(0,Math.min(cards.length-1,i));if(next!==current)stopCardMedia(card(current));current=next;mediaActiveCard=card(current);setMode(mode);saveProgress();}"+
"function scoreTextColor(fraction){return fraction<=.30?'#ef4444':fraction<=.75?'#eab308':'#22c55e';}"+
"function createScoreAudio(finalFraction){if(!soundOn||finalFraction<=0)return{update:function(){},finish:function(){},cancel:function(){}};try{var C=window.AudioContext||window.webkitAudioContext;if(!C)return{update:function(){},finish:function(){},cancel:function(){}};var ctx=new C();if(ctx.state==='suspended')ctx.resume().catch(function(){});var nextTick=ctx.currentTime,closed=false;function clamp(v){return Math.max(0,Math.min(1,Number(v)||0));}function pulse(fraction,at){var o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(230+Math.pow(clamp(fraction),.85)*650,at);g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(.026,at+.009);g.gain.exponentialRampToValueAtTime(.0001,at+.075);o.connect(g);g.connect(ctx.destination);o.start(at);o.stop(at+.085);}return{update:function(fraction,progress){if(closed)return;var now=ctx.currentTime;if(now>=nextTick){pulse(fraction,now);nextTick=now+.11+Math.pow(clamp(progress),1.15)*.39;}},finish:function(){if(closed)return;closed=true;var now=ctx.currentTime,base=360+clamp(finalFraction)*620;[1,1.25,1.5].forEach(function(m,i){var at=now+i*.075,o=ctx.createOscillator(),g=ctx.createGain();o.type='triangle';o.frequency.setValueAtTime(base*m,at);g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(.032,at+.012);g.gain.exponentialRampToValueAtTime(.0001,at+.13);o.connect(g);g.connect(ctx.destination);o.start(at);o.stop(at+.145);});window.setTimeout(function(){try{ctx.close();}catch(e){}},850);},cancel:function(){if(closed)return;closed=true;try{ctx.close();}catch(e){}}};}catch(e){return{update:function(){},finish:function(){},cancel:function(){}};}}"+
"function animateScore(node,target,maxScore){if(!node)return;target=Math.max(0,Number(target)||0);maxScore=Math.max(.01,Number(maxScore)||10);var arc=studentScoreArc,circ=2*Math.PI*96,finalFraction=Math.max(0,Math.min(1,target/maxScore)),audio=createScoreAudio(finalFraction);if(arc){arc.style.strokeDasharray=String(circ);arc.style.strokeDashoffset=String(circ);arc.style.stroke='url(#studentScoreGradient)';}function updateVisual(value,progress,withSound){var fraction=Math.max(0,Math.min(1,value/maxScore));node.textContent=value.toFixed(2);node.style.color=scoreTextColor(fraction);if(arc){if(target<=0){arc.style.stroke='#ef4444';arc.style.strokeDashoffset='0';}else{arc.style.stroke='url(#studentScoreGradient)';arc.style.strokeDashoffset=String(circ*(1-fraction));}}if(withSound!==false)audio.update(fraction,progress||0);}function complete(){updateVisual(target,1,false);if(target>0){launchFireworks(studentScoreWrap);audio.finish();}else{audio.cancel();}}if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches){complete();return;}var started=0;function frame(now){if(!started)started=now;var p=Math.min(1,(now-started)/5000),ease=1-Math.pow(1-p,3.6),value=target*ease;updateVisual(value,p,true);if(p<1)requestAnimationFrame(frame);else complete();}requestAnimationFrame(frame);}"+
"function launchFireworks(container){if(!container)return;var old=container.querySelector('.score-fireworks');if(old)old.remove();var layer=document.createElement('div');layer.className='score-fireworks';layer.setAttribute('aria-hidden','true');var colors=['#ef4444','#f97316','#facc15','#84cc16','#22c55e','#38bdf8','#a78bfa','#fb7185'];for(var i=0;i<64;i++){var angle=Math.PI*2*i/64+(i%4)*.035,distance=66+(i%8)*13,particle=document.createElement('span');particle.style.setProperty('--spark-x',Math.cos(angle)*distance+'px');particle.style.setProperty('--spark-y',(Math.sin(angle)*distance+35)+'px');particle.style.setProperty('--spark-r',(240+(i%5)*130)+'deg');particle.style.setProperty('--spark-color',colors[i%colors.length]);particle.style.setProperty('--spark-w',(5+(i%3)*2)+'px');particle.style.setProperty('--spark-h',(9+(i%4)*2)+'px');particle.style.setProperty('--spark-delay',(i%8)*.025+'s');layer.append(particle);}container.append(layer);window.setTimeout(function(){layer.remove();},2300);}"+
"function elapsedTimeText(value){var s=Math.max(0,Math.floor(Number(value)||0)),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),r=s%60;return h?String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(r).padStart(2,'0'):String(m).padStart(2,'0')+':'+String(r).padStart(2,'0');}"+
  "var jsonpSerial=0;\nfunction appsScriptRequest(params){if(window.__qcSupabaseBridge){var sb=window.__qcSupabaseBridge(params);if(sb)return sb;}return new Promise(function(resolve,reject){if(!appsScriptUrl){reject(new Error('Chưa cấu hình Google Sheets.'));return;}var endpoint;try{endpoint=new URL(appsScriptUrl);}catch(e){reject(new Error('URL Apps Script không hợp lệ.'));return;}var callback='qcStudentCallback_'+Date.now().toString(36)+'_'+(++jsonpSerial),script=document.createElement('script'),done=false;function cleanup(){if(done)return;done=true;clearTimeout(timer);delete window[callback];script.remove();}var timer=setTimeout(function(){cleanup();reject(new Error('Apps Script không phản hồi.'));},15000);window[callback]=function(data){cleanup();resolve(data);};Object.keys(params).forEach(function(key){endpoint.searchParams.set(key,String(params[key]==null?'':params[key]));});endpoint.searchParams.set('callback',callback);script.onerror=function(){cleanup();reject(new Error('Không thể kết nối Apps Script.'));};script.src=endpoint.toString();document.head.append(script);});}\n"+String.raw`function studentGuestId(){try{var id=localStorage.getItem('quiz-craft-guest-id-v1');if(!id){id='GUEST-'+(window.crypto&&crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random());localStorage.setItem('quiz-craft-guest-id-v1',id);}return id;}catch(e){return 'GUEST-'+Date.now().toString(36)+Math.random().toString(36).slice(2);}}
var studentAuthStorageKey='quiz-craft-auth-session-v1',studentRememberEmailKey='quiz-craft-last-student-email-v1';
function setStudentAuthMode(mode){studentAuthMode=mode==='register'||mode==='forgot'?mode:'login';var reg=studentAuthMode==='register',forgot=studentAuthMode==='forgot';if(studentAuthTitle)studentAuthTitle.textContent=reg?'Tạo tài khoản học sinh':forgot?'Khôi phục mật khẩu':'Đăng nhập bằng Gmail';if(studentAuthNameWrap)studentAuthNameWrap.hidden=!reg;if(studentAuthOtpWrap)studentAuthOtpWrap.hidden=!reg&&!forgot;if(studentAuthSendOtpBtn)studentAuthSendOtpBtn.hidden=!reg&&!forgot;if(studentAuthForgotBtn)studentAuthForgotBtn.hidden=reg||forgot;if(studentAuthSwitchBtn)studentAuthSwitchBtn.hidden=forgot;if(studentAuthSwitchBtn)studentAuthSwitchBtn.textContent=reg?'Đã có tài khoản? Đăng nhập':'Chưa có tài khoản? Đăng ký';if(studentAuthPasswordText)studentAuthPasswordText.textContent=forgot?'Mật khẩu mới':'Mật khẩu';if(studentAuthPassword)studentAuthPassword.autocomplete=studentAuthMode==='login'?'current-password':'new-password';if(studentAuthEmail&&!reg&&!forgot&&!studentPendingReauth&&!studentAuthEmail.value){try{studentAuthEmail.value=localStorage.getItem(studentRememberEmailKey)||'';}catch(e){}}if(studentAuthSubmitBtn)studentAuthSubmitBtn.textContent=reg?'Xác minh và tạo tài khoản':forgot?'Xác minh OTP và đổi mật khẩu':'Đăng nhập';if(studentAuthOtp)studentAuthOtp.value='';if(studentAuthError){studentAuthError.textContent='';studentAuthError.hidden=true;}studentOtpId='';}
function syncStudentAuthUI(){var authenticated=!!(studentAccountSession&&studentAccountSession.sessionToken),authRequired=!!settings.requireEmail||!!studentPendingReauth;if(studentAuthOpenBtn)studentAuthOpenBtn.hidden=true;if(studentAuthSection)studentAuthSection.hidden=!authRequired||authenticated;if(identityForm)identityForm.hidden=(authRequired&&!authenticated)||studentPendingReauth;if(studentAccountBar)studentAccountBar.hidden=!authenticated;if(studentAccountLabel&&authenticated)studentAccountLabel.textContent='Đã đăng nhập: '+(studentAccountSession.email||studentAccountSession.name||'Tài khoản');if(studentNameLabel)studentNameLabel.hidden=!!(settings.requireEmail&&authenticated);if(studentNameInput){if(authenticated&&studentAccountSession.name)studentNameInput.value=studentAccountSession.name;studentNameInput.readOnly=!!(settings.requireEmail&&authenticated);studentNameInput.required=!(settings.requireEmail&&authenticated);}if(studentEmailInput){studentEmailInput.readOnly=authenticated;if(authenticated)studentEmailInput.value=studentAccountSession.email||'';}if(identityForm){var heading=identityForm.querySelector('h2'),help=identityForm.querySelector('p:not(.resume-hint)');if(settings.requireEmail&&authenticated){if(heading)heading.textContent='Chọn lớp để bắt đầu';if(help)help.textContent=assignedClassCode?'Tài khoản đã xác thực. Nhấn nút bên dưới để vào bài thi.':'Tài khoản đã xác thực. Hãy nhập lớp của bạn để vào bài thi.';}else if(!settings.requireEmail&&!studentPendingReauth){if(heading)heading.textContent='Bắt đầu bài tập';if(help)help.textContent='Điền họ tên và lớp để bắt đầu làm bài.';}}}
async function restoreStudentAuth(){if(!settings.requireEmail&&!studentPendingReauth){studentAccountSession=null;syncStudentAuthUI();return;}try{var raw=localStorage.getItem(studentAuthStorageKey),saved=raw?JSON.parse(raw):null;if(saved&&saved.sessionToken){var live=await appsScriptRequest({action:'session',sessionToken:saved.sessionToken,guestId:saved.guestId||''});if(live&&live.ok&&live.authenticated){studentAccountSession=Object.assign({},saved,live.session,{sessionToken:saved.sessionToken});}else{localStorage.removeItem(studentAuthStorageKey);}}}catch(e){studentAccountSession=null;}if(studentAccountSession&&studentNameInput){studentNameInput.value=studentAccountSession.name||studentNameInput.value;if(studentEmailInput)studentEmailInput.value=studentAccountSession.email||'';}syncStudentAuthUI();}
async function logoutStudentAuth(){if(!studentAccountSession||!studentAccountSession.sessionToken)return;if(!await window.confirm('Bạn có chắc chắn muốn đăng xuất khỏi tài khoản học sinh này không?'))return;try{await appsScriptRequest({action:'logout',sessionToken:studentAccountSession.sessionToken,guestId:studentAccountSession.guestId||''});}catch(e){window.alert('Không thể đăng xuất do lỗi kết nối. Hãy thử lại.');return;}try{localStorage.removeItem(studentAuthStorageKey);}catch(e){}studentAccountSession=null;studentAuthManualOpen=false;if(studentNameInput){studentNameInput.value='';studentNameInput.readOnly=false;}if(studentClassInput&&!assignedClassCode)studentClassInput.value='';syncStudentAuthUI();}
async function sendStudentAuthOtp(){try{var email=studentAuthEmail&&studentAuthEmail.value.trim().toLowerCase(),name=studentAuthName&&studentAuthName.value.trim(),password=studentAuthPassword&&studentAuthPassword.value;if(!email)throw new Error('Hãy nhập Gmail hợp lệ.');if(studentAuthMode==='register'&&!name)throw new Error('Hãy nhập họ tên.');if(!password||password.length<8||password.length>128)throw new Error('Mật khẩu phải có từ 8 đến 128 ký tự.');var purpose=studentAuthMode==='register'?'register':'reset_password',result=await appsScriptRequest({action:'requestOtp',email:email,role:'HOCSINH',purpose:purpose,displayName:name||'',guestId:studentGuestId()});if(!result||!result.ok)throw new Error(result&&result.error||'Không gửi được OTP.');studentOtpId=result.otpId;if(studentAuthOtpWrap)studentAuthOtpWrap.hidden=false;if(studentAuthOtp)studentAuthOtp.focus();if(studentAuthError){studentAuthError.hidden=false;studentAuthError.textContent='Đã gửi OTP đến Gmail. Mã có hiệu lực 5 phút.';}}catch(e){if(studentAuthError){studentAuthError.hidden=false;studentAuthError.textContent=e.message||'Không gửi được OTP.';}}}
function studentGoogleCredential(response){
  var credential=String(response&&response.credential||'');
  if(!credential){if(studentAuthError){studentAuthError.hidden=false;studentAuthError.textContent='Google không trả về mã xác thực.';}return;}
  appsScriptRequest({action:'googleLogin',idToken:credential,role:'HOCSINH',guestId:studentGuestId()}).then(function(result){
    if(!result||!result.ok)throw new Error(result&&result.error||'Đăng nhập Google thất bại.');
    if(!result.session||!result.sessionToken)throw new Error('API Google chưa trả về phiên học sinh hợp lệ.');
    studentAccountSession=Object.assign({},result.session,{sessionToken:result.sessionToken,guestId:result.session.guestId||studentGuestId()});
    localStorage.setItem(studentAuthStorageKey,JSON.stringify(studentAccountSession));
    if(studentAuthEmail)studentAuthEmail.value=studentAccountSession.email||'';
    try{localStorage.setItem(studentRememberEmailKey,studentAccountSession.email||'');}catch(e){}
    studentAuthManualOpen=false;
    syncStudentAuthUI();
    if(assignedClassCode){if(studentClassInput)studentClassInput.value=assignedClassCode;if(!window.__QC_PACK_CAPTURE_PROFILE)startStudent();}
    else if(studentAuthError){studentAuthError.hidden=false;studentAuthError.textContent='Đăng nhập Google thành công. Hãy chọn lớp để bắt đầu.';}
  }).catch(function(error){if(studentAuthError){studentAuthError.hidden=false;studentAuthError.textContent=error.message||'Không thể đăng nhập Google.';}});
}
function initStudentGoogleAuth(){
  var wrap=document.getElementById('studentGoogleAuthWrap'),mount=document.getElementById('studentGoogleAuthMount');
  if(!wrap||!mount||!settings.requireEmail)return;
  wrap.hidden=false;
  var clientId=String((window.QUIZ_CRAFT_CONFIG&&window.QUIZ_CRAFT_CONFIG.googleClientId)||'');
  if(!clientId.endsWith('.apps.googleusercontent.com')){
    var note=document.getElementById('studentGoogleAuthNote');if(note)note.textContent='Chưa cấu hình Google OAuth Client ID.';return;
  }
  var attempts=0;
  function render(){
    if(!window.google||!google.accounts||!google.accounts.id)return false;
    google.accounts.id.initialize({client_id:clientId,callback:studentGoogleCredential,auto_select:false});
    google.accounts.id.renderButton(mount,{type:'standard',shape:'rectangular',theme:'outline',size:'large',text:'continue_with',locale:'vi',width:280});
    var note=document.getElementById('studentGoogleAuthNote');if(note)note.textContent='Dùng tài khoản Google để đăng nhập học sinh.';
    return true;
  }
  (function wait(){if(render()||attempts++>30)return;setTimeout(wait,250);})();
}
async function submitStudentAuth(event){if(event)event.preventDefault();try{var email=studentAuthEmail&&studentAuthEmail.value.trim().toLowerCase(),password=studentAuthPassword&&studentAuthPassword.value,name=studentAuthName&&studentAuthName.value.trim(),guestId=studentGuestId(),wasReauth=!!studentPendingReauth,previousClass=studentClass||String(studentClassInput&&studentClassInput.value||'').trim();if(!email)throw new Error('Hãy nhập Gmail.');if(studentAuthMode==='login'){if(!password)throw new Error('Hãy nhập mật khẩu.');var result=await appsScriptRequest({action:'login',email:email,password:password,guestId:guestId});if(!result||!result.ok)throw new Error(result&&result.error||'Gmail hoặc mật khẩu không đúng.');if(!result.session||!result.sessionToken)throw new Error('API đăng nhập trả về thiếu phiên đăng nhập. Hãy kiểm tra Apps Script deployment.');studentAccountSession=Object.assign({},result.session,{sessionToken:result.sessionToken,guestId:result.session.guestId||guestId});}else{if(password.length<8||password.length>128)throw new Error('Mật khẩu phải có từ 8 đến 128 ký tự.');if(!studentOtpId)throw new Error('Hãy nhấn “Gửi OTP” trước.');var purpose=studentAuthMode==='register'?'register':'reset_password';var verified=await appsScriptRequest({action:'verifyOtp',email:email,role:'HOCSINH',purpose:purpose,otpId:studentOtpId,otp:studentAuthOtp.value.trim(),password:password,displayName:name||'',guestId:guestId});if(!verified||!verified.ok)throw new Error(verified&&verified.error||'OTP không hợp lệ.');studentOtpId='';if(verified.passwordReset){setStudentAuthMode('login');if(studentAuthEmail)studentAuthEmail.value=email;if(studentAuthPassword)studentAuthPassword.value='';if(studentAuthError){studentAuthError.hidden=false;studentAuthError.textContent='Đổi mật khẩu thành công. Hãy đăng nhập bằng mật khẩu mới.';}return;}if(!verified.session||!verified.sessionToken)throw new Error('API đăng ký trả về thiếu phiên đăng nhập. Hãy kiểm tra Apps Script deployment.');studentAccountSession=Object.assign({},verified.session,{sessionToken:verified.sessionToken,guestId:verified.session.guestId||guestId});}localStorage.setItem(studentAuthStorageKey,JSON.stringify(studentAccountSession));try{localStorage.setItem(studentRememberEmailKey,email);}catch(e){}studentAuthManualOpen=false;if(wasReauth){var state=readAntiCheatState();state.count=0;state.lockedUntil=0;state.needsReauth=false;state.lastEventAt=Date.now();writeAntiCheatState(state);studentPendingReauth=false;}if(studentNameInput)studentNameInput.value=studentAccountSession.name||studentNameInput.value;if(studentEmailInput)studentEmailInput.value=studentAccountSession.email||'';syncStudentAuthUI();if(assignedClassCode){if(studentClassInput)studentClassInput.value=assignedClassCode;startStudent();return;}if(wasReauth&&previousClass){if(studentClassInput)studentClassInput.value=previousClass;startStudent();return;}if(studentAuthError){studentAuthError.hidden=false;studentAuthError.textContent='Đăng nhập thành công. Hãy chọn lớp bên dưới để bắt đầu bài thi.';}if(studentClassInput)studentClassInput.focus();}catch(e){if(studentAuthError){studentAuthError.hidden=false;studentAuthError.textContent=e.message||'Không thể đăng nhập.';}}}
function forceStudentReauth(){studentPendingReauth=true;studentAccountSession=null;try{localStorage.removeItem(studentAuthStorageKey);}catch(e){}if(antiCheatOverlay)antiCheatOverlay.hidden=true;document.body.style.overflow='';studentAuthManualOpen=true;setStudentAuthMode('login');syncStudentAuthUI();if(studentAuthError){studentAuthError.hidden=false;studentAuthError.textContent='Bạn đã vi phạm 4 lần. Hãy đăng nhập lại bằng Gmail và mật khẩu để tiếp tục bài làm.';}if(studentAuthEmail)studentAuthEmail.value='';if(studentAuthPassword)studentAuthPassword.value='';if(studentAuthEmail)studentAuthEmail.focus();}
`+"\nfunction createStudentId(name,klass){var stableIdentity=String(studentEmail||name).normalize('NFC').trim().toLocaleLowerCase();var key='quizcraft-student-id-v2:'+stableIdentity;function rand5(){var chars='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',out='';if(window.crypto&&crypto.getRandomValues){var a=new Uint8Array(5);crypto.getRandomValues(a);for(var i=0;i<5;i++)out+=chars[a[i]%chars.length];}else for(var j=0;j<5;j++)out+=chars[Math.floor(Math.random()*chars.length)];return out;}function device(){var ua=navigator.userAgent||'';return /android/i.test(ua)?'01':(/iphone|ipad|ipod/i.test(ua)?'02':'03');}function initials(v){var p=String(v||'').normalize('NFC').trim().split(/\s+/).filter(Boolean);if(p.length>1)return (p[0][0]+p[p.length-1][0]).toLocaleUpperCase();return (p[0]||'HS').slice(0,2).toLocaleUpperCase();}function classParts(v){var m=String(v||'').toUpperCase().match(/^(\d{1,2})([A-Z])?(\d)?$/);if(!m)return ['00','00'];return [m[1].padStart(2,'0'),m[2]?(m[2]+(m[3]||'0')):'00'];}try{var id=localStorage.getItem(key);if(!id){var d=new Date(),c=classParts(klass);id=initials(name)+'-'+c[0]+'-'+c[1]+'-'+String(d.getDate()).padStart(2,'0')+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+d.getFullYear()+'-'+device()+'-'+rand5();localStorage.setItem(key,id);}return id;}catch(e){var d2=new Date(),c2=classParts(klass);return initials(name)+'-'+c2[0]+'-'+c2[1]+'-'+String(d2.getDate()).padStart(2,'0')+'-'+String(d2.getMonth()+1).padStart(2,'0')+'-'+d2.getFullYear()+'-'+device()+'-'+rand5();}}\nfunction createAttemptId(){return 'LT-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);}\nfunction renderLeaderboard(rows,stats,rank){var panel=document.querySelector('#studentLeaderboard'),list=document.querySelector('#studentLeaderboardList'),status=document.querySelector('#studentLeaderboardStatus');if(!panel||!list||!status)return;panel.hidden=false;list.replaceChildren();stats=stats||{};var sorted=(Array.isArray(rows)?rows:[]).slice().sort(function(a,b){return Number(a.score)-Number(b.score)?Number(b.score)-Number(a.score):String(a.studentName).localeCompare(String(b.studentName),'vi');}).slice(0,5);var headline='Lớp '+studentClass+' · '+(Number(stats.studentCount)||0)+' học sinh · '+(Number(stats.attemptCount)||0)+' lượt làm · TB '+(Number(stats.average)||0).toFixed(2)+'/10 ('+((Number(stats.average)||0)*10).toFixed(1)+'%) · cao nhất '+(Number(stats.highest)||0).toFixed(2)+' · thấp nhất '+(Number(stats.lowest)||0).toFixed(2);if(rank)headline+=' · bạn đang hạng #'+rank;status.textContent=headline;if(!sorted.length){var empty=document.createElement('span');empty.textContent='Chưa có dữ liệu xếp hạng cho đề và lớp này.';list.append(empty);return;}sorted.forEach(function(item,index){var row=document.createElement('div');row.className='student-leaderboard-row';var badge=document.createElement('span');badge.className='student-leaderboard-rank';badge.textContent=['🥇','🥈','🥉'][index]||String(index+1);var name=document.createElement('span');name.className='student-leaderboard-name';name.textContent=item.studentName||'Học sinh';var score=document.createElement('strong');score.className='student-leaderboard-score';score.textContent=(Number(item.score)||0).toFixed(2)+'/10';row.append(badge,name,score);list.append(row);});}\nfunction syncScoreAndLeaderboard(score){var panel=document.querySelector('#studentLeaderboard'),status=document.querySelector('#studentLeaderboardStatus');if(!appsScriptUrl){if(panel)panel.hidden=true;return;}if(panel)panel.hidden=false;if(status)status.textContent='Đang lưu điểm và tính thứ hạng...';if(!studentId)studentId=createStudentId(studentName,studentClass);if(!attemptId)attemptId=createAttemptId();var payload={action:'save',teacherId:teacherId,examId:assignmentId,classCode:studentClass,studentId:studentId,attemptId:attemptId,studentName:studentName,studentEmail:studentEmail,sessionToken:studentAccountSession&&studentAccountSession.sessionToken||'',guestId:studentAccountSession&&studentAccountSession.guestId||studentGuestId(),score:score,maxScore:settings.maxScore,elapsedSeconds:elapsedSeconds};appsScriptRequest(payload).then(function(saved){if(!saved||!saved.ok)throw new Error(saved&&saved.error||'Không lưu được điểm.');return appsScriptRequest({action:'list',teacherId:teacherId,examId:assignmentId,classCode:studentClass,studentId:studentId});}).then(function(response){if(!response||!response.ok)throw new Error(response&&response.error||'Không tải được bảng xếp hạng.');renderLeaderboard(response.rows||[],response.stats||{},response.studentRank);}).catch(function(error){if(status)status.textContent='Không đồng bộ được: '+(error.message||'lỗi kết nối')+'. Kết quả vẫn hiển thị trên thiết bị này.';});}\n"+
  "function renderStudentResults(){var chain=streakStats(),maxRaw=0,earnedRaw=0,correct=0,partial=0,wrong=0,unanswered=0,essay=0,byLevel=Object.create(null);cards.forEach(function(f,i){var type=f.dataset.type,pts=Number(f.dataset.points)||0,done=answered(i),full=fullyCorrect(i),got=earned(i),level=f.dataset.level||'unclassified';maxRaw+=pts;earnedRaw+=got;if(type==='essay'){essay++;}else if(full){correct++;}else if(type==='truefalse'&&got>0){partial++;}else if(!done){unanswered++;}else{wrong++;}if(!byLevel[level])byLevel[level]={earned:0,max:0,total:0,correct:0};byLevel[level].earned+=got;byLevel[level].max+=pts;byLevel[level].total++;if(type!=='essay'&&full)byLevel[level].correct++;});var finalScore=maxRaw?Math.min(settings.maxScore,earnedRaw/maxRaw*settings.maxScore):0,percent=settings.maxScore?Math.round(finalScore/settings.maxScore*100):0;if(studentScore)animateScore(studentScore,finalScore,settings.maxScore);if(studentScoreCaption)studentScoreCaption.textContent='/' + settings.maxScore + ' điểm' + (essay?' · tạm tính':'');if(studentResultMessage)studentResultMessage.textContent=(studentName?studentName+' · '+studentClass+' — ':'')+'Bạn đã hoàn thành bài tập với '+percent+'% thang điểm.';if(studentHeaderNote)studentHeaderNote.textContent='Bài làm đã được nộp.';if(studentResultStats){studentResultStats.replaceChildren();var resultPairs=[[correct,'Câu đúng hoàn toàn'],[partial,'Câu đúng một phần'],[wrong,'Câu đã làm chưa đúng'],[unanswered,'Câu chưa làm'],[elapsedTimeText(elapsedSeconds),'Thời gian làm bài']];if(reveal==='per-question')resultPairs.push([chain.best,'Chuỗi đúng dài nhất']);resultPairs.forEach(function(pair){var box=document.createElement('div');box.className='student-result-stat';var strong=document.createElement('strong');strong.textContent=String(pair[0]);var label=document.createElement('span');label.textContent=pair[1];box.append(strong,label);studentResultStats.append(box);});}var levelNames={nb:'Nhận biết',th:'Thông hiểu',vd:'Vận dụng',unclassified:'Chưa phân loại'},palette=['#ef4444','#f59e0b','#facc15','#84cc16','#22c55e'],pieItems=Object.keys(byLevel).map(function(key,i){return{label:levelNames[key]||key,earned:byLevel[key].earned,max:byLevel[key].max,color:palette[i%palette.length]};}),sliceTotal=pieItems.reduce(function(sum,x){return sum+x.earned;},0),pieWeights=sliceTotal>0?pieItems.map(function(x){return{label:x.label,value:x.earned,color:x.color};}):pieItems.map(function(x){return{label:x.label,value:x.max,color:x.color};}),drawTotal=pieWeights.reduce(function(sum,x){return sum+x.value;},0),cursor=0,stops=[];pieWeights.filter(function(x){return x.value>0;}).forEach(function(x){var start=cursor/drawTotal*100;cursor+=x.value;stops.push(x.color+' '+start+'% '+(cursor/drawTotal*100)+'%');});if(studentPie){studentPie.style.background=stops.length?'conic-gradient('+stops.join(',')+')':'#e8efeb';}if(studentPieCenter)studentPieCenter.innerHTML='<span>'+earnedRaw.toFixed(2)+'<small>điểm đạt</small></span>';if(studentPieLegend){studentPieLegend.replaceChildren();pieItems.forEach(function(x){var row=document.createElement('div');row.className='student-legend-row';var sw=document.createElement('span');sw.className='student-legend-swatch';sw.style.background=x.color;var label=document.createElement('span');label.textContent=x.label;var count=document.createElement('strong');count.textContent=Math.round((sliceTotal>0?x.earned:x.max)/Math.max(drawTotal,1)*100)+'%';row.append(sw,label,count);studentPieLegend.append(row);});}if(studentColumnChart){studentColumnChart.replaceChildren();Object.keys(byLevel).forEach(function(key){var v=byLevel[key],pct=v.max?Math.round(v.earned/v.max*100):0,label=levelNames[key]||key;if(key==='')label='Chưa phân loại';var col=document.createElement('div');col.className='student-column';var value=document.createElement('strong');value.className='student-column-value';value.textContent=pct+'%';var track=document.createElement('div');track.className='student-column-track';var fill=document.createElement('span');fill.className='student-column-fill';fill.style.height='0%';track.append(fill);requestAnimationFrame(function(){fill.style.height=Math.max(2,pct)+'%';});var name=document.createElement('span');name.className='student-column-label';name.textContent=label;var note=document.createElement('small');note.className='student-column-note';note.textContent=v.earned.toFixed(2)+'/'+v.max.toFixed(2)+'đ';col.append(value,track,name,note);studentColumnChart.append(col);});}if(reviewAnswersBtn)reviewAnswersBtn.hidden=reveal!=='submit';if(retakeStudentBtn)retakeStudentBtn.hidden=!settings.allowRetake;if(studentResultFootnote){var notes=[];if(essay)notes.push(essay+' câu tự luận đang chờ giáo viên chấm và chưa được cộng điểm.');if(partial)notes.push('Câu Đúng/Sai được tính điểm theo số phát biểu trả lời đúng.');if(!notes.length)notes.push('Điểm được tính tự động theo đáp án đã thiết lập.');studentResultFootnote.textContent=notes.join(' ');}if(examLayout)examLayout.hidden=true;if(studentResultScreen)studentResultScreen.hidden=false;document.body.classList.add('result-mode');window.scrollTo(0,0);syncScoreAndLeaderboard(Math.round((finalScore/Math.max(settings.maxScore,.01))*1000)/100);}"
+
"function openReview(){if(!submitted||reveal!=='submit')return;reviewMode=true;examLayout.hidden=false;studentResultScreen.hidden=true;document.body.classList.remove('result-mode');if(backToResultsBtn)backToResultsBtn.hidden=false;cards.forEach(function(f,i){f.querySelectorAll('input,textarea,button.confirm-answer').forEach(function(x){x.disabled=true;});showFeedback(i,true);});current=0;mode='single';setMode('single');updateNav();window.scrollTo(0,0);}"+
"function returnToResults(){reviewMode=false;examLayout.hidden=true;studentResultScreen.hidden=false;document.body.classList.add('result-mode');if(backToResultsBtn)backToResultsBtn.hidden=true;if(navHelp)navHelp.hidden=false;if(reviewLegend)reviewLegend.hidden=true;window.scrollTo(0,0);}"+
"function retake(){if(!settings.allowRetake)return;stopAllQuestionMedia();attemptId=createAttemptId();submitted=false;reviewMode=false;flagged.clear();locked.clear();current=0;timer=settings.duration*60;elapsedSeconds=0;cards.forEach(function(f){f.querySelectorAll('input').forEach(function(x){x.checked=false;x.disabled=false;if(x.type==='text')x.value='';});f.querySelectorAll('textarea').forEach(function(x){x.value='';x.disabled=false;});var fb=f.querySelector('.feedback');if(fb){fb.hidden=true;fb.innerHTML='';fb.classList.remove('wrong');}f.querySelectorAll('.choice').forEach(function(x){x.classList.remove('correct','incorrect');});f.querySelectorAll('.tf-st').forEach(function(x){x.classList.remove('correct-st','wrong-st');var note=x.querySelector('.tf-st-note');if(note){note.textContent='';note.className='tf-st-note';}});var star=f.querySelector('[data-star]');if(star){star.textContent='☆';star.classList.remove('is-starred');star.setAttribute('aria-pressed','false');}});if(resultEl)resultEl.hidden=true;if(studentResultScreen)studentResultScreen.hidden=true;if(examLayout)examLayout.hidden=false;if(backToResultsBtn)backToResultsBtn.hidden=true;document.body.classList.remove('result-mode');if(submitBtn){submitBtn.disabled=false;submitBtn.textContent='Nộp bài';}if(submitAllBtn)submitAllBtn.disabled=false;showTimer();mode='single';setMode('single');updateNav();if(clock)clearInterval(clock);clock=null;saveProgress();startClock();window.scrollTo(0,0);}"+
"if(reviewAnswersBtn)reviewAnswersBtn.addEventListener('click',openReview);if(backToResultsBtn)backToResultsBtn.addEventListener('click',returnToResults);if(retakeStudentBtn)retakeStudentBtn.addEventListener('click',retake);"+
"function finish(){if(submitted)return;stopAllQuestionMedia();submitted=true;cards.forEach(function(f,i){if(reveal!=='none')showFeedback(i,true);f.querySelectorAll('input,textarea,button.confirm-answer').forEach(function(x){x.disabled=true;});});renderStudentResults();if(resultEl)resultEl.hidden=true;if(submitBtn){submitBtn.disabled=true;submitBtn.textContent='Đã nộp bài';}if(submitAllBtn)submitAllBtn.disabled=true;if(clock)clearInterval(clock);clock=null;saveProgress();}"+
"async function attemptSubmit(){var missing=cards.map(function(_,i){return answered(i)?null:i+1;}).filter(Boolean);if(missing.length&&!await window.confirm('Bạn chưa làm xong '+missing.length+' câu ('+missing.join(', ')+'). Nộp bài tập luôn?'))return;finish();}"+
"function tone(){if(!soundOn)return;try{var C=window.AudioContext||window.webkitAudioContext;if(!C)return;var c=new C(),o=c.createOscillator(),gn=c.createGain(),now=c.currentTime;o.type='sine';o.frequency.setValueAtTime(460,now);gn.gain.setValueAtTime(.0001,now);gn.gain.exponentialRampToValueAtTime(.032,now+.012);gn.gain.exponentialRampToValueAtTime(.0001,now+.105);o.connect(gn);gn.connect(c.destination);o.start(now);o.stop(now+.12);setTimeout(function(){c.close();},250);}catch(e){}}"+
"var studentName='',studentClass='',studentEmail='',studentId='',attemptId='',storageKey='quizcraft-student-'+assignmentId,identityKey='quizcraft-student-identity-'+assignmentId,antiCheatLockTimer=null,antiCheatLastEventAt=0,studentHiddenAt=0,studentAccountSession=null,studentAuthMode='login',studentOtpId='',studentPendingReauth=false,studentAuthManualOpen=false,studentVisibilityTimer=null,studentStarted=false;"+
"function saveProgress(){try{var values=cards.map(function(f){if(f.dataset.type==='truefalse')return tfAnswers(f);var r=f.querySelector('input:checked'),t=f.querySelector('input[type=text],textarea');return r?r.value:t?t.value:'';});localStorage.setItem(storageKey,JSON.stringify({version:2,assignmentId:assignmentId,values:values,flagged:[].slice.call(flagged),current:current,mode:mode,locked:[].slice.call(locked),submitted:submitted,soundOn:soundOn,theme:studentTheme?studentTheme.value:'dark',timer:timer,elapsedSeconds:elapsedSeconds,studentName:studentName,studentClass:studentClass,studentEmail:studentEmail,studentId:studentId,attemptId:attemptId,started:!!studentStarted,savedAt:Date.now()}));}catch(e){}}"+
"function applyTheme(v){var next=v==='light'?'light':'dark';document.body.classList.toggle('dark',next==='dark');if(studentTheme)studentTheme.value=next;}"+
"function labelSound(){if(soundToggle)soundToggle.textContent=soundOn?'Âm thanh: Bật':'Âm thanh: Tắt';}"+
"function startClock(){if(clock||submitted)return;if(settings.duration>0&&timer<=0){finish();return;}clock=setInterval(function(){elapsedSeconds++;if(settings.duration>0){timer=Math.max(0,timer-1);showTimer();}if(elapsedSeconds%5===0)saveProgress();if(settings.duration>0&&timer<=0){clearInterval(clock);clock=null;finish();}},1000);}"+
"function restoreProgress(){try{var raw=localStorage.getItem(storageKey);if(!raw)return;var saved=JSON.parse(raw);if(saved.studentEmail)studentEmail=String(saved.studentEmail);if(saved.studentId)studentId=String(saved.studentId);if(saved.attemptId)attemptId=String(saved.attemptId);if(Number.isFinite(Number(saved.timer))&&settings.duration)timer=Math.max(0,Number(saved.timer));if(Number.isFinite(Number(saved.elapsedSeconds)))elapsedSeconds=Math.max(0,Math.floor(Number(saved.elapsedSeconds)));if(Array.isArray(saved.values))saved.values.forEach(function(v,i){var f=card(i);if(!f)return;if(f.dataset.type==='truefalse'){if(Array.isArray(v))v.forEach(function(val,j){var r=f.querySelector('input[name=\"q'+i+'_s'+j+'\"][value=\"'+val+'\"]');if(r)r.checked=true;});return;}var radio=[].slice.call(f.querySelectorAll('input[type=radio]')).find(function(x){return x.value===String(v);});if(radio)radio.checked=true;else{var t=f.querySelector('input[type=text],textarea');if(t)t.value=String(v==null?'':v);}});locked=new Set(Array.isArray(saved.locked)?saved.locked.map(Number):[]);locked.forEach(function(i){var f=card(i);if(f){f.querySelectorAll('input,textarea').forEach(function(x){x.disabled=true;});var cb=f.querySelector('[data-confirm]');if(cb){cb.disabled=true;cb.textContent='Đã xác nhận';}if(f.dataset.type==='truefalse'&&reveal==='per-question')showFeedback(i,false);}});flagged=new Set(Array.isArray(saved.flagged)?saved.flagged.map(Number):[]);flagged.forEach(function(i){var s=card(i)?card(i).querySelector('[data-star]'):null;if(s){s.textContent='★';s.classList.add('is-starred');s.setAttribute('aria-pressed','true');}});current=Math.max(0,Math.min(cards.length-1,Number(saved.current)||0));mode=saved.mode==='all'?'all':'single';soundOn=saved.soundOn!==false;applyTheme(saved.theme||'dark');showTimer();updateNav();if(saved.submitted)finish();}catch(e){}}"+
"if(viewMode)viewMode.addEventListener('change',function(){setMode(viewMode.value);saveProgress();});"+
"if(nav)nav.addEventListener('click',function(e){var b=e.target.closest('[data-jump]');if(b)go(Number(b.dataset.jump));});"+
"root.addEventListener('click',function(e){var confirmBtn=e.target.closest('[data-confirm]');if(confirmBtn&&!submitted){var ci=Number(confirmBtn.dataset.confirm),cf=card(ci);if(cf.dataset.type==='truefalse'){var chosenCount=cf.querySelectorAll('.tf-st input:checked').length;if(!chosenCount){window.alert('Hãy chọn ít nhất một phát biểu trước khi xác nhận.');return;}}else if(!answered(ci)){window.alert('Bạn hãy nhập câu trả lời trước khi xác nhận.');return;}locked.add(ci);cf.querySelectorAll('input,textarea').forEach(function(x){x.disabled=true;});confirmBtn.disabled=true;confirmBtn.textContent='Đã xác nhận';if(reveal==='per-question')showFeedback(ci,false);if(reveal==='per-question')tone();updateStreak();updateNav();saveProgress();return;}var star=e.target.closest('[data-star]');if(star){var i=Number(star.dataset.star);if(flagged.has(i)){flagged.delete(i);star.textContent='☆';star.classList.remove('is-starred');star.setAttribute('aria-pressed','false');}else{flagged.add(i);star.textContent='★';star.classList.add('is-starred');star.setAttribute('aria-pressed','true');}updateNav();saveProgress();}});"+
"root.addEventListener('input',function(e){var f=e.target.closest('[data-card]');if(f&&!locked.has(Number(f.dataset.index)))handleChange(Number(f.dataset.index));});"+
"root.addEventListener('change',function(e){var f=e.target.closest('[data-card]');if(f){var qi=Number(f.dataset.index);if(!submitted&&reveal==='per-question'&&f.dataset.type==='multiple'&&answered(qi)){locked.add(qi);f.querySelectorAll('input').forEach(function(x){x.disabled=true;});showFeedback(qi,false);}if(!submitted&&f.dataset.type==='truefalse'&&reveal==='per-question'){tone();handleChange(qi);updateNav();saveProgress();return;}if(!submitted&&f.dataset.type==='truefalse')tone();else if(!submitted&&f.dataset.type!=='essay')tone();updateStreak();saveProgress();}});"+
"if(prevBtn)prevBtn.addEventListener('click',function(){go(current-1);});"+
"if(nextBtn)nextBtn.addEventListener('click',function(){current===cards.length-1?attemptSubmit():go(current+1);});"+
"if(submitBtn)submitBtn.addEventListener('click',attemptSubmit);if(submitAllBtn)submitAllBtn.addEventListener('click',attemptSubmit);"+
"var studentBadge=document.querySelector('#studentBadge'),studentTheme=document.querySelector('#studentTheme'),soundToggle=document.querySelector('#soundToggle'),identityGate=document.querySelector('#identityGate'),identityForm=document.querySelector('#identityForm'),studentNameLabel=document.querySelector('#studentNameLabel'),studentNameInput=document.querySelector('#studentName'),studentClassInput=document.querySelector('#studentClass'),studentEmailInput=document.querySelector('#studentEmail'),antiCheatOverlay=document.querySelector('#antiCheatOverlay'),antiCheatTitle=document.querySelector('#antiCheatTitle'),antiCheatMessage=document.querySelector('#antiCheatMessage'),antiCheatWait=document.querySelector('#antiCheatWait'),antiCheatCountdown=document.querySelector('#antiCheatCountdown'),studentAuthOpenBtn=document.querySelector('#studentAuthOpenBtn'),studentAuthSection=document.querySelector('#studentAuthSection'),studentAuthTitle=document.querySelector('#studentAuthTitle'),studentAuthForm=document.querySelector('#studentAuthForm'),studentAuthNameWrap=document.querySelector('#studentAuthNameWrap'),studentAuthName=document.querySelector('#studentAuthName'),studentAuthEmail=document.querySelector('#studentAuthEmail'),studentAuthPassword=document.querySelector('#studentAuthPassword'),studentAuthPasswordText=document.querySelector('#studentAuthPasswordText'),studentAuthOtpWrap=document.querySelector('#studentAuthOtpWrap'),studentAuthOtp=document.querySelector('#studentAuthOtp'),studentAuthSendOtpBtn=document.querySelector('#studentAuthSendOtpBtn'),studentAuthError=document.querySelector('#studentAuthError'),studentAuthSubmitBtn=document.querySelector('#studentAuthSubmitBtn'),studentAuthForgotBtn=document.querySelector('#studentAuthForgotBtn'),studentAuthSwitchBtn=document.querySelector('#studentAuthSwitchBtn'),studentAuthCloseBtn=document.querySelector('#studentAuthCloseBtn'),studentAccountBar=document.querySelector('#studentAccountBar'),studentAccountLabel=document.querySelector('#studentAccountLabel'),studentLogoutBtn=document.querySelector('#studentLogoutBtn'),privacyShield=document.querySelector('#privacyShield');if(assignedClassCode&&studentClassInput){studentClassInput.value=assignedClassCode;studentClassInput.readOnly=true;studentClassInput.setAttribute('aria-readonly','true');}"+
""+
"if(studentTheme)studentTheme.addEventListener('change',function(){applyTheme(studentTheme.value);saveProgress();});"+
"if(soundToggle)soundToggle.addEventListener('click',function(){soundOn=!soundOn;labelSound();saveProgress();});"+
"window.addEventListener('pagehide',function(){stopAllQuestionMedia();saveProgress();if(settings.antiCheat&&studentStarted&&studentName&&!submitted&&!isAntiCheatLocked()){var pageState=readAntiCheatState();pageState.pendingHiddenAt=pageState.pendingHiddenAt||Date.now();writeAntiCheatState(pageState);}pauseAntiCheatCountdown();});document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'){stopAllQuestionMedia();saveProgress();studentHiddenAt=Date.now();if(settings.antiCheat&&studentStarted&&studentName&&!submitted){if(isAntiCheatLocked())pauseAntiCheatCountdown();else{var hiddenState=readAntiCheatState();hiddenState.pendingHiddenAt=studentHiddenAt;writeAntiCheatState(hiddenState);if(studentVisibilityTimer)clearTimeout(studentVisibilityTimer);studentVisibilityTimer=setTimeout(function(){studentVisibilityTimer=null;if(document.visibilityState==='hidden'&&studentHiddenAt&&Date.now()-studentHiddenAt>=1000){var pending=readAntiCheatState();pending.pendingHiddenAt=0;writeAntiCheatState(pending);registerAntiCheatViolation('Rời khỏi bài thi hoặc chuyển sang ứng dụng khác quá 1 giây');}},1050);}}if(settings.antiScreenshot&&privacyShield)privacyShield.hidden=false;}else{if(studentVisibilityTimer){clearTimeout(studentVisibilityTimer);studentVisibilityTimer=null;}if(settings.antiCheat&&studentStarted&&studentName&&!submitted){var state=readAntiCheatState(),hiddenFor=studentHiddenAt?Date.now()-studentHiddenAt:(Number(state.pendingHiddenAt)?Date.now()-Number(state.pendingHiddenAt):0);if(hiddenFor>=1000&&!isAntiCheatLocked()){state.pendingHiddenAt=0;writeAntiCheatState(state);registerAntiCheatViolation('Rời khỏi bài thi hoặc chuyển sang ứng dụng khác quá 1 giây');}else if(state.pendingHiddenAt){state.pendingHiddenAt=0;writeAntiCheatState(state);}studentHiddenAt=0;resumeAntiCheatState();}if(privacyShield)privacyShield.hidden=true;}});if(studentAuthOpenBtn)studentAuthOpenBtn.addEventListener('click',function(){studentAuthManualOpen=true;studentAuthSection.hidden=false;studentAuthOpenBtn.hidden=true;setStudentAuthMode('login');});if(studentAuthCloseBtn)studentAuthCloseBtn.addEventListener('click',function(){studentAuthManualOpen=false;syncStudentAuthUI();});if(studentAuthSwitchBtn)studentAuthSwitchBtn.addEventListener('click',function(){setStudentAuthMode(studentAuthMode==='register'?'login':'register');});if(studentAuthForgotBtn)studentAuthForgotBtn.addEventListener('click',function(){setStudentAuthMode('forgot');});if(studentAuthSendOtpBtn)studentAuthSendOtpBtn.addEventListener('click',sendStudentAuthOtp);if(studentAuthForm)studentAuthForm.addEventListener('submit',submitStudentAuth);initStudentGoogleAuth();if(studentLogoutBtn)studentLogoutBtn.addEventListener('click',logoutStudentAuth);"+
"function learnerStorageKey(name,klass){return 'quizcraft-student-'+assignmentId+'-'+encodeURIComponent(name.toLocaleLowerCase().replace(/\\s+/g,' '))+'-'+encodeURIComponent(klass.toLocaleLowerCase().replace(/\\s+/g,' '));}"+"function antiCheatStorageKey(){return 'quizcraft-anticheat-'+assignmentId+'-'+encodeURIComponent((studentName||'').toLocaleLowerCase())+'-'+encodeURIComponent((studentClass||'').toLocaleLowerCase());}\nfunction readAntiCheatState(){try{return JSON.parse(localStorage.getItem(antiCheatStorageKey())||'{}')||{};}catch(e){return {};}}\nfunction writeAntiCheatState(state){try{localStorage.setItem(antiCheatStorageKey(),JSON.stringify(state));}catch(e){}}\nfunction lockRemainingMs(state){var remaining=Number(state.remainingMs);if(!Number.isFinite(remaining)){remaining=Math.max(0,Number(state.lockedUntil||0)-Date.now());}if(Number(state.runningSince)>0)remaining-=Date.now()-Number(state.runningSince);return Math.max(0,remaining);}\nfunction isAntiCheatLocked(){var state=readAntiCheatState();return !!state.needsReauth||lockRemainingMs(state)>0;}\nfunction pauseExamClock(){if(clock){clearInterval(clock);clock=null;}}\nfunction pauseAntiCheatCountdown(){var state=readAntiCheatState();if(Number(state.runningSince)>0){state.remainingMs=lockRemainingMs(state);state.runningSince=0;state.lockedUntil=0;writeAntiCheatState(state);}if(antiCheatLockTimer){clearInterval(antiCheatLockTimer);antiCheatLockTimer=null;}}\nfunction hideAntiCheatOverlay(){if(antiCheatLockTimer){clearInterval(antiCheatLockTimer);antiCheatLockTimer=null;}if(antiCheatOverlay)antiCheatOverlay.hidden=true;document.body.style.overflow='';}\nfunction showAntiCheatState(state){if(!settings.antiCheat||!antiCheatOverlay)return;if(state.needsReauth){forceStudentReauth();return;}pauseExamClock();antiCheatOverlay.hidden=false;document.body.style.overflow='hidden';if(antiCheatTitle)antiCheatTitle.textContent='T\u1ea1m th\u1eddi kh\u00f3a l\u00e0m b\u00e0i';if(antiCheatMessage)antiCheatMessage.textContent='Do ch\u1ee9c n\u0103ng ch\u1ed1ng gian l\u1eadn \u0111\u00e3 \u0111\u01b0\u1ee3c b\u1eadt n\u00ean b\u1ea1n kh\u00f4ng th\u1ec3 l\u00e0m ti\u1ebfp trong th\u1eddi gian n\u00e0y.';if(antiCheatWait)antiCheatWait.hidden=false;if(antiCheatLockTimer){clearInterval(antiCheatLockTimer);antiCheatLockTimer=null;}if(document.visibilityState!=='visible'){pauseAntiCheatCountdown();return;}if(!(Number(state.runningSince)>0)){state.runningSince=Date.now();state.remainingMs=lockRemainingMs(state);writeAntiCheatState(state);}function tick(){var remain=lockRemainingMs(state);if(antiCheatCountdown)antiCheatCountdown.textContent=Math.ceil(remain/1000)+' gi\u00e2y';if(remain<=0){if(antiCheatLockTimer)clearInterval(antiCheatLockTimer);antiCheatLockTimer=null;state.remainingMs=0;state.runningSince=0;state.lockedUntil=0;writeAntiCheatState(state);hideAntiCheatOverlay();saveProgress();startClock();}}tick();if(lockRemainingMs(state)>0)antiCheatLockTimer=setInterval(tick,250);}\nfunction resumeAntiCheatState(){if(!settings.antiCheat||!studentStarted||!studentName)return;var state=readAntiCheatState();if(state.needsReauth){forceStudentReauth();return;}if(Number(state.pendingHiddenAt)>0){var elapsed=Date.now()-Number(state.pendingHiddenAt);state.pendingHiddenAt=0;writeAntiCheatState(state);if(elapsed>=1000){registerAntiCheatViolation('R\u1eddi kh\u1ecfi b\u00e0i thi ho\u1eb7c chuy\u1ec3n sang \u1ee9ng d\u1ee5ng kh\u00e1c qu\u00e1 1 gi\u00e2y');return;}state=readAntiCheatState();}var remaining=lockRemainingMs(state);if(remaining>0)showAntiCheatState(state);else if(state.remainingMs||state.lockedUntil){state.remainingMs=0;state.runningSince=0;state.lockedUntil=0;writeAntiCheatState(state);}}\nfunction registerAntiCheatViolation(reason){if(!settings.antiCheat||!studentStarted||!studentName||submitted)return;var now=Date.now(),state=readAntiCheatState();if(state.needsReauth||lockRemainingMs(state)>0)return;if(now-Number(state.lastEventAt||0)<1500||now-antiCheatLastEventAt<1000)return;antiCheatLastEventAt=now;state.lastEventAt=now;state.count=(Number(state.count)||0)+1;state.pendingHiddenAt=0;state.lastReason=String(reason||'R\u1eddi kh\u1ecfi b\u00e0i thi');if(state.count>=4){state.needsReauth=true;state.remainingMs=0;state.runningSince=0;state.lockedUntil=0;writeAntiCheatState(state);saveProgress();forceStudentReauth();return;}var delays=[10,30,60];state.remainingMs=delays[state.count-1]*1000;state.runningSince=0;state.lockedUntil=0;state.needsReauth=false;writeAntiCheatState(state);saveProgress();showAntiCheatState(state);}\n"+
"function validStudentName(value){return /^[\\p{L}]+(?:\\s+[\\p{L}]+)*$/u.test(String(value||'').normalize('NFC').trim());}function validClassCode(value){var v=String(value||'').normalize('NFC').trim();return v.length>0&&v.length<=30&&!/[\\u0000-\\u001f\\u007f<>]/.test(v);}function startStudent(event){if(event)event.preventDefault();if((settings.requireEmail||studentPendingReauth)&&!studentAccountSession){syncStudentAuthUI();if(studentAuthSection)studentAuthSection.hidden=false;if(studentAuthError){studentAuthError.hidden=false;studentAuthError.textContent='Bài thi yêu cầu xác thực tài khoản trước khi bắt đầu.';}return;}var name=(studentNameInput&&studentNameInput.value||'').normalize('NFC').trim().replace(/\\s+/g,' '),klass=assignedClassCode||String(studentClassInput&&studentClassInput.value||'').normalize('NFC').trim(),email=(studentAccountSession&&studentAccountSession.email||studentEmailInput&&studentEmailInput.value||'').trim().toLowerCase();if(assignedClassCode&&studentClassInput)studentClassInput.value=assignedClassCode;if(studentAccountSession&&studentAccountSession.name)name=studentAccountSession.name;if(!name){window.alert('Hãy nhập họ tên học sinh.');if(studentNameInput)studentNameInput.focus();return;}if(!klass){window.alert('Hãy nhập mã lớp để bắt đầu bài thi.');if(studentClassInput)studentClassInput.focus();return;}if(!validStudentName(name)){window.alert('Tên học sinh chỉ được gồm chữ cái và khoảng trắng; không nhập số hoặc ký tự đặc biệt.');if(studentNameInput)studentNameInput.focus();return;}if(!validClassCode(klass)){window.alert('Tên lớp không hợp lệ. Hãy nhập tối đa 30 ký tự và không dùng ký tự điều khiển.');if(studentClassInput)studentClassInput.focus();return;}if(settings.requireEmail&&(!studentAccountSession||!email)){window.alert('Bài này yêu cầu đăng nhập bằng Gmail và mật khẩu.');return;}studentName=name;studentClass=klass;studentEmail=email;studentId=(studentAccountSession&&studentAccountSession.role==='HOCSINH'&&studentAccountSession.uuid)?studentAccountSession.uuid:createStudentId(name,klass);attemptId=attemptId||createAttemptId();storageKey=learnerStorageKey(name,klass);try{localStorage.setItem(identityKey,JSON.stringify({name:name,klass:klass,studentEmail:studentEmail,storageKey:storageKey}));}catch(e){}if(studentBadge)studentBadge.textContent=name+' · '+klass;if(identityGate)identityGate.hidden=true;restoreProgress();setMode(mode);showTimer();labelSound();saveProgress();startClock();resumeAntiCheatState();}function prepareResume(){try{var raw=localStorage.getItem(identityKey);if(!raw)return;var identity=JSON.parse(raw);if(!identity||!identity.name||!identity.klass)return;var key=learnerStorageKey(identity.name,identity.klass),saved=localStorage.getItem(key);if(!saved)return;JSON.parse(saved);studentNameInput.value=identity.name;studentClassInput.value=identity.klass;if(studentEmailInput)studentEmailInput.value=identity.studentEmail||'';var hint=document.querySelector('#resumeHint'),button=identityForm&&identityForm.querySelector('button[type=submit]');if(hint){hint.textContent='Đã tìm thấy tiến độ đã lưu của '+identity.name+' · '+identity.klass+'. Nhấn “Tiếp tục làm bài” để làm tiếp từ chỗ đã dừng.';hint.hidden=false;}if(button)button.textContent='Tiếp tục làm bài';}catch(e){}}"+
"if(identityForm)identityForm.addEventListener('submit',startStudent);setStudentAuthMode('login');prepareResume();(function(){try{var raw=localStorage.getItem(identityKey),saved=raw?JSON.parse(raw):null;if(saved&&saved.name&&saved.klass){studentName=saved.name;studentClass=saved.klass;studentEmail=saved.studentEmail||'';if(readAntiCheatState().needsReauth)forceStudentReauth();else{studentName='';studentClass='';studentEmail='';}}}catch(e){}})();window.quizCraftAuthReady=restoreStudentAuth();document.body.classList.toggle('anti-copy',!!settings.antiCopy);showTimer();labelSound();";

  const studentExtras=String.raw`var entryToken='';
function setStudentLoadingStatus(status,message){if(!status)return;status.replaceChildren();status.setAttribute('role','status');status.setAttribute('aria-live','polite');var wrap=document.createElement('span');wrap.className='qc-loading-status';var spinner=document.createElement('span');spinner.className='qc-spinner';spinner.setAttribute('aria-hidden','true');var label=document.createElement('span');label.textContent=message||'Đang tải dữ liệu...';wrap.append(spinner,label);status.append(wrap);}
function studentAvatarData(name){var value=String(name||'HS').trim(),parts=value.split(/\s+/).filter(Boolean),initials=(parts.length>1?parts[0][0]+parts[parts.length-1][0]:value.slice(0,2)).toLocaleUpperCase(),hash=0;for(var i=0;i<value.length;i++)hash=(hash*31+value.charCodeAt(i))|0;var colors=['#245c77','#5b4b8a','#28735c','#8a583e','#8a4265','#52617d'],bg=colors[Math.abs(hash)%colors.length],svg='<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="'+bg+'"/><text x="48" y="58" text-anchor="middle" font-family="Arial" font-size="31" font-weight="700" fill="#fff">'+initials.replace(/[&<>"']/g,'')+'</text></svg>';return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg);}
var _qcOldSaveProgress=saveProgress;
saveProgress=function(){_qcOldSaveProgress();try{if(storageKey){var raw=localStorage.getItem(storageKey),saved=raw?JSON.parse(raw):{};saved.entryToken=entryToken;localStorage.setItem(storageKey,JSON.stringify(saved));}}catch(e){}};
renderLeaderboard=function(rows,stats,rank){var panel=document.querySelector('#studentLeaderboard'),list=document.querySelector('#studentLeaderboardList'),status=document.querySelector('#studentLeaderboardStatus');if(!panel||!list||!status)return;panel.hidden=false;list.replaceChildren();stats=stats||{};var sorted=(Array.isArray(rows)?rows:[]).slice().sort(function(a,b){return Number(b.score||0)-Number(a.score||0)||Number(a.elapsedSeconds||0)-Number(b.elapsedSeconds||0)||Number(b.averageScore||0)-Number(a.averageScore||0);});var headline='Lớp '+studentClass+' · '+(Number(stats.studentCount)||0)+' học sinh · '+(Number(stats.attemptCount)||0)+' lượt làm · TB '+(Number(stats.average)||0).toFixed(2)+'/10';if(rank)headline+=' · hạng #'+rank;status.textContent=headline;if(!sorted.length){var empty=document.createElement('span');empty.textContent='Chưa có dữ liệu xếp hạng.';list.append(empty);return;}function avatar(item,small){var img=document.createElement('img');img.className='student-leaderboard-avatar'+(small?' small':'');img.alt='Avatar '+(item.studentName||'học sinh');img.src=studentAvatarData(item.studentName);return img;}function timeText(value){var n=Math.max(0,Math.floor(Number(value)||0));return Math.floor(n/60)+' phút '+String(n%60).padStart(2,'0')+' giây';}var podium=document.createElement('div');podium.className='student-leaderboard-podium';[sorted[1],sorted[0],sorted[2]].forEach(function(item){if(!item)return;var n=sorted.indexOf(item)+1,card=document.createElement('article');card.className='student-podium-card rank-'+n;var medal=document.createElement('span');medal.className='student-podium-medal';medal.textContent=['🥇','🥈','🥉'][n-1];var name=document.createElement('strong');name.className='student-leaderboard-name';name.textContent=item.studentName||'Học sinh';var klass=document.createElement('span');klass.className='student-leaderboard-meta';klass.textContent='Lớp '+(item.classCode||studentClass);var score=document.createElement('b');score.className='student-leaderboard-score';score.textContent=Number(item.score||0).toFixed(2)+'/10';var info=document.createElement('small');info.textContent='TB '+Number(item.averageScore||0).toFixed(2)+' · '+timeText(item.elapsedSeconds);card.append(medal,avatar(item,false),name,klass,score,info);podium.append(card);});list.append(podium);if(sorted.length>3){var rest=document.createElement('div');rest.className='student-leaderboard-rest';sorted.slice(3).forEach(function(item,index){var row=document.createElement('div');row.className='student-leaderboard-row';var number=document.createElement('strong');number.textContent='#'+(index+4);var name=document.createElement('strong');name.className='student-leaderboard-name';name.textContent=item.studentName||'Học sinh';var meta=document.createElement('small');meta.className='student-leaderboard-meta';meta.textContent='Lớp '+(item.classCode||studentClass)+' · TB '+Number(item.averageScore||0).toFixed(2)+' · '+timeText(item.elapsedSeconds);var score=document.createElement('b');score.className='student-leaderboard-score';score.textContent=Number(item.score||0).toFixed(2)+'/10';row.append(number,avatar(item,true),name,meta,score);rest.append(row);});list.append(rest);}};
syncScoreAndLeaderboard=function(score){var panel=document.querySelector('#studentLeaderboard'),status=document.querySelector('#studentLeaderboardStatus');if(!appsScriptUrl){if(panel)panel.hidden=true;return;}if(panel)panel.hidden=false;if(status)setStudentLoadingStatus(status,'Đang lưu điểm và tải bảng xếp hạng...');if(!studentId)studentId=createStudentId(studentName,studentClass);if(!attemptId)attemptId=createAttemptId();var payload={action:'save',teacherId:teacherId,examId:assignmentId,classCode:studentClass,studentId:studentId,attemptId:attemptId,entryToken:entryToken,studentName:studentName,studentEmail:studentEmail,sessionToken:studentAccountSession&&studentAccountSession.sessionToken||'',guestId:studentAccountSession&&studentAccountSession.guestId||studentGuestId(),score:score,maxScore:settings.maxScore,elapsedSeconds:elapsedSeconds};appsScriptRequest(payload).then(function(saved){if(!saved||!saved.ok)throw new Error(saved&&saved.error||'Không lưu được điểm.');return appsScriptRequest({action:'list',teacherId:teacherId,examId:assignmentId,classCode:studentClass,studentId:studentId,entryToken:entryToken});}).then(function(response){if(!response||!response.ok)throw new Error(response&&response.error||'Không tải được bảng xếp hạng.');renderLeaderboard(response.rows||[],response.stats||{},response.studentRank);}).catch(function(error){if(status)status.textContent='Không đồng bộ được: '+(error.message||'lỗi kết nối')+'.';});};
var _qcOldStartStudent=startStudent;
startStudent=async function(event){if(event)event.preventDefault();if(requiredExamPasswordHash){var passInput=document.querySelector('#examPasswordInput'),passError=document.querySelector('#examPasswordError'),entered=String(passInput&&passInput.value||''),digest=await qcPasswordHash(entered),fallback=qcPasswordFallbackHash(entered),valid=!!(requiredExamPasswordHash.fallback&&requiredExamPasswordHash.fallback===fallback)||(digest.indexOf('sha256:')===0&&requiredExamPasswordHash.sha256&&requiredExamPasswordHash.sha256===digest.slice(7));if(!valid){if(passError){passError.hidden=false;passError.textContent='Mật khẩu bài thi chưa đúng. Hãy kiểm tra lại với giáo viên.';}if(passInput)passInput.focus();return;}if(passError){passError.hidden=true;passError.textContent='';}}if((settings.requireEmail||studentPendingReauth)&&!studentAccountSession){syncStudentAuthUI();if(studentAuthSection)studentAuthSection.hidden=false;if(studentAuthError){studentAuthError.hidden=false;studentAuthError.textContent='Bài thi yêu cầu xác thực tài khoản trước khi bắt đầu.';}return;}var name=(studentNameInput&&studentNameInput.value||'').normalize('NFC').trim().replace(/\s+/g,' '),klass=assignedClassCode||String(studentClassInput&&studentClassInput.value||'').normalize('NFC').trim(),email=(studentAccountSession&&studentAccountSession.email||studentEmailInput&&studentEmailInput.value||'').trim().toLowerCase();if(assignedClassCode&&studentClassInput)studentClassInput.value=assignedClassCode;if(studentAccountSession&&studentAccountSession.name)name=studentAccountSession.name;if(!name){alert('Hãy nhập họ tên học sinh.');if(studentNameInput)studentNameInput.focus();return;}if(!klass){alert('Hãy nhập mã lớp để bắt đầu bài thi.');if(studentClassInput)studentClassInput.focus();return;}if(!/^[\p{L}]+(?:\s+[\p{L}]+)*$/u.test(name)){alert('Tên chỉ được gồm chữ cái và khoảng trắng.');if(studentNameInput)studentNameInput.focus();return;}if(!validClassCode(klass)){alert('Tên lớp không hợp lệ. Hãy nhập tối đa 30 ký tự và không dùng ký tự điều khiển.');if(studentClassInput)studentClassInput.focus();return;}if(settings.requireEmail&&(!studentAccountSession||!email)){alert('Bài này yêu cầu đăng nhập bằng Gmail.');return;}var scheduledLockMs=Date.parse(settings.lockAt||'');if(settings.lockMode==='LOCKED'&&(!Number.isFinite(scheduledLockMs)||!settings.lockAt)){alert('Bài thi đang bật khóa nhưng chưa có lịch khóa hợp lệ. Hãy liên hệ giáo viên.');return;}if(settings.lockMode==='LOCKED'&&Date.now()>=scheduledLockMs){alert('Bài thi đã tự động khóa từ '+new Date(scheduledLockMs).toLocaleString('vi-VN')+'.');return;}studentName=name;studentClass=klass;studentEmail=email;studentId=(studentAccountSession&&studentAccountSession.role==='HOCSINH'&&studentAccountSession.uuid)?studentAccountSession.uuid:createStudentId(name,klass);attemptId=attemptId||createAttemptId();storageKey=learnerStorageKey(name,klass);var entryKey='quizcraft-entry-'+assignmentId+'-'+encodeURIComponent(studentId)+'-'+encodeURIComponent(klass);try{var savedRaw=localStorage.getItem(storageKey),savedProgress=savedRaw?JSON.parse(savedRaw):null;if(savedProgress&&savedProgress.entryToken)entryToken=String(savedProgress.entryToken);entryToken=localStorage.getItem(entryKey)||entryToken||'';}catch(e){}try{var access=await appsScriptRequest({action:'examAccess',teacherId:teacherId,examId:assignmentId,studentId:studentId,classCode:klass,entryToken:entryToken,sessionToken:studentAccountSession&&studentAccountSession.sessionToken||'',guestId:studentAccountSession&&studentAccountSession.guestId||studentGuestId(),lockMode:settings.lockMode||'UNLOCKED',lockAt:settings.lockAt||'',lockAtMs:settings.lockMode==='LOCKED'&&settings.lockAt?Date.parse(settings.lockAt):0,clientNow:Date.now()});if(!access||!access.ok){var accessError=String(access&&access.error||'').toLocaleLowerCase();if(/xóa|deleted|not found|không tồn tại/.test(accessError)){alert('Đề đã bị xóa.');return;}if(/khóa|locked|private/.test(accessError)){alert('Đề đã bị khóa.');return;}throw new Error(access&&access.error||'Không kiểm tra được trạng thái đề.');}if(!access.allowed){var accessMessage=String(access.message||'').toLocaleLowerCase();alert(/xóa|deleted|not found|không tồn tại/.test(accessMessage)?'Đề đã bị xóa.':'Đề đã bị khóa.');return;}entryToken=String(access.entryToken||entryToken||'');if(!entryToken)throw new Error('API chưa cấp mã phiên vào đề.');localStorage.setItem(entryKey,entryToken);studentStarted=true;}catch(error){var accessError=String(error&&error.message||'').toLocaleLowerCase();alert(/xóa|deleted|not found|không tồn tại/.test(accessError)?'Đề đã bị xóa.':/khóa|locked|private/.test(accessError)?'Đề đã bị khóa.':(error.message||'Không thể kiểm tra quyền vào đề.'));return;}try{localStorage.setItem(identityKey,JSON.stringify({name:name,klass:klass,studentEmail:studentEmail,storageKey:storageKey}));}catch(e){}if(studentBadge)studentBadge.textContent=name+' · '+klass;if(identityGate)identityGate.hidden=true;restoreProgress();setMode(mode);showTimer();labelSound();saveProgress();startClock();resumeAntiCheatState();};
if(identityForm){identityForm.removeEventListener('submit',_qcOldStartStudent);identityForm.addEventListener('submit',startStudent);}
function qcStudentShowNotice(reason){
  var now=Date.now(),snoozeKey='qc-development-notice-snooze-until';
  try{if(Number(localStorage.getItem(snoozeKey)||0)>now)return;}catch(e){}
  var key='qc-development-notice-last-'+reason+'-v2';
  try{var last=Number(sessionStorage.getItem(key)||0);if(now-last<300000)return;sessionStorage.setItem(key,String(now));}catch(e){}
  var panel=document.getElementById('qcDevelopmentNotice');
  if(!panel){
    panel=document.createElement('div');panel.id='qcDevelopmentNotice';
    panel.style.cssText='position:fixed;inset:0;z-index:200000;display:grid;place-items:center;padding:clamp(10px,2vh,22px);background:rgba(3,7,18,.78);backdrop-filter:blur(7px);overflow:hidden';
    var card=document.createElement('section');card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-labelledby','qcDevelopmentNoticeTitle');
    card.style.cssText='position:relative;isolation:isolate;width:min(100%,940px);max-height:calc(100dvh - 36px);overflow-y:auto;overscroll-behavior:contain;padding:clamp(18px,2.8vw,28px);border:1px solid #2c3549;border-radius:20px;background:#151a27;color:#f2f5fa;box-shadow:0 24px 70px rgba(0,0,0,.48);font:14px/1.48 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;scrollbar-color:#475569 #151a27;scrollbar-width:thin;user-select:none;-webkit-user-select:none';
    var style=document.createElement('style');
    style.textContent='#qcDevelopmentNotice,#qcDevelopmentNotice *{user-select:none!important;-webkit-user-select:none!important}#qcDevelopmentNoticeTitle{margin:0 0 17px!important;text-align:center!important;white-space:nowrap!important;color:#ef4444!important;font-size:clamp(19px,2.7vw,25px)!important;font-weight:850!important;letter-spacing:-.025em!important;line-height:1.2!important}#qcDevelopmentNotice section::after{content:"";position:absolute;inset:0;padding:1.5px;border-radius:inherit;pointer-events:none;opacity:0;background:radial-gradient(190px circle at var(--qc-notice-x,50%) var(--qc-notice-y,0px),rgba(125,211,252,.98),rgba(56,189,248,.45) 43%,transparent 74%);-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;transition:opacity .16s ease}#qcDevelopmentNotice section:hover::after{opacity:1}#qcDevelopmentNoticeText ol{margin:0;padding:0 0 0 1.45em;column-count:2;column-gap:34px;color:#e2e8f0;font-size:clamp(12.5px,1.35vw,14px);font-weight:550;line-height:1.48}#qcDevelopmentNoticeText li{break-inside:avoid;padding:0 0 8px 5px;color:#e2e8f0}#qcDevelopmentNoticeText li::marker{color:#7dd3fc;font-weight:850}#qcDevelopmentNoticeText a{color:#7dd3fc!important;text-decoration:underline;text-underline-offset:3px;font-weight:800}#qcDevelopmentNotice .qc-notice-dontshow{display:inline-flex;align-items:center;gap:8px;margin-right:16px;color:#cbd5e1;font-size:12px;font-weight:650;cursor:pointer;user-select:auto!important;-webkit-user-select:auto!important}#qcDevelopmentNotice .qc-notice-dontshow input{width:16px;height:16px;margin:0;accent-color:#7dd3fc;cursor:pointer;user-select:auto!important;-webkit-user-select:auto!important}#qcDevelopmentNotice .qc-notice-actions{display:flex;justify-content:center;align-items:center;margin:24px 18px 4px;padding:0 18px 2px}#qcDevelopmentNotice .qc-notice-close{display:flex;align-items:center;justify-content:center;position:static;margin:0 auto;min-width:190px;min-height:46px;padding:0 68px;border:1px solid #38bdf8;border-radius:11px;background:#7dd3fc;color:#07111c;font-size:13px;font-weight:900;cursor:pointer;box-shadow:0 7px 18px rgba(56,189,248,.16);transition:transform .18s ease,box-shadow .18s ease,background .18s ease}#qcDevelopmentNotice .qc-notice-close:hover{background:#93ddff;box-shadow:0 8px 24px rgba(56,189,248,.28);transform:translateY(-1px)}#qcDevelopmentNotice .qc-notice-close:active{transform:translateY(0)}#qcDevelopmentNotice .qc-notice-offline{margin:0 0 13px;padding:10px 13px;border:1px solid #38516f;border-radius:11px;background:#1a2638;color:#dbeafe;font-size:13px;font-weight:700}@media(max-width:680px){#qcDevelopmentNotice{padding:10px!important}#qcDevelopmentNotice section{width:100%!important;max-height:calc(100dvh - 20px)!important;padding:18px 16px!important;border-radius:17px!important}#qcDevelopmentNoticeTitle{font-size:20px!important;margin-bottom:14px!important}#qcDevelopmentNoticeText ol{column-count:1;font-size:13.5px;line-height:1.5}#qcDevelopmentNoticeText li{padding-bottom:9px}#qcDevelopmentNotice .qc-notice-actions{margin:20px 4px 2px;padding:0 10px 2px;flex-wrap:wrap;gap:12px}#qcDevelopmentNotice .qc-notice-close{width:min(100%,280px);min-width:0;padding:0 42px}}@media(max-height:520px) and (min-width:681px){#qcDevelopmentNotice section{max-height:calc(100dvh - 16px)!important;padding:12px 20px!important}#qcDevelopmentNoticeTitle{margin-bottom:8px!important;font-size:19px!important}#qcDevelopmentNoticeText ol{font-size:12px;line-height:1.35}#qcDevelopmentNoticeText li{padding-bottom:4px}#qcDevelopmentNotice .qc-notice-actions{margin-top:10px}#qcDevelopmentNotice .qc-notice-close{min-height:38px}}';
    var title=document.createElement('h2');title.id='qcDevelopmentNoticeTitle';title.textContent='Thông báo !';
    var body=document.createElement('div');body.id='qcDevelopmentNoticeText';
    var dontShowLabel=document.createElement('label');dontShowLabel.className='qc-notice-dontshow';
    var dontShow=document.createElement('input');dontShow.type='checkbox';dontShow.id='qcNoticeDontShowToday';
    dontShowLabel.append(dontShow,document.createTextNode('Không hiển thị trong 1 ngày'));
    var close=document.createElement('button');close.type='button';close.className='qc-notice-close';close.textContent='OK';
    close.addEventListener('click',function(){if(dontShow.checked){try{localStorage.setItem('qc-development-notice-snooze-until',String(Date.now()+86400000));}catch(e){}}panel.remove();});
    var actions=document.createElement('div');actions.className='qc-notice-actions';actions.append(dontShowLabel,close);card.append(title,body,actions);card.addEventListener('pointermove',function(event){var rect=card.getBoundingClientRect();card.style.setProperty('--qc-notice-x',(event.clientX-rect.left)+'px');card.style.setProperty('--qc-notice-y',(event.clientY-rect.top)+'px');});panel.append(style,card);document.body.append(panel);close.focus({preventScroll:true});
  }
  var body=panel.querySelector('#qcDevelopmentNoticeText');body.replaceChildren();
  var messages=['Do đang trong quá trình phát triển nên có thể xử lý hơi chậm, vui lòng không spam.','Nên tạo và hoàn thành bài thi khi có internet để tránh bị lỗi.','Tiến độ có thể vẫn được lưu trên thiết bị, nhưng đồng bộ và thống kê trực tuyến sẽ chờ đến khi có mạng.','Khi kết nối lại, hãy kiểm tra trạng thái lưu trước khi đóng trang hoặc nộp bài.','Vui lòng chờ thông báo hoàn tất trước khi thực hiện lại thao tác.','Không đóng trang khi đang xuất đề, tải tệp hoặc đồng bộ dữ liệu.','Kiểm tra lại tên bài và lớp trước khi xác nhận để tránh nhầm dữ liệu.','Tôn trọng bản quyền, quyền riêng tư và văn minh trong việc tạo câu hỏi.','Nếu tài khoản không dùng hoặc dự án không dùng, vui lòng xóa để tránh quá tải dữ liệu.'];
  var list=document.createElement('ol');messages.forEach(function(message){var li=document.createElement('li');li.textContent=message;list.append(li);});
  var contact=document.createElement('li');contact.append(document.createTextNode('Nếu có thắc mắc, ý kiến hay báo cáo gì, vui lòng liên hệ qua Gmail: '));var email=document.createElement('a');email.href='mailto:hosu2k9@gmail.com';email.textContent='hosu2k9@gmail.com';contact.append(email);list.append(contact);body.append(list);
  if(reason==='offline'){var note=document.createElement('p');note.className='qc-notice-offline';note.textContent='Thiết bị đã mất kết nối internet liên tục hơn 5 phút. Một số chức năng trực tuyến hiện có thể tạm thời chưa hoạt động.';body.prepend(note);}
}
(function qcStudentNoticeHandlers(){var timer=null,offlineSince=0,firstActionNoticeShown=false;function start(){clearTimeout(timer);offlineSince=Date.now();timer=setTimeout(function(){if(!navigator.onLine&&offlineSince&&Date.now()-offlineSince>=300000)qcStudentShowNotice('offline');},300000);}window.addEventListener('offline',start);window.addEventListener('online',function(){clearTimeout(timer);timer=null;offlineSince=0;});if(!navigator.onLine)start();document.addEventListener('click',function(event){if(firstActionNoticeShown||event.target.closest('#qcDevelopmentNotice,input:not([type=button]):not([type=submit]),textarea,select,[contenteditable=true]'))return;if(event.target.closest('button,a,[role=button],.choice,.tf-toggle,.nav-button,.question-card')){firstActionNoticeShown=true;setTimeout(function(){qcStudentShowNotice('action');},0);}},true);})();
`;

  const html='<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+safeTitle+'</title><!-- CSS moved to css/styles.css (style block 6) --></head><body class="dark">'+
  '<div class="identity-gate" id="identityGate"><div class="identity-card"><button type="button" class="student-auth-open" id="studentAuthOpenBtn" hidden>Đăng nhập bằng Gmail</button><section class="student-auth-section" id="studentAuthSection" hidden><h3 id="studentAuthTitle">Đăng nhập bằng Gmail</h3><form id="studentAuthForm"><div id="studentAuthNameWrap" hidden><label for="studentAuthName">Tên của bạn<input id="studentAuthName" type="text" maxlength="100" autocomplete="name" placeholder="Họ và tên"></label></div><label for="studentAuthEmail">Gmail<input id="studentAuthEmail" name="username" type="email" autocomplete="username" required placeholder="example@gmail.com"></label><label for="studentAuthPassword"><span id="studentAuthPasswordText">Mật khẩu</span><input id="studentAuthPassword" name="password" type="password" minlength="8" maxlength="128" autocomplete="current-password" required placeholder="Tối thiểu 8 ký tự"></label><div id="studentAuthOtpWrap" hidden><label for="studentAuthOtp">Mã OTP<input id="studentAuthOtp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="Mã trong email"></label></div><button class="student-auth-submit" id="studentAuthSubmitBtn" type="submit">Đăng nhập</button></form><div class="student-google-auth-wrap" id="studentGoogleAuthWrap" hidden><div id="studentGoogleAuthMount"></div><p class="student-auth-error" id="studentGoogleAuthNote">Đăng nhập bằng Google</p></div><p class="student-auth-error" id="studentAuthError" hidden></p><div class="student-auth-actions"><button type="button" id="studentAuthSendOtpBtn" hidden>Gửi OTP</button><button type="button" id="studentAuthForgotBtn">Quên mật khẩu?</button><button type="button" id="studentAuthSwitchBtn">Chưa có tài khoản? Đăng ký</button></div></section><div class="student-account-bar" id="studentAccountBar" hidden><span id="studentAccountLabel">Đã đăng nhập</span><button type="button" id="studentLogoutBtn">Đăng xuất</button></div><form class="identity-card identity-form" id="identityForm"><h2>Bắt đầu bài tập</h2><p>Điền họ tên và lớp để bắt đầu làm bài.</p><p class="resume-hint" id="resumeHint" hidden></p><label id="studentNameLabel" for="studentName">Tên học sinh<input id="studentName" type="text" maxlength="100" autocomplete="name" placeholder="Họ tên" required></label><label for="studentClass">Lớp<input id="studentClass" type="text" maxlength="30" autocomplete="off" placeholder="Ví dụ: 10A1" required></label><div class="student-exam-password" id="examPasswordWrap" hidden><label for="examPasswordInput">Mật khẩu bài thi</label><div class="password-control"><input id="examPasswordInput" type="password" maxlength="128" autocomplete="off" placeholder="Nhập mật khẩu do giáo viên cung cấp"><button aria-label="Hiện mật khẩu" class="password-eye-button" id="toggleStudentExamPasswordBtn" title="Hiện mật khẩu" type="button">👁</button></div><p class="student-auth-error" id="examPasswordError" hidden></p></div><button class="submit-button" type="submit">Bắt đầu làm bài</button></form></div></div>'+
  '<div class="anti-cheat-overlay" id="antiCheatOverlay" hidden><section class="anti-cheat-card"><h2 id="antiCheatTitle">Tạm thời khóa làm bài</h2><p id="antiCheatMessage">Vui lòng chờ.</p><div id="antiCheatWait"><strong class="anti-cheat-countdown" id="antiCheatCountdown">10 giây</strong><p>Nếu bạn tiếp tục gian lận, hệ thống có thể sẽ kick bạn ra ngoài.</p></div></section></div><div class="privacy-shield" id="privacyShield" hidden>Nội dung bài thi đang được ẩn khi cửa sổ không hoạt động.</div>'+
  '<main><div class="head"><h1>'+safeTitle+'</h1>'+teacherMetaHtml+'<p id="studentHeaderNote"><span id="studentBadge" class="student-badge"></span> Hoàn thành bài làm rồi bấm Nộp bài.</p>'+
  '<div class="toolbar"><label>Chế độ xem<select id="viewMode"><option value="single">Từng câu</option><option value="all">Tất cả câu</option></select></label><label>Nền<select id="studentTheme"><option value="dark" selected>Đen gradient</option><option value="light">Sáng</option></select></label><span class="timer" id="timer">Thời gian: Không giới hạn</span><span class="streak-pill" id="streak">Chuỗi đúng: 0</span><button type="button" class="sound-button" id="soundToggle">Âm thanh: Bật</button><button type="button" class="submit-button" id="submit">Nộp bài</button></div></div>'+
  '<div class="layout" id="examLayout"><div class="sheet"><button type="button" class="back-results-button" id="backToResultsBtn" hidden>← Quay lại kết quả</button><div class="questions">'+itemHtml+'</div><div class="single-nav"><button type="button" id="prev">Trước</button><button type="button" id="next">Sau</button></div><button type="button" class="submit-button all-submit" id="submitAll">Nộp bài</button><div class="result" id="result" hidden></div></div>'+
  '<div class="navigator"><h2>Điều hướng</h2><div class="nav-list">'+items.map(function(_,i){return '<button type="button" class="nav-button" data-jump="'+i+'">'+(i+1)+'</button>';}).join('')+'</div><span class="muted" id="status">Đã làm 0/'+items.length+' câu</span><span class="nav-help" id="navHelp">Xanh: đã làm · Vàng: đã đánh dấu · Trắng: chưa làm</span><div class="review-legend" id="reviewLegend" hidden><span class="review-legend-row"><i class="review-legend-swatch" style="background:#16a34a"></i> Xanh: câu đúng</span><span class="review-legend-row"><i class="review-legend-swatch" style="background:#dc2626"></i> Đỏ: câu sai</span><span class="review-legend-row"><i class="review-legend-swatch" style="background:#d97706"></i> Vàng: chưa làm / tự luận chờ chấm</span></div></div></div>'+
  '<section class="student-result-screen" id="studentResultScreen" hidden><p class="result-kicker">ĐÃ HOÀN THÀNH</p><div class="student-score-wrap" id="studentScoreWrap"><svg class="student-score-ring" viewBox="0 0 220 220" aria-hidden="true"><defs><linearGradient id="studentScoreGradient" x1="100%" y1="50%" x2="0%" y2="50%"><stop offset="0%" stop-color="#ef4444"/><stop offset="50%" stop-color="#facc15"/><stop offset="100%" stop-color="#22c55e"/></linearGradient></defs><circle class="student-score-track" cx="110" cy="110" r="96"></circle><circle class="student-score-arc" id="studentScoreArc" cx="110" cy="110" r="96"></circle></svg><h2 class="student-score" id="studentScore">0.00</h2></div><p class="student-score-caption" id="studentScoreCaption">/ '+max+' điểm</p><p class="student-result-message" id="studentResultMessage"></p><div class="student-result-stats" id="studentResultStats"></div><div class="student-result-charts"><article class="student-chart-card"><h3>Tỉ lệ điểm theo mức độ</h3><div class="student-pie-layout"><div class="student-pie" id="studentPie"><div class="student-pie-center" id="studentPieCenter"></div></div><div class="student-pie-legend" id="studentPieLegend"></div></div></article><article class="student-chart-card"><h3>Kết quả theo mức độ</h3><div class="student-column-chart" id="studentColumnChart"></div></article></div><section class="student-leaderboard-card" id="studentLeaderboard" hidden><h3>🏆 Bảng xếp hạng lớp</h3><p class="student-leaderboard-status" id="studentLeaderboardStatus"><span class="qc-loading-status"><span class="qc-spinner" aria-hidden="true"></span><span>Đang tải bảng xếp hạng...</span></span></p><div class="student-leaderboard-list" id="studentLeaderboardList"></div></section><p class="student-result-footnote" id="studentResultFootnote"></p><div class="student-result-actions"><button type="button" id="reviewAnswersBtn" class="primary" hidden>Xem lại bài</button><button type="button" id="retakeStudentBtn" hidden>Làm lại bài</button></div></section></main>'+
  '<footer class="qc-footer"><div class="qc-footer-brand"><strong>QUIZ CRAFT</strong><span>Nền tảng tạo và làm bài tập trực tuyến</span></div><nav aria-label="Liên kết cuối trang"><a href="terms.html">Điều khoản sử dụng</a><a href="guide.html">Hướng dẫn sử dụng</a><a href="about.html">Giới thiệu</a><a href="support.html">Ủng hộ nhà phát triển</a><a href="https://www.facebook.com/hovsu2009" target="_blank" rel="noopener noreferrer">Facebook</a><a href="https://x.com/hovsu2009" target="_blank" rel="noopener noreferrer">Twitter</a><a href="https://www.tiktok.com/@hovsu2009" target="_blank" rel="noopener noreferrer">TikTok</a></nav><small>© 2026 Quiz Craft</small></footer>'+
  '<script>'+ "\nfunction qcShowDialog(type,message,defaultValue){\n  return new Promise(function(resolve){\n    var old=document.getElementById('qcNativeDialog');if(old)old.remove();\n    var overlay=document.createElement('div');overlay.id='qcNativeDialog';\n    overlay.style.cssText='position:fixed;inset:0;z-index:999999;display:grid;place-items:center;padding:18px;background:rgba(8,15,25,.62);backdrop-filter:blur(5px);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,\"Segoe UI\",sans-serif';\n    var card=document.createElement('section');card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.style.cssText='width:min(100%,430px);padding:24px;border:1px solid var(--line,#2c3549);border-radius:20px;background:var(--surface,#151a27);color:var(--ink,#f2f5fa);box-shadow:0 24px 70px rgba(0,0,0,.35)';\n    var heading=document.createElement('h2');heading.textContent=type==='confirm'?'Xác nhận':type==='prompt'?'Nhập thông tin':'Thông báo';heading.style.cssText='margin:0 0 10px;font:600 24px Georgia,serif';\n    var body=document.createElement('p');body.textContent=String(message==null?'':message);body.style.cssText='margin:0 0 18px;white-space:pre-wrap;overflow-wrap:anywhere;color:inherit;line-height:1.6';\n    card.append(heading,body);\n    var field=null;if(type==='prompt'){field=document.createElement('input');field.type='text';field.value=defaultValue==null?'':String(defaultValue);field.style.cssText='display:block;width:100%;height:44px;margin:0 0 18px;padding:0 12px;border:1px solid var(--line,#475569);border-radius:11px;background:var(--paper,#0b0d14);color:inherit;font:inherit';card.append(field);}\n    var actions=document.createElement('div');actions.style.cssText='display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap';\n    function button(label,primary,value){var b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='min-height:42px;padding:0 18px;border:1px solid '+(primary?'transparent':'var(--line,#475569)')+';border-radius:11px;background:'+(primary?'var(--primary,#7dd3fc)':'transparent')+';color:'+(primary?'var(--surface,#07111c)':'inherit')+';font:700 13px inherit;cursor:pointer';b.addEventListener('click',function(){overlay.remove();resolve(value);});actions.append(b);return b;}\n    if(type==='confirm'){button('Hủy',false,false);button('Xác nhận',true,true);}\n    else if(type==='prompt'){button('Hủy',false,null);var ok=button('OK',true,field.value);ok.addEventListener('click',function(){});ok.onclick=function(){var value=field.value;overlay.remove();resolve(value);};}\n    else button('Đã hiểu',true,true);\n    card.append(actions);overlay.append(card);overlay.addEventListener('click',function(e){if(e.target===overlay){overlay.remove();resolve(type==='confirm'?false:null);}});\n    document.addEventListener('keydown',function onKey(e){if(!document.getElementById('qcNativeDialog')){document.removeEventListener('keydown',onKey);return;}if(e.key==='Escape'){overlay.remove();resolve(type==='confirm'?false:null);document.removeEventListener('keydown',onKey);}else if(e.key==='Enter'&&type!=='alert'){var primary=actions.lastElementChild;if(primary)primary.click();}});\n    document.body.append(overlay);if(field){field.focus();field.select();}else actions.lastElementChild.focus();\n  });\n}\nwindow.alert=function(message){qcShowDialog('alert',message);};\nwindow.confirm=function(message){return qcShowDialog('confirm',message);};\nwindow.prompt=function(message,value){return qcShowDialog('prompt',message,value);};\n" +'<\\/script><script>window.QUIZ_CRAFT_CONFIG=Object.assign({},window.QUIZ_CRAFT_CONFIG||{},{googleClientId:'+JSON.stringify(GOOGLE_CLIENT_ID)+'});<\\/script><script src="https://accounts.google.com/gsi/client" async defer><\/script><script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@5/dist/email.min.js"><\/script><script>'+(document.getElementById('qcSupabaseBridge')?.textContent||'')+'\n'+js+'\n'+studentExtras+'<\/script></body></html>';

  if(config.returnHtml)return {html:html,assignmentId:assignmentId,projectKey:stableProjectKey,assignmentOwnerId:String(teacherSession.teacherId||'')};
  if(config.publishOnline){
    const published=await qcApiPost({action:'publishExam',...teacherApiParams({}),examId:assignmentId,html:html});
    if(!published||!published.ok)throw new Error(published&&published.error||'Không thể lưu nội dung đề lên Google Sheets.');
    const shareUrl=new URL('exam.html',document.baseURI);shareUrl.searchParams.set('id',assignmentId);
    return shareUrl.toString();
  }
  const blob=new Blob([html],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),
        link=document.createElement('a');
  link.href=url;const fileBase=String(title||'bai-tap').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase()||'bai-tap';link.download=fileBase+'.html';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

