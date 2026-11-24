/* ============================================================
   Quiz Craft — shared app + editor lifecycle
   Classic script: shares top-level bindings with teacher.js/student.js.
   Do not add type="module" unless the app is refactored to imports.
   ============================================================ */

/* ============================================================
   Quiz Craft — single-file app
   ============================================================ */
const QKEY='quiz-craft-questions-v1', PKEY='quiz-craft-preferences-v1', PRKEY='quiz-craft-projects-v1',
      DKEY='quiz-craft-editor-draft-v1', AKEY='quiz-craft-account-v1', SKEY='quiz-craft-session-v1',
      PROGKEY='quiz-craft-quiz-progress-v1', AUTH_EMAIL_KEY='quiz-craft-last-teacher-email-v1';
const LETTERS=['A','B','C','D'], TF_LETTERS=['a','b','c','d'], TYPES=['multiple','truefalse','short','essay'];
const TEACHER_KEY='quiz-craft-teacher-code-v1';
function getTeacherCode(){
  try{
    let code=localStorage.getItem(TEACHER_KEY);
    if(!code){const seed=(window.crypto&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));code='GV-'+seed.replace(/[^a-z0-9]/gi,'').slice(0,10).toUpperCase();localStorage.setItem(TEACHER_KEY,code);}
    return code;
  }catch(e){return 'GV-'+Math.random().toString(36).slice(2,12).toUpperCase();}
}
let TEACHER_CODE=getTeacherCode();
const appsScriptUrl='https://script.google.com/macros/s/AKfycbyN3kuh7Rlfw8abCS8aFLFxwcbeaILyvhg4YK-9Nc-vLl4UZ3HW-lOSUnrUam16iIAH5w/exec';
const GOOGLE_CLIENT_ID=(window.QUIZ_CRAFT_CONFIG&&window.QUIZ_CRAFT_CONFIG.googleClientId)||'';
let teacherExamRows=[],teacherExamCatalog=[],teacherSelectedExamIds=null,teacherCatalogOwner='',teacherClassSelectionInitialized=false,otpRequestId='',authGuestId='';

const LANG={
  brand:{tagline:'Tạo câu hỏi dễ dàng'},
  hero:{saved:'Đã lưu thay đổi.'},
  stats:{questions:'câu hỏi'},
  actions:{start:'Bắt đầu làm bài',cancel:'Thoát chỉnh sửa',saveQuestion:'Lưu câu hỏi',edit:'Sửa',delete:'Xóa',
    addQuestion:'Thêm câu hỏi',retry:'Làm lại',next:'Sau',finish:'Xem kết quả',submit:'Nộp bài',
    settings:'Cài đặt',export:'Xuất bài tập',soundOn:'Âm thanh: Bật',soundOff:'Âm thanh: Tắt'},
  status:{saved:'Đã lưu',saveFailed:'Chưa lưu được'},
  editor:{title:'Thêm câu hỏi',editTitle:'Chỉnh sửa câu hỏi'},
  form:{questionPlaceholder:'Ví dụ: HTML dùng để làm gì?',typeMultiple:'Trắc nghiệm',typeTrueFalse:'Đúng / Sai',
    typeShort:'Trả lời ngắn',typeEssay:'Tự luận',optionPlaceholder:'Lựa chọn {letter} (có thể chỉ dùng ảnh)',
    optionChoice:'Đáp án {letter}',trueChoice:'Đúng',falseChoice:'Sai',tfPlaceholder:'Phát biểu {letter}',
    answerLabel:'Đáp án mong đợi',answerPlaceholder:'Nhập đáp án để đối chiếu',
    referenceLabel:'Gợi ý hoặc đáp án tham khảo',referencePlaceholder:'Không bắt buộc: nhập ý chính cần đạt',
    referenceHelp:'Câu tự luận không tự chấm điểm; phần này giúp bạn nhớ ý cần xem lại.',
    answerHelp:'Câu trả lời gần giống về nội dung sẽ được đối chiếu sau khi chuẩn hóa.',
    answerExplanationLabel:'giải thích (không bắt buộc)',answerExplanationPlaceholder:'Giải thích cho đáp án {letter}',
    tfCorrectLabel:'Đáp án'},
  media:{chooseImage:'Chọn ảnh',remove:'Xóa ảnh',fileFailed:'Không đọc được ảnh này.',alt:'Ảnh minh họa'},
  levels:{nb:'Nhận biết',th:'Thông hiểu',vd:'Vận dụng',shortNB:'NB',shortTH:'TH',shortVD:'VD'},
  navigator:{quizQuestion:'Câu {number}',newQuestion:'Câu hỏi mới'},
  bank:{questionNumber:'CÂU {number}',correctAnswer:'Đúng: {letter} — {text}',imageChoice:'Ảnh lựa chọn',
    emptyChoice:'Lựa chọn chưa có nội dung',shortAnswer:'Đáp án: {text}',referenceAnswer:'Có đáp án tham khảo',
    selfGraded:'Tự xem và chấm câu trả lời',explanationLabel:'Đã có giải thích riêng cho đáp án',
    tfSummary:'4 phát biểu · đúng {ok}/4'},
  analytics:{title:'Tỉ lệ câu hỏi theo mức độ',empty:'Chọn mức độ cho câu hỏi để xem biểu đồ.'},
  quiz:{score:'Điểm: 0',liveScore:'Điểm tạm tính: {score}/{max}',progress:'{current} / {total}',
    questionLabel:'CÂU HỎI {number}',shortResponseLabel:'Câu trả lời của bạn',essayResponseLabel:'Bài tự luận của bạn',
    shortPlaceholder:'Nhập câu trả lời ngắn',essayPlaceholder:'Viết câu trả lời của bạn ở đây',
    timeUp:'Đã hết thời gian. Bài làm được nộp tự động.',explanationHidden:'Đã tắt hiển thị giải thích cho bài này.',
    streak:'Chuỗi đúng: {count}',tfHint:'Mỗi phát biểu, chọn Đúng hoặc Sai.'},
  feedback:{correct:'Chính xác!',incorrect:'Chưa đúng.',correctAnswer:'Đáp án đúng',explanation:'Giải thích',
    tfPartial:'Đúng {ok}/4 phát biểu.'},
  result:{title:'Bạn đạt {score}/{max} điểm',good:'Tuyệt vời! Bạn đạt {percent}% với {correct}/{total} câu tự động đúng.',
    keepTrying:'Bạn đạt {percent}% với {correct}/{total} câu tự động đúng. Hãy xem lại và thử thêm lần nữa nhé.',
    correctStat:'câu đúng',rawStat:'điểm thô',timeStat:'thời gian còn',unlimited:'không giới hạn',
    timeUp:'Bài làm đã được nộp khi hết giờ.',streakStat:'chuỗi đúng dài nhất',essayTitle:'Chấm phần tự luận',
    essayCopy:'Nhập điểm cho từng câu tự luận nếu muốn cộng vào kết quả.',noAnswer:'Chưa có câu trả lời.',
    essayPoint:'Điểm (tối đa {max})'},
  messages:{added:'Đã thêm câu hỏi.',updated:'Đã cập nhật câu hỏi.',deleted:'Đã xóa câu hỏi.',
    progressSaved:'Đã tự động lưu tiến độ.',progressRestored:'Đã khôi phục bài làm chưa nộp.',progressDiscarded:'Đã bỏ bản lưu cũ.'},
  errors:{completeForm:'Hãy nhập nội dung câu hỏi.',completeOptions:'Hãy để trống lựa chọn không dùng; các lựa chọn còn lại cần chữ, ảnh hoặc cả hai và phải có ít nhất 2 đáp án.',
    completeAnswer:'Hãy nhập đáp án mong đợi.',completeTF:'Hãy nhập nội dung cho 4 phát biểu Đúng/Sai.',
    chooseAnswer:'Chọn một đáp án trước khi tiếp tục.',writeResponse:'Hãy viết câu trả lời trước khi tiếp tục.',
    saveFailed:'Không thể lưu lúc này. Hãy thử lại nhé.',loadFailed:'Không đọc được dữ liệu, bộ câu hỏi mẫu đã được mở.'},
  settings:{saved:'Đã lưu cài đặt.'},
  themes:{mint:'Bạc hà',sunset:'Hoàng hôn',ocean:'Đại dương',lavender:'Tím dịu',mono:'Đen trắng'},
  auth:{loginButton:'Đăng nhập',logoutButton:'Đăng xuất',close:'Đóng',registerTitle:'Tạo tài khoản',loginTitle:'Đăng nhập',
    registerIntro:'Tạo tài khoản để lưu lại bộ câu hỏi của bạn.',loginIntro:'Học sinh có thể nhập bất kỳ nội dung nào để vào xem và sử dụng Quiz Craft.',
    loginSubmit:'Đăng nhập',registerSubmit:'Đăng ký',switchToLogin:'Đã có tài khoản? Đăng nhập',
    switchToRegister:'Chưa có tài khoản? Đăng ký',registered:'Đăng ký thành công.',loggedIn:'Đăng nhập thành công.',
    loggedOut:'Đã đăng xuất.',accountExists:'Thiết bị này đã có tài khoản. Hãy đăng nhập.',
    nameRequired:'Hãy nhập tên của bạn.',invalid:'Email hoặc mật khẩu chưa đúng.',failed:'Không thể xử lý tài khoản lúc này.'},
  export:{empty:'Hãy thêm ít nhất một câu hỏi trước khi xuất.',defaultName:'Bài tập Quiz Craft',
    success:'Đã tải file bài tập xuống.',failed:'Không thể tạo file lúc này.'},
  project:{prompt:'Nhập tiêu đề cho dự án mới:',defaultName:'Đề mới',created:'Đã tạo dự án mới theo tiêu đề.',
    opened:'Đã mở dự án: {name}'}
};
const t=(key,values={})=>{const value=key.split('.').reduce((o,p)=>o?.[p],LANG)||key;return String(value).replace(/\{(\w+)\}/g,(_,n)=>values[n]??'');};

/* ---- Storage: miniappsAI + IndexedDB + localStorage fallback ----
   GitHub Pages là hosting tĩnh, không có API ghi file về repository.
   IndexedDB lưu dữ liệu bền vững trên chính trình duyệt và chứa được bộ đề
   nhiều ảnh tốt hơn giới hạn dung lượng nhỏ của localStorage. */
const QC_STORAGE_DB='quiz-craft-browser-storage-v2';
let qcStorageDbPromise=null;
function qcOpenStorageDB(){
  if(qcStorageDbPromise)return qcStorageDbPromise;
  qcStorageDbPromise=new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject(new Error('Trình duyệt không hỗ trợ IndexedDB.'));return;}
    let request;
    try{request=indexedDB.open(QC_STORAGE_DB,1);}catch(error){reject(error);return;}
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('items'))db.createObjectStore('items');};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('Không mở được bộ nhớ IndexedDB.'));
    request.onblocked=()=>reject(new Error('Bộ nhớ Quiz Craft đang bị chặn bởi một tab khác.'));
  }).catch(error=>{qcStorageDbPromise=null;throw error;});
  return qcStorageDbPromise;
}
async function qcIdbGet(key){
  const db=await qcOpenStorageDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('items','readonly'),request=tx.objectStore('items').get(String(key));
    request.onsuccess=()=>resolve(request.result==null?null:String(request.result));
    request.onerror=()=>reject(request.error||new Error('Không đọc được IndexedDB.'));
  });
}
async function qcIdbSet(key,value){
  const db=await qcOpenStorageDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('items','readwrite');
    tx.objectStore('items').put(String(value),String(key));
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error||new Error('Không ghi được IndexedDB.'));
    tx.onabort=()=>reject(tx.error||new Error('Giao dịch IndexedDB bị hủy.'));
  });
}
async function qcIdbRemove(key){
  const db=await qcOpenStorageDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('items','readwrite');tx.objectStore('items').delete(String(key));
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error||new Error('Không xóa được IndexedDB.'));
    tx.onabort=()=>reject(tx.error||new Error('Giao dịch IndexedDB bị hủy.'));
  });
}
const store={
  async getItem(k){
    // Phiên đăng nhập cần được đọc đồng bộ từ localStorage như trước.
    if(k===SKEY){try{const local=localStorage.getItem(k);if(local)return local;}catch(e){}}
    try{if(window.miniappsAI?.storage){const value=await miniappsAI.storage.getItem(k);if(value!=null&&value!=='')return value;}}catch(e){}
    try{const value=await qcIdbGet(k);if(value!=null)return value;}catch(e){}
    try{return localStorage.getItem(k);}catch(e){return null;}
  },
  async setItem(k,v){
    const value=String(v);let lastError=null;
    // Chỉ ghi vào MỘT nơi lưu trữ chính, không nhân đôi dữ liệu lớn sang
    // miniappsAI + IndexedDB + localStorage sau mỗi lần người dùng chỉnh sửa.
    if(window.miniappsAI?.storage){
      try{await miniappsAI.storage.setItem(k,value);return true;}catch(error){lastError=error;}
    }
    // GitHub Pages: IndexedDB là bộ nhớ chính, phù hợp với đề có nhiều ảnh.
    try{await qcIdbSet(k,value);return true;}catch(error){lastError=error;}
    // Chỉ dùng localStorage khi IndexedDB không khả dụng.
    try{localStorage.setItem(k,value);return true;}catch(error){lastError=error;}
    throw lastError||new Error('Không thể lưu dữ liệu trên trình duyệt.');
  },
  async removeItem(k){
    try{if(window.miniappsAI?.storage)await miniappsAI.storage.removeItem(k);}catch(e){}
    try{await qcIdbRemove(k);}catch(e){}
    try{localStorage.removeItem(k);}catch(e){}
  }
};

