/**
 * QUIZ CRAFT - GOOGLE SHEETS DATABASE + JSONP API + OTP AUTH
 * Full replacement for the supplied v3.1.3 Code.gs.
 *
 * INSTALL
 * 1) Open the target Google Sheet > Extensions > Apps Script.
 * 2) Replace the old Code.gs content with this complete file.
 * 3) Save, run setupDatabase() once, and approve permissions.
 *    setupDatabase() creates/checks the 10 data groups and installs the OTP_001
 *    cleanup trigger (one-minute scan; rows are removed at age >= 10 minutes).
 * 4) Run authorizeOtpEmail() once and approve the Mail permission.
 * 5) Optional: run initializeAdminKey() only for admin-only maintenance APIs.
 * 6) Deploy as Web App: Execute as Me; access Anyone (or the intended audience).
 * 7) Keep the /exec URL in the Quiz Craft source configuration. Never put the
 *    admin key in public browser code.
 *
 * AUTH
 * - Email OTP: 6 digits, 5-minute validity, 60-second resend cooldown,
 *   maximum 5 wrong attempts, maximum 5 messages/hour/email.
 * - Roles: GIAOVIEN and HOCSINH.
 * - Session tokens are returned once; only SHA-256 hashes are stored.
 * - OTP endpoints support JSONP GET for standalone HTML files.
 *
 * SECURITY
 * - Student score values remain CLIENT_REPORTED for compatibility with the
 *   exported exam HTML. They are not tamper-proof until server-side grading
 *   and answer-key storage are implemented.
 * - GET/JSONP query values can appear in browser/network logs. Use HTTPS.
 *
 * CHANGES IN THIS VERSION
 * - OTP email sender display name is "Quiz Craft" and signature is "@hovsu2009".
 * - deleteProject removes only DeThi records owned by the authenticated teacher
 *   and matching the specified ProjectKey (or the exact legacy ExamID fallback).
 * - deleteProject does not delete LichSu, student rows, accounts, or other projects.
 * - Only OTP_001 data rows older than 10 minutes are deleted. The tab/header and
 *   OTP_002+ tabs are not touched by this cleanup function.
 */

const QC = {
  SPREADSHEET_PROPERTY: 'QUIZ_CRAFT_SPREADSHEET_ID',
  ADMIN_KEY_PROPERTY: 'QUIZ_CRAFT_ADMIN_KEY',
  HEADER_ROW: 1,
  FIRST_DATA_ROW: 2,
  MAX_DATA_ROWS_PER_TAB: 20000,
  MAX_AUDIT_LOG_ROWS: 5000,
  ROW_GROWTH_STEP: 1000,
  LOCK_TIMEOUT_MS: 30000,
  OTP_TTL_MS: 5 * 60 * 1000,
  OTP_RESEND_SECONDS: 60,
  OTP_MAX_PER_HOUR: 5,
  OTP_MAX_ATTEMPTS: 5,
  OTP_001_DELETE_AFTER_MS: 10 * 60 * 1000,
  SESSION_IDLE_MS: 30 * 24 * 60 * 60 * 1000,
  VERSION: '3.1.4',
  GROUPS: {
    GiaoVien: {
      prefix: 'GiaoVien', color: '#4285F4',
      headers: ['IDGV','TenGV','SoDe','Email','UUIDTaiKhoan','NgayTao','TrangThai'],
      required: ['IDGV'], uniqueKeys: [['IDGV'], ['Email']], numberFields: ['SoDe']
    },
    DeThi: {
      prefix: 'DeThi', color: '#8E7CC3',
      headers: ['IDDe','SoLanLam','IDGV','MaLop','NgayTao','TrangThai','TenDe','SoCau','DiemToiDa','EmailRequired','AntiCopy','AntiScreenshot','KhoaDen','CheDoTruyCap','UpdatedAt','ProjectKey'],
      required: ['IDDe','IDGV'], uniqueKeys: [['IDDe']], numberFields: ['SoLanLam','SoCau','DiemToiDa']
    },
    HocSinh: {
      prefix: 'HocSinh', color: '#0F9D58',
      headers: ['IDHS','TenHocSinh','SoLanLam','Email','MaLop','NgayTao','IDGV','LastActiveAt','RetentionMode','RetainUntil'],
      required: ['IDHS','TenHocSinh'], uniqueKeys: [['IDHS']], numberFields: ['SoLanLam']
    },
    LichSu: {
      prefix: 'LichSu', color: '#F1C232',
      headers: ['IDLuotLam','IDGV','IDDe','IDHS','TenHocSinh','MaLop','Diem','DuLieuBaiLamJSON','ThoiGianBatDau','ThoiGianNop','TrangThai','DiemToiDa','ThoiLuongGiay','NguonDiem','EmailHS','GuestID','RetentionMode','RetainUntil'],
      required: ['IDLuotLam','IDGV','IDDe','IDHS','TenHocSinh','MaLop','Diem','ThoiGianNop'],
      uniqueKeys: [['IDLuotLam']], numberFields: ['Diem','DiemToiDa','ThoiLuongGiay']
    },
    PhienDeThi: {
      prefix: 'PhienDeThi', color: '#CC0000',
      headers: ['TokenHash','IDGV','IDDe','IDHS','MaLop','CreatedAt','LastActiveAt','Status'],
      required: ['TokenHash','IDGV','IDDe','CreatedAt','Status'], uniqueKeys: [['TokenHash']]
    },
    LopHoc: {
      prefix: 'LopHoc', color: '#46BDC6',
      headers: ['MaLop','IDGV','TenLop','NgayTao','TrangThai'],
      required: ['MaLop','IDGV'], uniqueKeys: [['IDGV','MaLop']]
    },
    NhatKy: {
      prefix: 'NhatKy', color: '#999999',
      headers: ['IDLog','ThoiGian','IDNguoiDung','VaiTro','HanhDong','LoaiDuLieu','IDBanGhi','KetQua','ChiTiet'],
      required: ['IDLog','ThoiGian','HanhDong','KetQua'], uniqueKeys: [['IDLog']]
    },
    TaiKhoan: {
      prefix: 'TaiKhoan', color: '#E69138',
      // New fields remain appended after the original v2 columns.
      headers: ['UUID','Gmail','Ho','Ten','Nickname','PasswordHash','PasswordSalt','CreatedAt','LastLoginAt','Status','DeletionRequestedAt','DeletionDeadlineAt','DeletionStatus','InactiveSinceAt','Reminder2hSentAt','Reminder1hSentAt','Reminder5mSentAt','DeletedAt','VaiTro','GuestID','IDGV'],
      required: ['UUID','Gmail','CreatedAt','Status','VaiTro'], uniqueKeys: [['UUID'],['Gmail']]
    },
    PhienDangNhap: {
      prefix: 'PhienDangNhap', color: '#CC0000',
      headers: ['SessionID','UUID','TokenHash','CreatedAt','LastHeartbeatAt','Status','EndedAt','EndReason','GuestID','VaiTro'],
      required: ['SessionID','UUID','TokenHash','CreatedAt','Status'], uniqueKeys: [['SessionID']]
    },
    OTP: {
      prefix: 'OTP', color: '#A4C2F4',
      headers: ['OTPID','Gmail','VaiTro','Purpose','OTPHash','Salt','GuestID','TenHienThi','CreatedAt','ExpiresAt','Attempts','MaxAttempts','Status','LastSentAt'],
      required: ['OTPID','Gmail','VaiTro','Purpose','OTPHash','Salt','CreatedAt','ExpiresAt','Status'],
      uniqueKeys: [['OTPID']], numberFields: ['Attempts','MaxAttempts']
    }
  }
};

/* ----------------------------- SETUP / ADMIN ----------------------------- */
function setupDatabase() {
  const lock = LockService.getScriptLock();
  lock.waitLock(QC.LOCK_TIMEOUT_MS);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('Hãy mở Apps Script từ file Google Sheets đích.');
    PropertiesService.getScriptProperties().setProperty(QC.SPREADSHEET_PROPERTY, ss.getId());
    const created = [], existing = [], upgraded = [];
    Object.keys(QC.GROUPS).forEach(function (key) {
      const group = QC.GROUPS[key], name = _qcSheetName_(group.prefix, 1);
      const existed = !!ss.getSheetByName(name);
      const before = existed ? ss.getSheetByName(name).getLastColumn() : 0;
      _qcEnsureGroupSheet_(ss, key, 1);
      if (!existed) created.push(name); else existing.push(name);
      if (existed && before < group.headers.length) upgraded.push(name);
      _qcGetGroupSheets_(ss, group).forEach(function (sh) { _qcEnsureCompatibleHeader_(sh, group); });
    });

    // Install/update only the OTP_001 cleanup trigger. Other triggers are preserved.
    installOtp001CleanupTrigger();

    const report = {
      ok:true,
      spreadsheet:ss.getName(),
      groups:Object.keys(QC.GROUPS).length,
      created:created,
      existing:existing,
      upgraded:upgraded,
      otpCleanup:{sheet:'OTP_001',ageMinutes:10,scanEveryMinutes:1},
      maxDataRowsPerTab:QC.MAX_DATA_ROWS_PER_TAB
    };
    Logger.log(JSON.stringify(report, null, 2));
    ss.toast('Đã khởi tạo/kiểm tra 10 nhóm tab và bật dọn OTP_001.', 'Quiz Craft', 8);
    return report;
  } finally {
    lock.releaseLock();
  }
}

function authorizeOtpEmail() {
  const quota = MailApp.getRemainingDailyQuota();
  Logger.log('Gmail OTP permission is ready. Remaining recipient quota: ' + quota);
  return quota;
}

function initializeAdminKey() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty(QC.ADMIN_KEY_PROPERTY);
  if (!key) {
    key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty(QC.ADMIN_KEY_PROPERTY, key);
  }
  Logger.log('QUIZ_CRAFT_ADMIN_KEY=' + key);
  SpreadsheetApp.getActiveSpreadsheet()?.toast('Khóa quản trị đã có. Không dán khóa này vào trang web công khai.', 'Quiz Craft', 8);
  return key;
}

function rotateAdminKey() {
  const key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(QC.ADMIN_KEY_PROPERTY, key);
  Logger.log('QUIZ_CRAFT_ADMIN_KEY=' + key);
  return key;
}

