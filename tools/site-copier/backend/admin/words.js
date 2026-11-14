window.W=(function(){var th=/^th\b/i.test(navigator.language||'');var w={
signinTitle:['Back office','หลังบ้าน'],password:['Password','รหัสผ่าน'],signin:['Sign in','เข้าสู่ระบบ'],wrong:['Wrong password.','รหัสผ่านไม่ถูกต้อง'],
firstHint:['First time? The password is shown where you started the site, and saved in data/first-password.txt.','ครั้งแรก? รหัสผ่านแสดงตอนเปิดเว็บ และเก็บไว้ในไฟล์ data/first-password.txt'],
title:['Back office','หลังบ้าน'],viewSite:['View site','ดูหน้าเว็บ'],signout:['Sign out','ออกจากระบบ'],
inbox:['Messages','ข้อความ'],pages:['Edit pages','แก้ไขหน้าเว็บ'],settings:['Settings','ตั้งค่า'],
noMessages:['No messages yet. Messages from your site\'s forms appear here.','ยังไม่มีข้อความ ข้อความจากฟอร์มบนเว็บจะแสดงที่นี่'],
markRead:['Mark read','อ่านแล้ว'],markUnread:['Mark unread','ยังไม่อ่าน'],del:['Delete','ลบ'],confirmDel:['Delete this message?','ลบข้อความนี้?'],
csv:['Download all (Excel/CSV)','ดาวน์โหลดทั้งหมด (Excel/CSV)'],from:['Page','หน้า'],
pagesHelp:['Open a page, click any text to change it, click a picture to replace it, then press Save.','เปิดหน้าที่ต้องการ คลิกข้อความเพื่อแก้ คลิกรูปเพื่อเปลี่ยน แล้วกดบันทึก'],
recent:['Recent changes','การแก้ไขล่าสุด'],none:['None yet.','ยังไม่มี'],textChange:['Text changed on','แก้ข้อความหน้า'],imageChange:['Picture replaced','เปลี่ยนรูป'],
changePw:['Change password','เปลี่ยนรหัสผ่าน'],current:['Current password','รหัสผ่านปัจจุบัน'],next:['New password (8+ characters)','รหัสผ่านใหม่ (8 ตัวขึ้นไป)'],save:['Save','บันทึก'],
pwSaved:['Password changed.','เปลี่ยนรหัสผ่านแล้ว'],pwShort:['Use at least 8 characters.','ใช้อย่างน้อย 8 ตัวอักษร'],
firstPw:['You are still using the first password. Change it in Settings.','ยังใช้รหัสผ่านแรกอยู่ เปลี่ยนได้ที่ ตั้งค่า'],
backups:['Your data is in the data and uploads folders. Copy them to keep a backup.','ข้อมูลอยู่ในโฟลเดอร์ data และ uploads คัดลอกเก็บไว้เพื่อสำรอง']
};return function(k){var v=w[k];return v?v[th?1:0]:k};})();
document.querySelectorAll('[data-w]').forEach(function(e){e.textContent=W(e.dataset.w)});