const $=id=>document.getElementById(id);
const el={};
let projects=[], activeProjectId='', projectName='Bộ câu hỏi mới', questions=[], editingId=null, editorIndex=-1,
    recentQuestionIds=[],
    soundOn=true, current=0, revealed=false, timerId=null, remainingSeconds=0,
    answers={}, essayScores={}, tfAnswers={}, tfConfirmed={}, toastTimer, authMode='login',
    currentStreak=0, bestStreak=0, submitted=false, quizStartTime=0, quizElapsedBeforeResume=0, timeTakenSec=0, resultAnimationStarted=false, resultAnimationFrame=0,
    meta={title:'Biến kiến thức thành một bài quiz thú vị.',description:'Tạo câu hỏi, chèn ảnh, đặt thời gian và thử sức ngay trên cùng một trang.'},
    settings={duration:0,maxScore:10,studentView:'single',answerReveal:'submit',allowRetake:true,shuffle:false,lockMode:'UNLOCKED',lockAt:'',classCode:'',assignmentId:'',projectKey:'',accessMode:'PUBLIC',antiCheat:false,antiCopy:false,antiScreenshot:false,requireStudentEmail:false,points:{multiple:.25,truefalse:.5,short:1,essay:2}};

/* Seed: 1 câu mỗi loại. True/False dùng dạng 4 phát biểu. */
const seed=[
  {id:'seed-1',type:'multiple',level:'nb',prompt:'Thẻ HTML nào dùng để tạo liên kết?',
    options:['a','link','href','nav'],answer:0,explanations:['Thẻ a (anchor) tạo liên kết đến một trang hoặc vị trí khác.','','','']},
  {id:'seed-2',type:'truefalse',level:'th',prompt:'Với mỗi phát biểu sau về CSS, hãy cho biết Đúng hay Sai.',
    statements:[
      {text:'CSS được dùng để tạo kiểu cho giao diện web.',correct:true},
      {text:'CSS là viết tắt của "Computer Style Sheets".',correct:false},
      {text:'Mỗi trang HTML chỉ có thể nhúng một file CSS.',correct:false},
      {text:'CSS có thể điều khiển màu sắc, khoảng cách và bố cục.',correct:true}
    ],explanation:'CSS viết tắt của Cascading Style Sheets; một trang có thể dùng nhiều file CSS.'},
  {id:'seed-3',type:'short',level:'vd',prompt:'Ngôn ngữ nào thường được dùng để tạo tương tác cho trang web?',
    answer:'JavaScript',explanation:'JavaScript giúp trang web phản hồi với thao tác của người dùng.'},
  {id:'seed-4',type:'essay',prompt:'Hãy nêu hai lợi ích của việc học qua câu hỏi trắc nghiệm.',
    answer:'',explanation:'Có thể đề cập đến việc ôn tập nhanh và phát hiện phần kiến thức chưa chắc.'}
];
function cache(){
  ['saveStatus','settingsBtn','exportBtn','authBtn','newProjectBtn','deleteProjectBtn','projectSelect',
   'quizPrevBtn','quizJump','quizNextBtn','quizTitle','quizDescription','questionCount','bankCount',
   'manualModeBtn','autoModeBtn','autoJsonPanel','manualQuestionEditor','jsonPromptText','copyJsonPromptBtn','jsonImportText','jsonImportFile','jsonImportMode','previewJsonBtn','jsonImportStatus','jsonImportPreview','applyJsonImportBtn','questionForm','questionText','questionType','questionLevel','questionLevelCustom',
   'choiceEditor','tfEditor','tfFields','optionFields','correctChoiceEditor','correctAnswer','correctAnswerLabel',
   'answerEditor','textAnswer','textAnswerLabel','answerHelpText','explanation',
   'questionMediaFile','questionMediaPreview','clearQuestionMediaBtn','questionMediaListPreview',
   'explanationMediaFiles','explanationMediaPreview',
   'formTitle','cancelEditBtn','resetFormBtn','questionList','emptyBank','startQuizBtnEmpty',
   'quizCard','quizEmpty','resultCard','resultTitle','resultScoreRing','resultScoreArc','resultScoreValue','resultScoreCaption','resultCopy','resultNote','resultStats','essayReview','essayReviewList',
   'retryBtn','goEditorBtn','goEditorBtn2','quizProgress','quizTimer','quizScore','quizStreak','showExplanationsToggle',
   'toast','editorView','quizView','prevQuestionBtn','nextQuestionBtn','questionJump','editorPosition',
   'analyticsEmpty','analyticsContent','levelPie','levelLegend','levelBars',
   'teacherCodeLabel','sheetConnectionStatus','loadExamStatsBtn','classStatsSelect','teacherExamMulti','teacherClassMulti','teacherCompareBy','teacherExamClassFilter','teacherExamSort','teacherExamCatalogCount','teacherSortSelect','teacherChartSelect','teacherCompareWrap','teacherCompareTitle','teacherCompareChart','teacherExamBreakdownWrap','teacherExamBreakdownBody','classStatsSummary','classAverage','classStudentCount','classWeakPct','classAveragePct','classGoodPct','classVeryGoodPct','classExcellentPct','classGradeBars','classResultsWrap','classResultsBody','classStatsStatus',
   'settingsModal','closeSettingsBtn','exportModal','closeExportBtn','exportTitleInput','exportClassInput','teacherDisplayNameInput','examPasswordInput','toggleTeacherExamPasswordBtn','examAccessModeInput','examLockModeInput','examLockScheduleField','examLockUntilInput','updateExamAccessBtn','antiCheatInput','antiCopyInput','antiScreenshotInput','requireStudentEmailInput','durationInput','maxScoreInput',
   'pointMultiple','pointTruefalse','pointShort','pointEssay','answerRevealMode',
   'saveSettingsBtn','saveSettingsBtnExport','exportProjectJsonBtn','multiExportModeInput','multiExportPanel','multiExportSelectAll','multiExportList','multiExportCount','themeSelect','settingsSoundBtn','logoutSettingsBtn',
   'authModal','closeAuthBtn','authForm','authTitle','authIntro','nameField','authName','authEmail',
   'authError','authSubmit','authSwitch','authPassword','authPasswordLabel','authOtp','otpField','sendOtpBtn','forgotPasswordBtn','googleAuthMount','googleAuthNote','publishExamLinkBtn','restoreBar','restoreProgressBtn','discardProgressBtn','quizBottomNav',
   'resultCharts','resultPie','resultLegend','resultBars','wrongReview','wrongReviewList']
  .forEach(id=>el[id]=$(id));
}

function qcShowDialog(type,message,defaultValue){
  return new Promise(function(resolve){
    var old=document.getElementById('qcNativeDialog');if(old)old.remove();
    var overlay=document.createElement('div');overlay.id='qcNativeDialog';
    overlay.style.cssText='position:fixed;inset:0;z-index:999999;display:grid;place-items:center;padding:18px;background:rgba(8,15,25,.62);backdrop-filter:blur(5px);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif';
    var card=document.createElement('section');card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.style.cssText='width:min(100%,430px);padding:24px;border:1px solid var(--line,#2c3549);border-radius:20px;background:var(--surface,#151a27);color:var(--ink,#f2f5fa);box-shadow:0 24px 70px rgba(0,0,0,.35)';
    var heading=document.createElement('h2');heading.textContent=type==='confirm'?'Xác nhận':type==='prompt'?'Nhập thông tin':'Thông báo';heading.style.cssText='margin:0 0 10px;font:600 24px Georgia,serif';
    var body=document.createElement('p');body.textContent=String(message==null?'':message);body.style.cssText='margin:0 0 18px;white-space:pre-wrap;overflow-wrap:anywhere;color:inherit;line-height:1.6';
    card.append(heading,body);
    var field=null;if(type==='prompt'){field=document.createElement('input');field.type='text';field.value=defaultValue==null?'':String(defaultValue);field.style.cssText='display:block;width:100%;height:44px;margin:0 0 18px;padding:0 12px;border:1px solid var(--line,#475569);border-radius:11px;background:var(--paper,#0b0d14);color:inherit;font:inherit';card.append(field);}
    var actions=document.createElement('div');actions.style.cssText='display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap';
    function button(label,primary,value){var b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='min-height:42px;padding:0 18px;border:1px solid '+(primary?'transparent':'var(--line,#475569)')+';border-radius:11px;background:'+(primary?'var(--primary,#7dd3fc)':'transparent')+';color:'+(primary?'var(--surface,#07111c)':'inherit')+';font:700 13px inherit;cursor:pointer';b.addEventListener('click',function(){overlay.remove();resolve(value);});actions.append(b);return b;}
    if(type==='confirm'){button('Hủy',false,false);button('Xác nhận',true,true);}
    else if(type==='prompt'){button('Hủy',false,null);var ok=document.createElement('button');ok.type='button';ok.textContent='OK';ok.style.cssText='min-height:42px;padding:0 18px;border:1px solid transparent;border-radius:11px;background:var(--primary,#7dd3fc);color:var(--surface,#07111c);font:700 13px Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer';ok.addEventListener('click',function(){var value=field.value;overlay.remove();resolve(value);});actions.append(ok);}
    else button('Đã hiểu',true,true);
    card.append(actions);overlay.append(card);overlay.addEventListener('click',function(e){if(e.target===overlay){overlay.remove();resolve(type==='confirm'?false:null);}});
    document.addEventListener('keydown',function onKey(e){if(!document.getElementById('qcNativeDialog')){document.removeEventListener('keydown',onKey);return;}if(e.key==='Escape'){overlay.remove();resolve(type==='confirm'?false:null);document.removeEventListener('keydown',onKey);}else if(e.key==='Enter'&&type!=='alert'){var primary=actions.lastElementChild;if(primary)primary.click();}});
    document.body.append(overlay);if(field){field.focus();field.select();}else actions.lastElementChild.focus();
  });
}
window.alert=function(message){qcShowDialog('alert',message);};
window.confirm=function(message){return qcShowDialog('confirm',message);};
window.prompt=function(message,value){return qcShowDialog('prompt',message,value);};