function checkDatabase() {
  const ss = _qcSpreadsheet_();
  const report = Object.keys(QC.GROUPS).map(function (key) {
    const group = QC.GROUPS[key], tabs = _qcGetGroupSheets_(ss, group);
    let rows = 0;
    tabs.forEach(function (sh) {
      _qcEnsureCompatibleHeader_(sh, group);
      rows += Math.max(0, sh.getLastRow() - QC.HEADER_ROW);
    });
    return {group:key,tabs:tabs.length,dataRows:rows,latestTab:tabs.length ? tabs[tabs.length-1].getName() : ''};
  });
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/* ----------------------------- HTTP API ----------------------------- */
function doGet(e) {
  const p = (e && e.parameter) || {};
  const callback = String(p.callback || '');
  let result;
  try {
    const action = String(p.action || 'health').trim();
    // Email clients cannot run clipboard JavaScript; this temporary page can.
    if (action === 'copyOtp') return _qcOtpCopyPage_(p.token);
    if (action === 'health') result = {ok:true,version:QC.VERSION,service:'Quiz Craft API'};
    else if (action === 'requestOtp') result = _qcRequestOtp_(p);
    else if (action === 'login') result = _qcLoginWithPassword_(p);
    else if (action === 'verifyOtp') result = _qcVerifyOtp_(p);
    else if (action === 'session') result = _qcGetSession_(p);
    else if (action === 'logout') result = _qcLogout_(p);
    else if (action === 'save') result = _qcSaveStudentResult_(p);
    else if (action === 'list') result = _qcGetStudentLeaderboard_(p);
    else if (action === 'examAccess') result = _qcCheckExamAccess_(p);
    else if (action === 'ensureTeacher') {
      if (!_qcIsAdmin_(p.adminKey)) throw new Error('UNAUTHORIZED: Khóa quản trị không đúng.');
      result = _qcEnsureTeacher_(p);
    } else if (action === 'registerExam') {
      _qcRequireTeacherOrAdmin_(p);
      result = _qcRegisterExam_(p);
    } else if (action === 'catalog') {
      _qcRequireTeacherOrAdmin_(p);
      result = _qcGetCatalog_(p);
    } else if (action === 'stats') {
      _qcRequireTeacherOrAdmin_(p);
      result = _qcGetTeacherStats_(p);
    } else if (action === 'deleteProject') {
      result = _qcDeleteProject_(p);
    } else if (action === 'check') {
      if (!_qcIsAdmin_(p.adminKey)) throw new Error('UNAUTHORIZED');
      result = {ok:true,database:checkDatabase()};
    } else {
      throw new Error('Hành động không được hỗ trợ: ' + action);
    }
  } catch (err) {
    result = {ok:false,error:String(err && err.message ? err.message : err)};
  }
  return _qcOutput_(result, callback);
}

function doPost(e) {
  let result;
  try {
    const body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const action = String(body.action || '');
    if (action === 'save') result = _qcSaveStudentResult_(body);
    else if (action === 'requestOtp') result = _qcRequestOtp_(body);
    else if (action === 'login') result = _qcLoginWithPassword_(body);
    else if (action === 'verifyOtp') result = _qcVerifyOtp_(body);
    else if (action === 'session') result = _qcGetSession_(body);
    else if (action === 'logout') result = _qcLogout_(body);
    else if (action === 'examAccess') result = _qcCheckExamAccess_(body);
    else if (action === 'registerExam') {
      _qcRequireTeacherOrAdmin_(body);
      result = _qcRegisterExam_(body);
    } else if (action === 'catalog') {
      _qcRequireTeacherOrAdmin_(body);
      result = _qcGetCatalog_(body);
    } else if (action === 'stats') {
      _qcRequireTeacherOrAdmin_(body);
      result = _qcGetTeacherStats_(body);
    } else if (action === 'deleteProject') {
      result = _qcDeleteProject_(body);
    } else {
      throw new Error('Hành động không được hỗ trợ.');
    }
  } catch (err) {
    result = {ok:false,error:String(err && err.message ? err.message : err)};
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

/* ----------------------------- OTP + ACCOUNT AUTH ----------------------------- */
function _qcRequestOtp_(p) {
  const email = _qcEmail_(p.email || p.Gmail);
  const purpose = String(p.purpose || 'register').toLowerCase();
  if (purpose !== 'register' && purpose !== 'reset_password') {
    throw new Error('Loại xác thực OTP không hợp lệ.');
  }

  const existing = _qcAccountByEmail_(email);
  let role;
  if (purpose === 'register') {
    role = _qcRole_(p.role || p.VaiTro);
    if (existing) throw new Error('Email này đã có tài khoản. Hãy chuyển sang đăng nhập.');
  } else {
    if (!existing) throw new Error('Email chưa có tài khoản để khôi phục mật khẩu.');
    if (String(existing.Status).toUpperCase() !== 'ACTIVE') throw new Error('Tài khoản hiện không hoạt động.');
    role = String(existing.VaiTro);
  }

  const guestId = _qcGuestId_(p.guestId || p.GuestID);
  const displayName = _qcClean_(p.displayName || p.name || '', 100, 'Tên hiển thị', true);
  if (purpose === 'register' && !displayName) throw new Error('Hãy nhập tên hiển thị trước khi đăng ký.');

  const cache = CacheService.getScriptCache();
  const rateKey = 'qc_otp_' + _qcHash_(email + '|' + purpose).slice(0, 32);
  const hourlyKey = 'qc_otph_' + _qcHash_(email).slice(0, 32);
  let otp = '';
  while (otp.length < 6) otp += Utilities.getUuid().replace(/[^0-9]/g, '');
  otp = otp.slice(0, 6);

  const otpId = _qcId_('OTP');
  const salt = Utilities.getUuid().replace(/-/g, '');
  const now = new Date();
  const record = {
    OTPID:otpId,Gmail:email,VaiTro:role,Purpose:purpose,
    OTPHash:_qcHash_(otp + '|' + salt + '|' + otpId),Salt:salt,
    GuestID:guestId,TenHienThi:displayName,CreatedAt:now,
    ExpiresAt:new Date(now.getTime() + QC.OTP_TTL_MS),
    Attempts:0,MaxAttempts:QC.OTP_MAX_ATTEMPTS,Status:'PENDING',LastSentAt:now
  };

  const lock = LockService.getScriptLock();
  lock.waitLock(QC.LOCK_TIMEOUT_MS);
  try {
    if (cache.get(rateKey)) throw new Error('Mã vừa được gửi. Hãy đợi 60 giây rồi thử lại.');
    const hourlyCount = Number(cache.get(hourlyKey) || 0);
    if (hourlyCount >= QC.OTP_MAX_PER_HOUR) throw new Error('Đã vượt giới hạn gửi OTP trong giờ này. Hãy thử lại sau.');
    const ss = _qcSpreadsheet_();
    _qcFindRows_(ss, 'OTP', function (r) {
      return String(r.Gmail).toLowerCase() === email && r.Purpose === purpose && r.Status === 'PENDING';
    }).forEach(function (x) {
      x.values.Status = 'SUPERSEDED';
      _qcUpdateRow_(x.sheet, x.row, 'OTP', x.values);
    });
    _qcAppendUnlocked_(ss, 'OTP', record);
    cache.put(rateKey, '1', QC.OTP_RESEND_SECONDS);
    cache.put(hourlyKey, String(hourlyCount + 1), 3600);
  } finally {
    lock.releaseLock();
  }

  try {
    const copyToken = Utilities.getUuid().replace(/-/g, '');
    cache.put('qc_otpcopy_' + copyToken, otp, Math.ceil(QC.OTP_TTL_MS / 1000));
    const webAppUrl = ScriptApp.getService().getUrl();
    const copyUrl = webAppUrl ? webAppUrl + '?action=copyOtp&token=' + encodeURIComponent(copyToken) : '';
    const subject = purpose === 'register' ? 'Xác minh tạo tài khoản Quiz Craft' : 'Khôi phục mật khẩu Quiz Craft';

    const plainBody = 'Mã xác minh Quiz Craft của bạn là: ' + otp +
      '\n\nMã có hiệu lực trong 5 phút và chỉ sử dụng được một lần.' +
      (copyUrl ? '\nMở trang sao chép mã: ' + copyUrl : '') +
      '\nNếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.' +
      '\n\nQuiz Craft\n@hovsu2009';

    const htmlBody = '<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;color:#172033">' +
      '<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:28px">' +
      '<div style="font-size:13px;font-weight:700;letter-spacing:1px;color:#64748b">QUIZ CRAFT</div>' +
      '<h2 style="margin:12px 0 8px;font-size:22px">' + (purpose === 'register' ? 'Xác minh tài khoản' : 'Khôi phục mật khẩu') + '</h2>' +
      '<p style="margin:0 0 18px;color:#475569">Sử dụng mã bên dưới để tiếp tục.</p>' +
      '<div style="padding:18px 12px;border-radius:12px;background:#f1f5f9;text-align:center;font-size:32px;font-weight:800;letter-spacing:8px;color:#0f172a">' + otp + '</div>' +
      (copyUrl ? '<div style="text-align:center;margin:22px 0 10px"><a href="' + _qcHtmlEscape_(copyUrl) + '" style="display:inline-block;padding:13px 22px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700">Sao chép mã OTP</a></div>' : '') +
      '<p style="font-size:13px;line-height:1.6;color:#64748b">Mã có hiệu lực trong 5 phút và chỉ dùng được một lần. Nút trên sẽ mở trang an toàn có nút sao chép mã.</p>' +
      '<p style="font-size:12px;color:#94a3b8">Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.</p>' +
      '<div style="margin-top:20px;padding-top:14px;border-top:1px solid #e5e7eb;text-align:center">' +
      '<strong style="font-size:14px;color:#243b35">Quiz Craft</strong>' +
      '<div style="margin-top:4px;font-size:12px;color:#64748b">@hovsu2009</div>' +
      '</div></div></body></html>';

    // Display name in the recipient's inbox is Quiz Craft.
    MailApp.sendEmail({to:email,subject:subject,name:'Quiz Craft',body:plainBody,htmlBody:htmlBody});
  } catch (mailError) {
    _qcSetOtpStatus_(otpId, 'SEND_FAILED');
    throw new Error('Không gửi được email OTP. Hãy kiểm tra quyền Gmail của Apps Script.');
  }

  return {
    ok:true,otpId:otpId,expiresIn:QC.OTP_TTL_MS / 1000,
    resendAfter:QC.OTP_RESEND_SECONDS,message:'Đã gửi mã xác minh đến email.'
  };
}

function _qcVerifyOtp_(p) {
  const email = _qcEmail_(p.email || p.Gmail);
  const purpose = String(p.purpose || 'register').toLowerCase();
  const otpId = _qcClean_(p.otpId || '', 100, 'Mã yêu cầu OTP');
  const otp = String(p.otp || '').replace(/\s/g, '');
  const guestId = _qcGuestId_(p.guestId || p.GuestID);
  if (purpose !== 'register' && purpose !== 'reset_password') throw new Error('Loại xác thực OTP không hợp lệ.');
  if (!/^\d{6}$/.test(otp)) throw new Error('Mã OTP phải gồm đúng 6 chữ số.');
  const password = String(p.password || p.newPassword || '');
  if (password.length < 8 || password.length > 128) throw new Error('Mật khẩu phải có từ 8 đến 128 ký tự.');

  const lock = LockService.getScriptLock();
  lock.waitLock(QC.LOCK_TIMEOUT_MS);
  try {
    const ss = _qcSpreadsheet_();
    const found = _qcFindRows_(ss, 'OTP', function (r) { return String(r.OTPID) === otpId; })[0];
    if (!found) throw new Error('Không tìm thấy yêu cầu OTP. Hãy gửi mã mới.');
    const row = found.values;
    if (String(row.Gmail).toLowerCase() !== email || row.Purpose !== purpose || row.GuestID !== guestId) {
      throw new Error('Thông tin xác minh không khớp. Hãy gửi mã mới.');
    }
    if (row.Status !== 'PENDING') throw new Error('Mã OTP đã được sử dụng hoặc không còn hiệu lực.');
    if (_qcDateNum_(row.ExpiresAt) < Date.now()) {
      row.Status = 'EXPIRED';
      _qcUpdateRow_(found.sheet, found.row, 'OTP', row);
      throw new Error('Mã OTP đã hết hạn. Hãy gửi mã mới.');
    }
    if (Number(row.Attempts || 0) >= QC.OTP_MAX_ATTEMPTS) {
      row.Status = 'LOCKED';
      _qcUpdateRow_(found.sheet, found.row, 'OTP', row);
      throw new Error('Bạn đã nhập sai quá số lần cho phép. Hãy gửi mã mới.');
    }
    if (_qcHash_(otp + '|' + row.Salt + '|' + otpId) !== row.OTPHash) {
      row.Attempts = Number(row.Attempts || 0) + 1;
      if (row.Attempts >= QC.OTP_MAX_ATTEMPTS) row.Status = 'LOCKED';
      _qcUpdateRow_(found.sheet, found.row, 'OTP', row);
      throw new Error('Mã OTP không đúng. Còn ' + Math.max(0, QC.OTP_MAX_ATTEMPTS - row.Attempts) + ' lần thử.');
    }

    row.Status = 'VERIFIED';
    _qcUpdateRow_(found.sheet, found.row, 'OTP', row);
    let account = _qcAccountByEmail_(email);

    if (purpose === 'register') {
      if (account) throw new Error('Email đã được đăng ký trong lúc bạn xác minh. Hãy đăng nhập.');
      account = _qcCreateAccount_(ss, email, String(row.VaiTro), row.TenHienThi, guestId, password);
    } else {
      if (!account) throw new Error('Không tìm thấy tài khoản. Hãy đăng ký trước.');
      if (String(account.Status).toUpperCase() !== 'ACTIVE') throw new Error('Tài khoản hiện không hoạt động.');
      const salt = Utilities.getUuid().replace(/-/g, '');
      account.PasswordSalt = salt;
      account.PasswordHash = _qcPasswordHash_(password, salt);
      account.LastLoginAt = new Date();
      const accountRow = _qcFindRows_(ss, 'TaiKhoan', function (r) { return String(r.UUID) === String(account.UUID); })[0];
      if (accountRow) _qcUpdateRow_(accountRow.sheet, accountRow.row, 'TaiKhoan', account);
      _qcLogUnlocked_(ss, {IDNguoiDung:account.UUID,VaiTro:account.VaiTro,HanhDong:'RESET_PASSWORD',LoaiDuLieu:'TaiKhoan',IDBanGhi:account.UUID,KetQua:'OK'});
      return {ok:true,passwordReset:true,message:'Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới.'};
    }

    account.GuestID = guestId;
    account.LastLoginAt = new Date();
    const accountRow = _qcFindRows_(ss, 'TaiKhoan', function (r) { return String(r.UUID) === String(account.UUID); })[0];
    if (accountRow) _qcUpdateRow_(accountRow.sheet, accountRow.row, 'TaiKhoan', account);
    let teacherId = String(account.IDGV || '');
    if (account.VaiTro === 'GIAOVIEN') teacherId = _qcEnsureTeacherAccountRow_(ss, account);
    if (account.VaiTro === 'HOCSINH') _qcEnsureStudentAccountRow_(ss, account);
    const session = _qcCreateSession_(ss, account, guestId);
    _qcLogUnlocked_(ss, {IDNguoiDung:account.UUID,VaiTro:account.VaiTro,HanhDong:'REGISTER_ACCOUNT',LoaiDuLieu:'TaiKhoan',IDBanGhi:account.UUID,KetQua:'OK'});
    return {
      ok:true,sessionToken:session.token,
      session:{sessionId:session.sessionId,uuid:account.UUID,email:email,name:_qcAccountName_(account),role:account.VaiTro,teacherId:teacherId,guestId:guestId}
    };
  } finally {
    lock.releaseLock();
  }
}

function _qcCreateAccount_(ss, email, role, displayName, guestId, password) {
  const parts = _qcSplitName_(displayName);
  const uuid = role === 'HOCSINH' ? _qcCreateStudentAccountId_(displayName, guestId) : _qcId_('USR');
  const salt = Utilities.getUuid().replace(/-/g, '');
  const account = {
    UUID:uuid,Gmail:email,Ho:parts.first,Ten:parts.last,Nickname:'',
    PasswordHash:_qcPasswordHash_(password, salt),PasswordSalt:salt,
    CreatedAt:new Date(),LastLoginAt:new Date(),Status:'ACTIVE',
    DeletionRequestedAt:'',DeletionDeadlineAt:'',DeletionStatus:'',InactiveSinceAt:'',
    Reminder2hSentAt:'',Reminder1hSentAt:'',Reminder5mSentAt:'',DeletedAt:'',
    VaiTro:role,GuestID:guestId,IDGV:''
  };
  _qcAppendUnlocked_(ss, 'TaiKhoan', account);
  if (role === 'GIAOVIEN') account.IDGV = _qcEnsureTeacherAccountRow_(ss, account);
  else _qcEnsureStudentAccountRow_(ss, account);
  const saved = _qcFindRows_(ss, 'TaiKhoan', function (r) { return String(r.UUID) === uuid; })[0];
  if (saved) _qcUpdateRow_(saved.sheet, saved.row, 'TaiKhoan', account);
  return account;
}

function _qcEnsureTeacherAccountRow_(ss, account) {
  const byUuid = _qcFindRows_(ss, 'GiaoVien', function (r) { return String(r.UUIDTaiKhoan || '') === String(account.UUID); })[0];
  if (byUuid) {
    byUuid.values.TenGV = _qcAccountName_(account);
    byUuid.values.Email = account.Gmail;
    byUuid.values.TrangThai = 'ACTIVE';
    _qcUpdateRow_(byUuid.sheet, byUuid.row, 'GiaoVien', byUuid.values);
    return String(byUuid.values.IDGV);
  }
  // Migrate a legacy teacher row by email without changing its teacher ID/history.
  const byEmail = _qcFindRows_(ss, 'GiaoVien', function (r) {
    return String(r.Email || '').toLowerCase() === String(account.Gmail).toLowerCase() && !String(r.UUIDTaiKhoan || '');
  })[0];
  if (byEmail) {
    byEmail.values.UUIDTaiKhoan = account.UUID;
    byEmail.values.TenGV = _qcAccountName_(account);
    byEmail.values.TrangThai = 'ACTIVE';
    _qcUpdateRow_(byEmail.sheet, byEmail.row, 'GiaoVien', byEmail.values);
    return String(byEmail.values.IDGV);
  }
  const id = _qcId_('GV');
  _qcAppendUnlocked_(ss, 'GiaoVien', {
    IDGV:id,TenGV:_qcAccountName_(account),SoDe:0,Email:account.Gmail,
    UUIDTaiKhoan:account.UUID,NgayTao:new Date(),TrangThai:'ACTIVE'
  });
  return id;
}

function _qcCreateStudentAccountId_(displayName, guestId) {
  const name = String(displayName || 'HS').normalize('NFC').trim().split(/\s+/).filter(Boolean);
  const initials = (name.length > 1 ? name[0].charAt(0) + name[name.length - 1].charAt(0) : (name[0] || 'HS').slice(0, 2)).toLocaleUpperCase();
  const now = new Date(), tz = Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';
  const dd = Utilities.formatDate(now, tz, 'dd');
  const mm = Utilities.formatDate(now, tz, 'MM');
  const yyyy = Utilities.formatDate(now, tz, 'yyyy');
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let suffix = '';
  for (let i = 0; i < 5; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return [initials,'00','00',dd,mm,yyyy,'03',suffix].join('-');
}

function _qcEnsureStudentAccountRow_(ss, account) {
  const found = _qcFindRows_(ss, 'HocSinh', function (r) { return String(r.IDHS) === String(account.UUID); })[0];
  if (found) return;
  _qcAppendUnlocked_(ss, 'HocSinh', {
    IDHS:account.UUID,TenHocSinh:_qcAccountName_(account),SoLanLam:0,
    Email:account.Gmail,MaLop:'',NgayTao:new Date(),IDGV:''
  });
}

function _qcCreateSession_(ss, account, guestId) {
  _qcFindRows_(ss, 'PhienDangNhap', function (r) {
    return String(r.UUID) === String(account.UUID) && String(r.GuestID || '') === guestId && r.Status === 'ACTIVE';
  }).forEach(function (x) {
    x.values.Status = 'ENDED';
    x.values.EndedAt = new Date();
    x.values.EndReason = 'REPLACED';
    _qcUpdateRow_(x.sheet, x.row, 'PhienDangNhap', x.values);
  });
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const sessionId = _qcId_('SES'), now = new Date();
  _qcAppendUnlocked_(ss, 'PhienDangNhap', {
    SessionID:sessionId,UUID:account.UUID,TokenHash:_qcHash_(token),CreatedAt:now,
    LastHeartbeatAt:now,Status:'ACTIVE',EndedAt:'',EndReason:'',GuestID:guestId,VaiTro:account.VaiTro
  });
  return {token:token,sessionId:sessionId};
}

function _qcPasswordHash_(password, salt) {
  const saltText = String(salt);
  const saltBytes = Utilities.newBlob(saltText).getBytes();
  let digest = Utilities.computeHmacSha256Signature(String(password), saltText);
  for (let i = 0; i < 1200; i++) {
    digest = Utilities.computeHmacSha256Signature(digest, saltBytes);
  }
  return Utilities.base64Encode(digest);
}

function _qcLoginWithPassword_(p) {
  const email = _qcEmail_(p.email || p.Gmail);
  const password = String(p.password || '');
  const guestId = _qcGuestId_(p.guestId || p.GuestID);
  if (!password || password.length > 128) throw new Error('Hãy nhập mật khẩu hợp lệ.');
  const ss = _qcSpreadsheet_();
  const account = _qcAccountByEmail_(email);
  if (!account || String(account.Status).toUpperCase() !== 'ACTIVE') throw new Error('Email hoặc mật khẩu không đúng.');
  if (!account.PasswordHash || !account.PasswordSalt) throw new Error('Tài khoản cũ chưa có mật khẩu. Hãy chọn “Quên mật khẩu” để tạo mật khẩu mới.');
  const actual = _qcPasswordHash_(password, String(account.PasswordSalt));
  if (actual !== String(account.PasswordHash)) throw new Error('Email hoặc mật khẩu không đúng.');

  account.GuestID = guestId;
  account.LastLoginAt = new Date();
  const row = _qcFindRows_(ss, 'TaiKhoan', function (r) { return String(r.UUID) === String(account.UUID); })[0];
  if (row) _qcUpdateRow_(row.sheet, row.row, 'TaiKhoan', account);
  let teacherId = String(account.IDGV || '');
  if (account.VaiTro === 'GIAOVIEN') teacherId = _qcEnsureTeacherAccountRow_(ss, account);
  if (account.VaiTro === 'HOCSINH') _qcEnsureStudentAccountRow_(ss, account);
  const session = _qcCreateSession_(ss, account, guestId);
  _qcLogUnlocked_(ss, {IDNguoiDung:account.UUID,VaiTro:account.VaiTro,HanhDong:'LOGIN_PASSWORD',LoaiDuLieu:'TaiKhoan',IDBanGhi:account.UUID,KetQua:'OK'});
  return {
    ok:true,sessionToken:session.token,
    session:{sessionId:session.sessionId,uuid:account.UUID,email:email,name:_qcAccountName_(account),role:account.VaiTro,teacherId:teacherId,guestId:guestId}
  };
}

function _qcGetSession_(p) {
  const session = _qcFindSession_(p.sessionToken || p.token, p.guestId || p.GuestID, true);
  if (!session) return {ok:false,authenticated:false,message:'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'};
  const account = _qcFindRows_(_qcSpreadsheet_(), 'TaiKhoan', function (r) { return String(r.UUID) === String(session.UUID); })[0];
  if (!account || String(account.values.Status).toUpperCase() !== 'ACTIVE') {
    return {ok:false,authenticated:false,message:'Tài khoản không hoạt động.'};
  }
  return {
    ok:true,authenticated:true,
    session:{sessionId:session.SessionID,uuid:account.values.UUID,email:account.values.Gmail,name:_qcAccountName_(account.values),role:account.values.VaiTro,teacherId:account.values.IDGV || _qcTeacherIdByUuid_(account.values.UUID),guestId:session.GuestID}
  };
}

function _qcLogout_(p) {
  const token = String(p.sessionToken || p.token || '');
  if (!token) return {ok:true};
  const hash = _qcHash_(token);
  const guestId = String(p.guestId || p.GuestID || '');
  const lock = LockService.getScriptLock();
  lock.waitLock(QC.LOCK_TIMEOUT_MS);
  try {
    const matches = _qcFindRows_(_qcSpreadsheet_(), 'PhienDangNhap', function (r) {
      return r.TokenHash === hash && r.Status === 'ACTIVE' && (!guestId || r.GuestID === guestId);
    });
    matches.forEach(function (x) {
      x.values.Status = 'ENDED';
      x.values.EndedAt = new Date();
      x.values.EndReason = 'LOGOUT';
      _qcUpdateRow_(x.sheet, x.row, 'PhienDangNhap', x.values);
    });
    return {ok:true};
  } finally {
    lock.releaseLock();
  }
}

function _qcFindSession_(token, guestId, heartbeat) {
  if (!token) return null;
  const hash = _qcHash_(String(token));
  const ss = _qcSpreadsheet_();
  const lock = heartbeat ? LockService.getScriptLock() : null;
  if (lock) lock.waitLock(QC.LOCK_TIMEOUT_MS);
  try {
    const found = _qcFindRows_(ss, 'PhienDangNhap', function (r) {
      return r.TokenHash === hash && r.Status === 'ACTIVE' && (!guestId || r.GuestID === String(guestId));
    })[0];
    if (!found) return null;
    const last = _qcDateNum_(found.values.LastHeartbeatAt || found.values.CreatedAt);
    if (Date.now() - last > QC.SESSION_IDLE_MS) {
      found.values.Status = 'EXPIRED';
      found.values.EndedAt = new Date();
      found.values.EndReason = 'IDLE_TIMEOUT';
      _qcUpdateRow_(found.sheet, found.row, 'PhienDangNhap', found.values);
      return null;
    }
    if (heartbeat) {
      found.values.LastHeartbeatAt = new Date();
      _qcUpdateRow_(found.sheet, found.row, 'PhienDangNhap', found.values);
    }
    return found.values;
  } finally {
    if (lock) lock.releaseLock();
  }
}

function _qcRequireTeacherOrAdmin_(p) {
  if (_qcIsAdmin_(p.adminKey)) return true;
  const session = _qcFindSession_(p.sessionToken || p.token, p.guestId || p.GuestID, true);
  if (!session || session.VaiTro !== 'GIAOVIEN') throw new Error('UNAUTHORIZED: Hãy đăng nhập bằng tài khoản giáo viên.');
  const ownedTeacherId = _qcTeacherIdByUuid_(session.UUID);
  if (!ownedTeacherId || !p.teacherId || ownedTeacherId !== String(p.teacherId)) {
    throw new Error('UNAUTHORIZED: Bạn không có quyền xem đề hoặc thống kê của giáo viên khác.');
  }
  return true;
}

function _qcTeacherIdByUuid_(uuid) {
  const found = _qcFindRows_(_qcSpreadsheet_(), 'GiaoVien', function (r) { return String(r.UUIDTaiKhoan || '') === String(uuid); })[0];
  return found ? String(found.values.IDGV) : '';
}

function _qcAccountByEmail_(email) {
  const found = _qcFindRows_(_qcSpreadsheet_(), 'TaiKhoan', function (r) {
    return String(r.Gmail || '').toLowerCase() === String(email).toLowerCase();
  })[0];
  return found ? found.values : null;
}

function _qcAccountName_(a) {
  return [String(a.Ho || '').trim(), String(a.Ten || '').trim()].filter(Boolean).join(' ') || String(a.Nickname || a.Gmail || 'Người dùng');
}
function _qcSplitName_(name) {
  const p = String(name || '').trim().replace(/\s+/g, ' ').split(' ');
  return {first:p.shift() || '',last:p.join(' ')};
}
function _qcRole_(value) {
  const v = String(value || '').toUpperCase();
  if (v === 'GIAOVIEN' || v === 'TEACHER') return 'GIAOVIEN';
  if (v === 'HOCSINH' || v === 'STUDENT') return 'HOCSINH';
  throw new Error('Loại tài khoản không hợp lệ.');
}
function _qcGuestId_(value) {
  const s = _qcClean_(value, 100, 'Guest ID');
  if (!/^GUEST-[A-Za-z0-9-]{8,90}$/.test(s)) throw new Error('Guest ID không hợp lệ.');
  return s;
}
function _qcSetOtpStatus_(otpId, status) {
  const lock = LockService.getScriptLock();
  lock.waitLock(QC.LOCK_TIMEOUT_MS);
  try {
    const f = _qcFindRows_(_qcSpreadsheet_(), 'OTP', function (r) { return r.OTPID === otpId; })[0];
    if (f) {
      f.values.Status = status;
      _qcUpdateRow_(f.sheet, f.row, 'OTP', f.values);
    }
  } finally {
    lock.releaseLock();
  }
}

function _qcOtpCopyPage_(token) {
  const safeToken = String(token || '');
  if (!/^[a-f0-9]{32}$/i.test(safeToken)) {
    return HtmlService.createHtmlOutput('<!doctype html><html><body style="font-family:Arial;padding:32px;text-align:center"><h2>Liên kết không hợp lệ</h2><p>Hãy quay lại email và mở lại nút sao chép mã.</p></body></html>').setTitle('Quiz Craft');
  }
  const otp = CacheService.getScriptCache().get('qc_otpcopy_' + safeToken);
  if (!otp) {
    return HtmlService.createHtmlOutput('<!doctype html><html><body style="font-family:Arial;padding:32px;text-align:center"><h2>Mã sao chép đã hết hạn</h2><p>Mã OTP chỉ có hiệu lực trong 5 phút. Hãy quay lại Quiz Craft để gửi mã mới.</p></body></html>').setTitle('Quiz Craft');
  }
  const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>Sao chép mã OTP</title>' +
    '<style>body{margin:0;padding:24px;background:#f1f5f9;font-family:Arial,sans-serif;color:#172033}.card{max-width:420px;margin:8vh auto;background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:28px;text-align:center;box-shadow:0 12px 36px rgba(15,23,42,.08)}.code{font-size:34px;font-weight:800;letter-spacing:8px;background:#f1f5f9;padding:18px 10px;border-radius:12px;margin:20px 0}.btn{border:0;border-radius:10px;background:#2563eb;color:#fff;font-size:16px;font-weight:700;padding:14px 22px;cursor:pointer}.hint{font-size:13px;color:#64748b;line-height:1.6}</style></head><body>' +
    '<main class="card"><div style="font-weight:700;letter-spacing:1px;color:#64748b">QUIZ CRAFT</div><h2>Mã xác minh của bạn</h2><div id="otp" class="code">' + otp + '</div>' +
    '<button id="copyBtn" class="btn" type="button">Sao chép mã</button><p id="status" class="hint" aria-live="polite">Mã chỉ có hiệu lực trong 5 phút và sử dụng một lần.</p></main>' +
    '<script>(function(){var btn=document.getElementById("copyBtn"),code=document.getElementById("otp").textContent,status=document.getElementById("status");btn.addEventListener("click",async function(){var ok=false;try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(code);ok=true;}}catch(e){}if(!ok){var field=document.createElement("textarea");field.value=code;field.setAttribute("readonly","");field.style.position="fixed";field.style.opacity="0";document.body.appendChild(field);field.focus();field.select();try{ok=document.execCommand("copy");}catch(e){}field.remove();}btn.textContent=ok?"Đã sao chép mã":"Không tự sao chép được";status.textContent=ok?"Đã sao chép. Quay lại Quiz Craft và dán mã OTP.":"Hãy chọn mã phía trên rồi sao chép thủ công.";});})();</script></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Sao chép mã OTP Quiz Craft');
}

function _qcHtmlEscape_(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
  });
}

/* ----------------------------- EXISTING QUIZ / PROJECT API ----------------------------- */
function _qcEnsureTeacher_(p) {
  const id = _qcClean_(p.teacherId, 80, 'Mã giáo viên');
  const name = _qcClean_(p.teacherName || '', 100, 'Tên giáo viên', true);
  const email = _qcEmail_(p.teacherEmail || '', true);
  const lock = LockService.getScriptLock();
  lock.waitLock(QC.LOCK_TIMEOUT_MS);
  try {
    const ss = _qcSpreadsheet_();
    const existing = _qcFindRows_(ss, 'GiaoVien', function (r) { return String(r.IDGV) === id; })[0];
    if (email) {
      const owner = _qcFindRows_(ss, 'GiaoVien', function (r) { return String(r.Email || '').toLowerCase() === email; })[0];
      if (owner && String(owner.values.IDGV) !== id) throw new Error('Gmail này đã được liên kết với một mã giáo viên khác.');
    }
    if (existing) {
      if (name) existing.values.TenGV = name;
      if (email) existing.values.Email = email;
      existing.values.TrangThai = 'ACTIVE';
      _qcUpdateRow_(existing.sheet, existing.row, 'GiaoVien', existing.values);
      return {ok:true,teacherId:id,existing:true};
    }
    _qcAppendUnlocked_(ss, 'GiaoVien', {
      IDGV:id,TenGV:name,SoDe:0,Email:email,UUIDTaiKhoan:'',NgayTao:new Date(),TrangThai:'ACTIVE'
    });
    _qcLogUnlocked_(ss, {IDNguoiDung:id,VaiTro:'GIAOVIEN',HanhDong:'ENSURE_TEACHER',LoaiDuLieu:'GiaoVien',IDBanGhi:id,KetQua:'OK'});
    return {ok:true,teacherId:id,existing:false};
  } finally {
    lock.releaseLock();
  }
}

function _qcRegisterExam_(p) {
  const teacherId = _qcClean_(p.teacherId, 80, 'Mã giáo viên');
  const examId = _qcClean_(p.examId, 100, 'Mã đề');
  const projectKey = _qcClean_(p.projectKey || '', 100, 'Mã dự án', true);
  const examTitle = _qcClean_(p.examTitle || '', 180, 'Tên đề', true);
  const classCode = _qcClean_(p.classCode || '', 40, 'Mã lớp', true);
  const questionCount = _qcNumber_(p.questionCount || 0, 0, 1000, 'Số câu');
  const maxScore = _qcNumber_(p.maxScore || 10, 0.01, 1000, 'Điểm tối đa');
  const emailRequired = _qcIsTrue_(p.emailRequired);
  const antiCopy = _qcIsTrue_(p.antiCopy);
  const antiScreenshot = _qcIsTrue_(p.antiScreenshot);
  const accessMode = String(p.accessMode || 'PUBLIC').toUpperCase() === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC';
  const lockUntilRaw = String(p.lockedUntil || '').trim();
  const lockUntil = lockUntilRaw ? new Date(lockUntilRaw) : '';
  if (lockUntilRaw && isNaN(lockUntil.getTime())) throw new Error('Thời điểm khóa đề không hợp lệ.');
  if (classCode && !/^[\p{L}\p{N}]+$/u.test(classCode)) throw new Error('Mã lớp chỉ được gồm chữ và số.');

  const lock = LockService.getScriptLock();
  lock.waitLock(QC.LOCK_TIMEOUT_MS);
  try {
    const ss = _qcSpreadsheet_();
    _qcEnsureTeacherRow_(ss, teacherId, p.teacherName || '', p.teacherEmail || '');
    const found = _qcFindRows_(ss, 'DeThi', function (r) { return String(r.IDDe) === examId; })[0];
    if (found) {
      if (String(found.values.IDGV) !== teacherId) throw new Error('Mã đề đã thuộc một giáo viên khác.');
      found.values.TenDe = examTitle || found.values.TenDe || '';
      found.values.SoCau = questionCount || found.values.SoCau || 0;
      found.values.DiemToiDa = maxScore;
      found.values.MaLop = classCode;
      found.values.EmailRequired = emailRequired;
      found.values.AntiCopy = antiCopy;
      found.values.AntiScreenshot = antiScreenshot;
      found.values.KhoaDen = lockUntil;
      found.values.CheDoTruyCap = accessMode;
      found.values.ProjectKey = projectKey || found.values.ProjectKey || '';
      found.values.UpdatedAt = new Date();
      found.values.TrangThai = 'ACTIVE';
      _qcUpdateRow_(found.sheet, found.row, 'DeThi', found.values);
    } else {
      _qcAppendUnlocked_(ss, 'DeThi', {
        IDDe:examId,SoLanLam:0,IDGV:teacherId,MaLop:classCode,NgayTao:new Date(),TrangThai:'ACTIVE',
        TenDe:examTitle,SoCau:questionCount,DiemToiDa:maxScore,EmailRequired:emailRequired,
        AntiCopy:antiCopy,AntiScreenshot:antiScreenshot,KhoaDen:lockUntil,
        CheDoTruyCap:accessMode,UpdatedAt:new Date(),ProjectKey:projectKey
      });
      _qcRecountTeacherExams_(ss, teacherId);
    }

    // Backfill ProjectKey to older sibling rows only when their title/class match.
    if (projectKey) {
      const normalizeProjectText = function (v) { return String(v || '').normalize('NFC').trim().toLocaleLowerCase(); };
      _qcFindRows_(ss, 'DeThi', function (r) {
        return String(r.IDGV) === teacherId && (
          String(r.ProjectKey || '') === projectKey ||
          (!String(r.ProjectKey || '') && normalizeProjectText(r.TenDe) === normalizeProjectText(examTitle) && String(r.MaLop || '') === classCode)
        );
      }).forEach(function (x) {
        x.values.ProjectKey = projectKey;
        x.values.TenDe = examTitle;
        x.values.MaLop = classCode;
        x.values.CheDoTruyCap = accessMode;
        x.values.KhoaDen = lockUntil;
        x.values.UpdatedAt = new Date();
        x.values.EmailRequired = emailRequired;
        x.values.AntiCopy = antiCopy;
        x.values.AntiScreenshot = antiScreenshot;
        x.values.SoCau = questionCount;
        x.values.DiemToiDa = maxScore;
        _qcUpdateRow_(x.sheet, x.row, 'DeThi', x.values);
      });
    }

    if (classCode) _qcEnsureClassRow_(ss, teacherId, classCode);
    _qcLogUnlocked_(ss, {
      IDNguoiDung:teacherId,VaiTro:'GIAOVIEN',HanhDong:found ? 'UPDATE_EXAM' : 'REGISTER_EXAM',
      LoaiDuLieu:'DeThi',IDBanGhi:examId,KetQua:'OK'
    });
    return {ok:true,examId:examId,updated:!!found,accessMode:accessMode,lockedUntil:lockUntil ? _qcIso_(lockUntil) : ''};
  } finally {
    lock.releaseLock();
  }
}

/**
 * Delete remote exams belonging to a deleted local project.
 * Required request fields: teacherId, sessionToken, guestId, projectKey.
 * examId is accepted only as a legacy fallback when no ProjectKey row matched.
 * LichSu is deliberately preserved so existing score/history reports are not erased.
 */
function _qcDeleteProject_(p) {
  _qcRequireTeacherOrAdmin_(p);
  const teacherId = _qcClean_(p.teacherId, 80, 'Mã giáo viên');
  const projectKey = _qcClean_(p.projectKey || '', 100, 'Mã dự án', true);
  const examId = _qcClean_(p.examId || '', 100, 'Mã đề', true);
  if (!projectKey && !examId) throw new Error('Thiếu mã dự án hoặc mã đề để xóa.');

  const lock = LockService.getScriptLock();
  lock.waitLock(QC.LOCK_TIMEOUT_MS);
  try {
    const ss = _qcSpreadsheet_();
    let matches = [];
    if (projectKey) {
      matches = _qcFindRows_(ss, 'DeThi', function (r) {
        return String(r.IDGV) === teacherId && String(r.ProjectKey || '') === projectKey;
      });
    }
    // Only use the exact ExamID fallback for old records if the project key had no match.
    if (!matches.length && examId) {
      matches = _qcFindRows_(ss, 'DeThi', function (r) {
        return String(r.IDGV) === teacherId && String(r.IDDe || '') === examId;
      });
    }

    const bySheet = {};
    matches.forEach(function (item) {
      const key = String(item.sheet.getSheetId());
      if (!bySheet[key]) bySheet[key] = {sheet:item.sheet,rows:[]};
      bySheet[key].rows.push(item.row);
    });
    Object.keys(bySheet).forEach(function (key) {
      const group = bySheet[key];
      group.rows.sort(function (a, b) { return b - a; });
      group.rows.forEach(function (rowNumber) { group.sheet.deleteRow(rowNumber); });
    });

    if (matches.length) _qcRecountTeacherExams_(ss, teacherId);
    _qcLogUnlocked_(ss, {
      IDNguoiDung:teacherId,VaiTro:'GIAOVIEN',HanhDong:'DELETE_PROJECT_EXAMS',
      LoaiDuLieu:'DeThi',IDBanGhi:projectKey || examId,KetQua:'OK',
      ChiTiet:'Đã xóa ' + matches.length + ' đề thuộc dự án.'
    });
    return {
      ok:true,projectKey:projectKey,deletedExams:matches.length,
      message:matches.length ? 'Đã xóa đề của dự án khỏi nhóm tab DeThi.' : 'Không tìm thấy đề tương ứng; không có dữ liệu nào bị xóa.'
    };
  } finally {
    lock.releaseLock();
  }
}

function _qcExamIsBlocked_(exam) {
  const mode = String(exam && exam.CheDoTruyCap || 'PUBLIC').toUpperCase();
  const until = _qcDateNum_(exam && exam.KhoaDen);
  return mode === 'PRIVATE' || (until && until > Date.now());
}

function _qcValidateExamEntry_(ss, token, teacherId, examId, studentId, classCode) {
  if (!token) return null;
  const hash = _qcHash_(String(token));
  const found = _qcFindRows_(ss, 'PhienDeThi', function (r) {
    return String(r.TokenHash) === hash && String(r.IDGV) === String(teacherId) &&
      String(r.IDDe) === String(examId) && String(r.Status) === 'ACTIVE' &&
      (!studentId || String(r.IDHS) === String(studentId)) &&
      (!classCode || String(r.MaLop) === String(classCode));
  })[0];
  return found || null;
}

function _qcCheckExamAccess_(p) {
  const teacherId = _qcClean_(p.teacherId || p.IDGV, 80, 'Mã giáo viên');
  const examId = _qcClean_(p.examId || p.IDDe, 100, 'Mã đề');
  const studentId = _qcClean_(p.studentId || '', 120, 'Mã học sinh', true);
  const classCode = _qcClean_(p.classCode || '', 40, 'Mã lớp', true);
  const token = String(p.entryToken || '').trim();
  const lock = LockService.getScriptLock();
  lock.waitLock(QC.LOCK_TIMEOUT_MS);
  try {
    const ss = _qcSpreadsheet_();
    const found = _qcFindRows_(ss, 'DeThi', function (r) {
      return String(r.IDDe) === examId && String(r.IDGV) === teacherId && String(r.TrangThai || 'ACTIVE') !== 'DELETED';
    })[0];
    if (!found) throw new Error('Đề thi không tồn tại hoặc không thuộc giáo viên này.');
    if (token) {
      const existing = _qcValidateExamEntry_(ss, token, teacherId, examId, studentId, classCode);
      if (existing) {
        existing.values.LastActiveAt = new Date();
        _qcUpdateRow_(existing.sheet, existing.row, 'PhienDeThi', existing.values);
        return {ok:true,allowed:true,entryToken:token,resumed:true};
      }
    }
    if (_qcExamIsBlocked_(found.values)) {
      return {
        ok:true,allowed:false,
        reason:String(found.values.CheDoTruyCap || 'PUBLIC').toUpperCase() === 'PRIVATE' ? 'PRIVATE' : 'LOCKED',
        lockedUntil:_qcIso_(found.values.KhoaDen),
        message:String(found.values.CheDoTruyCap || '').toUpperCase() === 'PRIVATE'
          ? 'Đề đang ở chế độ riêng tư. Giáo viên chưa mở quyền truy cập.'
          : 'Đề đang tạm khóa. Hãy quay lại sau thời điểm mở đề.'
      };
    }
    const entryToken = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    _qcAppendUnlocked_(ss, 'PhienDeThi', {
      TokenHash:_qcHash_(entryToken),IDGV:teacherId,IDDe:examId,IDHS:studentId,
      MaLop:classCode,CreatedAt:new Date(),LastActiveAt:new Date(),Status:'ACTIVE'
    });
    return {ok:true,allowed:true,entryToken:entryToken,resumed:false};
  } finally {
    lock.releaseLock();
  }
}

function _qcSaveStudentResult_(p) {
  const teacherId = _qcClean_(p.teacherId || p.IDGV, 80, 'Mã giáo viên');
  const examId = _qcClean_(p.examId || p.IDDe, 100, 'Mã đề');
  const classCode = _qcClean_(p.classCode || p.MaLop, 40, 'Mã lớp');
  const studentName = _qcClean_(p.studentName || p.TenHocSinh, 100, 'Tên học sinh');
  if (!/^[\p{L}]+(?:\s+[\p{L}]+)*$/u.test(studentName)) throw new Error('Tên học sinh chỉ được gồm chữ cái và khoảng trắng.');
  if (!/^[\p{L}\p{N}]+$/u.test(classCode)) throw new Error('Mã lớp chỉ được gồm chữ và số.');

  const studentId = _qcClean_(p.studentId || p.IDHS || _qcId_('HS'), 100, 'Mã học sinh');
  const attemptId = _qcClean_(p.attemptId || p.IDLuotLam || _qcId_('LT'), 120, 'Mã lượt làm');
  const score = _qcNumber_(p.score, 0, 10, 'Điểm');
  const maxScore = _qcNumber_(p.maxScore || 10, 0.01, 10, 'Điểm tối đa');
  const elapsed = _qcNumber_(p.elapsedSeconds || 0, 0, 86400, 'Thời gian làm bài');
  const submittedEmail = _qcEmail_(p.studentEmail || '', true);
  const guestId = _qcClean_(p.guestId || '', 100, 'Guest ID', true);
  const startedAt = p.startedAt ? new Date(String(p.startedAt)) : new Date(Date.now() - elapsed * 1000);
  if (isNaN(startedAt.getTime())) throw new Error('Thời gian bắt đầu không hợp lệ.');

  const sessionToken = String(p.sessionToken || '');
  const studentSession = sessionToken ? _qcFindSession_(sessionToken, guestId, false) : null;
  let account = null;
  let studentEmail = submittedEmail;
  if (studentSession) {
    const acc = _qcFindRows_(_qcSpreadsheet_(), 'TaiKhoan', function (r) { return String(r.UUID) === String(studentSession.UUID); })[0];
    if (acc && String(acc.values.Status).toUpperCase() === 'ACTIVE') {
      account = acc.values;
      studentEmail = String(account.Gmail || '');
    }
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(QC.LOCK_TIMEOUT_MS);
  try {
    const ss = _qcSpreadsheet_();
    const duplicate = _qcFindRows_(ss, 'LichSu', function (r) { return String(r.IDLuotLam) === attemptId; })[0];
    if (duplicate) {
      return {ok:true,duplicate:true,studentId:String(duplicate.values.IDHS),message:'Lượt làm này đã được lưu trước đó.'};
    }

    const examFound = _qcFindRows_(ss, 'DeThi', function (r) { return String(r.IDDe) === examId; })[0];
    if (!examFound || String(examFound.values.IDGV) !== teacherId || String(examFound.values.TrangThai || 'ACTIVE') === 'DELETED') {
      throw new Error('Đề thi không tồn tại hoặc không thuộc giáo viên này.');
    }
    const entryToken = String(p.entryToken || '');
    const validEntry = _qcValidateExamEntry_(ss, entryToken, teacherId, examId, studentId, classCode);
    if (entryToken && !validEntry) throw new Error('Phiên vào đề không hợp lệ. Hãy mở lại file bài thi và vào đề từ đầu.');
    if (_qcExamIsBlocked_(examFound.values) && !validEntry) {
      throw new Error('Đề đã khóa hoặc chuyển sang riêng tư. Chỉ học sinh đã vào bài từ trước mới được nộp.');
    }
    const assigned = String(examFound.values.MaLop || '');
    if (assigned && assigned !== classCode) {
      throw new Error('Đề này được giao cho lớp ' + assigned + '. Không thể nộp bài bằng lớp ' + classCode + '.');
    }
    if (_qcIsTrue_(examFound.values.EmailRequired) && !account) {
      throw new Error('Đề này yêu cầu học sinh đăng nhập bằng tài khoản email trước khi nộp bài.');
    }

    const retentionMode = account ? 'PERMANENT' : 'TEMP_7D';
    const retainUntil = account ? '' : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    _qcEnsureStudentRow_(ss, teacherId, studentId, studentName, classCode, studentEmail, retentionMode, retainUntil);
    if (!account) {
      _qcFindRows_(ss, 'LichSu', function (r) {
        return String(r.IDGV) === teacherId && String(r.IDHS) === studentId && String(r.RetentionMode) === 'TEMP_7D';
      }).forEach(function (x) {
        x.values.RetainUntil = retainUntil;
        _qcUpdateRow_(x.sheet, x.row, 'LichSu', x.values);
      });
    }

    const submittedAt = new Date();
    _qcAppendUnlocked_(ss, 'LichSu', {
      IDLuotLam:attemptId,IDGV:teacherId,IDDe:examId,IDHS:studentId,TenHocSinh:studentName,
      MaLop:classCode,Diem:score,DuLieuBaiLamJSON:'',ThoiGianBatDau:startedAt,ThoiGianNop:submittedAt,
      TrangThai:'SAVED',DiemToiDa:maxScore,ThoiLuongGiay:Math.round(elapsed),NguonDiem:'CLIENT_REPORTED',
      EmailHS:studentEmail,GuestID:guestId,RetentionMode:retentionMode,RetainUntil:retainUntil
    });
    _qcIncrementExamCount_(ss, examId);
    _qcLogUnlocked_(ss, {IDNguoiDung:studentId,VaiTro:'HOCSINH',HanhDong:'SUBMIT_RESULT',LoaiDuLieu:'LichSu',IDBanGhi:attemptId,KetQua:'OK'});
    return {ok:true,studentId:studentId,attemptId:attemptId,retentionMode:retentionMode,message:'Đã lưu kết quả.'};
  } finally {
    lock.releaseLock();
  }
}

function _qcGetStudentLeaderboard_(p) {
  const teacherId = _qcClean_(p.teacherId || p.IDGV, 80, 'Mã giáo viên');
  const examId = _qcClean_(p.examId || p.IDDe, 100, 'Mã đề');
  const classCode = _qcClean_(p.classCode || p.MaLop, 40, 'Mã lớp');
  const studentId = String(p.studentId || '').slice(0, 120);
  const entryToken = String(p.entryToken || '');
  const ss = _qcSpreadsheet_();
  const examFound = _qcFindRows_(ss, 'DeThi', function (r) {
    return String(r.IDDe) === examId && String(r.IDGV) === teacherId;
  })[0];
  if (!examFound) throw new Error('Không tìm thấy đề để xem bảng xếp hạng.');
  const validEntry = _qcValidateExamEntry_(ss, entryToken, teacherId, examId, studentId, classCode);
  if (_qcExamIsBlocked_(examFound.values) && !validEntry) throw new Error('Đề đang khóa hoặc riêng tư.');

  const title = String(examFound.values.TenDe || 'Đề chưa đặt tên').trim().toLocaleLowerCase();
  const klass = String(examFound.values.MaLop || '').trim();
  const projectKey = String(examFound.values.ProjectKey || '').trim();
  const siblingIds = _qcReadGroup_(ss, 'DeThi').filter(function (r) {
    if (String(r.IDGV) !== teacherId || r.TrangThai === 'DELETED') return false;
    if (projectKey) return String(r.ProjectKey || '') === projectKey;
    return !String(r.ProjectKey || '') && String(r.TenDe || '').trim().normalize('NFC').toLocaleLowerCase() === title.normalize('NFC') && String(r.MaLop || '').trim() === klass;
  }).map(function (r) { return String(r.IDDe); });
  if (siblingIds.indexOf(examId) < 0) siblingIds.push(examId);

  const all = _qcGetHistory_().filter(function (r) {
    return r.IDGV === teacherId && siblingIds.indexOf(r.IDDe) >= 0 && r.MaLop === classCode;
  }).map(function (r) { return Object.assign({}, r, {IDDe:examId}); });
  const aggregated = _qcStudentAttemptStats_(all);
  const sorted = aggregated.slice().sort(function (a, b) {
    return Number(b.Diem) - Number(a.Diem) || Number(a.ThoiLuongGiay) - Number(b.ThoiLuongGiay) ||
      Number(b.AverageScore) - Number(a.AverageScore) || String(a.TenHocSinh).localeCompare(String(b.TenHocSinh), 'vi');
  });
  const scores = sorted.map(function (r) { return {Diem:Number(r.Diem) || 0}; });
  const summary = _qcSummary_(scores);
  const ownIndex = studentId ? sorted.findIndex(function (r) { return r.IDHS === studentId; }) : -1;
  return {
    ok:true,
    rows:sorted.slice(0, 100).map(function (r, i) {
      return {
        studentName:r.TenHocSinh,classCode:r.MaLop,score:Number(r.Diem) || 0,
        averageScore:Number(r.AverageScore) || 0,attemptCount:Number(r.AttemptCount) || 0,
        elapsedSeconds:Number(r.ThoiLuongGiay) || 0,submittedAt:_qcIso_(r.ThoiGianNop),rank:i + 1
      };
    }),
    stats:{studentCount:sorted.length,attemptCount:all.length,average:summary.average,highest:summary.highest,lowest:summary.lowest,gradeBands:summary.gradeBands},
    studentRank:ownIndex >= 0 ? ownIndex + 1 : null,
    studentBestScore:ownIndex >= 0 ? Number(sorted[ownIndex].Diem) : null
  };
}

function _qcGetCatalog_(p) {
  const teacherId = _qcClean_(p.teacherId, 80, 'Mã giáo viên');
  const requestedExamIds = _qcParseList_(p.examIds);
  const ss = _qcSpreadsheet_();
  const allRows = _qcReadGroup_(ss, 'DeThi').filter(function (r) {
    return String(r.IDGV) === teacherId && r.TrangThai !== 'DELETED' && String(r.IDDe || '');
  });

  // De-dupe by IDDe, preferring the latest UpdatedAt / NgayTao record.
  const uniqueById = {};
  allRows.forEach(function (r) {
    const id = String(r.IDDe);
    const stamp = Math.max(_qcDateNum_(r.UpdatedAt), _qcDateNum_(r.NgayTao));
    const old = uniqueById[id];
    if (!old || stamp >= Math.max(_qcDateNum_(old.UpdatedAt), _qcDateNum_(old.NgayTao))) uniqueById[id] = r;
  });
  const rawExams = Object.keys(uniqueById).map(function (id) { return uniqueById[id]; });
  const byProject = {};
  rawExams.forEach(function (r) {
    const id = String(r.IDDe || '');
    if (!id) return;
    const title = String(r.TenDe || 'Đề chưa đặt tên').trim() || 'Đề chưa đặt tên';
    const classCode = String(r.MaLop || '').trim();
    const projectKey = String(r.ProjectKey || '').trim();
    const key = projectKey ? 'PROJECT:' + projectKey : 'LEGACY:' + title.normalize('NFC').toLocaleLowerCase() + '|' + classCode.toLocaleUpperCase();
    let group = byProject[key];
    if (!group) {
      group = byProject[key] = {
        groupKey:'group-' + _qcHash_(key).slice(0, 18),projectKey:projectKey,title:title,classCode:classCode,
        examIds:[],createdAt:r.NgayTao,submissionCount:0,accessMode:'PUBLIC',lockedUntil:'',emailRequired:false
      };
    }
    group.examIds.push(id);
    group.submissionCount += Number(r.SoLanLam) || 0;
    if (_qcDateNum_(r.NgayTao) > _qcDateNum_(group.createdAt)) group.createdAt = r.NgayTao;
    if (String(r.CheDoTruyCap || 'PUBLIC').toUpperCase() === 'PRIVATE') group.accessMode = 'PRIVATE';
    if (_qcDateNum_(r.KhoaDen) > _qcDateNum_(group.lockedUntil)) group.lockedUntil = r.KhoaDen;
    if (_qcIsTrue_(r.EmailRequired)) group.emailRequired = true;
  });

  const exams = Object.keys(byProject).map(function (key) {
    const x = byProject[key];
    x.examIds = Array.from(new Set(x.examIds)).sort();
    x.examId = x.examIds[0];
    x.createdAt = _qcIso_(x.createdAt);
    x.lockedUntil = _qcIso_(x.lockedUntil);
    return x;
  });
  const ownedIds = exams.reduce(function (a, x) { return a.concat(x.examIds); }, []);
  const allowedIds = requestedExamIds.length ? requestedExamIds.filter(function (id) { return ownedIds.indexOf(id) >= 0; }) : ownedIds;
  const history = _qcGetHistory_().filter(function (r) { return r.IDGV === teacherId; });
  const classMap = {};
  history.filter(function (r) { return allowedIds.indexOf(r.IDDe) >= 0; }).forEach(function (r) {
    if (!r.MaLop) return;
    classMap[r.MaLop] = classMap[r.MaLop] || {classCode:r.MaLop,className:r.MaLop,submissionCount:0};
    classMap[r.MaLop].submissionCount++;
  });
  const classesByExam = {};
  history.forEach(function (r) {
    if (!r.MaLop) return;
    (classesByExam[r.IDDe] || (classesByExam[r.IDDe] = new Set())).add(r.MaLop);
  });
  exams.forEach(function (x) {
    const set = new Set();
    x.examIds.forEach(function (id) { (classesByExam[id] || new Set()).forEach(function (c) { set.add(c); }); });
    x.takenClasses = Array.from(set).sort();
  });
  exams.sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
  return {
    ok:true,teacherId:teacherId,examCount:exams.length,exams:exams,
    classes:Object.keys(classMap).sort().map(function (k) { return classMap[k]; }),
    classCount:Object.keys(classMap).length
  };
}

function _qcGetTeacherStats_(p) {
  const teacherId = _qcClean_(p.teacherId, 80, 'Mã giáo viên');
  const examIds = _qcParseList_(p.examIds);
  const classCodes = _qcParseList_(p.classCodes);
  const ss = _qcSpreadsheet_();
  const exams = _qcReadGroup_(ss, 'DeThi').filter(function (r) {
    return String(r.IDGV) === teacherId && r.TrangThai !== 'DELETED';
  });
  const byId = {}, groupTitles = {};
  exams.forEach(function (e) {
    const title = String(e.TenDe || 'Đề chưa đặt tên').trim() || 'Đề chưa đặt tên';
    const classCode = String(e.MaLop || '').trim();
    const pk = String(e.ProjectKey || '').trim();
    const key = pk ? 'PROJECT:' + pk : 'LEGACY:' + title.normalize('NFC').toLocaleLowerCase() + '|' + classCode.toLocaleUpperCase();
    byId[String(e.IDDe)] = {key:key,title:title};
    groupTitles[key] = title;
  });

  let raw = _qcGetHistory_().filter(function (r) { return String(r.IDGV) === teacherId; });
  if (examIds.length) raw = raw.filter(function (r) { return examIds.indexOf(String(r.IDDe)) >= 0; });
  if (classCodes.length) raw = raw.filter(function (r) { return classCodes.indexOf(String(r.MaLop)) >= 0; });
  raw = raw.map(function (r) {
    const info = byId[String(r.IDDe)] || {key:'ID:' + String(r.IDDe),title:String(r.IDDe)};
    return Object.assign({}, r, {OriginalExamId:r.IDDe,IDDe:info.key,ExamTitle:info.title});
  });

  const best = _qcBestPerStudent_(raw);
  const summary = _qcSummary_(best);
  summary.lastSubmission = _qcSummary_(raw).lastSubmission;
  const byClass = _qcGroupSummary_(best, 'MaLop', raw);
  const byExam = _qcGroupSummary_(best, 'IDDe', raw).map(function (x) {
    return {
      name:groupTitles[String(x.name)] || String(x.name).replace(/^ID:/, ''),examId:String(x.name),
      studentCount:x.studentCount,average:x.average,highest:x.highest,lowest:x.lowest,
      lastSubmission:x.lastSubmission,gradeBands:x.gradeBands
    };
  });

  const sortBy = String(p.sortBy || 'latest');
  const rows = _qcStudentAttemptStats_(raw);
  if (sortBy === 'scoreHigh') rows.sort(function (a, b) { return Number(b.Diem) - Number(a.Diem); });
  else if (sortBy === 'scoreLow') rows.sort(function (a, b) { return Number(a.Diem) - Number(b.Diem); });
  else if (sortBy === 'avgHigh') rows.sort(function (a, b) { return Number(b.AverageScore) - Number(a.AverageScore); });
  else if (sortBy === 'name') rows.sort(function (a, b) { return String(a.TenHocSinh).localeCompare(String(b.TenHocSinh), 'vi'); });
  else rows.sort(function (a, b) { return _qcDateNum_(b.ThoiGianNop) - _qcDateNum_(a.ThoiGianNop); });

  return {
    ok:true,summary:summary,
    byClass:byClass.sort(function (a, b) { return b.studentCount - a.studentCount; }),
    byExam:byExam.sort(function (a, b) { return b.studentCount - a.studentCount; }),
    rows:rows.slice(0, 1500).map(function (r) {
      return {
        studentName:r.TenHocSinh,classCode:r.MaLop,examId:r.IDDe,
        examTitle:r.ExamTitle || groupTitles[String(r.IDDe)] || String(r.IDDe).replace(/^ID:/, ''),
        score:Number(r.Diem) || 0,latestScore:Number(r.Diem) || 0,
        averageScore:Number(r.AverageScore) || 0,attemptCount:Number(r.AttemptCount) || 0,
        elapsedSeconds:Number(r.ThoiLuongGiay) || 0,submittedAt:_qcIso_(r.ThoiGianNop)
      };
    }),
    totalRows:rows.length,rawAttempts:raw.length
  };
}

/* ----------------------------- DATA HELPERS ----------------------------- */
function _qcEnsureTeacherRow_(ss, id, name, email) {
  const found = _qcFindRows_(ss, 'GiaoVien', function (r) { return String(r.IDGV) === id; })[0];
  if (found) return found.values;
  const row = {
    IDGV:id,TenGV:_qcClean_(name || '', 100, 'Tên giáo viên', true),SoDe:0,
    Email:_qcEmail_(email || '', true),UUIDTaiKhoan:'',NgayTao:new Date(),TrangThai:'ACTIVE'
  };
  _qcAppendUnlocked_(ss, 'GiaoVien', row);
  return row;
}

function _qcEnsureExamRow_(ss, teacherId, examId, classCode) {
  const found = _qcFindRows_(ss, 'DeThi', function (r) { return String(r.IDDe) === examId; })[0];
  if (found) {
    if (String(found.values.IDGV) !== teacherId) throw new Error('Mã đề không thuộc giáo viên này.');
    const assigned = String(found.values.MaLop || '');
    if (assigned && assigned !== classCode) throw new Error('Đề này được giao cho lớp ' + assigned + '. Không thể nộp bài bằng lớp ' + classCode + '.');
    return found.values;
  }
  const row = {IDDe:examId,SoLanLam:0,IDGV:teacherId,MaLop:classCode,NgayTao:new Date(),TrangThai:'ACTIVE',TenDe:examId,SoCau:0,DiemToiDa:10};
  _qcAppendUnlocked_(ss, 'DeThi', row);
  _qcRecountTeacherExams_(ss, teacherId);
  return row;
}

function _qcEnsureClassRow_(ss, teacherId, classCode) {
  const found = _qcFindRows_(ss, 'LopHoc', function (r) { return String(r.IDGV) === teacherId && String(r.MaLop) === classCode; })[0];
  if (found) return found.values;
  const row = {MaLop:classCode,IDGV:teacherId,TenLop:classCode,NgayTao:new Date(),TrangThai:'ACTIVE'};
  _qcAppendUnlocked_(ss, 'LopHoc', row);
  return row;
}

function _qcEnsureStudentRow_(ss, teacherId, studentId, studentName, classCode, email, retentionMode, retainUntil) {
  const found = _qcFindRows_(ss, 'HocSinh', function (r) { return String(r.IDHS) === studentId; })[0];
  if (found) {
    found.values.TenHocSinh = studentName;
    found.values.MaLop = classCode;
    found.values.IDGV = teacherId;
    found.values.SoLanLam = (Number(found.values.SoLanLam) || 0) + 1;
    found.values.LastActiveAt = new Date();
    found.values.RetentionMode = retentionMode || 'TEMP_7D';
    found.values.RetainUntil = retainUntil || '';
    if (email) found.values.Email = email;
    _qcUpdateRow_(found.sheet, found.row, 'HocSinh', found.values);
    return found.values;
  }
  const row = {
    IDHS:studentId,TenHocSinh:studentName,SoLanLam:1,Email:email || '',MaLop:classCode,
    NgayTao:new Date(),IDGV:teacherId,LastActiveAt:new Date(),
    RetentionMode:retentionMode || 'TEMP_7D',RetainUntil:retainUntil || ''
  };
  _qcAppendUnlocked_(ss, 'HocSinh', row);
  return row;
}

function _qcIncrementExamCount_(ss, examId) {
  const f = _qcFindRows_(ss, 'DeThi', function (r) { return String(r.IDDe) === examId; })[0];
  if (f) {
    f.values.SoLanLam = (Number(f.values.SoLanLam) || 0) + 1;
    _qcUpdateRow_(f.sheet, f.row, 'DeThi', f.values);
  }
}

function _qcRecountTeacherExams_(ss, teacherId) {
  const n = _qcReadGroup_(ss, 'DeThi').filter(function (r) { return r.IDGV === teacherId && r.TrangThai !== 'DELETED'; }).length;
  const f = _qcFindRows_(ss, 'GiaoVien', function (r) { return String(r.IDGV) === teacherId; })[0];
  if (f) {
    f.values.SoDe = n;
    _qcUpdateRow_(f.sheet, f.row, 'GiaoVien', f.values);
  }
}

function _qcAppendUnlocked_(ss, groupKey, record) {
  const group = QC.GROUPS[groupKey];
  if (!group) throw new Error('Nhóm dữ liệu không hợp lệ.');
  const unknown = Object.keys(record).filter(function (k) { return group.headers.indexOf(k) < 0; });
  if (unknown.length) throw new Error('Cột không hợp lệ: ' + unknown.join(', '));
  group.headers.forEach(function (k) { if (record[k] === undefined) record[k] = ''; });
  group.required.forEach(function (k) {
    if (record[k] === null || String(record[k]).trim() === '') throw new Error('Thiếu dữ liệu bắt buộc: ' + k);
  });
  (group.numberFields || []).forEach(function (k) {
    if (record[k] !== '' && record[k] !== null && !Number.isFinite(Number(record[k]))) throw new Error('Cột ' + k + ' phải là số.');
  });
  const sheet = _qcGetWritableSheet_(ss, groupKey);
  const rowNum = sheet.getLastRow() + 1;
  const values = group.headers.map(function (k) { return _qcCellValue_(record[k]); });
  sheet.getRange(rowNum, 1, 1, group.headers.length).setValues([values]);
  return {sheet:sheet,row:rowNum};
}

function _qcUpdateRow_(sheet, rowNum, groupKey, record) {
  const headers = QC.GROUPS[groupKey].headers;
  sheet.getRange(rowNum, 1, 1, headers.length).setValues([headers.map(function (k) { return _qcCellValue_(record[k]); })]);
}

function _qcLogUnlocked_(ss, x) {
  try {
    _qcAppendUnlocked_(ss, 'NhatKy', {
      IDLog:_qcId_('LOG'),ThoiGian:new Date(),IDNguoiDung:x.IDNguoiDung || '',VaiTro:x.VaiTro || '',
      HanhDong:x.HanhDong || 'UNKNOWN',LoaiDuLieu:x.LoaiDuLieu || '',IDBanGhi:x.IDBanGhi || '',
      KetQua:x.KetQua || 'OK',ChiTiet:x.ChiTiet || ''
    });
    let total = 0;
    const sheets = _qcGetGroupSheets_(ss, QC.GROUPS.NhatKy);
    sheets.forEach(function (sh) { total += Math.max(0, sh.getLastRow() - 1); });
    if (total > QC.MAX_AUDIT_LOG_ROWS) {
      sheets.forEach(function (sh) {
        const last = sh.getLastRow();
        if (last > 1) sh.getRange(2, 1, last - 1, QC.GROUPS.NhatKy.headers.length).clearContent();
      });
    }
  } catch (ignore) {}
}

function _qcReadGroup_(ss, groupKey) {
  const g = QC.GROUPS[groupKey], out = [];
  _qcGetGroupSheets_(ss, g).forEach(function (sh) {
    const last = sh.getLastRow();
    if (last < 2) return;
    sh.getRange(2, 1, last - 1, g.headers.length).getValues().forEach(function (row) {
      if (row.every(function (v) { return v === '' || v === null; })) return;
      const obj = {};
      g.headers.forEach(function (h, i) { obj[h] = row[i]; });
      out.push(obj);
    });
  });
  return out;
}

function _qcFindRows_(ss, groupKey, predicate) {
  const g = QC.GROUPS[groupKey], out = [];
  _qcGetGroupSheets_(ss, g).forEach(function (sh) {
    const last = sh.getLastRow();
    if (last < 2) return;
    sh.getRange(2, 1, last - 1, g.headers.length).getValues().forEach(function (row, i) {
      const obj = {};
      g.headers.forEach(function (h, j) { obj[h] = row[j]; });
      if (predicate(obj)) out.push({sheet:sh,row:i + 2,values:obj});
    });
  });
  return out;
}

function _qcGetHistory_() {
  return _qcReadGroup_(_qcSpreadsheet_(), 'LichSu').map(function (r) {
    return {
      IDLuotLam:String(r.IDLuotLam || ''),IDGV:String(r.IDGV || ''),IDDe:String(r.IDDe || ''),
      IDHS:String(r.IDHS || ''),TenHocSinh:String(r.TenHocSinh || ''),MaLop:String(r.MaLop || ''),
      Diem:Number(r.Diem) || 0,DiemToiDa:Number(r.DiemToiDa) || 10,
      ThoiLuongGiay:Number(r.ThoiLuongGiay) || 0,ThoiGianBatDau:r.ThoiGianBatDau,ThoiGianNop:r.ThoiGianNop
    };
  });
}

function _qcStudentAttemptStats_(rows) {
  const map = {};
  (rows || []).forEach(function (r) {
    const key = [r.IDHS,r.IDDe,r.MaLop].join('|');
    let item = map[key];
    if (!item) item = map[key] = {IDHS:r.IDHS,IDDe:r.IDDe,MaLop:r.MaLop,TenHocSinh:r.TenHocSinh,total:0,count:0,latest:null};
    item.total += Number(r.Diem) || 0;
    item.count++;
    if (!item.latest || _qcDateNum_(r.ThoiGianNop) >= _qcDateNum_(item.latest.ThoiGianNop)) item.latest = r;
  });
  return Object.keys(map).map(function (key) {
    const x = map[key], last = x.latest || {};
    return Object.assign({}, last, {
      IDHS:x.IDHS,IDDe:x.IDDe,MaLop:x.MaLop,TenHocSinh:x.TenHocSinh,
      Diem:Number(last.Diem) || 0,AverageScore:x.count ? x.total / x.count : 0,
      AttemptCount:x.count,ThoiLuongGiay:Number(last.ThoiLuongGiay) || 0
    });
  });
}

function _qcBestPerStudent_(rows) {
  const map = {};
  rows.forEach(function (r) {
    const k = [r.IDHS,r.IDDe,r.MaLop].join('|');
    const old = map[k];
    if (!old || Number(r.Diem) > Number(old.Diem) || (Number(r.Diem) === Number(old.Diem) && _qcDateNum_(r.ThoiGianNop) > _qcDateNum_(old.ThoiGianNop))) map[k] = r;
  });
  return Object.keys(map).map(function (k) { return map[k]; });
}

function _qcSummary_(rows) {
  const scores = rows.map(function (r) { return Number(r.Diem) || 0; });
  const count = scores.length;
  const avg = count ? scores.reduce(function (a, b) { return a + b; }, 0) / count : 0;
  const bands = [
    {name:'Yếu',min:0,max:5},
    {name:'Trung bình',min:5,max:6.5},
    {name:'Khá',min:6.5,max:8},
    {name:'Giỏi',min:8,max:9},
    {name:'Xuất sắc',min:9,max:10.000001}
  ];
  return {
    studentCount:count,average:avg,
    highest:count ? Math.max.apply(null, scores) : 0,
    lowest:count ? Math.min.apply(null, scores) : 0,
    gradeBands:bands.map(function (b) {
      const n = scores.filter(function (s) { return s >= b.min && s < b.max; }).length;
      return {name:b.name,count:n,percent:count ? n / count * 100 : 0};
    }),
    lastSubmission:rows.reduce(function (t, r) { return Math.max(t, _qcDateNum_(r.ThoiGianNop)); }, 0)
  };
}

function _qcGroupSummary_(rows, field, allRows) {
  const map = {}, latest = {};
  rows.forEach(function (r) {
    const n = String(r[field] || '(chưa có)');
    (map[n] || (map[n] = [])).push(r);
  });
  (allRows || rows).forEach(function (r) {
    const n = String(r[field] || '(chưa có)');
    const stamp = _qcDateNum_(r.ThoiGianNop);
    latest[n] = Math.max(latest[n] || 0, stamp);
  });
  return Object.keys(map).map(function (n) {
    const s = _qcSummary_(map[n]);
    return {name:n,studentCount:s.studentCount,average:s.average,highest:s.highest,lowest:s.lowest,lastSubmission:latest[n] || s.lastSubmission,gradeBands:s.gradeBands};
  });
}

/* ----------------------------- RETENTION CLEANUP ----------------------------- */
function installRetentionCleanupTrigger() {
  ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'cleanupInactiveStudentData'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('cleanupInactiveStudentData').timeBased().everyDays(1).atHour(3).create();
  return {ok:true,message:'Đã cài trigger hằng ngày: dọn dữ liệu khách hết hạn 7 ngày và NhatKy cũ hơn 1 ngày; nếu NhatKy vượt 5000 dòng sẽ xóa toàn bộ nhật ký.'};
}

function cleanupInactiveStudentData() {
  const ss = _qcSpreadsheet_();
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  let removedHistory = 0, removedStudents = 0, deletedAuditRows = 0, auditRowsBeforeCleanup = 0, auditClearedAll = false;

  _qcGetGroupSheets_(ss, QC.GROUPS.LichSu).forEach(function (sh) {
    const last = sh.getLastRow();
    if (last < 2) return;
    const headers = QC.GROUPS.LichSu.headers;
    const values = sh.getRange(2, 1, last - 1, headers.length).getValues();
    const idxMode = headers.indexOf('RetentionMode');
    const idxExpiry = headers.indexOf('RetainUntil');
    for (let i = values.length - 1; i >= 0; i--) {
      const mode = String(values[i][idxMode] || '');
      const expiry = _qcDateNum_(values[i][idxExpiry]);
      if (mode === 'TEMP_7D' && expiry && expiry <= now) {
        sh.deleteRow(i + 2);
        removedHistory++;
      }
    }
  });

  _qcGetGroupSheets_(ss, QC.GROUPS.HocSinh).forEach(function (sh) {
    const last = sh.getLastRow();
    if (last < 2) return;
    const headers = QC.GROUPS.HocSinh.headers;
    const values = sh.getRange(2, 1, last - 1, headers.length).getValues();
    const idxId = headers.indexOf('IDHS');
    const idxMode = headers.indexOf('RetentionMode');
    const idxExpiry = headers.indexOf('RetainUntil');
    for (let i = values.length - 1; i >= 0; i--) {
      const id = String(values[i][idxId] || '');
      const mode = String(values[i][idxMode] || '');
      const expiry = _qcDateNum_(values[i][idxExpiry]);
      if (mode !== 'TEMP_7D' || !expiry || expiry > now) continue;
      const stillHasData = _qcFindRows_(ss, 'LichSu', function (r) {
        return String(r.IDHS) === id && String(r.RetentionMode) === 'TEMP_7D' && _qcDateNum_(r.RetainUntil) > now;
      }).length > 0;
      if (!stillHasData) {
        sh.deleteRow(i + 2);
        removedStudents++;
      }
    }
  });

  const auditSheets = _qcGetGroupSheets_(ss, QC.GROUPS.NhatKy);
  auditSheets.forEach(function (sh) { auditRowsBeforeCleanup += Math.max(0, sh.getLastRow() - 1); });
  if (auditRowsBeforeCleanup > QC.MAX_AUDIT_LOG_ROWS) {
    auditSheets.forEach(function (sh) {
      const last = sh.getLastRow();
      if (last > 1) {
        const n = last - 1;
        sh.getRange(2, 1, n, QC.GROUPS.NhatKy.headers.length).clearContent();
        deletedAuditRows += n;
      }
    });
    auditClearedAll = true;
  } else {
    const timeCol = QC.GROUPS.NhatKy.headers.indexOf('ThoiGian') + 1;
    auditSheets.forEach(function (sh) {
      const last = sh.getLastRow();
      if (last < 2) return;
      const values = sh.getRange(2, 1, last - 1, QC.GROUPS.NhatKy.headers.length).getValues();
      const kept = values.filter(function (row) {
        const stamp = _qcDateNum_(row[timeCol - 1]);
        return stamp && stamp >= oneDayAgo;
      });
      const removed = values.length - kept.length;
      if (!removed) return;
      sh.getRange(2, 1, values.length, QC.GROUPS.NhatKy.headers.length).clearContent();
      if (kept.length) sh.getRange(2, 1, kept.length, QC.GROUPS.NhatKy.headers.length).setValues(kept);
      deletedAuditRows += removed;
    });
  }

  return {
    ok:true,deletedHistory:removedHistory,deletedStudentRows:removedStudents,
    deletedAuditRows:deletedAuditRows,auditRowsBeforeCleanup:auditRowsBeforeCleanup,auditClearedAll:auditClearedAll
  };
}

/* ----------------------------- OTP_001 CLEANUP ONLY ----------------------------- */
function installOtp001CleanupTrigger() {
  const handler = 'cleanupOtp001OlderThan10Minutes';
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handler) ScriptApp.deleteTrigger(trigger);
  });
  // Apps Script supports a one-minute time-based trigger. A row is deleted only
  // after its CreatedAt timestamp is at least ten minutes old.
  ScriptApp.newTrigger(handler).timeBased().everyMinutes(1).create();
  Logger.log('Đã cài trigger dọn OTP_001: quét mỗi phút, xóa dòng từ 10 phút tuổi trở lên.');
  return {ok:true,sheet:'OTP_001',ageMinutes:10,scanEveryMinutes:1};
}

