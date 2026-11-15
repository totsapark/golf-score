// ซ้อมกอล์ฟ — แอปแยก: ใช้มือถือช่วยซ้อม (ไม่ต้องใช้อินเทอร์เน็ตหลังเปิดครั้งแรก ข้อมูลอยู่ในเครื่อง)
import { createPractice } from './practice.js';

const VER = '1.2.0', $app = document.getElementById('app'), $back = document.getElementById('back');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function dlg(html, bind) { const d = document.createElement('div'); d.className = 'dlg'; d.innerHTML = `<div class="dlgbox">${html}</div>`; document.body.appendChild(d); bind && bind(d); return d; }
function ask(msg) { return new Promise(res => { dlg(`<p>${esc(msg)}</p><div class="grid2"><button class="btn sec" data-r="0">ยกเลิก</button><button class="btn" data-r="1">ตกลง</button></div>`, d => d.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b) return; d.remove(); res(b.dataset.r === '1'); })); }); }
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

const PR = createPractice($app, { esc, toast, ask, dlg, tr: s => s, ver: VER });
// ปุ่มย้อนกลับ (หัวจอ + ปุ่มของ Android): ปิดหน้าต่าง → กลับหน้าก่อน → ไม่หลุดออกจากแอปจนกว่าจะอยู่หน้าเมนู
const syncBack = () => { $back.hidden = PR.page === 'menu'; };
new MutationObserver(syncBack).observe($app, { childList: true });
history.pushState({}, '', location.href);
addEventListener('popstate', () => {
  const d = document.querySelector('.dlg');
  if (d) { d.remove(); history.pushState({}, '', location.href); return; }
  if (PR.back()) history.pushState({}, '', location.href);
});
$back.addEventListener('click', () => { if (!document.querySelector('.dlg')) PR.back(); });
PR.render(); syncBack();

if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !new URLSearchParams(location.search).has('nosw')) {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('มีเวอร์ชันใหม่ · ปิดแล้วเปิดแอปใหม่เพื่ออัปเดต'); });
}
