// สองภาษา ไทย / English
// แปลข้อความบนหน้าจอขณะแสดงผล (แทนเฉพาะวลีที่ตรงทั้งคำ จึงไม่ไปแตะชื่อผู้เล่น/ชื่อสนาม)
const EN = {
  // ---- ทั่วไป ----
  'กำลังโหลด...': 'Loading...', 'ตกลง': 'OK', 'ยกเลิก': 'Cancel', 'ปิด': 'Close', 'ยืนยัน': 'Confirm', 'ลองใหม่': 'Try again', 'เปิด': 'Open', 'เพิ่ม': 'Add', 'เข้า': 'Go',
  'เกิดข้อผิดพลาด': 'Something went wrong', 'เชื่อมต่อไม่ได้': "Can't connect", 'ออนไลน์': 'Online', 'ออฟไลน์': 'Offline', 'กำลังส่ง': 'Sending', 'รอส่ง': 'pending',
  'โหมดทดสอบ': 'Test mode', 'เวอร์ชัน': 'Version', 'แอปออฟไลน์ตัวเดิม': 'Old offline app', 'ใช้แอปออฟไลน์ตัวเดิม': 'Use the old offline app',
  'บาท': 'THB', 'หลา': 'yd', 'เมตร': 'm', 'ม.': 'm', 'คน': 'players', 'ครั้ง': 'times', 'หลุม': 'holes', 'ชิ้น': 'items', 'รายการ': 'items',
  // ---- หน้าแรก ----
  '🏌️ สร้างแก๊งใหม่': '🏌️ Create a gang', '🔑 เข้าร่วมแก๊ง': '🔑 Join a gang', 'เข้าร่วมแก๊ง': 'Join a gang', '📷 สแกน QR': '📷 Scan QR', '📷 สแกน QR แก๊ง': '📷 Scan gang QR',
  'รหัสแก๊ง': 'Gang code', '🕘 แก๊งล่าสุดของฉัน': '🕘 My recent gangs', 'ลบรายการทั้งหมด': 'Clear list', '📚 ประวัติ & Handicap Index': '📚 History & Handicap Index',
  '▶️ วิดีโอแนะนำการใช้งาน': '▶️ How-to video', 'รหัสแก๊งมี 6 ตัว': 'Gang code has 6 characters', 'เจอแก๊ง': 'Found gang',
  'เปิดกล้องไม่ได้ · กดอนุญาตให้ใช้กล้อง หรือพิมพ์รหัสแก๊งแทน': "Can't open the camera · allow camera access, or type the gang code",
  'ลบรายการแก๊งทั้งหมดในเครื่องนี้': 'Remove all gangs from this phone', 'ออกจากรายการ': 'from the list', 'ลบแก๊ง': 'Remove gang',
  'รายการ ลบออกจากเครื่องนี้เลยไหม': 'items · remove from this phone anyway', 'ยังมีข้อมูลรอส่ง': 'Still has unsent data:',
  // ---- ตั้งค่าฐานข้อมูล / ข้อผิดพลาด ----
  '⚙️ ยังไม่ได้เชื่อมฐานข้อมูล': '⚙️ Database not connected', 'ลองโหมดทดสอบ (ข้อมูลอยู่ในเครื่องนี้เท่านั้น)': 'Try test mode (data stays on this phone)',
  'แอปออนไลน์ต้องใช้ Firebase (ฟรี) เป็นที่เก็บคะแนนกลาง เจ้าของแอปต้องใส่ค่าใน': 'The online app needs Firebase (free) to store scores. The app owner must fill in',
  'ระบบยังตั้งค่าไม่เสร็จ: ต้องเปิด Anonymous ใน Firebase Authentication ก่อน (คนสร้างแอป)': 'Setup incomplete: enable Anonymous in Firebase Authentication (app owner)',
  'ยังเชื่อมต่ออินเทอร์เน็ตไม่ได้ · เปิดแอปครั้งแรกต้องมีเน็ต': 'No internet yet · the first launch needs internet',
  '📶 ยังเชื่อมต่อไม่ได้': '📶 Not connected yet', 'เข้าแก๊งครั้งแรกต้องใช้อินเทอร์เน็ต หลังจากนั้นเปิดได้แม้สัญญาณหาย': 'Joining needs internet the first time; after that it works without signal',
  'ไม่พบแก๊ง': 'Gang not found', 'รหัสอาจผิด หรือแก๊งถูกลบไปแล้ว': 'Wrong code, or the gang was deleted', 'กลับหน้าแรก': 'Back to home', '🏠 กลับหน้าแรก': '🏠 Home',
  'คุณไม่ได้อยู่ในแก๊งนี้แล้ว': "You're no longer in this gang", 'มีเวอร์ชันใหม่ · ปิดแล้วเปิดแอปใหม่เพื่ออัปเดต': 'New version available · reopen the app to update',
  'ยังอยู่ในแก๊ง · กลับหน้าแรกได้ที่แท็บ 👥 แก๊ง': 'Still in the gang · go home from the 👥 Gang tab',
  // ---- สร้างแก๊ง ----
  'สนาม': 'Course', 'ชื่อสนาม': 'Course name', 'วันที่': 'Date', 'จำนวนหลุม': 'Holes', '9 หลุม': '9 holes', '18 หลุม': '18 holes',
  'ชื่อของคุณ': 'Your name', 'ชื่อ': 'Name', 'แต้มต่อของคุณ': 'Your handicap', 'ไม่ต่อเว้นว่าง': 'blank = none', 'PIN แก๊ง 4 หลัก': 'Gang PIN (4 digits)', 'PIN แก๊ง': 'Gang PIN',
  '💰 กินตัง: สุ่ม 3 อันดับทุกหลุม': '💰 Money game: 3 random ranks per hole', 'สุ่มครั้งที่ 1': 'Draw 1', 'ครั้งที่ 2': 'Draw 2', 'ครั้งที่ 3': 'Draw 3',
  'จัดอันดับด้วย': 'Rank by', 'จัดอันดับเงินด้วย': 'Rank money by', 'Net (หักแต้มต่อ)': 'Net (minus handicap)', 'อันดับที่สุ่มได้มีคนเสมอกัน': 'Tie at a drawn rank', 'อันดับที่สุ่มได้มีคนเสมอ': 'Tie at a drawn rank',
  'เสียทุกคน': 'All pay', 'ตัดด้วยพัตต์': 'Fewer putts wins', 'สุ่ม 1 คน': 'Random one', '✅ สร้างแก๊ง': '✅ Create gang',
  '🔎 ค้นหาสนาม & ดาวน์โหลดแผนที่': '🔎 Find course & download map', 'ใส่ชื่อของคุณ': 'Enter your name', 'ตั้ง PIN ตัวเลข 4 หลัก': 'Set a 4-digit PIN', 'สร้างไม่สำเร็จ': 'Could not create',
  'เช่น Blue': 'e.g. Blue', 'เช่น 72.3': 'e.g. 72.3', 'เช่น 128': 'e.g. 128',
  // ---- ค้นหาสนาม / แผนที่สนาม ----
  '🔎 ค้นหาสนามกอล์ฟ': '🔎 Find a golf course', 'ค้นหา': 'Search', 'กำลังค้นหา...': 'Searching...', 'ค้นหาไม่ได้ ต้องมีอินเทอร์เน็ต': 'Search needs internet',
  'ไม่พบ ลองพิมพ์ชื่อภาษาอังกฤษหรือไทยแบบอื่น': 'Not found · try another English or Thai spelling', '⬇️ กำลังดาวน์โหลดแผนที่สนาม...': '⬇️ Downloading course map...',
  'ดาวน์โหลดไม่สำเร็จ': 'Download failed', 'ต้องมีอินเทอร์เน็ต ลองใหม่อีกครั้ง': 'Needs internet · please try again', 'เชื่อมต่อเซิร์ฟเวอร์แผนที่ไม่ได้': "Can't reach the map server",
  'ไม่พบข้อมูลสนาม': 'No course data', 'ไม่พบข้อมูลสนามนี้ใน OpenStreetMap': 'This course is not in OpenStreetMap',
  'ตั้งค่าหลุมเองได้ที่แท็บ 🗺️ แผนที่ → ⚙️ → 🛠 ตั้งค่าหลุมเอง': 'Set holes yourself: 🗺️ Map tab → ⚙️ → 🛠 Set up holes',
  '✅ Par ครบ 18 หลุม': '✅ Par for all 18 holes', '⚠️ ยังไม่มี Par (ตั้งได้ในแท็บแก๊ง)': '⚠️ No par yet (set it in the Gang tab)', 'ตำแหน่งหลุม': 'Hole positions',
  '/18 หลุม · รูปทรงกรีน/บังเกอร์/น้ำ': '/18 holes · greens/bunkers/water', 'ดาวน์โหลดแผนที่แล้ว ✓': 'Map downloaded ✓', '🛠 ตั้งค่าหลุมเลย': '🛠 Set up holes now',
  '🗺️ แผนที่สนาม': '🗺️ Course map', '✅ มีแผนที่แล้ว: ข้อมูลกรีน': '✅ Map ready: greens for', 'หลุม · รูปทรง': 'holes · shapes',
  '🔎 ค้นหาสนามจากชื่อ & ดาวน์โหลด': '🔎 Find course by name & download', '🛠 ตั้งค่าหลุมเอง (แตะแท่นที/กรีนบนภาพดาวเทียม)': '🛠 Set up holes (tap tee/green on satellite)',
  '📍 ใช้ตำแหน่งฉัน': '📍 Use my location', '🗺️ เปิดแผนที่': '🗺️ Open map', '📋 Par & HCP ของสนาม': '📋 Course par & HCP',
  '💾 บันทึกเป็นข้อมูลสนาม (รอบหน้า/คนอื่นไม่ต้องตั้งอีก)': '💾 Save as course data (for next time / others)', '📍 บันทึกข้อมูลสนามไว้ใช้รอบหน้า': '📍 Save course data for next time',
  // ---- เข้าแก๊ง ----
  'PIN ไม่ถูกต้อง': 'Wrong PIN', '👋 คุณคือใคร': '👋 Who are you', '＋ ผู้เล่นใหม่': '＋ New player', 'ชื่อเล่น': 'Nickname', 'เข้าแก๊ง': 'Join gang', 'แก๊งเต็ม 10 คนแล้ว': 'Gang is full (10)',
  'ใช้อยู่ในเครื่องอื่น': 'in use on another phone', 'ใช้อยู่ในเครื่องอื่น ย้ายมาใช้เครื่องนี้แทน': 'is on another phone · move to this phone', 'ใส่ชื่อก่อน': 'Enter a name first',
  'ชื่อนี้มีแล้ว แตะที่ชื่อด้านบนแทน': 'Name taken · tap it above instead', 'ยังไม่มีผู้เล่น': 'No players yet', 'ชื่อซ้ำ': 'Duplicate name',
  // ---- แท็บ ----
  'จดสกอร์': 'Score', 'แผนที่': 'Map', 'สด': 'Live', 'สรุป': 'Summary', 'แก๊ง': 'Gang',
  // ---- จดสกอร์ ----
  'หลุมที่': 'Hole', 'ตีถึงออน': 'Strokes to green', 'พัตต์': 'Putts', 'ป่า/หาย': 'Lost', 'ตกน้ำ': 'Water', 'บังเกอร์': 'Bunker',
  '⬅ ซ้าย': '⬅ Left', '⬆ ตรง': '⬆ Fairway', 'ขวา ➡': 'Right ➡', 'สกอร์': 'Score', '= ออน': '= to green', '+ พัตต์': '+ putts', '+ โทษ': '+ penalty', 'แต้ม': 'strokes',
  'จดให้ (เฉพาะคนสร้างแก๊ง)': 'Record for (host only)', '(จดแทน)': '(for them)', 'จดแทน': 'for them', '🏌️ ช็อตหลุมนี้': '🏌️ Shots this hole', '📍 ตีแล้ว · บันทึกช็อต': '📍 Record shot',
  'ไปหลุม': 'Go to hole', 'ดูสรุปผล 🏁': 'See summary 🏁', '👥 หลุมนี้ของแก๊ง': '👥 This hole', '(เงินคิดด้วย': '(money by', 'เสีย': 'Pays', 'รอ': 'waiting',
  'หน้า': 'Front', 'กลางกรีน': 'Center', 'หลัง': 'Back', 'ถึงกลางกรีน': 'To center', 'ลบช็อต': 'Delete shot', 'เหลือ': 'left',
  'ตีด้วยไม้อะไร': 'Which club', 'Driver': 'Driver', 'แฟร์เวย์วู้ด': 'Fairway wood', 'ไฮบริด': 'Hybrid', 'เหล็ก': 'Iron', 'เวดจ์': 'Wedge', 'พัตเตอร์': 'Putter',
  'เลือกเบอร์ ›': 'Pick number ›', 'ล่าสุด': 'last', '· เบอร์อะไร': '· which number', 'ไม่ระบุเบอร์': 'No number', '‹ เปลี่ยนประเภทไม้': '‹ Change club type',
  'แล้ว ✓': '✓', 'แล้ว (ไม่มีตำแหน่ง GPS)': '(no GPS position)', 'บันทึก': 'Saved',
  // ---- เงิน / สุ่ม ----
  '🎲 ผลสุ่มหลุม': '🎲 Draw · hole', '🎲 สุ่มเงินหลุม': '🎲 Money draw · hole', 'กำลังสุ่ม...': 'Drawing...', 'ครั้งที่': 'Draw', ': อันดับ': ': rank', 'คุณเสีย': 'You pay',
  'บาท 😅': 'THB 😅', 'คุณรอด 😎': "You're safe 😎", 'ไม่มีใครโดน': 'Nobody hit', '🎲 สุ่มได้อันดับ': '🎲 Drawn ranks',
  '💰 กินตัง': '💰 Money game', 'ปิดกินตังแล้ว': 'Money game off', '💰 เปิดกินตังแล้ว': '💰 Money game on',
  'ปิดกินตัง? (ไม่สุ่มเงินหลุมต่อไป ยอดที่คิดไปแล้วจะไม่แสดง)': 'Turn off the money game? (no more draws; past amounts are hidden)',
  '💰 เงินสุ่ม 3 อันดับต่อหลุม (บาท)': '💰 Amount per draw (THB)', '🍛 ค่ากับข้าว (บาท)': '🍛 Lunch bill (THB)', 'ใส่ยอดบิลตอนจบ': 'Enter the bill at the end',
  // ---- แผนที่ ----
  '📍 บันทึกช็อต': '📍 Record shot', 'ช็อต': 'Shots', 'ช็อตหลุม': 'Shots · hole', 'จากที': 'from tee', 'ยังไม่มีจุดกรีนของหลุมนี้': 'No green point for this hole',
  'กด ⚙️ เพื่อโหลดข้อมูลสนามหรือปักเอง': 'Tap ⚙️ to load course data or set it', 'รอ GPS...': 'Waiting for GPS...', 'GPS คลาดเคลื่อน ~': 'GPS accuracy ~',
  'ยังไม่มีช็อตในหลุมนี้ กด 📍 บันทึกช็อต ตอนยืนที่ลูก': 'No shots on this hole · tap 📍 Record shot at your ball',
  '🔎 ค้นหาสนามจากชื่อ แล้วดาวน์โหลด': '🔎 Find course by name and download', '🛠 ตั้งค่าหลุมเอง (แตะแท่นที → กรีน ทีละหลุม)': '🛠 Set up holes (tap tee → green per hole)',
  '📍 ดาวน์โหลดสนามตรงที่แผนที่อยู่ / ตำแหน่งฉัน': '📍 Download course at map / my location', '🅃 ปักแท่นทีหลุม': '🅃 Place tee · hole', '⛳ ปักกรีนหลุม': '⛳ Place green · hole',
  '🗑 ล้างแผนที่สนามของแก๊งนี้': "🗑 Clear this gang's course map", 'ล้างข้อมูลแผนที่สนามของแก๊งนี้': "Clear this gang's course map", 'แผนที่สนาม': 'Course map',
  'แตะบนแผนที่ตรงแท่นที': 'Tap the tee on the map', 'แตะบนแผนที่ตรงกลางกรีน': 'Tap the center of the green', 'ปักแท่นทีหลุม': 'Tee placed · hole', 'ปักกรีนหลุม': 'Green placed · hole',
  'เลื่อนแผนที่ไปที่สนาม (ซูมเข้า) หรือเปิด GPS ก่อน': 'Move the map to the course (zoom in) or turn on GPS first',
  '🛠 ตั้งค่าหลุมเอง': '🛠 Set up holes', 'ทำครั้งเดียว ใช้ได้ทั้งแก๊งและรอบหน้า (ประมาณ 5 นาที)': 'Do it once · works for the gang and next time (about 5 min)',
  '1. ซูมภาพดาวเทียมหาหลุมนั้น': '1. Zoom the satellite view to the hole', '2. แตะที่': '2. Tap the', '3. แตะที่': '3. Tap the', '4. แอปไปหลุมถัดไปให้เอง': '4. The app moves to the next hole',
  'ดูลำดับหลุมได้จากป้ายในสนาม หรือแผนผังสนามใน Garmin': 'Check the hole order on course signs or in Garmin', '🛠 หลุม': '🛠 Hole', '👆 แตะที่': '👆 Tap the',
  'แท่นที': 'tee', '‹ ย้อน': '‹ Back', 'ข้าม ›': 'Skip ›', 'เสร็จ': 'Done', 'ครบแล้ว!': 'All done!', 'ตั้งค่าแล้ว': 'Set', 'หลุม ✓ บันทึกเป็นแผนที่สนามไว้ใช้รอบหน้า': 'holes ✓ saved as the course map',
  // ---- สด ----
  'ใครอยู่หลุมไหน': 'Who is on which hole', '🗺️ ทุกคนอยู่ตรงไหน': '🗺️ Where is everyone', 'ดูทุกคน': 'Show all', 'เห็นตำแหน่ง': 'Seeing', 'ยังไม่มีใครเปิด GPS': 'Nobody has GPS on yet',
  '🏆 Leaderboard สด': '🏆 Live leaderboard', 'ผู้เล่น': 'Player', 'อยู่': 'On', '📰 ความเคลื่อนไหวล่าสุด': '📰 Latest activity', 'ยังไม่มีใครจดสกอร์': 'No scores yet',
  '📋 สกอร์การ์ดสด': '📋 Live scorecard', 'รวม': 'Total', 'เมื่อกี้': 'just now', 'นาทีที่แล้ว': 'min ago', 'ชม.ที่แล้ว': 'h ago',
  // ---- สรุป ----
  '🏁 สรุปผล ·': '🏁 Summary ·', 'เรียง Gross': 'Sort Gross', 'เรียง Net': 'Sort Net', '🏅 รางวัลประจำรอบ': '🏅 Awards', '💰 เงิน & ค่ากับข้าว': '💰 Money & lunch',
  'กองกลาง': 'Pot', 'กองกลางไม่พอ ทุกคนจ่ายเพิ่มคนละ': 'Pot is short · each pays extra', 'กองกลางเหลือ': 'Pot left over', 'พอดี 👍': 'Exactly covered 👍', 'พอดี': 'covered',
  'ค่ากับข้าว': 'Lunch', '🍛 ค่ากับข้าว': '🍛 Lunch', 'หาร': 'split', 'คน → คนละ': 'players → each', 'บาท → คนละ': 'THB → each', 'บาท หาร': 'THB split', 'บาท →': 'THB →',
  'โดนสุ่ม': 'Drawn', 'เข้ากอง': 'To pot', 'รวมจ่าย': 'Total', 'ค่าข้าว': 'incl. lunch', '📈 การกระจายสกอร์': '📈 Score distribution',
  '⛳ สกอร์เฉลี่ยตาม Par': '⛳ Average score by par', '/ หน้า-หลัง': '/ front-back', 'ดีสุด': 'Best', 'แย่สุด': 'Worst', '🎯 พัตต์ & ลูกสั้น': '🎯 Putting & short game',
  'พัตต์/หลุม': 'putts/hole', '/หลุม': '/hole', '1 พัตต์': '1 putt', '3 พัตต์': '3 putts', 'ชิปลง': 'Chip-ins', '🚫 ลูกโทษ & บังเกอร์': '🚫 Penalties & bunkers',
  'แต้มโทษ': 'Penalty strokes', 'สกอร์เมื่อ': 'Score when', 'ตีตรง': 'fairway', 'เมื่อ': 'when', 'ไม่ตรง': 'missed',
  '🏌️‍♂️ ระยะไม้ของฉัน (จากช็อตที่บันทึก)': '🏌️‍♂️ My club distances (from recorded shots)', 'ไม้': 'Club', 'ใช้': 'Used', 'เฉลี่ย': 'Avg', 'ไกลสุด': 'Longest',
  '🗺️ แผนที่การตีย้อนหลัง': '🗺️ Shot replay map', 'ทั้งหมด': 'All', '📋 สกอร์การ์ด': '📋 Scorecard', 'สกอร์การ์ด': 'Scorecard', '📤 แชร์ & บันทึก': '📤 Share & save',
  '📷 ส่งรูปสกอร์การ์ด': '📷 Share scorecard image', '📋 คัดลอกสรุป (ส่ง LINE)': '📋 Copy summary (for LINE)', 'บันทึกรอบนี้ลงประวัติ (เครื่องนี้)': 'Save this round to history (this phone)',
  'อัปเดตประวัติรอบนี้': 'Update this round in history', 'บันทึกรอบนี้ลงประวัติ': 'Save this round to history', 'คัดลอกแล้ว ✓': 'Copied ✓', 'กดค้างที่รูป → บันทึกรูปภาพ': 'Press and hold the image → Save',
  // ---- รางวัล ----
  'แชมป์ Gross': 'Gross champion', 'แชมป์ Net': 'Net champion', 'ราชาพัตต์': 'Putting king', 'เทพ GIR': 'GIR master', 'ไดรฟ์ตรงสุด': 'Straightest driver', '% ลงแฟร์เวย์': '% fairways',
  'นักล่าเบอร์ดี้': 'Birdie hunter', 'ฟอร์มนิ่งสุด': 'Most consistent', 'พาร์หรือดีกว่าติดกัน': 'par or better in a row:', 'สายเซฟพาร์': 'Par saver', 'นักสำรวจป่า': 'Jungle explorer',
  'หาลูกไม่เจอ': 'lost balls:', 'นักดำน้ำ': 'Scuba diver', 'ราชา OB': 'OB king', 'ขาประจำบังเกอร์': 'Bunker regular', 'ดวงซวยประจำก๊วน': 'Unluckiest', 'ATM ประจำก๊วน': 'Gang ATM', '🏅 รางวัล': '🏅 Awards',
  // ---- แก๊ง / ตั้งค่า ----
  '📲 ชวนเพื่อนเข้าแก๊ง': '📲 Invite friends', '🔗 แชร์ลิงก์เข้าแก๊ง': '🔗 Share join link', 'ลิงก์เข้าแก๊ง': 'Join link', 'คัดลอกลิงก์แล้ว': 'Link copied', 'เข้าแก๊งกอล์ฟ': 'Join golf gang', '(รหัส': '(code',
  '👥 ผู้เล่น': '👥 Players', '(ฉัน)': '(me)', 'มีเครื่องจดแล้ว': 'has a phone', 'ยังไม่มีเครื่อง': 'no phone yet', 'เพิ่มชื่อเพื่อนล่วงหน้า': "Add a friend's name", 'ครบ 10 คนแล้ว': 'Already 10 players',
  'ออกจากแก๊ง? (คะแนนของคนนี้จะหายด้วย)': "Remove from gang? (their scores are deleted too)", '⚙️ ตั้งค่ารอบ': '⚙️ Round settings', 'Tee (สีแท่นที)': 'Tee', 'หน่วยระยะ': 'Distance unit',
  '📱 เครื่องนี้': '📱 This phone', 'โหมดกลางแดด': 'Sunlight mode', 'กันจอดับ': 'Keep screen on', 'บันทึกช็อต (ไม้ + ตำแหน่ง)': 'Record shots (club + position)', 'ภาษา': 'Language',
  'ออกจากแก๊งในเครื่องนี้': 'Leave gang on this phone', 'ออกจากแก๊งในเครื่องนี้? (คะแนนที่ส่งแล้วยังอยู่ เข้าใหม่ได้ด้วย PIN)': 'Leave on this phone? (sent scores stay; rejoin with the PIN)',
  'รายการ (รอเน็ต) ถ้าออกตอนนี้จะหาย ออกเลยไหม': 'items (waiting for internet) will be lost · leave anyway',
  '🗑 ลบแก๊งนี้ทิ้ง (ข้อมูลทุกคน)': "🗑 Delete this gang (everyone's data)", 'ลบแก๊งนี้ทิ้ง? คะแนน แผนที่ และข้อมูลของทุกคนในแก๊งจะหายถาวร': "Delete this gang? Everyone's scores, map and data are gone for good",
  'ลบแก๊งแล้ว': 'Gang deleted', '💡 กันจอดับ: เปิด': '💡 Keep screen on: ON', 'กันจอดับ: ปิด': 'Keep screen on: OFF', '🌞 โหมดกลางแดด: เปิด (ตัวใหญ่ สีชัด)': '🌞 Sunlight mode: ON (bigger, high contrast)',
  'โหมดกลางแดด: ปิด': 'Sunlight mode: OFF', '📍 เปิดบันทึกช็อต': '📍 Shot recording ON', 'ปิดบันทึกช็อตแล้ว': 'Shot recording OFF',
  'แดง': 'Red', 'เหลือง': 'Yellow', 'ขาว': 'White', 'น้ำเงิน': 'Blue', 'ดำ': 'Black',
  // ---- ประวัติ ----
  'ลบรอบนี้ออกจากประวัติ': 'Delete this round from history', '🗺️ ดูการตี': '🗺️ View shots', '‹ กลับไปประวัติ': '‹ Back to history', '🗑 ลบประวัติทั้งหมด': '🗑 Delete all history',
  'ลบประวัติทั้งหมด? (Handicap Index จะเริ่มนับใหม่)': 'Delete all history? (Handicap Index restarts)', 'รอบ': 'Rounds', 'รอบกอล์ฟ': 'Golf round', 'ยังไม่มีประวัติ จบรอบแล้วกด': 'No history yet · after a round tap',
  'ในหน้าสรุป': 'on the Summary tab', 'ข้อมูลครบ': 'Full data ·',
  'เช่น ปัญญาอินทรา, Alpine': 'e.g. Panya Indra, Alpine', 'ของ': 'of',
};
const MON_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export let LANG = 'th';
const TH = '฀-๿';
let RX = null;
function build() {
  const keys = Object.keys(EN).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // วลีต้องไม่ติดกับตัวอักษรไทยตัวอื่น (กันไปแปลกลางคำ/ชื่อคน)
  RX = new RegExp(`(?<![${TH}])(${keys.join('|')})(?![${TH}])`, 'g');
}
// แปลข้อความหนึ่งก้อน (ใช้กับข้อความที่ไม่ได้อยู่บนหน้าจอ เช่น ข้อความคัดลอก / รูปสกอร์การ์ด)
export function tr(s) {
  if (LANG === 'th' || s == null) return s;
  const str = String(s); if (!/[฀-๿]/.test(str)) return str;
  if (!RX) build();
  return str.replace(RX, m => EN[m] ?? m);
}
// วันที่สั้น: ไทย "13 พ.ย. 69" / อังกฤษ "13 Nov 2026"
export function shortDate(s) {
  if (!s) return ''; const [y, m, d] = s.split('-');
  return LANG === 'en' ? `${+d} ${MON_EN[m - 1]} ${y}` : `${+d} ${MON_TH[m - 1]} ${(+y + 543) % 100}`;
}
function walk(root) {
  if (!root) return;
  if (root.nodeType === 3) { const v = root.nodeValue; if (/[฀-๿]/.test(v) && !root.parentElement?.closest('[data-notr],input,textarea,select,script,style')) { const t = tr(v); if (t !== v) root.nodeValue = t; } return; }
  if (root.nodeType !== 1 || root.closest?.('[data-notr]')) return;
  for (const a of ['placeholder', 'title', 'aria-label']) { const v = root.getAttribute?.(a); if (v && /[฀-๿]/.test(v)) root.setAttribute(a, tr(v)); }
  if (root.tagName === 'SCRIPT' || root.tagName === 'STYLE') return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n; while ((n = w.nextNode())) {
    if (n.nodeType === 1) { for (const a of ['placeholder', 'title', 'aria-label']) { const v = n.getAttribute(a); if (v && /[฀-๿]/.test(v)) n.setAttribute(a, tr(v)); } continue; }
    const v = n.nodeValue; if (!/[฀-๿]/.test(v)) continue;
    const p = n.parentElement; if (!p || p.closest('[data-notr],input,textarea,select,script,style')) continue;
    const t = tr(v); if (t !== v) n.nodeValue = t;
  }
}
export function initLang(lang) {
  LANG = lang === 'en' ? 'en' : 'th';
  document.documentElement.lang = LANG;
  if (LANG === 'th') return;
  build(); walk(document.body);
  let q = new Set(), sched = false;
  new MutationObserver(ms => {
    for (const m of ms) { if (m.type === 'characterData') q.add(m.target); else m.addedNodes.forEach(n => q.add(n)); }
    if (!sched) { sched = true; queueMicrotask(() => { sched = false; const nodes = [...q]; q = new Set(); nodes.forEach(walk); }); }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