function cleanupOtp001OlderThan10Minutes() {
  const lock = LockService.getScriptLock();
  lock.waitLock(QC.LOCK_TIMEOUT_MS);
  try {
    const ss = _qcSpreadsheet_();
    const sheet = ss.getSheetByName('OTP_001');
    if (!sheet || sheet.getLastRow() < QC.FIRST_DATA_ROW) return {ok:true,tab:'OTP_001',deletedRows:0};

    const lastColumn = sheet.getLastColumn();
    if (lastColumn < 1) return {ok:true,tab:'OTP_001',deletedRows:0};
    const headers = sheet.getRange(QC.HEADER_ROW, 1, 1, lastColumn).getDisplayValues()[0]
      .map(function (value) { return String(value).trim(); });
    const createdAtIndex = headers.indexOf('CreatedAt');
    if (createdAtIndex < 0) throw new Error('Không tìm thấy cột CreatedAt trong OTP_001. Không xóa dữ liệu.');

    const lastRow = sheet.getLastRow();
    const rowCount = lastRow - QC.HEADER_ROW;
    const values = sheet.getRange(QC.FIRST_DATA_ROW, 1, rowCount, lastColumn).getValues();
    const cutoff = Date.now() - QC.OTP_001_DELETE_AFTER_MS;
    const staleRows = [];
    values.forEach(function (row, index) {
      const createdAt = _qcDateNum_(row[createdAtIndex]);
      if (createdAt && createdAt <= cutoff) staleRows.push(index + QC.FIRST_DATA_ROW);
    });

    // Delete bottom-up. Only data rows in OTP_001 are touched; header/tab remain.
    for (let i = staleRows.length - 1; i >= 0; i--) sheet.deleteRow(staleRows[i]);
    const report = {ok:true,tab:'OTP_001',deletedRows:staleRows.length,cutoff:new Date(cutoff).toISOString()};
    if (staleRows.length) Logger.log(JSON.stringify(report));
    return report;
  } finally {
    lock.releaseLock();
  }
}