function toast(message){if(!el.toast)return;el.toast.textContent=message;el.toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.toast.hidden=true,3200);}
function qcShowDevelopmentNotice(reason){
  const now=Date.now(),snoozeKey='qc-development-notice-snooze-until';
  try{if(Number(localStorage.getItem(snoozeKey)||0)>now)return;}catch(e){}
  const key='qc-development-notice-last-'+reason+'-v2';
  try{const last=Number(sessionStorage.getItem(key)||0);if(now-last<300000)return;sessionStorage.setItem(key,String(now));}catch(e){}
  let panel=document.getElementById('qcDevelopmentNotice');
  if(!panel){
    panel=document.createElement('div');panel.id='qcDevelopmentNotice';
    panel.style.cssText='position:fixed;inset:0;z-index:200000;display:grid;place-items:center;padding:clamp(10px,2vh,22px);background:rgba(3,7,18,.78);backdrop-filter:blur(7px);overflow:hidden';
    const card=document.createElement('section');card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-labelledby','qcDevelopmentNoticeTitle');
    card.style.cssText='position:relative;isolation:isolate;width:min(100%,940px);max-height:calc(100dvh - 36px);overflow-y:auto;overscroll-behavior:contain;padding:clamp(18px,2.8vw,28px);border:1px solid #2c3549;border-radius:20px;background:#151a27;color:#f2f5fa;box-shadow:0 24px 70px rgba(0,0,0,.48);font:14px/1.48 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;scrollbar-color:#475569 #151a27;scrollbar-width:thin;user-select:none;-webkit-user-select:none';
    const style=document.createElement('style');
    style.textContent='#qcDevelopmentNotice,#qcDevelopmentNotice *{user-select:none!important;-webkit-user-select:none!important}#qcDevelopmentNoticeTitle{margin:0 0 17px!important;text-align:center!important;white-space:nowrap!important;color:#ef4444!important;font-size:clamp(19px,2.7vw,25px)!important;font-weight:850!important;letter-spacing:-.025em!important;line-height:1.2!important}#qcDevelopmentNotice section::after{content:"";position:absolute;inset:0;padding:1.5px;border-radius:inherit;pointer-events:none;opacity:0;background:radial-gradient(190px circle at var(--qc-notice-x,50%) var(--qc-notice-y,0px),rgba(125,211,252,.98),rgba(56,189,248,.45) 43%,transparent 74%);-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;transition:opacity .16s ease}#qcDevelopmentNotice section:hover::after{opacity:1}#qcDevelopmentNoticeText ol{margin:0;padding:0 0 0 1.45em;column-count:2;column-gap:34px;color:#e2e8f0;font-size:clamp(12.5px,1.35vw,14px);font-weight:550;line-height:1.48}#qcDevelopmentNoticeText li{break-inside:avoid;padding:0 0 8px 5px;color:#e2e8f0}#qcDevelopmentNoticeText li::marker{color:#7dd3fc;font-weight:850}#qcDevelopmentNoticeText a{color:#7dd3fc!important;text-decoration:underline;text-underline-offset:3px;font-weight:800}#qcDevelopmentNotice .qc-notice-dontshow{display:inline-flex;align-items:center;gap:8px;margin-right:16px;color:#cbd5e1;font-size:12px;font-weight:650;cursor:pointer;user-select:auto!important;-webkit-user-select:auto!important}#qcDevelopmentNotice .qc-notice-dontshow input{width:16px;height:16px;margin:0;accent-color:#7dd3fc;cursor:pointer;user-select:auto!important;-webkit-user-select:auto!important}#qcDevelopmentNotice .qc-notice-actions{display:flex;justify-content:center;align-items:center;margin:24px 18px 4px;padding:0 18px 2px}#qcDevelopmentNotice .qc-notice-close{display:flex;align-items:center;justify-content:center;position:static;margin:0 auto;min-width:190px;min-height:46px;padding:0 68px;border:1px solid #38bdf8;border-radius:11px;background:#7dd3fc;color:#07111c;font-size:13px;font-weight:900;cursor:pointer;box-shadow:0 7px 18px rgba(56,189,248,.16);transition:transform .18s ease,box-shadow .18s ease,background .18s ease}#qcDevelopmentNotice .qc-notice-close:hover{background:#93ddff;box-shadow:0 8px 24px rgba(56,189,248,.28);transform:translateY(-1px)}#qcDevelopmentNotice .qc-notice-close:active{transform:translateY(0)}#qcDevelopmentNotice .qc-notice-offline{margin:0 0 13px;padding:10px 13px;border:1px solid #38516f;border-radius:11px;background:#1a2638;color:#dbeafe;font-size:13px;font-weight:700}@media(max-width:680px){#qcDevelopmentNotice{padding:10px!important}#qcDevelopmentNotice section{width:100%!important;max-height:calc(100dvh - 20px)!important;padding:18px 16px!important;border-radius:17px!important}#qcDevelopmentNoticeTitle{font-size:20px!important;margin-bottom:14px!important}#qcDevelopmentNoticeText ol{column-count:1;font-size:13.5px;line-height:1.5}#qcDevelopmentNoticeText li{padding-bottom:9px}#qcDevelopmentNotice .qc-notice-actions{margin:20px 4px 2px;padding:0 10px 2px;flex-wrap:wrap;gap:12px}#qcDevelopmentNotice .qc-notice-close{width:min(100%,280px);min-width:0;padding:0 42px}}@media(max-height:520px) and (min-width:681px){#qcDevelopmentNotice section{max-height:calc(100dvh - 16px)!important;padding:12px 20px!important}#qcDevelopmentNoticeTitle{margin-bottom:8px!important;font-size:19px!important}#qcDevelopmentNoticeText ol{font-size:12px;line-height:1.35}#qcDevelopmentNoticeText li{padding-bottom:4px}#qcDevelopmentNotice .qc-notice-actions{margin-top:10px}#qcDevelopmentNotice .qc-notice-close{min-height:38px}}';
    const title=document.createElement('h2');title.id='qcDevelopmentNoticeTitle';title.textContent='Thông báo !';
    const body=document.createElement('div');body.id='qcDevelopmentNoticeText';
    const dontShowLabel=document.createElement('label');dontShowLabel.className='qc-notice-dontshow';
    const dontShow=document.createElement('input');dontShow.type='checkbox';dontShow.id='qcNoticeDontShowToday';
    dontShowLabel.append(dontShow,document.createTextNode('Không hiển thị trong 1 ngày'));
    const close=document.createElement('button');close.type='button';close.className='qc-notice-close';close.textContent='OK';
    close.addEventListener('click',()=>{if(dontShow.checked){try{localStorage.setItem('qc-development-notice-snooze-until',String(Date.now()+86400000));}catch(e){}}panel.remove();});
    const actions=document.createElement('div');actions.className='qc-notice-actions';actions.append(dontShowLabel,close);card.append(title,body,actions);card.addEventListener('pointermove',event=>{const rect=card.getBoundingClientRect();card.style.setProperty('--qc-notice-x',(event.clientX-rect.left)+'px');card.style.setProperty('--qc-notice-y',(event.clientY-rect.top)+'px');});panel.append(style,card);document.body.append(panel);
    close.focus({preventScroll:true});
  }
  const body=panel.querySelector('#qcDevelopmentNoticeText');body.replaceChildren();
  const messages=[
    'Do đang trong quá trình phát triển nên có thể xử lý hơi chậm, vui lòng không spam.',
    'Nên tạo và hoàn thành bài thi khi có internet để tránh bị lỗi.',
    'Tiến độ có thể vẫn được lưu trên thiết bị, nhưng đồng bộ và thống kê trực tuyến sẽ chờ đến khi có mạng.',
    'Khi kết nối lại, hãy kiểm tra trạng thái lưu trước khi đóng trang hoặc nộp bài.',
    'Vui lòng chờ thông báo hoàn tất trước khi thực hiện lại thao tác.',
    'Không đóng trang khi đang xuất đề, tải tệp hoặc đồng bộ dữ liệu.',
    'Kiểm tra lại tên bài và lớp trước khi xác nhận để tránh nhầm dữ liệu.',
    'Tôn trọng bản quyền, quyền riêng tư và văn minh trong việc tạo câu hỏi.',
    'Nếu tài khoản không dùng hoặc dự án không dùng, vui lòng xóa để tránh quá tải dữ liệu.'
  ];
  const list=document.createElement('ol');
  messages.forEach(message=>{const li=document.createElement('li');li.textContent=message;list.append(li);});
  const contact=document.createElement('li');contact.append(document.createTextNode('Nếu có thắc mắc, ý kiến hay báo cáo gì, vui lòng liên hệ qua Gmail: '));
  const email=document.createElement('a');email.href='mailto:hosu2k9@gmail.com';email.textContent='hosu2k9@gmail.com';contact.append(email);list.append(contact);body.append(list);
  if(reason==='offline'){const offlineNote=document.createElement('p');offlineNote.className='qc-notice-offline';offlineNote.textContent='Thiết bị đã mất kết nối internet liên tục hơn 5 phút. Một số chức năng trực tuyến hiện có thể tạm thời chưa hoạt động.';body.prepend(offlineNote);}
}
function qcInstallNoticeHandlers(){let offlineTimer=null,offlineSince=0;const startOfflineTimer=()=>{clearTimeout(offlineTimer);offlineSince=Date.now();offlineTimer=setTimeout(()=>{if(!navigator.onLine&&offlineSince&&Date.now()-offlineSince>=300000)qcShowDevelopmentNotice('offline');},300000);};window.addEventListener('offline',startOfflineTimer);window.addEventListener('online',()=>{clearTimeout(offlineTimer);offlineTimer=null;offlineSince=0;});if(!navigator.onLine)startOfflineTimer();let firstActionNoticeShown=false;document.addEventListener('click',event=>{if(firstActionNoticeShown||event.target.closest('#qcDevelopmentNotice,input:not([type=button]):not([type=submit]),textarea,select,[contenteditable=true]'))return;if(event.target.closest('button,a,[role=button],.tab,.question-item,.quiz-option,.tf-toggle,.multi-check-item')){firstActionNoticeShown=true;setTimeout(()=>qcShowDevelopmentNotice('action'),0);}},true);}
function typeOf(q){return TYPES.includes(q?.type)?q.type:'multiple';}
function validMedia(value){const type=['image','video','audio'].includes(value?.type)?value.type:'none',url=String(value?.url||'');return type!=='none'&&/^(data:(image|video|audio)\/|https?:\/\/)/i.test(url)?{type,url}:{type:'none',url:''};}
function cleanQuestionPrompt(value){return String(value??'').replace(/^\s*Câu\s*\d+\s*[:.)\-–—]?\s*/i,'').trim();}
function cleanOptionLabel(value,index){const text=String(value??'').trim(),letter=LETTERS[index];if(!letter)return text;const prefix=new RegExp('^(?:'+letter+'\\s*[.:：-]\\s*|\\('+letter+'\\)\\s*|'+letter+'\\)\\s*)+','i');return text.replace(prefix,'').trim();}
function hasChoice(text,media){return Boolean(String(text||'').trim()||validMedia(media).url);}
function normalize(q){
  const type=typeOf(q), media=validMedia(q.media), prompt=cleanQuestionPrompt(q.prompt), levelRaw=String(q.level||'').trim(), level=levelKey(levelRaw)||levelRaw, explanation=String(q.explanation||'').trim();
  q={...q,explanationMedia:(Array.isArray(q.explanationMedia)?q.explanationMedia:[]).map(validMedia).filter(x=>x.url),mediaItems:(Array.isArray(q.mediaItems)?q.mediaItems:[]).map(validMedia).filter(x=>x.url)};
  if(type==='multiple'){
    const opts=Array.isArray(q.options)?q.options.slice(0,4):[],
          medias=Array.isArray(q.optionMedia)?q.optionMedia:[], exps=Array.isArray(q.explanations)?q.explanations:[],
          original=opts.map((text,i)=>({text:cleanOptionLabel(text,i),media:validMedia(medias[i]),explanation:String(exps[i]||'').trim(),originalIndex:i})),
          selectedIndex=Number(q.answer),
          slots=original.filter(x=>hasChoice(x.text,x.media));
    const selected=slots.findIndex(x=>x.originalIndex===selectedIndex);
    return {...q,type,level,prompt,options:slots.map(x=>x.text),optionMedia:slots.map(x=>x.media),
      explanations:slots.map(x=>x.explanation),media,explanation,
      answer:selected>=0?selected:0};
  }
  if(type==='truefalse'){
    const raw=Array.isArray(q.statements)?q.statements:[];
    const statements=Array.from({length:4},(_,i)=>({text:String(raw[i]?.text||'').trim(),correct:!!raw[i]?.correct,media:(Array.isArray(raw[i]?.media)?raw[i].media:[]).map(validMedia).filter(x=>x.url)}));
    const explanationMedia=(Array.isArray(q.explanationMedia)?q.explanationMedia:[]).map(validMedia).filter(x=>x.url);
    return {...q,type,level,prompt,media,explanation,explanationMedia,statements,options:[],optionMedia:[],explanations:[],answer:''};
  }
  return {...q,type,level,prompt,options:[],optionMedia:[],explanations:[],media,answer:String(q.answer||'').trim(),explanation};
}
function valid(q){
  if(!q||(!String(q.prompt||'').trim()&&!validMedia(q.media).url))return false;
  if(q.type==='multiple')return Array.isArray(q.options)&&q.options.length>=2&&Number.isInteger(q.answer)&&q.answer>=0&&q.answer<q.options.length;
  if(q.type==='truefalse')return Array.isArray(q.statements)&&q.statements.filter(s=>String(s.text||'').trim()).length>=2;
  if(q.type==='short')return Boolean(String(q.answer||'').trim());
  if(q.type==='essay')return Boolean(String(q.prompt||'').trim()||validMedia(q.media).url);
  return false;
}
// Luôn chuẩn hóa trước khi xác định đề có nội dung xuất được hay không.
// Điều này cũng xử lý các dự án cũ có cấu trúc câu hỏi chưa đầy đủ.
function exportableQuestionList(source){
  if(!Array.isArray(source))return [];
  return source.map(item=>{try{return normalize(item);}catch(error){return null;}}).filter(valid);
}
function projectSnapshot(){return {id:activeProjectId,name:projectName,questions:questions.map(normalize),meta,settings};}
function hydrateProject(p){activeProjectId=p.id;projectName=p.name||'Bộ câu hỏi';questions=Array.isArray(p.questions)?p.questions.map(normalize).filter(valid):[];meta={...meta,...(p.meta||{})};const savedSettings=p.settings||{};settings={...settings,...savedSettings,lockMode:savedSettings.lockMode|| (savedSettings.lockAt||savedSettings.lockedUntil?'LOCKED':'UNLOCKED'),lockAt:savedSettings.lockAt||savedSettings.lockedUntil||'',points:{...settings.points,...(savedSettings.points||{})}};}
function renderProjects(){if(!el.projectSelect)return;el.projectSelect.replaceChildren();projects.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;el.projectSelect.append(o);});el.projectSelect.value=activeProjectId;}

