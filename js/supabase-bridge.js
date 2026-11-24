(function() {
  const SB_URL = 'https://hxcyjzjzkjxkaodrxlvm.supabase.co';
  const SB_KEY = 'sb_publishable_Q6T4cyYP1S00zNjbU-5nEQ_kEePXGyC'; window.__qcOtpStore = window.__qcOtpStore || {};

  async function sbFetch(path, options = {}) {
    const res = await fetch(SB_URL + '/rest/v1/' + path, {
      ...options,
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
        'Prefer': options.prefer || 'return=representation',
        ...(options.headers || {})
      }
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error('Lỗi Supabase (' + res.status + '): ' + errText);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  }

  async function sbFetchAll(path, pageSize = 1000) {
    const all = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = await sbFetch(path, { headers: { 'Range-Unit': 'items', 'Range': offset + '-' + (offset + pageSize - 1) } });
      if (Array.isArray(page)) all.push(...page);
      if (!Array.isArray(page) || page.length < pageSize) break;
    }
    return all;
  }

  window.__qcSupabaseBridge = async function(params) {
    const action = String(params.action || '');

    if (action === 'registerExam') {
      const row = {
        id_de: String(params.examId),
        id_gv: String(params.teacherId),
        ten_de: String(params.examTitle || ''),
        ma_lop: String(params.classCode || ''),
        so_cau: Number(params.questionCount || 0),
        diem_toi_da: Number(params.maxScore || 10),
        email_required: !!params.emailRequired,
        anti_copy: !!params.antiCopy,
        anti_screenshot: !!params.antiScreenshot,
        che_do_truy_cap: String(params.accessMode || 'PUBLIC'),
        khoa_den: params.lockAt ? new Date(params.lockAt).toISOString() : null,
        project_key: String(params.projectKey || ''),
        trang_thai: String(params.lockMode || '') === 'LOCKED_NOW' ? 'LOCKED' : 'ACTIVE',
        updated_at: new Date().toISOString()
      };
      await sbFetch('de_thi?on_conflict=id_de', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: JSON.stringify(row)
      });
      if (params.classCode) {
        await sbFetch('lop_hoc?on_conflict=id_gv,ma_lop', {
          method: 'POST',
          prefer: 'resolution=ignore-duplicates,return=minimal',
          body: JSON.stringify({ id_gv: String(params.teacherId), ma_lop: String(params.classCode), ten_lop: String(params.classCode) })
        });
      }
      return { ok: true, examId: row.id_de, updated: true };
    }

    if (action === 'deleteProject') {
      const filter = params.projectKey
        ? 'id_gv=eq.' + encodeURIComponent(params.teacherId) + '&project_key=eq.' + encodeURIComponent(params.projectKey)
        : 'id_gv=eq.' + encodeURIComponent(params.teacherId) + '&id_de=eq.' + encodeURIComponent(params.examId);
      await sbFetch('de_thi?' + filter, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ trang_thai: 'DELETED', updated_at: new Date().toISOString() })
      });
      return { ok: true, deleted: true };
    }

    if (action === 'examAccess') {
      const rows = await sbFetch('de_thi?id_de=eq.' + encodeURIComponent(params.examId) + '&id_gv=eq.' + encodeURIComponent(params.teacherId));
      if (!rows.length) return { ok: true, allowed: true, entryToken: 'SB-' + Date.now() };
      const exam = rows.at(0);
      if (String(exam.trang_thai || '').toUpperCase() === 'DELETED') {
        return { ok: true, allowed: false, message: 'Đề này đã bị giáo viên xóa. Vui lòng liên hệ giáo viên để nhận đề mới.' };
      }
      if (String(exam.trang_thai || '').toUpperCase() === 'LOCKED') {
        return { ok: true, allowed: false, message: 'Bài thi đã bị khóa ngay lập tức bởi giáo viên.' };
      }
      if (exam.che_do_truy_cap === 'PRIVATE') {
        return { ok: true, allowed: false, message: 'Đề đang ở chế độ riêng tư. Giáo viên chưa mở quyền truy cập.' };
      }
      if (exam.khoa_den && new Date(exam.khoa_den).getTime() <= Date.now()) {
        return { ok: true, allowed: false, message: 'Đề đã tự động khóa.' };
      }
      return { ok: true, allowed: true, entryToken: params.entryToken || ('SB-' + Math.random().toString(36).slice(2)) };
    }

    if (action === 'save') {
      const row = {
        id_luot_lam: String(params.attemptId),
        id_gv: String(params.teacherId),
        id_de: String(params.examId),
        id_hs: String(params.studentId),
        ten_hoc_sinh: String(params.studentName),
        ma_lop: String(params.classCode),
        diem: Number(params.score || 0),
        diem_toi_da: Number(params.maxScore || 10),
        thoi_luong_giay: Math.round(Number(params.elapsedSeconds || 0)),
        email_hs: String(params.studentEmail || ''),
        guest_id: String(params.guestId || ''),
        thoi_gian_nop: new Date().toISOString(),
        trang_thai: 'SAVED'
      };
      await sbFetch('lich_su?on_conflict=id_luot_lam', {
        method: 'POST',
        prefer: 'resolution=ignore-duplicates,return=minimal',
        body: JSON.stringify(row)
      });
      return { ok: true, studentId: row.id_hs, attemptId: row.id_luot_lam };
    }

    if (action === 'list') {
      const rows = await sbFetch('lich_su?id_gv=eq.' + encodeURIComponent(params.teacherId) + '&id_de=eq.' + encodeURIComponent(params.examId) + '&ma_lop=eq.' + encodeURIComponent(params.classCode) + '&order=thoi_gian_nop.desc');
      const byStudent = {};
      rows.forEach(r => {
        if (!byStudent[r.id_hs]) byStudent[r.id_hs] = { studentName: r.ten_hoc_sinh, classCode: r.ma_lop, score: Number(r.diem), total: 0, count: 0, highestScore: Number(r.diem), lowestScore: Number(r.diem), fastestTimeSeconds: Number(r.thoi_luong_giay), slowestTimeSeconds: Number(r.thoi_luong_giay), elapsedSeconds: Number(r.thoi_luong_giay), submittedAt: r.thoi_gian_nop, id: r.id_hs };
        const item = byStudent[r.id_hs], score = Number(r.diem), duration = Number(r.thoi_luong_giay);
        item.total += score; item.count++;
        item.highestScore = Math.max(item.highestScore, score); item.lowestScore = Math.min(item.lowestScore, score);
        item.fastestTimeSeconds = Math.min(item.fastestTimeSeconds, duration); item.slowestTimeSeconds = Math.max(item.slowestTimeSeconds, duration);
      });
      const list = Object.values(byStudent).map(s => ({ ...s, averageScore: s.total / s.count }));
      list.sort((a, b) => b.score - a.score || a.elapsedSeconds - b.elapsedSeconds);
      const scores = list.map(x => x.score);
      const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      const rankIdx = list.findIndex(x => x.id === params.studentId);
      return {
        ok: true,
        rows: list.slice(0, 100),
        stats: { studentCount: list.length, attemptCount: rows.length, average: avg, highest: scores.length ? Math.max(...scores) : 0, lowest: scores.length ? Math.min(...scores) : 0 },
        studentRank: rankIdx >= 0 ? rankIdx + 1 : null
      };
    }

    if (action === 'catalog') {
      const exams = await sbFetch('de_thi?id_gv=eq.' + encodeURIComponent(params.teacherId) + '&trang_thai=neq.DELETED&order=ngay_tao.desc');
      const history = await sbFetch('lich_su?id_gv=eq.' + encodeURIComponent(params.teacherId) + '&select=id_de,ma_lop');
      const byProject = {};
      exams.forEach(e => {
        const key = e.project_key ? 'P:' + e.project_key : 'E:' + e.id_de;
        if (!byProject[key]) byProject[key] = { groupKey: key, projectKey: e.project_key || '', title: e.ten_de || 'Đề chưa đặt tên', classCode: e.ma_lop || '', examIds: [], examId: e.id_de, createdAt: e.ngay_tao, takenClasses: [] };
        byProject[key].examIds.push(e.id_de);
      });
      const requested = params.examIds ? JSON.parse(params.examIds) : [];
      const classMap = {};
      history.filter(h => !requested.length || requested.includes(h.id_de)).forEach(h => {
        if (!h.ma_lop) return;
        if (!classMap[h.ma_lop]) classMap[h.ma_lop] = { classCode: h.ma_lop, className: h.ma_lop, submissionCount: 0 };
        classMap[h.ma_lop].submissionCount++;
      });
      return { ok: true, teacherId: params.teacherId, examCount: Object.keys(byProject).length, exams: Object.values(byProject), classes: Object.values(classMap) };
    }

    if (action === 'stats') {
      const examIds = params.examIds ? JSON.parse(params.examIds) : [];
      const classCodes = params.classCodes ? JSON.parse(params.classCodes) : [];
      const exams = await sbFetch('de_thi?id_gv=eq.' + encodeURIComponent(params.teacherId));
      const titleMap = {}; exams.forEach(e => titleMap[e.id_de] = e.ten_de || e.id_de);
      let raw = await sbFetchAll('lich_su?id_gv=eq.' + encodeURIComponent(params.teacherId) + '&order=thoi_gian_nop.desc');
      if (examIds.length) raw = raw.filter(r => examIds.includes(r.id_de));
      if (classCodes.length) raw = raw.filter(r => classCodes.includes(r.ma_lop));

      const map = {};
      // Sort explicitly so the first record for each student/exam is always the latest.
      raw.sort((a,b)=>new Date(b.thoi_gian_nop||0).getTime()-new Date(a.thoi_gian_nop||0).getTime());
      raw.forEach((r, index) => {
        const studentKey = String(r.id_hs || r.guest_id || r.email_hs || r.ten_hoc_sinh || ('attempt-' + (r.id_luot_lam || index))).trim();
        const k = studentKey + '|' + String(r.id_de||'') + '|' + String(r.ma_lop||'');
        const parsedScore = Number(r.diem), score = Number.isFinite(parsedScore) ? parsedScore : 0;
        const parsedDuration = Number(r.thoi_luong_giay), duration = Number.isFinite(parsedDuration) ? parsedDuration : 0;
        if (!map[k]) map[k] = { studentId: studentKey, studentName: String(r.ten_hoc_sinh||'').trim() || 'Học sinh chưa có tên', classCode: r.ma_lop||'', examId: r.id_de, examTitle: titleMap[r.id_de] || r.id_de, score, latestScore: score, maxScore: Number(r.diem_toi_da)||10, total: 0, attemptCount: 0, highestScore: score, lowestScore: score, fastestTimeSeconds: duration, slowestTimeSeconds: duration, elapsedSeconds: duration, submittedAt: r.thoi_gian_nop, attemptHistory: [] };
        const item = map[k];
        item.total += score; item.attemptCount++;
        item.maxScore = Math.max(Number(item.maxScore)||10, Number(r.diem_toi_da)||10);
        item.attemptHistory.push({score, maxScore:Number(r.diem_toi_da)||Number(item.maxScore)||10, durationSeconds:duration, submittedAt:r.thoi_gian_nop, attemptId:r.id_luot_lam||'', examId:r.id_de||'', examTitle:titleMap[r.id_de]||r.id_de||''});
        item.highestScore = Math.max(item.highestScore, score); item.lowestScore = Math.min(item.lowestScore, score);
        item.fastestTimeSeconds = Math.min(item.fastestTimeSeconds, duration); item.slowestTimeSeconds = Math.max(item.slowestTimeSeconds, duration);
      });
      const rows = Object.values(map).map(x => ({ ...x, averageScore: x.total / x.attemptCount }));
      const scores = rows.map(x => x.score);
      const count = scores.length;
      const avg = count ? scores.reduce((a, b) => a + b, 0) / count : 0;
      const bands = [
        { name: 'Yếu', min: 0, max: 5 }, { name: 'Trung bình', min: 5, max: 6.5 },
        { name: 'Khá', min: 6.5, max: 8 }, { name: 'Giỏi', min: 8, max: 9 }, { name: 'Xuất sắc', min: 9, max: 10.1 }
      ].map(b => {
        const n = scores.filter(s => s >= b.min && s < b.max).length;
        return { name: b.name, count: n, percent: count ? (n / count) * 100 : 0 };
      });
      return {
        ok: true,
        summary: { studentCount: count, average: avg, highest: count ? Math.max(...scores) : 0, lowest: count ? Math.min(...scores) : 0, gradeBands: bands },
        byClass: [], byExam: [], rows, totalRows: rows.length, rawAttempts: raw.length }; } if (action === 'requestOtp') {
      const email = String(params.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Gmail không hợp lệ.');
      if (!window.emailjs || typeof window.emailjs.send !== 'function') {
        throw new Error('Không tải được thư viện gửi OTP. Hãy tải lại trang hoặc kiểm tra kết nối mạng.');
      }
      const purpose = params.purpose === 'reset_password' ? 'reset_password' : 'register';
      const accounts = await sbFetch('tai_khoan?select=uuid&gmail=eq.' + encodeURIComponent(email));
      if (purpose === 'register' && accounts.length) throw new Error('Gmail này đã được đăng ký. Hãy chuyển sang Đăng nhập.');
      if (purpose === 'reset_password' && !accounts.length) throw new Error('Gmail này chưa có tài khoản.');

      const random = new Uint32Array(1);
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(random);
      else random[0] = Math.floor(Math.random() * 0xFFFFFFFF);
      const code = String(100000 + (random[0] % 900000));
      const exp = Date.now() + 5 * 60 * 1000;
      const otpId = 'EJS-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
      const timeStr = new Date(exp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

      try {
        await window.emailjs.send('service_g3bcbbd', 'template_f3gy1di',
          { email, passcode: code, time: timeStr },
          { publicKey: 'q9aT_k_GtzqHWjXlV' });
      } catch (error) {
        const detail = error && (error.text || error.message);
        throw new Error('EmailJS không gửi được OTP' + (detail ? ': ' + detail : '.'));
      }
      window.__qcOtpStore[email] = { code, exp, otpId, purpose };
      return { ok: true, otpId };
    }

    if (action === 'verifyOtp') {
      const email = String(params.email || '').trim().toLowerCase();
      const inputOtp = String(params.otp || '').trim();
      const saved = window.__qcOtpStore[email];
      if (!saved || saved.exp <= Date.now() || saved.code !== inputOtp || saved.otpId !== String(params.otpId || '')) {
        throw new Error('Mã OTP không đúng hoặc đã hết hạn.');
      }
      if (saved.purpose !== (params.purpose === 'reset_password' ? 'reset_password' : 'register')) {
        throw new Error('Mã OTP không khớp với thao tác hiện tại. Hãy gửi mã mới.');
      }

      const pass = String(params.password || '');
      const name = String(params.displayName || email.split('@')[0]);
      const role = params.role === 'HOCSINH' ? 'HOCSINH' : 'GIAOVIEN';
      if (pass.length < 8 || pass.length > 128) throw new Error('Mật khẩu phải có từ 8 đến 128 ký tự.');

      if (saved.purpose === 'reset_password') {
        const existing = await sbFetch('tai_khoan?select=uuid&gmail=eq.' + encodeURIComponent(email));
        if (!existing.length) throw new Error('Gmail này chưa có tài khoản.');
        await sbFetch('tai_khoan?gmail=eq.' + encodeURIComponent(email), {
          method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ mat_khau: pass })
        });
        delete window.__qcOtpStore[email];
        return { ok: true, passwordReset: true };
      }

      const existing = await sbFetch('tai_khoan?select=uuid&gmail=eq.' + encodeURIComponent(email));
      if (existing.length) throw new Error('Gmail này đã được đăng ký. Hãy chuyển sang Đăng nhập.');
      const uuid = 'USR-' + Date.now().toString(36).toUpperCase();
      const teacherId = role === 'GIAOVIEN' ? 'GV-' + Math.random().toString(36).slice(2, 10).toUpperCase() : '';
      await sbFetch('tai_khoan', {
        method: 'POST', prefer: 'return=minimal',
        body: JSON.stringify({ uuid, gmail: email, ten_hien_thi: name, mat_khau: pass, vai_tro: role, id_gv: teacherId })
      });
      if (role === 'GIAOVIEN') {
        await sbFetch('giao_vien', {
          method: 'POST', prefer: 'return=minimal',
          body: JSON.stringify({ id_gv: teacherId, ten_gv: name, email, uuid_tai_khoan: uuid })
        });
      }
      delete window.__qcOtpStore[email];
      const session = { uuid, email, name, role, teacherId, guestId: params.guestId || '' };
      return { ok: true, sessionToken: 'SB-SESS-' + uuid, session };
    }

    if (action === 'login') { const email = String(params.email || '').trim().toLowerCase(); const pass = String(params.password || ''); const rows = await sbFetch('tai_khoan?gmail=eq.' + encodeURIComponent(email)); if (!rows.length || rows[0].mat_khau !== pass) throw new Error('Gmail hoặc mật khẩu chưa đúng.'); const u = rows[0]; const session = { uuid: u.uuid, email: u.gmail, name: u.ten_hien_thi || u.gmail, role: u.vai_tro || 'GIAOVIEN', teacherId: u.id_gv || '', guestId: params.guestId || '' }; return { ok: true, sessionToken: 'SB-SESS-' + u.uuid, session }; } if (action === 'session') { const uuid = String(params.sessionToken || '').replace('SB-SESS-', ''); const rows = await sbFetch('tai_khoan?uuid=eq.' + encodeURIComponent(uuid)); if (!rows.length) return { ok: true, authenticated: false }; const u = rows[0]; return { ok: true, authenticated: true, session: { uuid: u.uuid, email: u.gmail, name: u.ten_hien_thi || u.gmail, role: u.vai_tro || 'GIAOVIEN', teacherId: u.id_gv || '' } }; } if (action === 'logout') { return { ok: true }; } return null;
  };
})();