/* ----------------------------- SHEET UTILITIES ----------------------------- */
function _qcEnsureGroupSheet_(ss, key, num) {
  const g = QC.GROUPS[key];
  const name = _qcSheetName_(g.prefix, num);
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getMaxColumns() < g.headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), g.headers.length - sh.getMaxColumns());
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, g.headers.length).setValues([g.headers]);
  else _qcEnsureCompatibleHeader_(sh, g);
  sh.setFrozenRows(1);
  sh.setTabColor(g.color);
  sh.getRange(1, 1, 1, g.headers.length).setFontWeight('bold').setWrap(true);
  return sh;
}

function _qcEnsureCompatibleHeader_(sh, g) {
  if (sh.getMaxColumns() < g.headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), g.headers.length - sh.getMaxColumns());
  const existing = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getDisplayValues()[0]
    .map(function (v) { return String(v).trim(); });
  const nonempty = existing.filter(Boolean);
  if (nonempty.length > g.headers.length) throw new Error('Tab ' + sh.getName() + ' có cột ngoài cấu trúc. Đã dừng để tránh ghi lệch dữ liệu.');
  for (let i = 0; i < nonempty.length; i++) {
    if (nonempty[i] !== g.headers[i]) throw new Error('Tiêu đề tab ' + sh.getName() + ' không khớp cột ' + (i + 1) + '. Không tự ghi đè dữ liệu.');
  }
  if (nonempty.length < g.headers.length) {
    sh.getRange(1, nonempty.length + 1, 1, g.headers.length - nonempty.length).setValues([g.headers.slice(nonempty.length)]);
  }
}