/* ---- Draft + automatic question saving ---- */
let draftTimer=0,editorDirty=false,lastDraftSerialized='';
function draftSnapshot(){
  return{projectId:activeProjectId,editingId,prompt:el.questionText.value,type:el.questionType.value,
    level:el.questionLevel.value,custom:el.questionLevelCustom.value,answer:el.textAnswer.value,
    explanation:el.explanation.value,explanationMedia:readMediaList(el.explanationMediaFiles),media:el.questionMediaFile.dataset.mediaUrl||'',mediaItems:questionMediaList(),
    options:optionSlots(),statements:tfSlots()};
}
async function persistDraft(){
  try{
    const serialized=JSON.stringify(draftSnapshot());
    if(serialized!==lastDraftSerialized){await store.setItem(DKEY,serialized);lastDraftSerialized=serialized;}
    if(el.saveStatus)el.saveStatus.textContent='Đã lưu bản nháp';
    return true;
  }catch(error){if(el.saveStatus)el.saveStatus.textContent='Chưa lưu được';return false;}
}
async function clearDraft(){try{await store.removeItem(DKEY);}catch(e){}lastDraftSerialized='';}
async function clearDraftFor(id){
  try{
    const raw=await store.getItem(DKEY);if(!raw)return;
    const draft=JSON.parse(raw);
    if(draft.projectId===activeProjectId&&String(draft.editingId||'')===String(id||'')){await store.removeItem(DKEY);lastDraftSerialized='';}
  }catch(e){}
}
function buildEditorQuestion(id){
  const prompt=el.questionText.value.trim(),type=el.questionType.value,
        level=el.questionLevel.value==='custom'?el.questionLevelCustom.value.trim():el.questionLevel.value;
  const mediaItems=questionMediaList(),primary=mediaItems[0]||{type:'none',url:''};
  const existing=questions.find(item=>item.id===id)||{};
  const data={...existing,id,type,level,prompt,
    media:{type:primary.type||'none',url:primary.url||''},mediaItems,
    explanation:el.explanation.value,explanationMedia:readMediaList(el.explanationMediaFiles)};
  if(type==='multiple'){
    const slots=optionSlots();
    const filled=slots.map((slot,index)=>({...slot,originalIndex:index})).filter(slot=>hasChoice(slot.text,slot.media));
    const selected=filled.findIndex(slot=>slot.originalIndex===Number(el.correctAnswer.value));
    Object.assign(data,{options:filled.map(slot=>slot.text),optionMedia:filled.map(slot=>slot.media),
      explanations:filled.map(slot=>slot.explanation),answer:selected>=0?selected:0});
  }else if(type==='truefalse'){
    Object.assign(data,{statements:tfSlots(),answer:''});
  }else{
    Object.assign(data,{answer:el.textAnswer.value.trim()});
  }
  return normalize(data);
}
function autosaveEditorQuestion(){
  if(!editorDirty)return true;
  const previousId=editingId;
  const id=previousId||('q-'+Date.now()+'-'+Math.random().toString(36).slice(2,7));
  let question;
  try{question=buildEditorQuestion(id);}catch(error){editorDirty=false;persistDraft();return false;}
  // Do not publish an unfinished new question or replace a valid saved question
  // with an incomplete form. The editor draft is still preserved locally.
  if(!valid(question)){editorDirty=false;persistDraft();return false;}
  const index=questions.findIndex(item=>item.id===id);
  if(index>=0)questions[index]=question;
  else{
    questions.push(question);
    editingId=id;
    el.formTitle.textContent=t('editor.editTitle');
    el.cancelEditBtn.hidden=false;
  }
  touchRecentQuestion(id);
  editorDirty=false;
  syncNavigator();
  renderBank();
  // Chỉ xóa bản nháp sau khi dự án đã ghi thành công; nếu lỗi thì giữ bản phục hồi.
  void save().then(saved=>saved?clearDraftFor(previousId):persistDraft());
  return true;
}
function markEditorDirty(){
  editorDirty=true;
  if(el.saveStatus)el.saveStatus.textContent='Có thay đổi chưa lưu';
}
function flushEditorAutosave(){
  clearTimeout(draftTimer);draftTimer=0;
  if(editorDirty)autosaveEditorQuestion();
}
// Chỉ gọi hàm này khi có thay đổi đã được xác nhận (change/blur, chọn ảnh,
// thêm-xóa media...). Không lưu theo từng phím gõ và không chạy vòng lặp nền.
function scheduleDraftSave(){
  markEditorDirty();
  if(el.saveStatus)el.saveStatus.textContent='Đang lưu thay đổi…';
  clearTimeout(draftTimer);
  draftTimer=setTimeout(()=>{draftTimer=0;autosaveEditorQuestion();},450);
}
async function restoreDraft(){
  try{const raw=await store.getItem(DKEY);if(!raw)return;const draft=JSON.parse(raw);
    if(draft.projectId!==activeProjectId)return;
    const q=questions.find(item=>item.id===draft.editingId);
    if(q)fill(q);editingId=q?draft.editingId:null;
    el.questionText.value=draft.prompt||'';el.questionType.value=TYPES.includes(draft.type)?draft.type:'multiple';
    el.questionLevel.value=draft.level||'';el.questionLevelCustom.value=draft.custom||'';
    el.textAnswer.value=draft.answer||'';el.explanation.value=draft.explanation||'';
    el.questionMediaFile.dataset.mediaUrl=draft.media||'';writeMediaList(el.questionMediaFile,draft.mediaItems||[]);preview(el.questionMediaPreview,draft.media||'',el.clearQuestionMediaBtn);renderQuestionMediaPreview();
    updateLevel();updateType();
    if(el.questionType.value==='multiple'&&Array.isArray(draft.options))
      renderOptions(draft.options.map(x=>x.text||''),draft.options.map(x=>x.media||{}),draft.options.map(x=>x.explanation||''));
    if(el.questionType.value==='truefalse'&&Array.isArray(draft.statements))renderTFStatements(draft.statements);
    syncNavigator();
    // Bản nháp đã nằm trong bộ nhớ; chỉ lưu lại khi người dùng chỉnh sửa tiếp.
    lastDraftSerialized=raw;
    editorDirty=false;
    clearTimeout(draftTimer);draftTimer=0;
    if(el.saveStatus)el.saveStatus.textContent='Đã khôi phục bản nháp';
  }catch(e){}
}
async function save(){
  try{const snap=projectSnapshot(),idx=projects.findIndex(p=>p.id===activeProjectId);
    if(idx>=0)projects[idx]=snap;else projects.push(snap);
    await store.setItem(PRKEY,JSON.stringify(projects));
    el.saveStatus.textContent=t('status.saved');
    return true;
  }catch(e){el.saveStatus.textContent=t('status.saveFailed');toast('Không lưu được trên trình duyệt: '+(e&&e.message||'hãy kiểm tra dung lượng bộ nhớ.'));return false;}
}
async function load(){
  try{const stored=await store.getItem(PRKEY);
    if(stored){const parsed=JSON.parse(stored);if(Array.isArray(parsed)&&parsed.length){projects=parsed;hydrateProject(projects[0]);renderProjects();return;}}
    const raw=await store.getItem(QKEY);const parsed=raw?JSON.parse(raw):null;
    activeProjectId=createProjectId();projectName='Bộ câu hỏi đầu tiên';
    questions=Array.isArray(parsed)?parsed.map(normalize).filter(valid):seed.map(normalize);
    projects=[projectSnapshot()];await save();renderProjects();
  }catch(e){activeProjectId=createProjectId();projectName='Bộ câu hỏi mẫu';questions=seed.map(normalize);projects=[projectSnapshot()];renderProjects();toast(t('errors.loadFailed'));}
}
async function createProject(){
  flushEditorAutosave();
  const name=await prompt(t('project.prompt'),t('project.defaultName'));if(!name?.trim())return;
  await save();activeProjectId=createProjectId();projectName=name.trim();questions=[];editingId=null;editorDirty=false;
  meta={title:projectName,description:'Tạo câu hỏi và tổ chức bài quiz của bạn.'};
  applyMeta();
  settings={duration:0,maxScore:10,studentView:'single',answerReveal:'submit',allowRetake:true,shuffle:false,lockMode:'UNLOCKED',lockAt:'',classCode:'',assignmentId:'',projectKey:'',accessMode:'PUBLIC',antiCheat:false,antiCopy:false,antiScreenshot:false,requireStudentEmail:false,points:{multiple:.25,truefalse:.5,short:1,essay:2}};
  projects.push(projectSnapshot());await save();renderProjects();renderBank();resetForm();await clearDraft();
  await clearProgress();loadTeacherIntegrationState();toast(t('project.created'));
}
function resetToBlankProject(name){
  activeProjectId=createProjectId();projectName=name||'Bộ câu hỏi mới';questions=[];editingId=null;editorIndex=-1;
  meta={title:projectName,description:'Tạo câu hỏi và tổ chức bài quiz của bạn.'};
  settings={duration:0,maxScore:10,studentView:'single',answerReveal:'submit',allowRetake:true,shuffle:false,lockMode:'UNLOCKED',lockAt:'',classCode:'',assignmentId:'',projectKey:'',accessMode:'PUBLIC',antiCheat:false,antiCopy:false,antiScreenshot:false,requireStudentEmail:false,points:{multiple:.25,truefalse:.5,short:1,essay:2}};
}

async function removeProjectsLocally(removedIds){
  const oldActiveId=activeProjectId;
  projects=projects.filter(project=>!removedIds.includes(String(project.id)));
  const activeWasRemoved=removedIds.includes(String(oldActiveId));
  if(!projects.length){
    resetToBlankProject('Bộ câu hỏi mới');
    projects=[projectSnapshot()];
  }else if(activeWasRemoved){
    hydrateProject(projects[0]);
  }
  await save();
  renderProjects();
  if(activeWasRemoved){
    applyMeta();renderBank();resetForm();await clearDraft();await clearProgress();loadTeacherIntegrationState();
  }
}

async function deleteProjectsByIds(ids){
  const selected=projects.filter(project=>ids.has(String(project.id)));
  if(!selected.length)return {deleted:0,failed:[]};
  const teacher=currentTeacherSession();
  const removedIds=[],failed=[];
  for(const project of selected){
    const savedSettings=project.settings||{};
    const hasSheetExam=Boolean(savedSettings.assignmentId||savedSettings.projectKey);
    if(hasSheetExam){
      if(!teacher){failed.push({name:project.name||'Dự án không tên',message:'Cần đăng nhập giáo viên để xóa bản đã đồng bộ.'});continue;}
      try{
        const remote=await appsScriptJsonp(teacherApiParams({action:'deleteProject',projectKey:String(savedSettings.projectKey||project.id),examId:String(savedSettings.assignmentId||'')}));
        if(!remote||!remote.ok)throw new Error(remote&&remote.error||'Không xóa được đề trên Google Sheets.');
      }catch(error){failed.push({name:project.name||'Dự án không tên',message:error.message||'Không thể đồng bộ thao tác xóa.'});continue;}
    }
    removedIds.push(String(project.id));
  }
  if(removedIds.length){
    await removeProjectsLocally(removedIds);
    // Làm mới số liệu ngay sau khi xóa để không giữ thống kê của đề vừa gỡ.
    if(typeof loadTeacherStats==='function'&&currentTeacherSession()){
      try{await loadTeacherStats();}catch(error){}
    }
  }
  if(failed.length){
    const message=removedIds.length
      ?'Đã xóa '+removedIds.length+'/'+selected.length+' dự án. '+failed.length+' dự án chưa xóa được.'
      :'Không xóa được dự án nào. '+failed.length+' dự án cần kiểm tra kết nối hoặc đăng nhập.';
    toast(message+' '+failed[0].name+': '+failed[0].message);
  }else{
    toast('Đã xóa '+removedIds.length+' dự án đã chọn.');
  }
  return {deleted:removedIds.length,failed};
}