function _qcGetGroupSheets_(ss, g) {
  const pattern = new RegExp('^' + g.prefix + '_([0-9]+)$');
  return ss.getSheets().map(function (sh) {
    const m = sh.getName().match(pattern);
    return m ? {sh:sh,n:Number(m[1])} : null;
  }).filter(Boolean).sort(function (a, b) { return a.n - b.n; }).map(function (x) { return x.sh; });
}

function _qcGetWritableSheet_(ss, key) {
  const g = QC.GROUPS[key];
  let tabs = _qcGetGroupSheets_(ss, g);
  if (!tabs.length) return _qcEnsureGroupSheet_(ss, key, 1);
  let sh = tabs[tabs.length - 1];
  _qcEnsureCompatibleHeader_(sh, g);
  if (sh.getLastRow() - 1 >= QC.MAX_DATA_ROWS_PER_TAB) {
    return _qcEnsureGroupSheet_(ss, key, _qcSheetNumber_(sh.getName(), g.prefix) + 1);
  }
  const target = sh.getLastRow() + 1;
  const max = QC.MAX_DATA_ROWS_PER_TAB + 1;
  if (target > max) return _qcEnsureGroupSheet_(ss, key, _qcSheetNumber_(sh.getName(), g.prefix) + 1);
  if (target > sh.getMaxRows()) {
    sh.insertRowsAfter(sh.getMaxRows(), Math.min(max, Math.max(target, sh.getMaxRows() + QC.ROW_GROWTH_STEP)) - sh.getMaxRows());
  }
  return sh;
}