async function deleteCurrentProject(){
  // Lưu trạng thái dự án đang mở trước khi dựng danh sách để không mất nội dung mới sửa.
  await save();
  const old=document.getElementById('projectDeleteModal');if(old)old.remove();
  const overlay=document.createElement('div');overlay.id='projectDeleteModal';overlay.className='modal';overlay.setAttribute('role','presentation');
  const backdrop=document.createElement('div');backdrop.className='modal-backdrop';
  const card=document.createElement('section');card.className='settings-card project-delete-card';card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-labelledby','projectDeleteTitle');
  const closeButton=document.createElement('button');closeButton.type='button';closeButton.className='modal-close';closeButton.setAttribute('aria-label','Đóng');closeButton.textContent='×';
  const heading=document.createElement('h2');heading.id='projectDeleteTitle';heading.textContent='Xóa dự án';
  const intro=document.createElement('p');intro.className='project-delete-intro';intro.textContent='Chọn một hoặc nhiều dự án cần xóa. Các dự án đã đồng bộ lên Google Sheets cũng sẽ được yêu cầu xóa đồng bộ.';

  const selectPanel=document.createElement('div');
  const selectAllLabel=document.createElement('label');selectAllLabel.className='project-delete-select-all';
  const selectAll=document.createElement('input');selectAll.type='checkbox';selectAll.setAttribute('aria-label','Chọn tất cả dự án');
  const selectAllText=document.createElement('span');selectAllText.textContent='Chọn tất cả dự án ('+projects.length+')';selectAllLabel.append(selectAll,selectAllText);
  const list=document.createElement('div');list.className='project-delete-list';
  const count=document.createElement('p');count.className='project-delete-count';
  const actions=document.createElement('div');actions.className='project-delete-actions';
  const cancelButton=document.createElement('button');cancelButton.type='button';cancelButton.className='button button-ghost';cancelButton.textContent='Hủy';
  const nextButton=document.createElement('button');nextButton.type='button';nextButton.className='button button-primary';nextButton.textContent='Tiếp tục';nextButton.disabled=true;
  actions.append(cancelButton,nextButton);selectPanel.append(selectAllLabel,list,count,actions);

  const confirmPanel=document.createElement('div');confirmPanel.hidden=true;
  const confirmIntro=document.createElement('p');confirmIntro.className='project-delete-intro';
  const confirmList=document.createElement('div');confirmList.className='project-delete-confirm-list';
  const warning=document.createElement('p');warning.className='project-delete-warning';warning.textContent='Thao tác này không thể hoàn tác.';
  const confirmActions=document.createElement('div');confirmActions.className='project-delete-actions';
  const backButton=document.createElement('button');backButton.type='button';backButton.className='button button-ghost';backButton.textContent='Quay lại';
  const confirmButton=document.createElement('button');confirmButton.type='button';confirmButton.className='button button-primary';confirmButton.textContent='Xác nhận xóa';
  confirmActions.append(backButton,confirmButton);confirmPanel.append(confirmIntro,confirmList,warning,confirmActions);

  card.append(closeButton,heading,intro,selectPanel,confirmPanel);overlay.append(backdrop,card);document.body.append(overlay);
  const checkboxes=[];
  projects.forEach(project=>{
    const label=document.createElement('label');label.className='project-delete-row';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=String(project.id);checkbox.checked=String(project.id)===String(activeProjectId);
    const copy=document.createElement('span');copy.className='project-delete-row-copy';
    const name=document.createElement('strong');name.textContent=project.name||'Dự án không tên';
    const settings=project.settings||{};
    const details=document.createElement('small');details.textContent=(Array.isArray(project.questions)?project.questions.length:0)+' câu hỏi'+(String(project.id)===String(activeProjectId)?' · Đang mở':'')+((settings.assignmentId||settings.projectKey)?' · Đã đồng bộ':'');
    copy.append(name,details);label.append(checkbox,copy);list.append(label);checkboxes.push(checkbox);
  });
  const selectedIds=()=>new Set(checkboxes.filter(checkbox=>checkbox.checked).map(checkbox=>checkbox.value));
  const updateSelection=()=>{
    const selected=checkboxes.filter(checkbox=>checkbox.checked).length;
    selectAll.checked=checkboxes.length>0&&selected===checkboxes.length;
    selectAll.indeterminate=selected>0&&selected<checkboxes.length;
    count.textContent='Đã chọn '+selected+' / '+checkboxes.length+' dự án';
    nextButton.disabled=selected===0;
    nextButton.textContent=selected?'Tiếp tục ('+selected+')':'Tiếp tục';
  };
  checkboxes.forEach(checkbox=>checkbox.addEventListener('change',updateSelection));
  selectAll.addEventListener('change',()=>{checkboxes.forEach(checkbox=>checkbox.checked=selectAll.checked);updateSelection();});
  updateSelection();

  let closed=false;
  const close=()=>{if(closed)return;closed=true;document.removeEventListener('keydown',onKey);overlay.remove();};
  const onKey=event=>{if(event.key==='Escape'){close();}};
  document.addEventListener('keydown',onKey);
  closeButton.addEventListener('click',close);cancelButton.addEventListener('click',close);backdrop.addEventListener('click',close);
  nextButton.addEventListener('click',()=>{
    const ids=selectedIds();if(!ids.size)return;
    const selected=projects.filter(project=>ids.has(String(project.id)));
    confirmIntro.textContent='Bạn đang chọn '+selected.length+' dự án để xóa:';
    confirmList.replaceChildren();
    selected.forEach(project=>{const line=document.createElement('p');line.textContent='• '+(project.name||'Dự án không tên');confirmList.append(line);});
    selectPanel.hidden=true;confirmPanel.hidden=false;heading.textContent='Xác nhận xóa dự án';confirmButton.focus();
  });
  backButton.addEventListener('click',()=>{confirmPanel.hidden=true;selectPanel.hidden=false;heading.textContent='Xóa dự án';nextButton.focus();});
  confirmButton.addEventListener('click',async()=>{
    const ids=selectedIds();if(!ids.size)return;
    confirmButton.disabled=true;backButton.disabled=true;closeButton.disabled=true;confirmButton.textContent='Đang xóa...';
    const result=await deleteProjectsByIds(ids);
    if(result.deleted||!result.failed.length){close();return;}
    confirmButton.disabled=false;backButton.disabled=false;closeButton.disabled=false;confirmButton.textContent='Thử xóa lại';
    warning.textContent='Chưa xóa được dự án nào. Hãy kiểm tra trạng thái đăng nhập hoặc kết nối rồi thử lại.';
  });
  const firstCheckbox=checkboxes.find(checkbox=>checkbox.checked)||checkboxes[0];if(firstCheckbox)firstCheckbox.focus();else closeButton.focus();
}

async function switchProject(id){
  if(!id||id===activeProjectId)return;
  flushEditorAutosave();
  await save();
  const p=projects.find(x=>x.id===id);if(!p)return;hydrateProject(p);renderProjects();renderBank();resetForm();
  applyMeta();loadTeacherIntegrationState();await savePrefs();await clearProgress();toast(t('project.opened',{name:p.name}));
}
async function savePrefs(){try{await store.setItem(PKEY,JSON.stringify({settings,soundOn,theme:document.body.dataset.theme||'dark',meta}));}catch(e){toast(t('errors.saveFailed'));}}
async function loadPrefs(){
  try{const raw=await store.getItem(PKEY);if(raw){const d=JSON.parse(raw);
    settings={...settings,...d.settings,points:{...settings.points,...d.settings?.points}};
    meta={...meta,...d.meta};soundOn=d.soundOn!==false;applyTheme(d.theme||'dark');}}catch(e){applyTheme('dark');}
}

/* ==================== Editor / question bank ==================== */
function applyMeta(){el.quizTitle.textContent=meta.title;el.quizDescription.textContent=meta.description;}
function applyTheme(theme){document.body.dataset.theme=['mint','sunset','ocean','lavender','mono','dark'].includes(theme)?theme:'dark';if(el.themeSelect)el.themeSelect.value=document.body.dataset.theme;}
function mediaType(file){return file?.type?.startsWith('image/')?'image':file?.type?.startsWith('video/')?'video':file?.type?.startsWith('audio/')?'audio':'none';}
function fileData(file){
  return new Promise((resolve,reject)=>{
    const type=mediaType(file);if(type==='none')return reject(new Error('unsupported'));
    const reader=new FileReader();reader.onerror=()=>reject(new Error('read'));
    reader.onload=()=>{if(type!=='image')return resolve(reader.result);
      const img=new Image();img.onload=()=>{const sc=Math.min(1,1400/img.width,1400/img.height),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*sc));c.height=Math.max(1,Math.round(img.height*sc));const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);resolve(c.toDataURL('image/jpeg',.82));};img.onerror=()=>reject(new Error('read'));img.src=reader.result;};reader.readAsDataURL(file);
  });
}
function preview(img,url,remove){if(url)img.src=url;else img.removeAttribute('src');img.hidden=!url;if(remove)remove.hidden=!url;}
function appendMedia(container,media,cls='media-preview'){const m=validMedia(media);if(!m.url)return;let node;if(m.type==='video'){node=document.createElement('video');node.controls=true;node.preload='metadata';}else if(m.type==='audio'){node=document.createElement('audio');node.controls=true;node.preload='metadata';}else{node=document.createElement('img');node.alt=t('media.alt');}node.className=cls;node.src=m.url;container.append(node);}
function choiceText(q,idx){const t0=cleanOptionLabel(q.options?.[idx],idx);const hasImg=validMedia(q.optionMedia?.[idx]).url;if(t0&&hasImg)return t0+' + ảnh';if(hasImg)return t('bank.imageChoice');return t0||t('bank.emptyChoice');}

/* ---- Multiple choice option editor ---- */
function optionSlots(){
  return [...el.optionFields.querySelectorAll('.option-row')].map(row=>({
    text:row.querySelector('.option-copy')?.value.trim()||'',
    media:{type:row.querySelector('.option-media-file')?.dataset.mediaUrl?'image':'none',url:row.querySelector('.option-media-file')?.dataset.mediaUrl||''},
    explanation:row.querySelector('.option-explanation')?.value.trim()||''}));
}
function syncCorrect(preferred){
  const old=preferred??el.correctAnswer.value;el.correctAnswer.replaceChildren();
  optionSlots().forEach((slot,i)=>{if(!hasChoice(slot.text,slot.media))return;
    const o=document.createElement('option');o.value=String(i);o.textContent=t('form.optionChoice',{letter:LETTERS[i]});el.correctAnswer.append(o);});
  if([...el.correctAnswer.options].some(x=>x.value===String(old)))el.correctAnswer.value=String(old);
  else if(el.correctAnswer.options.length)el.correctAnswer.value=el.correctAnswer.options[0].value;
}
function renderOptions(values=[],medias=[],exps=[]){
  el.optionFields.replaceChildren();
  Array.from({length:4},(_,i)=>({text:values[i]||'',media:validMedia(medias[i]),explanation:exps[i]||''})).forEach((slot,i)=>{
    const row=document.createElement('div');row.className='option-row';
    const core=document.createElement('div');core.className='option-core';
    const badge=document.createElement('span');badge.className='option-letter';badge.textContent=LETTERS[i];
    const input=document.createElement('input');input.className='option-copy';input.value=slot.text;input.placeholder=t('form.optionPlaceholder',{letter:LETTERS[i]});
    const picker=document.createElement('label');picker.className='image-picker compact';
    const plabel=document.createElement('span');plabel.textContent=t('media.chooseImage');
    const file=document.createElement('input');file.type='file';file.className='option-media-file';file.accept='image/*';
    picker.append(plabel,file);
    const image=document.createElement('img');image.className='option-upload-preview';image.alt='';
    const remove=document.createElement('button');remove.className='remove-image';remove.type='button';remove.textContent='×';remove.title=t('media.remove');remove.setAttribute('aria-label',t('media.remove'));
    file.dataset.mediaUrl=slot.media.url;preview(image,slot.media.url,remove);
    const note=document.createElement('textarea');note.className='option-explanation';note.rows=2;note.value=slot.explanation;note.placeholder=t('form.answerExplanationPlaceholder',{letter:LETTERS[i]});
    input.setAttribute('aria-label',t('form.optionChoice',{letter:LETTERS[i]}));
    core.append(badge,input,picker,image,remove);row.append(core,note);el.optionFields.append(row);
    input.addEventListener('input',()=>{syncCorrect();markEditorDirty();});
    file.addEventListener('change',async()=>{const selected=file.files?.[0];if(!selected)return;try{file.dataset.mediaUrl=await fileData(selected);preview(image,file.dataset.mediaUrl,remove);syncCorrect();scheduleDraftSave();}catch(e){toast(t('media.fileFailed'));}});
    remove.addEventListener('click',()=>{file.value='';file.dataset.mediaUrl='';preview(image,'',remove);syncCorrect();scheduleDraftSave();});
  });
  syncCorrect();
}

/* ---- True/False 4-statement editor ---- */
function questionMediaList(){const items=readMediaList(el.questionMediaFile);if(items.length)return items;const legacy=validMedia({type:'image',url:el.questionMediaFile.dataset.mediaUrl||''});return legacy.url?[legacy]:[];}
function renderQuestionMediaPreview(){renderMediaEditor(el.questionMediaListPreview,questionMediaList(),items=>{writeMediaList(el.questionMediaFile,items);el.questionMediaFile.dataset.mediaUrl=items[0]?.url||'';preview(el.questionMediaPreview,items[0]?.type==='image'?items[0]?.url||'':'',el.clearQuestionMediaBtn);renderQuestionMediaPreview();scheduleDraftSave();});}
function readMediaList(input){try{return JSON.parse(input?.dataset.mediaList||'[]').map(validMedia).filter(x=>x.url);}catch(e){return [];}}
function writeMediaList(input,items){input.dataset.mediaList=JSON.stringify(items);}
function renderMediaEditor(container,items,onChange){
  container.replaceChildren();items.forEach((raw,index)=>{const item=validMedia(raw);if(!item.url)return;const wrap=document.createElement('span');wrap.style.display='inline-flex';wrap.style.flexDirection='column';wrap.style.alignItems='flex-start';wrap.style.gap='3px';const holder=document.createElement('span');holder.style.maxWidth='180px';appendMedia(holder,item,'media-editor-preview');const del=document.createElement('button');del.type='button';del.textContent='×';del.title='Xóa tệp';del.addEventListener('click',()=>{items.splice(index,1);onChange(items);});wrap.append(holder,del);container.append(wrap);});
}
function tfSlots(){
  return [...el.tfFields.querySelectorAll('.tf-row')].map(row=>({
    text:row.querySelector('.tf-st-input')?.value.trim()||'',
    correct:row.querySelector('.tf-st-correct')?.value==='true',
    media:readMediaList(row.querySelector('.tf-st-media'))
  }));
}

function renderTFStatements(values=[]){
  el.tfFields.replaceChildren();
  Array.from({length:4},(_,i)=>{
    const v=values[i]||{};let media=Array.isArray(v.media)?v.media.map(validMedia).filter(x=>x.url):[];
    const row=document.createElement('div');row.className='tf-row';
    const badge=document.createElement('span');badge.className='option-letter';badge.textContent=TF_LETTERS[i];
    const input=document.createElement('input');input.className='tf-st-input';input.type='text';input.value=v.text||'';input.placeholder=t('form.tfPlaceholder',{letter:TF_LETTERS[i]});
    const wrap=document.createElement('div');const lab=document.createElement('div');lab.className='tf-correct-label';lab.textContent=t('form.tfCorrectLabel');
    const sel=document.createElement('select');sel.className='tf-st-correct';[['true',t('form.trueChoice')],['false',t('form.falseChoice')]].forEach(([val,txt])=>{const o=document.createElement('option');o.value=val;o.textContent=txt;sel.append(o);});sel.value=v.correct===false?'false':'true';wrap.append(lab,sel);
    const mediaWrap=document.createElement('div');mediaWrap.className='tf-media-editor';const picker=document.createElement('label');picker.className='image-picker compact';picker.textContent='Thêm nhiều ảnh';const file=document.createElement('input');file.type='file';file.accept='image/*';file.multiple=true;file.className='tf-st-media';writeMediaList(file,media);picker.append(file);const previewBox=document.createElement('div');previewBox.className='media-list-editor';
    const update=items=>{media=items;writeMediaList(file,media);renderMediaEditor(previewBox,media,update);scheduleDraftSave();};
    // Expose the same updater to the shared Ctrl+V / drag-drop handler.
    file._updateMedia=update;
    renderMediaEditor(previewBox,media,update);file.addEventListener('change',async()=>{for(const f of Array.from(file.files||[])){try{media.push({type:'image',url:await fileData(f)});}catch(e){toast(t('media.fileFailed'));}}update(media);file.value='';});mediaWrap.append(picker,previewBox);
    input.addEventListener('input',markEditorDirty);sel.addEventListener('change',scheduleDraftSave);
    row.append(badge,input,wrap,mediaWrap);el.tfFields.append(row);
  });
}


function renderExplanationMediaPreview(){renderMediaEditor(el.explanationMediaPreview,readMediaList(el.explanationMediaFiles),items=>{writeMediaList(el.explanationMediaFiles,items);renderExplanationMediaPreview();scheduleDraftSave();});}
el.explanationMediaFiles?.addEventListener('change',async()=>{const items=readMediaList(el.explanationMediaFiles);for(const f of Array.from(el.explanationMediaFiles.files||[])){try{items.push({type:'image',url:await fileData(f)});}catch(e){toast(t('media.fileFailed'));}}writeMediaList(el.explanationMediaFiles,items);el.explanationMediaFiles.value='';renderExplanationMediaPreview();scheduleDraftSave();});
function updateType(){
  const type=el.questionType.value, multi=type==='multiple', tf=type==='truefalse', text=type==='short'||type==='essay';
  el.choiceEditor.hidden=!multi;el.tfEditor.hidden=!tf;
  el.correctChoiceEditor.hidden=!multi;
  el.answerEditor.hidden=!text;el.textAnswer.required=type==='short';
  if(multi){renderOptions(optionSlots().map(x=>x.text),optionSlots().map(x=>x.media),optionSlots().map(x=>x.explanation));}
  if(tf){renderTFStatements();}
  el.textAnswerLabel.textContent=t(type==='essay'?'form.referenceLabel':'form.answerLabel');
  el.textAnswer.placeholder=t(type==='essay'?'form.referencePlaceholder':'form.answerPlaceholder');
  el.answerHelpText.textContent=t(type==='essay'?'form.referenceHelp':'form.answerHelp');
}
function updateLevel(){const custom=el.questionLevel.value==='custom';el.questionLevelCustom.hidden=!custom;el.questionLevelCustom.required=custom;if(!custom)el.questionLevelCustom.value='';}
function resetForm(){
  flushEditorAutosave();
  editingId=null;editorIndex=-1;el.questionForm.reset();
  editorDirty=false;
  el.formTitle.textContent=t('editor.title');el.cancelEditBtn.hidden=true;
  el.questionType.value='multiple';el.questionLevel.value='';el.questionLevelCustom.value='';
  writeMediaList(el.explanationMediaFiles,[]);el.explanationMediaFiles.value='';el.explanationMediaPreview.replaceChildren();
  updateLevel();syncBankCurrentItem();el.questionMediaFile.value='';el.questionMediaFile.dataset.mediaUrl='';writeMediaList(el.questionMediaFile,[]);el.questionMediaListPreview.replaceChildren();
  preview(el.questionMediaPreview,'',el.clearQuestionMediaBtn);
  renderOptions();renderTFStatements();updateType();syncNavigator();
}
function touchRecentQuestion(id){
  if(!id)return;
  recentQuestionIds=[id,...recentQuestionIds.filter(x=>x!==id)].slice(0,5);
}
function fill(q){
  if(!q)return;
  const targetId=q.id;
  flushEditorAutosave();
  q=questions.find(item=>item.id===targetId)||q;
  touchRecentQuestion(q.id);
  const bank=document.querySelector('.bank-panel'),collapseButton=document.getElementById('bankCollapseBtn');
  if(bank&&bank.classList.contains('is-collapsed')){
    bank.classList.remove('is-collapsed');
    if(collapseButton){collapseButton.textContent='Thu gọn';collapseButton.setAttribute('aria-expanded','true');}
  }
  editingId=q.id;el.formTitle.textContent=t('editor.editTitle');
  el.questionText.value=q.prompt;el.questionType.value=q.type;
  const known=levelKey(q.level);el.questionLevel.value=known||(q.level?'custom':'');
  el.questionLevelCustom.value=known?'':String(q.level||'');updateLevel();
  el.explanation.value=q.explanation||'';el.cancelEditBtn.hidden=false;
  writeMediaList(el.explanationMediaFiles,Array.isArray(q.explanationMedia)?q.explanationMedia:[]);renderExplanationMediaPreview();
  const media=validMedia(q.media);el.questionMediaFile.value='';el.questionMediaFile.dataset.mediaUrl=media.url;writeMediaList(el.questionMediaFile,q.mediaItems?.length?q.mediaItems:(media.url?[media]:[]));
  preview(el.questionMediaPreview,media.type==='image'?media.url:'',el.clearQuestionMediaBtn);renderQuestionMediaPreview();
  if(q.type==='short'||q.type==='essay')el.textAnswer.value=q.answer||'';
  updateType();
  if(q.type==='multiple'){
    renderOptions(q.options,q.optionMedia,q.explanations);
    el.correctAnswer.value=String(q.answer);
  }
  if(q.type==='truefalse')renderTFStatements(q.statements);
  syncNavigator();syncBankCurrentItem();
  // Refresh the collapsed bank immediately so the question just opened moves to the top.
  renderBank();
  el.questionText.focus();
}
function syncBankCurrentItem(){const bank=document.querySelector('.bank-panel');if(!bank)return;bank.querySelectorAll('.question-item').forEach(node=>node.classList.toggle('is-current-edit',node.dataset.questionId===editingId));const note=bank.querySelector('.bank-collapsed-note');if(note)note.textContent=editingId?'Đang hiển thị câu hỏi bạn đang chỉnh sửa.':'Đang thu gọn danh sách. Nhấn “Mở rộng” để xem toàn bộ câu hỏi.';}
function label(type){return t({multiple:'form.typeMultiple',truefalse:'form.typeTrueFalse',short:'form.typeShort',essay:'form.typeEssay'}[type]);}
function levelKey(v){
  const key=String(v??'').trim().toLowerCase();
  const aliases={b:'nb',nb:'nb',h:'th',th:'th',vd:'vd'};
  return aliases[key]||'';
}
function levelMark(q){const v=String(q?.level||'').trim();return v?levelKey(v)?t('levels.short'+v.toUpperCase()):v:'';}
function levelName(v){const k=levelKey(v);return k?t('levels.'+k):String(v||'');}
function syncNavigator(){
  if(!el.questionJump)return;const keep=editingId||'';el.questionJump.replaceChildren();
  const fresh=document.createElement('option');fresh.value='';fresh.textContent=t('navigator.newQuestion');el.questionJump.append(fresh);
  questions.forEach((q,i)=>{const o=document.createElement('option');o.value=q.id;
    o.textContent=t('bank.questionNumber',{number:i+1})+(levelMark(q)?' ['+levelMark(q)+']':'')+': '+(q.prompt||'Câu hỏi bằng hình ảnh').slice(0,40);
    el.questionJump.append(o);});
  el.questionJump.value=keep;
  const index=questions.findIndex(q=>q.id===editingId);editorIndex=index;
  el.editorPosition.textContent=(index>=0?index+1:0)+' / '+questions.length;
  if(el.prevQuestionBtn)el.prevQuestionBtn.disabled=index<=0;
  if(el.nextQuestionBtn)el.nextQuestionBtn.disabled=index>=questions.length-1&&index>=0;
}
function renderAnalytics(){
  const counts={};questions.forEach(q=>{const k=String(q.level||'').trim();if(k)counts[k]=(counts[k]||0)+1;});
  const entries=Object.entries(counts);
  el.analyticsEmpty.hidden=entries.length>0;el.analyticsContent.hidden=!entries.length;
  if(entries.length){
    const total=entries.reduce((s,e)=>s+e[1],0),palette=['var(--primary)','var(--accent)','var(--success)','var(--focus)'];
    let cursor=0;const stops=entries.map(([k,c],i)=>{const start=cursor/total*100;cursor+=c;return palette[i%palette.length]+' '+start+'% '+(cursor/total*100)+'%';});
    el.levelPie.style.background='conic-gradient('+stops.join(',')+')';
    el.levelPie.setAttribute('aria-label',t('analytics.title')+': '+entries.map(([k,c])=>levelName(k)+' '+c).join(', '));
    el.levelLegend.replaceChildren();el.levelBars.replaceChildren();
    const maxCount=Math.max(...entries.map(e=>e[1]));
    entries.forEach(([k,c],i)=>{
      const lg=document.createElement('div');lg.className='legend-item';const sw=document.createElement('span');sw.className='legend-swatch';sw.style.background=palette[i%palette.length];
      const tx=document.createElement('span');tx.textContent=levelName(k)+' · '+Math.round(c/total*100)+'%';lg.append(sw,tx);el.levelLegend.append(lg);
      const row=document.createElement('div');row.className='bar-row';const lb=document.createElement('span');lb.textContent=levelName(k);
      const track=document.createElement('div');track.className='bar-track';const fill=document.createElement('span');fill.className='bar-fill';fill.style.width=(c/maxCount*100)+'%';track.append(fill);
      const num=document.createElement('strong');num.textContent=String(c);row.append(lb,track,num);el.levelBars.append(row);
    });
  }
  const typeNames={multiple:'Trắc nghiệm',truefalse:'Đúng / Sai',short:'Trả lời ngắn',essay:'Tự luận'};
  const typeCounts={multiple:0,truefalse:0,short:0,essay:0};questions.forEach(q=>typeCounts[typeOf(q)]++);
  const total=questions.length,withLevel=questions.filter(q=>String(q.level||'').trim()).length;
  const setText=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=String(value);};
  setText('analyticsTotalQuestions',total);setText('analyticsWithLevel',withLevel);setText('analyticsWithoutLevel',total-withLevel);
  const drawBars=(id,items)=>{
    const host=document.getElementById(id);if(!host)return;host.replaceChildren();
    const max=Math.max(1,...items.map(x=>x[1]));
    items.forEach(([name,count])=>{const row=document.createElement('div');row.className='bar-row';const label=document.createElement('span');label.textContent=name;
      const track=document.createElement('div');track.className='bar-track';const fill=document.createElement('span');fill.className='bar-fill';fill.style.width=(count/max*100)+'%';track.append(fill);
      const number=document.createElement('strong');number.textContent=String(count);row.append(label,track,number);host.append(row);});
  };
  drawBars('analyticsDetailLevels',Object.entries(counts).map(([k,v])=>[levelName(k),v]));
  drawBars('analyticsDetailTypes',Object.entries(typeCounts).map(([k,v])=>[typeNames[k],v]));
}
function setupQuestionAnalyticsActions(){
  const panel=document.getElementById('questionAnalyticsPanel');
  const hide=document.getElementById('analyticsHideBtn'),detail=document.getElementById('analyticsDetailBtn'),capture=document.getElementById('analyticsCaptureBtn');
  if(!panel||panel.dataset.actionsBound)return;panel.dataset.actionsBound='1';
  hide?.addEventListener('click',()=>{const hidden=panel.classList.toggle('analytics-hidden');hide.textContent=hidden?'Hiện biểu đồ':'Ẩn biểu đồ';});
  detail?.addEventListener('click',()=>{const node=document.getElementById('analyticsDetail');node.hidden=!node.hidden;detail.textContent=node.hidden?'Thống kê kĩ hơn':'Thu gọn thống kê';});
  capture?.addEventListener('click',async()=>{
    try{
      if(typeof window.html2canvas!=='function'){
        await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('Không tải được thư viện chụp ảnh.'));document.head.append(s);});
      }
      const canvas=await window.html2canvas(panel,{backgroundColor:getComputedStyle(document.body).getPropertyValue('--surface')||'#151a27',scale:2,useCORS:true});
      const link=document.createElement('a');link.download='Quiz-Craft-phan-tich-cau-hoi.png';link.href=canvas.toDataURL('image/png');link.click();toast('Đã tạo ảnh thống kê.');
    }catch(error){toast(error.message||'Không thể chụp ảnh bảng thống kê.');}
  });
}
function navigateEditor(delta){
  if(!questions.length)return;
  const index=questions.findIndex(q=>q.id===editingId);
  const next=Math.max(0,Math.min(questions.length-1,(index<0?0:index)+delta));
  fill(questions[next]);
}
function setupEditorLayoutRefinements(){
  const grid=document.querySelector('.workspace-grid');
  const leftColumn=document.querySelector('.workspace-left-column');
  const stats=document.querySelector('.sheet-results-panel');
  const bank=document.querySelector('.bank-panel');
  const collapse=document.getElementById('bankCollapseBtn');

  // Balance the right stack (question bank + student statistics) against
  // the full left stack (editor + question analysis).
  const syncBankHeight=()=>{
    if(!grid||!leftColumn||!stats||!bank)return;
    if(window.matchMedia('(max-width: 820px)').matches){
      grid.style.removeProperty('--bank-panel-height');
      return;
    }
    const leftHeight=leftColumn.getBoundingClientRect().height;
    const statsHeight=stats.getBoundingClientRect().height;
    const gap=16;
    const target=Math.max(280,Math.round(leftHeight-statsHeight-gap));
    grid.style.setProperty('--bank-panel-height',target+'px');
  };
  syncBankHeight();
  if(typeof ResizeObserver!=='undefined'){
    const observer=new ResizeObserver(syncBankHeight);
    if(leftColumn)observer.observe(leftColumn);
    if(stats)observer.observe(stats);
  }
  window.addEventListener('resize',syncBankHeight,{passive:true});

  if(bank&&collapse&&!collapse.dataset.bound){
    bank.classList.add('is-collapsed');
    collapse.dataset.bound='1';
    collapse.addEventListener('click',()=>{
      const expanded=bank.classList.toggle('is-collapsed')===false;
      collapse.textContent=expanded?'Thu gọn':'Mở rộng';
      collapse.setAttribute('aria-expanded',String(expanded));
      if(expanded){
        [...el.questionList.children].forEach(node=>{node.classList.remove('is-recent-visible');});
        const current=bank.querySelector('.question-item.is-current-edit');
        if(current)current.scrollIntoView({block:'nearest'});
      }else renderBank();
    });
  }
}
function bankVisibleQuestions(){
  const mode=document.getElementById('bankGroupMode')?.value||'none';
  const level=document.getElementById('bankLevelFilter')?.value||'all';
  const type=document.getElementById('bankTypeFilter')?.value||'all';
  const sort=document.getElementById('bankSort')?.value||'original';
  let list=questions.map((q,index)=>({q,index}));
  if(mode==='level'&&level!=='all')list=list.filter(x=>String(x.q.level||'').trim()===level);
  if(mode==='type'&&type!=='all')list=list.filter(x=>typeOf(x.q)===type);
  if(mode==='type'){
    if(sort==='az')list.sort((a,b)=>cleanQuestionPrompt(a.q.prompt).localeCompare(cleanQuestionPrompt(b.q.prompt),'vi'));
    else if(sort==='long')list.sort((a,b)=>cleanQuestionPrompt(b.q.prompt).length-cleanQuestionPrompt(a.q.prompt).length);
    else if(sort==='short')list.sort((a,b)=>cleanQuestionPrompt(a.q.prompt).length-cleanQuestionPrompt(b.q.prompt).length);
  }
  return list;
}
function refreshBankFilterOptions(){
  const mode=document.getElementById('bankGroupMode'),level=document.getElementById('bankLevelFilter');
  const type=document.getElementById('bankTypeFilter'),sort=document.getElementById('bankSort');
  if(!mode||!level||!type||!sort)return;
  const selected=level.value;level.replaceChildren();
  const all=document.createElement('option');all.value='all';all.textContent='Tất cả mức độ';level.append(all);
  const levels=new Map();
  questions.forEach(q=>{const v=String(q.level||'').trim();if(v)levels.set(v,levelName(v));});
  [...levels.entries()].sort((a,b)=>a[1].localeCompare(b[1],'vi')).forEach(([value,name])=>{const o=document.createElement('option');o.value=value;o.textContent=name;level.append(o);});
  level.value=levels.has(selected)?selected:'all';
  level.hidden=mode.value!=='level'||levels.size===0;
  type.hidden=mode.value!=='type';
  sort.hidden=mode.value!=='type';
}
function renderBank(){
  el.questionCount.textContent=String(questions.length);el.bankCount.textContent=String(questions.length);
  refreshBankFilterOptions();
  el.questionList.replaceChildren();el.emptyBank.hidden=questions.length>0;
  el.startQuizBtnEmpty.hidden=!questions.length;
  const visible=bankVisibleQuestions();
  visible.forEach(({q,index})=>{
    const item=document.createElement('article');item.className='question-item'+(editingId===q.id?' is-current-edit':'');item.dataset.questionId=q.id;item.tabIndex=0;item.setAttribute('role','button');item.setAttribute('aria-label','Mở câu hỏi '+(index+1)+' để chỉnh sửa');
    const top=document.createElement('div');top.className='question-item-top';
    const n=document.createElement('span');n.className='question-number';
    n.textContent=t('bank.questionNumber',{number:index+1})+(levelMark(q)?' ['+levelMark(q)+']':'');
    const actions=document.createElement('div');actions.className='item-actions';
    const edit=document.createElement('button');edit.className='text-button';edit.type='button';edit.dataset.editId=q.id;edit.textContent=t('actions.edit');
    const del=document.createElement('button');del.className='text-button delete';del.type='button';del.dataset.deleteId=q.id;del.textContent=t('actions.delete');
    actions.append(edit,del);top.append(n,actions);
    const tag=document.createElement('span');tag.className='type-pill';tag.textContent=label(q.type);
    const prompt=document.createElement('p');prompt.className='question-prompt';prompt.innerHTML=renderRichText(cleanQuestionPrompt(q.prompt)||'Câu hỏi bằng hình ảnh');
    item.append(top,tag,prompt);appendMedia(item,q.media);
    if(q.imageSuggestion){const hint=document.createElement('p');hint.className='json-image-hint';hint.textContent='Gợi ý ảnh cần bổ sung: '+q.imageSuggestion;item.append(hint);}
    const answer=document.createElement('div');answer.className='answer-preview';
    const dot=document.createElement('span');dot.className='answer-dot';
    const text=document.createElement('span');
    if(q.type==='multiple')text.innerHTML=renderRichText(t('bank.correctAnswer',{letter:LETTERS[q.answer],text:choiceText(q,q.answer)}));
    else if(q.type==='truefalse'){
      const ok=q.statements.filter(s=>s.correct).length;text.textContent=t('bank.tfSummary',{ok});
      const mini=document.createElement('span');mini.className='tf-mini';
      q.statements.forEach((s,j)=>{if(!s.text)return;const sp=document.createElement('span');sp.className=s.correct?'ok':'no';sp.textContent=TF_LETTERS[j]+'. '+(s.correct?'Đ':'S');mini.append(sp);});
      answer.append(dot,text,mini);item.append(answer);
      if(q.explanation){const note=document.createElement('p');note.className='explanation-preview';note.textContent=t('bank.explanationLabel');item.append(note);}
      el.questionList.append(item);return;
    }else if(q.type==='short')text.innerHTML=renderRichText(t('bank.shortAnswer',{text:q.answer}));
    else text.textContent=q.answer?t('bank.referenceAnswer'):t('bank.selfGraded');
    answer.append(dot,text);item.append(answer);
    if(q.explanation||q.explanations?.some(Boolean)){const note=document.createElement('p');note.className='explanation-preview';note.textContent=t('bank.explanationLabel');item.append(note);}
    el.questionList.append(item);
  });
  const bankPanel=document.querySelector('.bank-panel');
  // The tutorial video belongs to the question list, so it always follows
  // the visible five recent questions and moves with the list.
  bankPanel?.querySelector('.bank-collapsed-video')?.remove();
  bankPanel?.querySelector('.bank-collapsed-note')?.remove();
  if(bankPanel&&bankPanel.classList.contains('is-collapsed')){
    recentQuestionIds=recentQuestionIds.filter(id=>questions.some(q=>q.id===id));
    if(!recentQuestionIds.length)recentQuestionIds=questions.slice(-5).reverse().map(q=>q.id);
    const recent=new Set(recentQuestionIds.slice(0,5));
    [...el.questionList.children].forEach(node=>node.classList.toggle('is-recent-visible',recent.has(node.dataset.questionId)));
    recentQuestionIds.slice(0,5).slice().reverse().forEach(id=>{
      const node=[...el.questionList.children].find(item=>item.dataset.questionId===id);
      if(node)el.questionList.prepend(node);
    });
    const video=document.createElement('div');
    video.className='bank-collapsed-video';
    video.innerHTML='<strong>Xem hướng dẫn sử dụng tại đây</strong><div class="video-frame"><iframe loading="lazy" src="https://www.youtube.com/embed/-pPXKjzIfBA?rel=0" title="Video hướng dẫn Quiz Craft" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>';
    // With no questions this is the first item in the list; otherwise it
    // appears directly after the five visible question cards.
    el.questionList.append(video);
  }else{
    [...el.questionList.children].forEach(node=>node.classList.remove('is-recent-visible'));
  }
  renderAnalytics();
}