function _qcSheetName_(prefix, n) { return prefix + '_' + String(n).padStart(3, '0'); }
function _qcSheetNumber_(name, prefix) {
  const m = name.match(new RegExp('^' + prefix + '_([0-9]+)$'));
  if (!m) throw new Error('Tên tab không hợp lệ: ' + name);
  return Number(m[1]);
}

function _qcSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(QC.SPREADSHEET_PROPERTY);
  if (id) return SpreadsheetApp.openById(id);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('Chưa cấu hình Spreadsheet. Hãy chạy setupDatabase() từ Google Sheets đích.');
  props.setProperty(QC.SPREADSHEET_PROPERTY, active.getId());
  return active;
}

function _qcOutput_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,100}$/.test(callback)) {
      return ContentService.createTextOutput('/* invalid callback */').setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function _qcIsAdmin_(key) {
  const saved = PropertiesService.getScriptProperties().getProperty(QC.ADMIN_KEY_PROPERTY);
  return !!saved && String(key || '') === saved;
}
function _qcClean_(value, max, label, allowEmpty) {
  const s = String(value == null ? '' : value).normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!s && !allowEmpty) throw new Error('Thiếu ' + label + '.');
  if (s.length > max) throw new Error(label + ' quá dài.');
  if (/[\u0000-\u001F\u007F]/.test(s)) throw new Error(label + ' chứa ký tự không hợp lệ.');
  return s;
}
function _qcEmail_(value, allowEmpty) {
  const s = String(value || '').trim().toLowerCase();
  if (!s && allowEmpty) return '';
  if (!s || s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new Error('Email không hợp lệ.');
  return s;
}
function _qcNumber_(value, min, max, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(label + ' không hợp lệ.');
  return n;
}
function _qcId_(prefix) { return prefix + '_' + Utilities.getUuid().replace(/-/g, '').toUpperCase(); }
function _qcHash_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}
function _qcCellValue_(v) {
  if (v === undefined || v === null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /^[\s]*[=+\-@]/.test(s) ? "'" + s : s;
}
function _qcIsTrue_(value) {
  const v = String(value == null ? '' : value).trim().toLowerCase();
  return value === true || v === 'true' || v === '1' || v === 'yes';
}
function _qcParseList_(value) {
  if (!value) return [];
  try {
    const x = JSON.parse(String(value));
    return Array.isArray(x) ? x.map(String).filter(Boolean) : [];
  } catch (e) {
    return String(value).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }
}
function _qcDateNum_(v) {
  if (v instanceof Date) return v.getTime();
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : 0;
}
function _qcIso_(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}