/* ==================== Event wiring and application boot ==================== */
/* ==================== Events ==================== */
function events(){
  el.manualModeBtn.addEventListener('click',()=>setCreationMode('manual'));
  el.autoModeBtn.addEventListener('click',()=>setCreationMode('auto'));
  el.copyJsonPromptBtn.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(el.jsonPromptText.textContent.trim());toast('Đã sao chép câu lệnh AI.');}catch(e){const promptText=el.jsonPromptText.textContent.trim();const fallback=document.createElement('textarea');fallback.value=promptText;fallback.setAttribute('readonly','');fallback.style.position='fixed';fallback.style.opacity='0';document.body.append(fallback);fallback.select();const copied=document.execCommand('copy');fallback.remove();if(copied)toast('Đã sao chép câu lệnh AI.');else toast('Trình duyệt không cho phép sao chép tự động.');}});
  el.previewJsonBtn.addEventListener('click',parseJsonImport);
  el.applyJsonImportBtn.addEventListener('click',applyJsonImport);
  el.jsonImportFile.addEventListener('change',async()=>{const file=el.jsonImportFile.files?.[0];if(!file)return;if(file.size>150*1024*1024){toast('Tệp JSON quá lớn (giới hạn 150 MB).');el.jsonImportFile.value='';return;}try{el.jsonImportText.value=await file.text();parseJsonImport();}catch(e){toast('Không đọc được tệp JSON.');}});
  el.questionForm.addEventListener('submit',submitQuestion);
  // Gõ chữ chỉ đánh dấu thay đổi; lưu khi control phát sinh change (thường là
  // lúc rời ô nhập/chọn xong), hoặc khi thêm/xóa media qua handler riêng.
  el.questionForm.addEventListener('input',markEditorDirty);
  el.questionForm.addEventListener('change',event=>{
    // File inputs tự lưu sau khi đọc xong tệp; bỏ qua event change ban đầu
    // để tránh ghi một lần với dữ liệu ảnh cũ rồi lại ghi lần hai.
    if(event.target.matches('input[type="file"]'))return;
    scheduleDraftSave();
  });
  el.questionType.addEventListener('change',updateType);
  el.questionLevel.addEventListener('change',updateLevel);
  el.prevQuestionBtn.addEventListener('click',()=>navigateEditor(-1));
  el.nextQuestionBtn.addEventListener('click',()=>navigateEditor(1));
  el.questionJump.addEventListener('change',()=>{const q=questions.find(x=>x.id===el.questionJump.value);if(q)fill(q);else resetForm();});
  el.resetFormBtn.addEventListener('click',()=>resetForm());
  el.cancelEditBtn.addEventListener('click',()=>resetForm());
  el.questionMediaFile.addEventListener('change',async()=>{const items=questionMediaList();for(const file of Array.from(el.questionMediaFile.files||[])){try{const type=mediaType(file);if(type!=='none')items.push({type,url:await fileData(file)});}catch(e){toast(t('media.fileFailed'));}}writeMediaList(el.questionMediaFile,items);el.questionMediaFile.dataset.mediaUrl=items[0]?.url||'';el.questionMediaFile.value='';preview(el.questionMediaPreview,items[0]?.type==='image'?items[0]?.url||'':'',el.clearQuestionMediaBtn);renderQuestionMediaPreview();scheduleDraftSave();});
  el.clearQuestionMediaBtn.addEventListener('click',()=>{el.questionMediaFile.value='';el.questionMediaFile.dataset.mediaUrl='';writeMediaList(el.questionMediaFile,[]);preview(el.questionMediaPreview,'',el.clearQuestionMediaBtn);el.questionMediaListPreview.replaceChildren();scheduleDraftSave();});
  el.questionList.addEventListener('click',event=>{
    const editButton=event.target.closest('[data-edit-id]'),deleteButton=event.target.closest('[data-delete-id]');
    if(editButton){fill(questions.find(q=>q.id===editButton.dataset.editId));return;}
    if(deleteButton){const id=deleteButton.dataset.deleteId;questions=questions.filter(q=>q.id!==id);if(editingId===id)resetForm();save();renderBank();toast(t('messages.deleted'));return;}
    const item=event.target.closest('.question-item');
    if(item){const q=questions.find(x=>x.id===item.dataset.questionId);if(q){fill(q);el.questionForm.scrollIntoView({behavior:'smooth',block:'start'});el.questionText.focus({preventScroll:true});}}
  });
  el.questionList.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.classList.contains('question-item')){event.preventDefault();const q=questions.find(x=>x.id===event.target.dataset.questionId);if(q){fill(q);el.questionForm.scrollIntoView({behavior:'smooth',block:'start'});el.questionText.focus({preventScroll:true});}}});
  el.quizCard.addEventListener('click',quizClick);
  el.startQuizBtnEmpty?.addEventListener('click',()=>view('quiz'));
  el.newProjectBtn.addEventListener('click',createProject);
  el.deleteProjectBtn.addEventListener('click',deleteCurrentProject);
  el.toggleTeacherExamPasswordBtn.addEventListener('click',()=>{const reveal=el.examPasswordInput.type==='password';el.examPasswordInput.type=reveal?'text':'password';el.toggleTeacherExamPasswordBtn.classList.toggle('is-visible',reveal);el.toggleTeacherExamPasswordBtn.setAttribute('aria-label',reveal?'Ẩn mật khẩu':'Hiện mật khẩu');el.toggleTeacherExamPasswordBtn.title=reveal?'Ẩn mật khẩu':'Hiện mật khẩu';});
  el.projectSelect.addEventListener('change',()=>switchProject(el.projectSelect.value));
  el.quizPrevBtn.addEventListener('click',()=>moveQuiz(-1));
  el.quizNextBtn.addEventListener('click',()=>{if(current>=questions.length-1)submitQuiz();else moveQuiz(1);});
  el.quizJump.addEventListener('change',()=>{capture();stopQuestionMedia();current=Number(el.quizJump.value)||0;revealed=false;renderQuiz();scheduleProgressSave();});
  el.goEditorBtn.addEventListener('click',()=>view('editor'));
  el.goEditorBtn2.addEventListener('click',()=>view('editor'));
  el.retryBtn.addEventListener('click',async()=>{await clearProgress();startQuiz();});
  document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>view(tab.dataset.view)));
  el.exportBtn.addEventListener('click',openExportModal);
  el.closeExportBtn.addEventListener('click',()=>el.exportModal.hidden=true);
  el.exportModal.addEventListener('click',e=>{
    if(e.target.dataset.closeExport!==undefined)el.exportModal.hidden=true;
    if(e.target.dataset.duration!==undefined){el.durationInput.value=e.target.dataset.duration;}
  });
  el.settingsBtn.addEventListener('click',openSettings);
  el.closeSettingsBtn.addEventListener('click',()=>el.settingsModal.hidden=true);
  el.settingsModal.addEventListener('click',e=>{if(e.target.dataset.closeSettings!==undefined)el.settingsModal.hidden=true;});
  ['Multiple','Truefalse','Short','Essay'].forEach(name=>{
    const type=name==='Truefalse'?'truefalse':name.toLowerCase();
    pointField(type).addEventListener('input',()=>{
      if(type==='essay')updateMaxScoreFromPoints();
      else rebalance(type);
    });
  });
  el.maxScoreInput.addEventListener('input',rebalanceEssayForMaxScore);
  el.maxScoreInput.addEventListener('change',finalizeMaxScoreEdit);
  el.saveSettingsBtn.addEventListener('click',saveSettings);
  el.loadExamStatsBtn.addEventListener('click',loadTeacherStats);
  // classStatsSelect is retained as a hidden compatibility element.
  if(el.teacherExamMulti)el.teacherExamMulti.addEventListener('change',()=>{captureTeacherExamSelection();if(currentTeacherSession())loadTeacherStats();});
  [el.teacherSortSelect,el.teacherChartSelect,el.teacherCompareBy,el.teacherClassMulti].forEach(node=>node&&node.addEventListener('change',()=>{if(currentTeacherSession())loadTeacherStats();}));
  [el.teacherExamClassFilter,el.teacherExamSort].forEach(node=>node&&node.addEventListener('change',renderTeacherExamOptions));
  if(el.multiExportModeInput)el.multiExportModeInput.addEventListener('change',()=>{if(el.multiExportPanel)el.multiExportPanel.hidden=!el.multiExportModeInput.checked;updateMultiExportCount();if(!el.multiExportModeInput.checked)el.saveSettingsBtnExport.textContent=settings.assignmentId?'Cập nhật đề và tải file học sinh':'Tải file học sinh';});
  if(el.multiExportList)el.multiExportList.addEventListener('change',updateMultiExportCount);
  if(el.multiExportSelectAll)el.multiExportSelectAll.addEventListener('change',()=>{if(el.multiExportList)el.multiExportList.querySelectorAll('.multi-export-project-check').forEach(box=>box.checked=el.multiExportSelectAll.checked);updateMultiExportCount();});
  el.saveSettingsBtnExport.addEventListener('click',saveExportSettings);
  if(el.exportProjectJsonBtn)el.exportProjectJsonBtn.addEventListener('click',downloadProjectJson);
  if(el.publishExamLinkBtn)el.publishExamLinkBtn.addEventListener('click',()=>saveExportSettings('online'));
  if(el.examLockModeInput)el.examLockModeInput.addEventListener('change',syncLockScheduleUI);
  if(el.updateExamAccessBtn)el.updateExamAccessBtn.addEventListener('click',updateExamAccessOnly);
  el.themeSelect.addEventListener('change',()=>{applyTheme(el.themeSelect.value);savePrefs();});
  el.settingsSoundBtn.addEventListener('click',async()=>{soundOn=!soundOn;soundLabel();await savePrefs();});
  el.logoutSettingsBtn.addEventListener('click',logout);
  el.showExplanationsToggle.addEventListener('change',()=>{if(!el.showExplanationsToggle.checked)toast(t('quiz.explanationHidden'));});
  el.authBtn.addEventListener('click',async()=>{const raw=await store.getItem(SKEY).catch(()=>null);
    if(raw)logout();else{el.authForm.reset();authModeSet('login');el.authModal.hidden=false;el.authEmail.focus();}});
  el.closeAuthBtn.addEventListener('click',()=>{if(window.quizCraftSession)el.authModal.hidden=true;});
  el.authModal.addEventListener('click',e=>{if(e.target.dataset.closeAuth!==undefined&&window.quizCraftSession)el.authModal.hidden=true;});
  el.authSwitch.addEventListener('click',()=>authModeSet(authMode==='register'?'login':'register'));
  el.sendOtpBtn.addEventListener('click',sendAuthOtp);
  if(el.forgotPasswordBtn)el.forgotPasswordBtn.addEventListener('click',()=>authModeSet('forgot'));
  el.authEmail.addEventListener('input',()=>{try{localStorage.setItem(AUTH_EMAIL_KEY,el.authEmail.value.trim().toLowerCase());}catch(e){}});
  el.authForm.addEventListener('submit',authSubmit);
  [el.quizTitle,el.quizDescription].forEach(node=>node.addEventListener('blur',async()=>{
    const key=node.dataset.editable;meta[key]=node.textContent.trim()||meta[key];node.textContent=meta[key];
    if(key==='title')projectName=meta.title;
    await savePrefs();await save();if(key==='title')renderProjects();toast(t('hero.saved'));
  }));
  function resolveEditorImageTarget(node){
    if(!node)return null;
    const tfRow=node.closest?.('.tf-row');if(tfRow)return tfRow;
    const optionRow=node.closest?.('.option-row');if(optionRow)return optionRow;
    if(node===el.questionText||node===el.questionMediaFile||node.closest?.('.question-media-dropzone')||node===el.questionMediaPreview||node===el.questionMediaListPreview||node.closest?.('#questionMediaListPreview'))return el.questionText;
    return null;
  }
  async function attachEditorFiles(files,target){
    const tfRow=target?.closest?.('.tf-row');
    if(tfRow){
      const imageFiles=Array.from(files||[]).filter(f=>mediaType(f)==='image');if(!imageFiles.length)return;
      const input=tfRow.querySelector('.tf-st-media');if(!input)return;
      const items=readMediaList(input);let added=0;
      for(const file of imageFiles){try{items.push({type:'image',url:await fileData(file)});added++;}catch(error){toast(t('media.fileFailed'));}}
      if(added){if(typeof input._updateMedia==='function')input._updateMedia(items);else{writeMediaList(input,items);scheduleDraftSave();}toast('Đã dán '+added+' ảnh vào phát biểu '+(tfRow.querySelector('.option-letter')?.textContent||'')+'.');}
      return;
    }
    const row=target?.closest?.('.option-row');
    if(row){
      const imageFiles=Array.from(files||[]).filter(f=>mediaType(f)==='image');if(!imageFiles.length)return;
      try{const file=imageFiles[0],url=await fileData(file),input=row.querySelector('.option-media-file'),img=row.querySelector('.option-upload-preview'),remove=row.querySelector('.remove-image');if(!input)return;input.value='';input.dataset.mediaUrl=url;preview(img,url,remove);syncCorrect();scheduleDraftSave();toast('Đã thêm ảnh vào đáp án '+(row.querySelector('.option-letter')?.textContent||'')+'.');}catch(error){toast(t('media.fileFailed'));}return;
    }
    const list=questionMediaList();let added=0;
    for(const file of Array.from(files||[])){
      const type=mediaType(file);if(type==='none')continue;
      try{list.push({type,url:await fileData(file)});added++;}catch(error){toast(t('media.fileFailed'));}
    }
    if(!added)return;
    writeMediaList(el.questionMediaFile,list);el.questionMediaFile.dataset.mediaUrl=list[0]?.url||'';
    preview(el.questionMediaPreview,list[0]?.type==='image'?list[0]?.url||'':'',el.clearQuestionMediaBtn);
    renderQuestionMediaPreview();scheduleDraftSave();toast('Đã thêm '+added+' tệp vào câu hỏi.');
  }
  document.addEventListener('paste',async e=>{
    if(!el.editorView||el.editorView.hidden)return;
    const clipboard=e.clipboardData;if(!clipboard)return;
    const target=resolveEditorImageTarget(e.target)||resolveEditorImageTarget(document.activeElement);if(!target)return;
    const files=[];
    const addFile=file=>{if(file&&mediaType(file)!=='none')files.push(file);};
    for(const item of Array.from(clipboard.items||[])){
      if(item.kind==='file'||/^(image|video|audio)\//i.test(item.type||'')){
        try{addFile(item.getAsFile?.());}catch(error){}
      }
    }
    // Một số trình duyệt chỉ đưa tệp vào clipboard.files thay vì clipboard.items.
    if(!files.length)for(const file of Array.from(clipboard.files||[]))addFile(file);
    if(!files.length)return;
    e.preventDefault();await attachEditorFiles(files,target);
  },true);
  document.addEventListener('dragover',e=>{
    if(!el.editorView||el.editorView.hidden)return;const target=resolveEditorImageTarget(e.target);
    if(target){e.preventDefault();target.classList.add('is-dragging');}
  });
  document.addEventListener('dragleave',e=>{const target=resolveEditorImageTarget(e.target);if(target)target.classList.remove('is-dragging');});
  document.addEventListener('drop',e=>{
    if(!el.editorView||el.editorView.hidden)return;const target=resolveEditorImageTarget(e.target);
    if(target){target.classList.remove('is-dragging');const files=Array.from(e.dataTransfer?.files||[]).filter(f=>mediaType(f)!=='none');if(files.length){e.preventDefault();attachEditorFiles(files,target);}}
  });
}

async function boot(){
  cache();events();qcInstallNoticeHandlers();await loadPrefs();await load();applyMeta();await loadSession();loadTeacherIntegrationState();
  setupEditorLayoutRefinements();setupQuestionAnalyticsActions();
  // Mở rộng bộ câu hỏi ngay khi người dùng thay đổi phân loại / bộ lọc,
  // để các câu hỏi khớp với lựa chọn không bị ẩn trong chế độ thu gọn.
  const handleBankFilterChange=()=>{
    const bank=document.querySelector('.bank-panel');
    const collapseButton=document.getElementById('bankCollapseBtn');
    if(bank?.classList.contains('is-collapsed')){
      bank.classList.remove('is-collapsed');
      if(collapseButton){
        collapseButton.textContent='Thu gọn';
        collapseButton.setAttribute('aria-expanded','true');
      }
    }
    [...(el.questionList?.children||[])].forEach(node=>node.classList.remove('is-recent-visible'));
    renderBank();
  };
  ['bankGroupMode','bankLevelFilter','bankTypeFilter','bankSort'].forEach(id=>document.getElementById(id)?.addEventListener('change',handleBankFilterChange));
  renderBank();resetForm();await restoreDraft();authModeSet('login');soundLabel();initGoogleTeacherAuth();
  if(!window.quizCraftSession){el.authModal.hidden=false;el.closeAuthBtn.hidden=true;}else{el.authModal.hidden=true;el.closeAuthBtn.hidden=false;}
  window.addEventListener('beforeunload',()=>{flushEditorAutosave();if(editorDirty)persistDraft();if(!el.quizView.hidden)saveProgress();});
  window.addEventListener('pagehide',()=>{flushEditorAutosave();if(editorDirty)persistDraft();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){flushEditorAutosave();if(editorDirty)persistDraft();if(!el.quizView.hidden)saveProgress();}});
}
document.addEventListener('DOMContentLoaded',()=>boot().catch(()=>toast(t('errors.loadFailed'))));
