import type { StarterContent, StarterItem, StarterLanguage } from './starters'

// The second set of looks. As in starter-looks.ts, only the layout patterns are learned from well-made sites;
// the words are our own samples and the photos are CC0 files served from /templates.

const footer = { en: 'This is a sample site. Its words, prices and times are examples.', th: 'นี่คือเว็บตัวอย่าง ข้อความ ราคา และเวลาในเว็บนี้เป็นเพียงตัวอย่าง' }

/** A new look over a starter that keeps its tables, records, items and automations. */
export type Look = Record<StarterLanguage, Partial<Omit<StarterContent, 'settings'>> & { settings: Partial<StarterContent['settings']> }>

/** Gives sample items photos, in turn. */
export const withPhotos = (items: StarterItem[], photos: string[], alt: string): StarterItem[] => items.map((item, index) => ({ ...item, imageUrl: `/templates/${photos[index % photos.length]}.jpg`, imageAlt: `${alt} (${item.title})` }))

// Premium products: a bright, centred product hero, the range below in clean cards, one big photo beside a
// short story, and how ordering works. Lots of white, one dark accent.
export const shopLook: Look = {
  en: {
    label: 'Online shop',
    description: 'A clean, premium shop: big product photos, a product range with a cart, and how ordering works.',
    includes: ['Home page with a product hero, the range and a story', 'Six sample products with photos', 'How to order page with questions and a form', 'Cart with bank transfer and pay on delivery'],
    settings: { style: 'studio', headingFont: 'Inter', bodyFont: 'Inter', accent: '#1d1d1f', background: '#ffffff', text: '#1d1d1f', nav: [{ label: 'Shop', href: '/#products' }, { label: 'Our story', href: '/#story' }, { label: 'How to order', href: '/how-to-order' }], headerButtonLabel: 'Shop now', headerButtonHref: '/#products' },
    pages: [
      { slug: 'home', title: 'Sample Shop', description: 'A sample online shop with products, a cart and ways to pay.', blocks: [
        { type: 'hero', layout: 'split', eyebrow: 'Sample shop · New', heading: 'Made simply. Made to last.', text: 'A sample shop for well-made everyday things. Products, prices and stock here are samples, so change them before you take real orders.', buttonLabel: 'Shop now', buttonHref: '/#products', secondLabel: 'How to order', secondHref: '/how-to-order', imageUrl: '/templates/shop-hero.jpg', imageAlt: 'A pair of black headphones on a white background' },
        { type: 'collection', id: 'products', collection: 'products', heading: 'The range', intro: 'All products below are samples.', filters: true, tone: 'tint' },
        { type: 'split', id: 'story', heading: 'Fewer, better things', body: 'Tell people what makes your products different: the materials, who makes them and how long they last.\n\nThis is sample text.', imageUrl: '/templates/shop-watch.jpg', imageAlt: 'Close-up of a black watch face', imageSide: 'right', buttonLabel: 'See the range', buttonHref: '/#products' },
        { type: 'steps', heading: 'How ordering works', items: [{ title: 'Add to your cart', text: 'Choose what you like and how many.' }, { title: 'Choose how to pay', text: 'Pay by bank transfer, or pay when your order arrives.' }, { title: 'We send it', text: 'We pack your order and let you know when it is on its way.' }] },
        { type: 'cta', heading: 'Questions before you order?', text: 'Read how ordering, payment and delivery work.', buttonLabel: 'How to order', buttonHref: '/how-to-order', tone: 'dark' },
      ] },
      { slug: 'how-to-order', title: 'How to order', description: 'Sample page on how to order, pay and get your delivery.', blocks: [
        { type: 'hero', layout: 'centered', heading: 'How to order', text: 'Everything about paying and getting your order, in one place. This page is a sample.' },
        { type: 'faq', heading: 'Questions', tone: 'tint', items: [{ question: 'How do I pay?', answer: 'At checkout, choose bank transfer or pay on delivery. If you choose bank transfer, you see how to pay when you place your order.' }, { question: 'When does my order arrive?', answer: 'A sample answer. Say how long packing and delivery usually take.' }, { question: 'Can I return something?', answer: 'A sample answer. Explain your return rules.' }] },
        { type: 'form', name: 'questions', heading: 'Ask a question', intro: 'We reply by email.', buttonLabel: 'Send question', sentMessage: 'Thank you. Your question has been sent.', fields: [{ name: 'name', label: 'Your name', type: 'text', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'message', label: 'Your question', type: 'textarea', required: true }] },
      ] },
    ],
  },
  th: {
    label: 'ร้านค้าออนไลน์',
    description: 'ร้านค้าดูพรีเมียม ภาพสินค้าใหญ่ รายการสินค้าพร้อมตะกร้า และวิธีสั่งซื้อ',
    includes: ['หน้าแรกมีภาพสินค้าใหญ่ รายการสินค้า และเรื่องราวของร้าน', 'สินค้าตัวอย่าง 6 ชิ้นพร้อมรูป', 'หน้าวิธีสั่งซื้อพร้อมคำถามและฟอร์ม', 'ตะกร้าพร้อมโอนเงินและเก็บเงินปลายทาง'],
    settings: { style: 'studio', headingFont: 'IBM Plex Sans Thai', bodyFont: 'IBM Plex Sans Thai', accent: '#1d1d1f', background: '#ffffff', text: '#1d1d1f', nav: [{ label: 'สินค้า', href: '/#products' }, { label: 'เรื่องของเรา', href: '/#story' }, { label: 'วิธีสั่งซื้อ', href: '/how-to-order' }], headerButtonLabel: 'เลือกซื้อ', headerButtonHref: '/#products' },
    pages: [
      { slug: 'home', title: 'ร้านค้าตัวอย่าง', description: 'ร้านค้าออนไลน์ตัวอย่าง มีสินค้า ตะกร้า และวิธีชำระเงิน', blocks: [
        { type: 'hero', layout: 'split', eyebrow: 'ร้านค้าตัวอย่าง · มาใหม่', heading: 'เรียบง่าย ใช้ได้นาน', text: 'ร้านตัวอย่างสำหรับของใช้คุณภาพดี สินค้า ราคา และสต็อกในหน้านี้เป็นตัวอย่าง เปลี่ยนเป็นของจริงก่อนรับคำสั่งซื้อ', buttonLabel: 'เลือกซื้อ', buttonHref: '/#products', secondLabel: 'วิธีสั่งซื้อ', secondHref: '/how-to-order', imageUrl: '/templates/shop-hero.jpg', imageAlt: 'หูฟังสีดำบนพื้นขาว' },
        { type: 'collection', id: 'products', collection: 'products', heading: 'สินค้าทั้งหมด', intro: 'สินค้าทั้งหมดด้านล่างเป็นตัวอย่าง', filters: true, tone: 'tint' },
        { type: 'split', id: 'story', heading: 'น้อยชิ้น แต่ดีกว่า', body: 'เล่าว่าสินค้าของคุณต่างจากที่อื่นอย่างไร วัสดุ คนทำ และใช้ได้นานแค่ไหน\n\nข้อความนี้เป็นตัวอย่าง', imageUrl: '/templates/shop-watch.jpg', imageAlt: 'หน้าปัดนาฬิกาสีดำ', imageSide: 'right', buttonLabel: 'ดูสินค้า', buttonHref: '/#products' },
        { type: 'steps', heading: 'สั่งซื้ออย่างไร', items: [{ title: 'ใส่ตะกร้า', text: 'เลือกสินค้าและจำนวนที่ต้องการ' }, { title: 'เลือกวิธีจ่าย', text: 'โอนเงิน หรือจ่ายตอนได้รับของ' }, { title: 'เราจัดส่ง', text: 'แพ็กของและแจ้งเมื่อส่งออกแล้ว' }] },
        { type: 'cta', heading: 'มีคำถามก่อนสั่งไหม', text: 'อ่านวิธีสั่งซื้อ ชำระเงิน และจัดส่ง', buttonLabel: 'วิธีสั่งซื้อ', buttonHref: '/how-to-order', tone: 'dark' },
      ] },
      { slug: 'how-to-order', title: 'วิธีสั่งซื้อ', description: 'หน้าตัวอย่างเรื่องวิธีสั่งซื้อ ชำระเงิน และรับสินค้า', blocks: [
        { type: 'hero', layout: 'centered', heading: 'วิธีสั่งซื้อ', text: 'ทุกเรื่องการจ่ายเงินและรับของในที่เดียว หน้านี้เป็นตัวอย่าง' },
        { type: 'faq', heading: 'คำถาม', tone: 'tint', items: [{ question: 'จ่ายเงินอย่างไร', answer: 'ตอนชำระเงิน เลือกโอนเงินหรือเก็บเงินปลายทาง ถ้าเลือกโอนเงิน จะเห็นวิธีโอนหลังกดสั่งซื้อ' }, { question: 'ของจะถึงเมื่อไร', answer: 'คำตอบตัวอย่าง บอกว่าปกติแพ็กและส่งใช้เวลากี่วัน' }, { question: 'คืนสินค้าได้ไหม', answer: 'คำตอบตัวอย่าง อธิบายเงื่อนไขการคืนสินค้า' }] },
        { type: 'form', name: 'questions', heading: 'ส่งคำถามถึงเรา', intro: 'เราจะตอบกลับทางอีเมล', buttonLabel: 'ส่งคำถาม', sentMessage: 'ขอบคุณ ส่งคำถามเรียบร้อยแล้ว', fields: [{ name: 'name', label: 'ชื่อของคุณ', type: 'text', required: true }, { name: 'email', label: 'อีเมล', type: 'email', required: true }, { name: 'message', label: 'คำถามของคุณ', type: 'textarea', required: true }] },
      ] },
    ],
  },
}

// Events: dark, lively and bold. A full-photo hero, the next events right away, what to expect, and a clear
// way to register with a site account.
export const clubsLook: Look = {
  en: {
    label: 'Events and community',
    description: 'A bold events site: upcoming events with places left, and registration with a site account.',
    includes: ['Home page with a photo hero and what to expect', 'Events page with places left', 'Registration for signed-in visitors, one place each'],
    settings: { style: 'bold', headingFont: 'Bricolage Grotesque', bodyFont: 'Inter', accent: '#ff5a5f', background: '#111114', text: '#f5f5f7', nav: [{ label: 'Events', href: '/events' }, { label: 'Register', href: '/events#signup' }], headerButtonLabel: 'See events', headerButtonHref: '/events' },
    pages: [
      { slug: 'home', title: 'Sample Events', description: 'A sample events and community site with upcoming events and registration.', blocks: [
        { type: 'hero', layout: 'cover', eyebrow: 'Sample community', heading: 'Unforgettable evenings start here', text: 'Meetups, workshops and nights out, all in one place. Every event on this site is a sample.', buttonLabel: 'See events', buttonHref: '/events', secondLabel: 'Create an account', secondHref: '/signup?next=%2Fevents', imageUrl: '/templates/events-hero.jpg', imageAlt: 'A crowd with raised hands in front of a lit stage' },
        { type: 'features', heading: 'What to expect', items: [{ title: 'Meet people', text: 'Sample meetups for people who share an interest.' }, { title: 'Learn something', text: 'Hands-on sample workshops with small groups.' }, { title: 'Have a great night', text: 'Sample evenings with music, food and good company.' }] },
        { type: 'gallery', heading: 'Moments from our events (sample photos)', images: [{ imageUrl: '/templates/events-crowd.jpg', imageAlt: 'A busy hall full of people talking' }, { imageUrl: '/templates/events-lights.jpg', imageAlt: 'Hands in the air under purple stage lights' }] },
        { type: 'cta', heading: 'Want to join an event?', text: 'Create a site account to register. An account does not mean approved or paid membership.', buttonLabel: 'Create a site account', buttonHref: '/signup?next=%2Fevents', tone: 'tint' },
      ] },
      { slug: 'events', title: 'Events', description: 'Sample upcoming events with places left, and registration for signed-in visitors.', blocks: [
        { type: 'hero', layout: 'centered', heading: 'Upcoming events', text: 'Choose an event with places left. These dates and details are samples.' },
        { type: 'records', table: 'club_events', heading: 'Next up', fields: ['title', 'date', 'time', 'details'], newestFirst: false, tone: 'tint' },
        { type: 'record-form', id: 'signup', table: 'event_signups', heading: 'Register for an event', intro: 'Sign in or create a site account first. A full event cannot be chosen.', fields: ['event', 'name', 'email'], buttonLabel: 'Register', sentMessage: 'Your event registration was saved.', tone: 'plain' },
        { type: 'records', table: 'event_signups', heading: 'My registrations', fields: ['event', 'status'], allowDelete: true, tone: 'tint' },
      ] },
    ],
  },
  th: {
    label: 'อีเวนต์และคอมมูนิตี้',
    description: 'เว็บอีเวนต์ดูสนุก มีกิจกรรมที่จะมาถึงพร้อมจำนวนที่ว่าง และลงชื่อด้วยบัญชีเว็บ',
    includes: ['หน้าแรกมีภาพใหญ่และสิ่งที่จะได้พบ', 'หน้ากิจกรรมพร้อมจำนวนที่ว่าง', 'ลงชื่อสำหรับผู้ที่เข้าสู่ระบบ คนละหนึ่งที่'],
    settings: { style: 'bold', headingFont: 'Bai Jamjuree', bodyFont: 'IBM Plex Sans Thai', accent: '#ff5a5f', background: '#111114', text: '#f5f5f7', nav: [{ label: 'กิจกรรม', href: '/events' }, { label: 'ลงชื่อ', href: '/events#signup' }], headerButtonLabel: 'ดูกิจกรรม', headerButtonHref: '/events' },
    pages: [
      { slug: 'home', title: 'อีเวนต์ตัวอย่าง', description: 'เว็บอีเวนต์และคอมมูนิตี้ตัวอย่าง มีกิจกรรมที่จะมาถึงและการลงชื่อ', blocks: [
        { type: 'hero', layout: 'cover', eyebrow: 'คอมมูนิตี้ตัวอย่าง', heading: 'ค่ำคืนที่น่าจดจำเริ่มต้นที่นี่', text: 'มีตอัป เวิร์กช็อป และปาร์ตี้ อยู่ในที่เดียว กิจกรรมทั้งหมดในเว็บนี้เป็นตัวอย่าง', buttonLabel: 'ดูกิจกรรม', buttonHref: '/events', secondLabel: 'สร้างบัญชี', secondHref: '/signup?next=%2Fevents', imageUrl: '/templates/events-hero.jpg', imageAlt: 'ฝูงชนยกมือหน้าเวทีที่มีไฟสว่าง' },
        { type: 'features', heading: 'จะได้พบอะไร', items: [{ title: 'เจอเพื่อนใหม่', text: 'มีตอัปตัวอย่างสำหรับคนที่ชอบเรื่องเดียวกัน' }, { title: 'ได้เรียนรู้', text: 'เวิร์กช็อปตัวอย่างแบบลงมือทำ กลุ่มเล็ก' }, { title: 'สนุกเต็มที่', text: 'ค่ำคืนตัวอย่างพร้อมดนตรี อาหาร และเพื่อนดี ๆ' }] },
        { type: 'gallery', heading: 'บรรยากาศงาน (รูปตัวอย่าง)', images: [{ imageUrl: '/templates/events-crowd.jpg', imageAlt: 'ห้องโถงที่มีผู้คนพูดคุยกันมากมาย' }, { imageUrl: '/templates/events-lights.jpg', imageAlt: 'มือที่ยกขึ้นใต้แสงไฟสีม่วง' }] },
        { type: 'cta', heading: 'อยากร่วมกิจกรรมไหม', text: 'สร้างบัญชีเว็บเพื่อลงชื่อ บัญชีเว็บไม่ได้แปลว่าเป็นสมาชิกที่อนุมัติหรือจ่ายเงินแล้ว', buttonLabel: 'สร้างบัญชีเว็บ', buttonHref: '/signup?next=%2Fevents', tone: 'tint' },
      ] },
      { slug: 'events', title: 'กิจกรรม', description: 'กิจกรรมตัวอย่างที่จะมาถึงพร้อมจำนวนที่ว่าง และการลงชื่อสำหรับผู้ที่เข้าสู่ระบบ', blocks: [
        { type: 'hero', layout: 'centered', heading: 'กิจกรรมที่จะมาถึง', text: 'เลือกกิจกรรมที่ยังมีที่ว่าง วันและรายละเอียดในหน้านี้เป็นตัวอย่าง' },
        { type: 'records', table: 'club_events', heading: 'เร็ว ๆ นี้', fields: ['title', 'date', 'time', 'details'], newestFirst: false, tone: 'tint' },
        { type: 'record-form', id: 'signup', table: 'event_signups', heading: 'ลงชื่อเข้าร่วม', intro: 'เข้าสู่ระบบหรือสร้างบัญชีเว็บก่อน กิจกรรมที่เต็มแล้วจะเลือกไม่ได้', fields: ['event', 'name', 'email'], buttonLabel: 'ลงชื่อ', sentMessage: 'บันทึกการลงชื่อแล้ว', tone: 'plain' },
        { type: 'records', table: 'event_signups', heading: 'รายการที่ฉันลงชื่อ', fields: ['event', 'status'], allowDelete: true, tone: 'tint' },
      ] },
    ],
  },
}

// Wellness classes: soft, warm and friendly. A big calm photo, the classes with places left, gentle steps, a
// photo beside a short note, and questions.
export const classesLook: Look = {
  en: {
    label: 'Classes and wellness',
    description: 'A calm site for yoga, fitness or any classes: places left update as people book, no account needed.',
    includes: ['Home page with a photo hero, classes and steps', 'Booking page without customer sign-up', 'Three sample classes; a full class closes by itself'],
    settings: { style: 'warm', headingFont: 'Nunito', bodyFont: 'Nunito', accent: '#d9541e', background: '#fffaf3', text: '#2b2118', nav: [{ label: 'Classes', href: '/#classes' }, { label: 'How it works', href: '/#how' }, { label: 'Book', href: '/book' }], headerButtonLabel: 'Book a place', headerButtonHref: '/book' },
    pages: [
      { slug: 'home', title: 'Sample Studio', description: 'A sample class studio website with classes, places left and online booking.', blocks: [
        { type: 'hero', layout: 'split', eyebrow: 'Sample studio', heading: 'Feel better, one class at a time', text: 'Small, friendly classes you can book in a minute. The classes on this site are samples.', buttonLabel: 'Book a place', buttonHref: '/book', secondLabel: 'See classes', secondHref: '/#classes', imageUrl: '/templates/classes-hero.jpg', imageAlt: 'A person meditating in the evening sun' },
        { type: 'records', id: 'classes', table: 'classes', heading: 'This week’s classes', intro: 'Sample classes. Places left update as people book.', fields: ['title', 'when', 'details'], newestFirst: false, tone: 'tint' },
        { type: 'steps', id: 'how', heading: 'How booking works', items: [{ title: 'Pick a class', text: 'Check the day, the time and the places left.' }, { title: 'Send your booking', text: 'Add your name and email. No account needed.' }, { title: 'Come and enjoy', text: 'We confirm by email. Bring water and comfortable clothes.' }] },
        { type: 'split', heading: 'A calm space for everyone', body: 'Say who your classes are for, what level they suit and what people should bring.\n\nThis is sample text.', imageUrl: '/templates/classes-beach.jpg', imageAlt: 'A person stretching on a quiet beach', imageSide: 'left' },
        { type: 'cta', heading: 'Ready to join a class?', text: 'Booking takes a minute, and full classes are closed automatically.', buttonLabel: 'Book a place', buttonHref: '/book', tone: 'tint' },
      ] },
      { slug: 'book', title: 'Book a class', description: 'Sample booking page: choose a class with places left and send your booking, no account needed.', blocks: [
        { type: 'hero', layout: 'centered', heading: 'Book a class', text: 'Full classes cannot be chosen, so your place is always a real one. This page is a sample.' },
        { type: 'record-form', table: 'bookings', heading: 'Your booking', intro: 'Choose a class and tell us how to reach you.', fields: ['class', 'name', 'email', 'phone', 'note'], buttonLabel: 'Book my place', sentMessage: 'Thank you. Your booking has arrived, and we will confirm it soon.', tone: 'tint' },
        { type: 'faq', heading: 'Questions', items: [{ question: 'Do I need an account?', answer: 'No. Your name and email are enough.' }, { question: 'Can a class be overbooked?', answer: 'No. When a class is full, it can no longer be chosen.' }, { question: 'What should I bring?', answer: 'A sample answer. Say what to wear and bring.' }] },
      ] },
    ],
  },
  th: {
    label: 'คลาสและสุขภาพ',
    description: 'เว็บโทนสบายตาสำหรับโยคะ ฟิตเนส หรือคลาสต่าง ๆ จำนวนที่ว่างอัปเดตเมื่อมีคนจอง ไม่ต้องสมัครสมาชิก',
    includes: ['หน้าแรกมีภาพใหญ่ คลาส และขั้นตอน', 'หน้าจองโดยไม่ต้องสมัครสมาชิก', 'คลาสตัวอย่าง 3 คลาส คลาสเต็มจะปิดเอง'],
    settings: { style: 'warm', headingFont: 'Nunito', bodyFont: 'IBM Plex Sans Thai', accent: '#d9541e', background: '#fffaf3', text: '#2b2118', nav: [{ label: 'คลาส', href: '/#classes' }, { label: 'วิธีจอง', href: '/#how' }, { label: 'จอง', href: '/book' }], headerButtonLabel: 'จองที่', headerButtonHref: '/book' },
    pages: [
      { slug: 'home', title: 'สตูดิโอตัวอย่าง', description: 'เว็บสตูดิโอตัวอย่าง มีคลาส จำนวนที่ว่าง และจองออนไลน์', blocks: [
        { type: 'hero', layout: 'split', eyebrow: 'สตูดิโอตัวอย่าง', heading: 'รู้สึกดีขึ้นทีละคลาส', text: 'คลาสเล็ก เป็นกันเอง จองได้ในหนึ่งนาที คลาสในเว็บนี้เป็นตัวอย่าง', buttonLabel: 'จองที่', buttonHref: '/book', secondLabel: 'ดูคลาส', secondHref: '/#classes', imageUrl: '/templates/classes-hero.jpg', imageAlt: 'คนนั่งสมาธิในแสงแดดยามเย็น' },
        { type: 'records', id: 'classes', table: 'classes', heading: 'คลาสสัปดาห์นี้', intro: 'คลาสตัวอย่าง จำนวนที่ว่างจะอัปเดตเมื่อมีคนจอง', fields: ['title', 'when', 'details'], newestFirst: false, tone: 'tint' },
        { type: 'steps', id: 'how', heading: 'จองอย่างไร', items: [{ title: 'เลือกคลาส', text: 'ดูวัน เวลา และจำนวนที่ว่าง' }, { title: 'ส่งการจอง', text: 'ใส่ชื่อและอีเมล ไม่ต้องมีบัญชี' }, { title: 'มาสนุกด้วยกัน', text: 'เรายืนยันทางอีเมล เตรียมน้ำและชุดสบาย ๆ มาด้วย' }] },
        { type: 'split', heading: 'พื้นที่สงบสำหรับทุกคน', body: 'บอกว่าคลาสเหมาะกับใคร ระดับไหน และควรเตรียมอะไรมา\n\nข้อความนี้เป็นตัวอย่าง', imageUrl: '/templates/classes-beach.jpg', imageAlt: 'คนยืดตัวบนชายหาดที่เงียบสงบ', imageSide: 'left' },
        { type: 'cta', heading: 'พร้อมเข้าคลาสไหม', text: 'จองได้ในหนึ่งนาที คลาสที่เต็มแล้วจะปิดเอง', buttonLabel: 'จองที่', buttonHref: '/book', tone: 'tint' },
      ] },
      { slug: 'book', title: 'จองคลาส', description: 'หน้าจองคลาสตัวอย่าง เลือกคลาสที่ยังมีที่ว่าง แล้วส่งการจองได้เลยโดยไม่ต้องมีบัญชี', blocks: [
        { type: 'hero', layout: 'centered', heading: 'จองคลาส', text: 'คลาสที่เต็มแล้วจะเลือกไม่ได้ ที่ของคุณจึงมีอยู่จริงเสมอ หน้านี้เป็นตัวอย่าง' },
        { type: 'record-form', table: 'bookings', heading: 'ข้อมูลการจอง', intro: 'เลือกคลาสและบอกวิธีติดต่อคุณ', fields: ['class', 'name', 'email', 'phone', 'note'], buttonLabel: 'จองที่ของฉัน', sentMessage: 'ขอบคุณ ได้รับการจองแล้ว เราจะยืนยันเร็ว ๆ นี้', tone: 'tint' },
        { type: 'faq', heading: 'คำถาม', items: [{ question: 'ต้องมีบัญชีไหม', answer: 'ไม่ต้อง ชื่อและอีเมลก็พอ' }, { question: 'คลาสจองเกินได้ไหม', answer: 'ไม่ได้ เมื่อคลาสเต็มแล้วจะเลือกไม่ได้อีก' }, { question: 'ต้องเตรียมอะไรมา', answer: 'คำตอบตัวอย่าง บอกว่าควรใส่และนำอะไรมา' }] },
      ] },
    ],
  },
}

// Portfolio: editorial and spacious. A huge statement over a photo, selected work as a gallery of projects,
// what I do, and a quiet contact.
export const portfolioLook: Look = {
  en: {
    label: 'Portfolio',
    description: 'An editorial portfolio for a designer, photographer or architect: big photos, selected work and a contact form.',
    includes: ['Home page with a statement, selected work and services', 'About page', 'Contact page with a working form'],
    items: withPhotos([
      { collection: 'work', sort: 1, category: 'Buildings', title: 'Hillside house (sample)', body: 'Sample project: a white house that steps down the slope. Replace with your own work.' },
      { collection: 'work', sort: 2, category: 'Buildings', title: 'Office corner (sample)', body: 'Sample project: a sharp corner of glass and stone. Replace with your own work.' },
      { collection: 'work', sort: 3, category: 'Photography', title: 'Lines and light (sample)', body: 'Sample photo series about rhythm in facades. Replace with your own work.' },
      { collection: 'work', sort: 4, category: 'Buildings', title: 'Blue windows (sample)', body: 'Sample project: a calm block with deep windows. Replace with your own work.' },
      { collection: 'work', sort: 5, category: 'Photography', title: 'Folded glass (sample)', body: 'Sample photo of a folded glass roof. Replace with your own work.' },
    ], ['portfolio-hero', 'portfolio-1', 'portfolio-2', 'portfolio-3', 'portfolio-4'], 'Sample project photo'),
    settings: { style: 'editorial', headingFont: 'Fraunces', bodyFont: 'Inter', accent: '#111111', background: '#f4f2ee', text: '#111111', nav: [{ label: 'Work', href: '/#work' }, { label: 'About', href: '/about' }, { label: 'Contact', href: '/contact' }], headerButtonLabel: 'Get in touch', headerButtonHref: '/contact' },
    pages: [
      { slug: 'home', title: 'Sample Portfolio', description: 'A sample portfolio with selected work, services and a contact form.', blocks: [
        { type: 'hero', layout: 'cover', eyebrow: 'Sample studio', heading: 'Spaces and images with a clear idea behind them', text: 'Selected work, how I work, and how to get in touch. Every project here is a sample.', buttonLabel: 'See the work', buttonHref: '/#work', imageUrl: '/templates/portfolio-hero.jpg', imageAlt: 'A white building with stacked balconies against the sky' },
        { type: 'collection', id: 'work', collection: 'work', heading: 'Selected work', intro: 'Sample projects, ready for your own work and photos.', filters: true },
        { type: 'features', heading: 'What I do', tone: 'tint', items: [{ title: 'Concept', text: 'A clear idea first, so every choice after it is easier.' }, { title: 'Design', text: 'Drawings, images and details, worked out together.' }, { title: 'Delivery', text: 'Final files and support until it is finished.' }] },
        { type: 'cta', heading: 'Have a project in mind?', text: "Tell me about it, and I'll reply with ideas and a price.", buttonLabel: 'Get in touch', buttonHref: '/contact', tone: 'dark' },
      ] },
      { slug: 'about', title: 'About', description: 'Sample about page for a portfolio: who I am, how a project with me goes and how we work together.', blocks: [
        { type: 'hero', layout: 'centered', heading: 'About', text: 'A few lines about you and your work. This page is a sample.' },
        { type: 'split', heading: 'How I work', body: 'Describe how a project with you goes, from the first message to the final files.\n\nThis is sample text.', imageUrl: '/templates/portfolio-1.jpg', imageAlt: 'The corner of a modern building', imageSide: 'right' },
        { type: 'steps', heading: 'Working together', tone: 'tint', items: [{ title: 'Brief', text: 'We talk about what you need.' }, { title: 'Ideas', text: 'I share first ideas for your feedback.' }, { title: 'Final files', text: 'You get everything ready to use.' }] },
        { type: 'cta', heading: 'Want to work together?', buttonLabel: 'Get in touch', buttonHref: '/contact', tone: 'dark' },
      ] },
      { slug: 'contact', title: 'Contact', description: 'Sample contact page with a working form for a portfolio.', blocks: [
        { type: 'hero', layout: 'centered', heading: 'Get in touch', text: "Tell me about your project, and I'll reply by email. This page is a sample." },
        { type: 'form', name: 'contact', heading: 'Send a message', buttonLabel: 'Send message', sentMessage: 'Thank you. Your message has been sent.', tone: 'tint', fields: [{ name: 'name', label: 'Your name', type: 'text', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'message', label: 'About your project', type: 'textarea', required: true }] },
      ] },
    ],
  },
  th: {
    label: 'พอร์ตโฟลิโอ',
    description: 'พอร์ตโฟลิโอแนวนิตยสารสำหรับนักออกแบบ ช่างภาพ หรือสถาปนิก ภาพใหญ่ ผลงานที่คัดมา และฟอร์มติดต่อ',
    includes: ['หน้าแรกมีข้อความเด่น ผลงาน และบริการ', 'หน้าเกี่ยวกับ', 'หน้าติดต่อพร้อมฟอร์มใช้งานได้'],
    items: withPhotos([
      { collection: 'work', sort: 1, category: 'อาคาร', title: 'บ้านบนเนิน (ตัวอย่าง)', body: 'โปรเจกต์ตัวอย่าง บ้านสีขาวที่ไล่ระดับลงตามเนิน เปลี่ยนเป็นผลงานของคุณ' },
      { collection: 'work', sort: 2, category: 'อาคาร', title: 'มุมอาคารสำนักงาน (ตัวอย่าง)', body: 'โปรเจกต์ตัวอย่าง มุมแหลมของกระจกและหิน เปลี่ยนเป็นผลงานของคุณ' },
      { collection: 'work', sort: 3, category: 'ภาพถ่าย', title: 'เส้นและแสง (ตัวอย่าง)', body: 'ภาพชุดตัวอย่างเรื่องจังหวะของผนังอาคาร เปลี่ยนเป็นผลงานของคุณ' },
      { collection: 'work', sort: 4, category: 'อาคาร', title: 'หน้าต่างสีฟ้า (ตัวอย่าง)', body: 'โปรเจกต์ตัวอย่าง อาคารเรียบที่มีหน้าต่างลึก เปลี่ยนเป็นผลงานของคุณ' },
      { collection: 'work', sort: 5, category: 'ภาพถ่าย', title: 'กระจกพับ (ตัวอย่าง)', body: 'ภาพตัวอย่างหลังคากระจกพับ เปลี่ยนเป็นผลงานของคุณ' },
    ], ['portfolio-hero', 'portfolio-1', 'portfolio-2', 'portfolio-3', 'portfolio-4'], 'รูปผลงานตัวอย่าง'),
    settings: { style: 'editorial', headingFont: 'Fraunces', bodyFont: 'IBM Plex Sans Thai', accent: '#111111', background: '#f4f2ee', text: '#111111', nav: [{ label: 'ผลงาน', href: '/#work' }, { label: 'เกี่ยวกับ', href: '/about' }, { label: 'ติดต่อ', href: '/contact' }], headerButtonLabel: 'ติดต่อ', headerButtonHref: '/contact' },
    pages: [
      { slug: 'home', title: 'พอร์ตโฟลิโอตัวอย่าง', description: 'พอร์ตโฟลิโอตัวอย่างสำหรับนักออกแบบหรือสถาปนิก มีผลงานที่คัดมา บริการ และฟอร์มติดต่อ', blocks: [
        { type: 'hero', layout: 'cover', eyebrow: 'สตูดิโอตัวอย่าง', heading: 'พื้นที่และภาพที่มีแนวคิดชัดเจน', text: 'ผลงานที่คัดมา วิธีทำงาน และช่องทางติดต่อ ทุกโปรเจกต์ในหน้านี้เป็นตัวอย่าง', buttonLabel: 'ดูผลงาน', buttonHref: '/#work', imageUrl: '/templates/portfolio-hero.jpg', imageAlt: 'อาคารสีขาวที่มีระเบียงซ้อนกันตัดกับท้องฟ้า' },
        { type: 'collection', id: 'work', collection: 'work', heading: 'ผลงานที่คัดมา', intro: 'โปรเจกต์ตัวอย่าง พร้อมใส่ผลงานและรูปของคุณ', filters: true },
        { type: 'features', heading: 'สิ่งที่ฉันทำ', tone: 'tint', items: [{ title: 'แนวคิด', text: 'เริ่มจากไอเดียที่ชัด ทุกการตัดสินใจหลังจากนั้นจะง่ายขึ้น' }, { title: 'ออกแบบ', text: 'แบบ ภาพ และรายละเอียด คิดไปด้วยกัน' }, { title: 'ส่งมอบ', text: 'ไฟล์สุดท้ายพร้อมดูแลจนเสร็จ' }] },
        { type: 'cta', heading: 'มีโปรเจกต์ในใจไหม', text: 'เล่าให้ฟัง แล้วฉันจะตอบกลับพร้อมไอเดียและราคา', buttonLabel: 'ติดต่อ', buttonHref: '/contact', tone: 'dark' },
      ] },
      { slug: 'about', title: 'เกี่ยวกับ', description: 'หน้าเกี่ยวกับตัวอย่างของพอร์ตโฟลิโอ เล่าว่าคุณเป็นใคร และการทำโปรเจกต์ด้วยกันเป็นอย่างไร', blocks: [
        { type: 'hero', layout: 'centered', heading: 'เกี่ยวกับ', text: 'เล่าเรื่องของคุณและงานของคุณสั้น ๆ หน้านี้เป็นตัวอย่าง' },
        { type: 'split', heading: 'วิธีทำงาน', body: 'เล่าว่าการทำโปรเจกต์กับคุณเป็นอย่างไร ตั้งแต่ข้อความแรกจนถึงไฟล์สุดท้าย\n\nข้อความนี้เป็นตัวอย่าง', imageUrl: '/templates/portfolio-1.jpg', imageAlt: 'มุมของอาคารสมัยใหม่', imageSide: 'right' },
        { type: 'steps', heading: 'ทำงานร่วมกัน', tone: 'tint', items: [{ title: 'บรีฟ', text: 'คุยกันว่าคุณต้องการอะไร' }, { title: 'ไอเดีย', text: 'ส่งไอเดียแรกให้ดูและแสดงความเห็น' }, { title: 'ไฟล์สุดท้าย', text: 'ได้ทุกอย่างพร้อมใช้งาน' }] },
        { type: 'cta', heading: 'อยากทำงานด้วยกันไหม', buttonLabel: 'ติดต่อ', buttonHref: '/contact', tone: 'dark' },
      ] },
      { slug: 'contact', title: 'ติดต่อ', description: 'หน้าติดต่อตัวอย่างของพอร์ตโฟลิโอ พร้อมฟอร์มที่ส่งข้อความถึงคุณได้จริงทางหลังบ้าน', blocks: [
        { type: 'hero', layout: 'centered', heading: 'ติดต่อ', text: 'เล่าเกี่ยวกับโปรเจกต์ของคุณ แล้วฉันจะตอบกลับทางอีเมล หน้านี้เป็นตัวอย่าง' },
        { type: 'form', name: 'contact', heading: 'ส่งข้อความ', buttonLabel: 'ส่งข้อความ', sentMessage: 'ขอบคุณ ส่งข้อความเรียบร้อยแล้ว', tone: 'tint', fields: [{ name: 'name', label: 'ชื่อของคุณ', type: 'text', required: true }, { name: 'email', label: 'อีเมล', type: 'email', required: true }, { name: 'message', label: 'เกี่ยวกับโปรเจกต์', type: 'textarea', required: true }] },
      ] },
    ],
  },
}

// New kinds of site.

const items = (collection: string, rows: [string, string, string][], photos: string[], alt: string): StarterItem[] =>
  withPhotos(rows.map(([title, category, body], index) => ({ body, category, collection, sort: index + 1, title })), photos, alt)

// A creator or membership page: a warm full-photo hero, what members get, three tiers, a photo beside a note
// and a join form.
export const creator: Record<StarterLanguage, StarterContent> = {
  en: {
    label: 'Creator or membership',
    description: 'A page for a podcaster, artist or creator: what members get, three sample tiers and a join form.',
    includes: ['One home page with a photo hero, benefits and tiers', 'A working form to join or ask'],
    settings: { name: 'Sample Creator', tagline: 'Make things, together with the people who love them', style: 'bold', headingFont: 'Space Grotesk', bodyFont: 'Inter', accent: '#ff424d', background: '#ffffff', text: '#141414', cart: false, nav: [{ label: 'What you get', href: '/#benefits' }, { label: 'Tiers', href: '/#tiers' }, { label: 'Join', href: '/#join' }], headerButtonLabel: 'Join now', headerButtonHref: '/#join', footerText: footer.en },
    pages: [
      { slug: 'home', title: 'Sample Creator', description: 'A sample creator page with member benefits, tiers and a join form.', blocks: [
        { type: 'hero', layout: 'cover', eyebrow: 'Sample creator', heading: 'Closer to the work. Closer to each other.', text: 'Episodes, early drafts and behind-the-scenes for the people who want more. Everything here is a sample.', buttonLabel: 'Join now', buttonHref: '/#join', secondLabel: 'See the tiers', secondHref: '/#tiers', imageUrl: '/templates/creator-hero.jpg', imageAlt: 'A studio microphone in warm light' },
        { type: 'features', id: 'benefits', heading: 'What members get', intro: 'Sample benefits. Keep what you can really offer.', items: [{ title: 'Early access', text: 'New episodes and work a week before everyone else.' }, { title: 'Behind the scenes', text: 'Drafts, notes and how things are made.' }, { title: 'A place to talk', text: 'Questions and conversations with other members.' }] },
        { type: 'split', heading: 'Made in a small studio', body: 'Tell people who you are, what you make and why their support matters.\n\nThis is sample text.', imageUrl: '/templates/creator-desk.jpg', imageAlt: 'A microphone on an arm above a keyboard', imageSide: 'right' },
        { type: 'pricing', id: 'tiers', heading: 'Tiers', intro: 'Sample tiers and prices. Change them before publishing.', plans: [{ name: 'Supporter', price: '3', note: 'Per month, sample', features: 'A thank-you in each episode\nMember updates', buttonLabel: 'Join', buttonHref: '/#join' }, { name: 'Insider', price: '8', note: 'Per month, sample', features: 'Everything in Supporter\nEarly access\nBehind the scenes', buttonLabel: 'Join', buttonHref: '/#join', highlighted: true }, { name: 'Studio', price: '20', note: 'Per month, sample', features: 'Everything in Insider\nA monthly live session', buttonLabel: 'Join', buttonHref: '/#join' }] },
        { type: 'form', name: 'join', id: 'join', heading: 'Join or ask a question', intro: 'Leave your email and the tier you like. This sample form sends entries to the back office.', buttonLabel: 'Send', sentMessage: 'Thank you. We will be in touch by email.', tone: 'tint', fields: [{ name: 'name', label: 'Your name', type: 'text', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'tier', label: 'Tier you like', type: 'select', options: ['Supporter', 'Insider', 'Studio', 'Not sure yet'] }] },
      ] },
    ],
    items: [], tables: [], records: {}, automations: [],
  },
  th: {
    label: 'ครีเอเตอร์หรือสมาชิก',
    description: 'หน้าสำหรับพอดแคสต์ ศิลปิน หรือครีเอเตอร์ สมาชิกได้อะไร ระดับสมาชิก 3 แบบ และฟอร์มสมัคร',
    includes: ['หน้าแรกหน้าเดียวมีภาพใหญ่ สิทธิ์สมาชิก และระดับ', 'ฟอร์มสมัครหรือสอบถามที่ใช้ได้จริง'],
    settings: { name: 'ครีเอเตอร์ตัวอย่าง', tagline: 'สร้างผลงานไปด้วยกันกับคนที่รัก', style: 'bold', headingFont: 'Bai Jamjuree', bodyFont: 'IBM Plex Sans Thai', accent: '#ff424d', background: '#ffffff', text: '#141414', cart: false, nav: [{ label: 'สิทธิ์สมาชิก', href: '/#benefits' }, { label: 'ระดับสมาชิก', href: '/#tiers' }, { label: 'สมัคร', href: '/#join' }], headerButtonLabel: 'สมัครเลย', headerButtonHref: '/#join', footerText: footer.th },
    pages: [
      { slug: 'home', title: 'ครีเอเตอร์ตัวอย่าง', description: 'หน้าครีเอเตอร์ตัวอย่าง มีสิทธิ์สมาชิก ระดับสมาชิก และฟอร์มสมัคร', blocks: [
        { type: 'hero', layout: 'cover', eyebrow: 'ครีเอเตอร์ตัวอย่าง', heading: 'ใกล้ผลงาน ใกล้กันมากขึ้น', text: 'ตอนใหม่ ร่างแรก และเบื้องหลัง สำหรับคนที่อยากได้มากกว่า ทุกอย่างในหน้านี้เป็นตัวอย่าง', buttonLabel: 'สมัครเลย', buttonHref: '/#join', secondLabel: 'ดูระดับสมาชิก', secondHref: '/#tiers', imageUrl: '/templates/creator-hero.jpg', imageAlt: 'ไมโครโฟนในสตูดิโอท่ามกลางแสงอุ่น' },
        { type: 'features', id: 'benefits', heading: 'สมาชิกได้อะไร', intro: 'สิทธิ์ตัวอย่าง เก็บเฉพาะที่ให้ได้จริง', items: [{ title: 'ได้ดูก่อน', text: 'ตอนใหม่และผลงานใหม่ก่อนคนอื่นหนึ่งสัปดาห์' }, { title: 'เบื้องหลัง', text: 'ร่าง โน้ต และวิธีการทำงาน' }, { title: 'พื้นที่พูดคุย', text: 'ถามตอบและคุยกับสมาชิกคนอื่น' }] },
        { type: 'split', heading: 'ทำในสตูดิโอเล็ก ๆ', body: 'เล่าว่าคุณเป็นใคร ทำอะไร และทำไมการสนับสนุนจึงสำคัญ\n\nข้อความนี้เป็นตัวอย่าง', imageUrl: '/templates/creator-desk.jpg', imageAlt: 'ไมโครโฟนบนขาตั้งเหนือคีย์บอร์ด', imageSide: 'right' },
        { type: 'pricing', id: 'tiers', heading: 'ระดับสมาชิก', intro: 'ระดับและราคาตัวอย่าง เปลี่ยนก่อนเผยแพร่', plans: [{ name: 'ผู้สนับสนุน', price: '99', note: 'ต่อเดือน ตัวอย่าง', features: 'ขอบคุณในทุกตอน\nอัปเดตสำหรับสมาชิก', buttonLabel: 'สมัคร', buttonHref: '/#join' }, { name: 'คนวงใน', price: '249', note: 'ต่อเดือน ตัวอย่าง', features: 'ทุกอย่างในระดับผู้สนับสนุน\nได้ดูก่อน\nเบื้องหลัง', buttonLabel: 'สมัคร', buttonHref: '/#join', highlighted: true }, { name: 'สตูดิโอ', price: '590', note: 'ต่อเดือน ตัวอย่าง', features: 'ทุกอย่างในระดับคนวงใน\nไลฟ์เดือนละครั้ง', buttonLabel: 'สมัคร', buttonHref: '/#join' }] },
        { type: 'form', name: 'join', id: 'join', heading: 'สมัครหรือสอบถาม', intro: 'ฝากอีเมลและระดับที่สนใจ ฟอร์มตัวอย่างนี้ส่งข้อมูลเข้าหลังบ้าน', buttonLabel: 'ส่ง', sentMessage: 'ขอบคุณ เราจะติดต่อกลับทางอีเมล', tone: 'tint', fields: [{ name: 'name', label: 'ชื่อของคุณ', type: 'text', required: true }, { name: 'email', label: 'อีเมล', type: 'email', required: true }, { name: 'tier', label: 'ระดับที่สนใจ', type: 'select', options: ['ผู้สนับสนุน', 'คนวงใน', 'สตูดิโอ', 'ยังไม่แน่ใจ'] }] },
      ] },
    ],
    items: [], tables: [], records: {}, automations: [],
  },
}

// A creative agency: big type on a full photo, services, selected projects, how we work and a brief form.
export const agency: Record<StarterLanguage, StarterContent> = {
  en: {
    label: 'Creative agency',
    description: 'A bold agency site: big statement, services, selected projects with photos and a project brief form.',
    includes: ['Home page with a photo hero, services, projects and steps', 'Contact page with a project brief form', 'Four sample projects with photos'],
    settings: { name: 'Sample Studio', tagline: 'Brands, websites and campaigns with craft', style: 'editorial', headingFont: 'Space Grotesk', bodyFont: 'Inter', accent: '#d63c00', background: '#f3f1ec', text: '#0d0d0d', cart: false, nav: [{ label: 'Work', href: '/#work' }, { label: 'Services', href: '/#services' }, { label: 'Contact', href: '/contact' }], headerButtonLabel: 'Start a project', headerButtonHref: '/contact', footerText: footer.en },
    pages: [
      { slug: 'home', title: 'Sample Studio', description: 'A sample creative agency site with services, selected projects and a project brief form.', blocks: [
        { type: 'hero', layout: 'cover', eyebrow: 'Sample creative studio', heading: 'We make brands people remember', text: 'Identity, websites and campaigns, made with care by a small team. Every project here is a sample.', buttonLabel: 'Start a project', buttonHref: '/contact', secondLabel: 'See the work', secondHref: '/#work', imageUrl: '/templates/agency-hero.jpg', imageAlt: 'A wooden desk from above with a laptop, coffee and plants' },
        { type: 'features', id: 'services', heading: 'What we do', items: [{ title: 'Brand identity', text: 'Names, logos, colours and the rules that hold them together.' }, { title: 'Websites', text: 'Fast, clear sites that are easy to keep up to date.' }, { title: 'Campaigns', text: 'Ideas that work across posters, social and video.' }, { title: 'Content', text: 'Photos, words and short films that tell your story.' }] },
        { type: 'collection', id: 'work', collection: 'projects', heading: 'Selected work', intro: 'Sample projects. Replace them with your own case studies.', filters: true, tone: 'tint' },
        { type: 'split', heading: 'Small team, close work', body: 'Say how you work with clients, how long a typical project takes and what makes your process different.\n\nThis is sample text.', imageUrl: '/templates/agency-sketch.jpg', imageAlt: 'A notebook with website sketches and a pen', imageSide: 'left', buttonLabel: 'Start a project', buttonHref: '/contact' },
        { type: 'steps', heading: 'How a project goes', items: [{ title: 'Brief', text: 'We listen and agree on the goal.' }, { title: 'Ideas', text: 'Two or three directions to choose from.' }, { title: 'Make', text: 'We build it, test it and launch it with you.' }] },
        { type: 'cta', heading: 'Have something in mind?', text: 'Send a short brief. This sample button leads to the form.', buttonLabel: 'Start a project', buttonHref: '/contact', tone: 'dark' },
      ] },
      { slug: 'contact', title: 'Start a project', description: 'Sample project brief form for a creative agency: tell the studio what you need and get a reply by email.', blocks: [
        { type: 'hero', layout: 'centered', heading: 'Start a project', text: 'Tell us what you need. We reply by email within a few days. This page is a sample.' },
        { type: 'form', name: 'brief', heading: 'Project brief', buttonLabel: 'Send brief', sentMessage: 'Thank you. Your brief has arrived.', tone: 'tint', fields: [{ name: 'name', label: 'Your name', type: 'text', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'service', label: 'What do you need?', type: 'select', options: ['Brand identity', 'Website', 'Campaign', 'Content', 'Something else'] }, { name: 'message', label: 'Tell us about the project', type: 'textarea', required: true }] },
      ] },
    ],
    items: items('projects', [['Brand for a bakery (sample)', 'Brand identity', 'Sample project: a warm, hand-drawn identity for a neighbourhood bakery.'], ['Website for a studio (sample)', 'Website', 'Sample project: a calm, fast site for a design studio.'], ['Spring campaign (sample)', 'Campaign', 'Sample project: posters and short videos for a seasonal launch.'], ['Photo series (sample)', 'Content', 'Sample project: a set of photos for a new product range.']], ['agency-desk', 'agency-sketch', 'agency-hero'], 'Sample project photo'),
    tables: [], records: {}, automations: [],
  },
  th: {
    label: 'เอเจนซี่สร้างสรรค์',
    description: 'เว็บเอเจนซี่ดูโดดเด่น ข้อความใหญ่ บริการ ผลงานพร้อมรูป และฟอร์มส่งบรีฟ',
    includes: ['หน้าแรกมีภาพใหญ่ บริการ ผลงาน และขั้นตอน', 'หน้าติดต่อพร้อมฟอร์มส่งบรีฟ', 'ผลงานตัวอย่าง 4 ชิ้นพร้อมรูป'],
    settings: { name: 'สตูดิโอตัวอย่าง', tagline: 'แบรนด์ เว็บไซต์ และแคมเปญที่ใส่ใจทุกรายละเอียด', style: 'editorial', headingFont: 'Bai Jamjuree', bodyFont: 'IBM Plex Sans Thai', accent: '#d63c00', background: '#f3f1ec', text: '#0d0d0d', cart: false, nav: [{ label: 'ผลงาน', href: '/#work' }, { label: 'บริการ', href: '/#services' }, { label: 'ติดต่อ', href: '/contact' }], headerButtonLabel: 'เริ่มโปรเจกต์', headerButtonHref: '/contact', footerText: footer.th },
    pages: [
      { slug: 'home', title: 'สตูดิโอตัวอย่าง', description: 'เว็บเอเจนซี่ตัวอย่าง มีบริการ ผลงาน และฟอร์มส่งบรีฟ', blocks: [
        { type: 'hero', layout: 'cover', eyebrow: 'สตูดิโอสร้างสรรค์ตัวอย่าง', heading: 'เราสร้างแบรนด์ที่คนจำได้', text: 'อัตลักษณ์ เว็บไซต์ และแคมเปญ ทำอย่างใส่ใจโดยทีมเล็ก ทุกโปรเจกต์ในหน้านี้เป็นตัวอย่าง', buttonLabel: 'เริ่มโปรเจกต์', buttonHref: '/contact', secondLabel: 'ดูผลงาน', secondHref: '/#work', imageUrl: '/templates/agency-hero.jpg', imageAlt: 'โต๊ะไม้มองจากด้านบน มีแล็ปท็อป กาแฟ และต้นไม้' },
        { type: 'features', id: 'services', heading: 'เราทำอะไร', items: [{ title: 'อัตลักษณ์แบรนด์', text: 'ชื่อ โลโก้ สี และกติกาที่ทำให้ทุกอย่างไปในทางเดียวกัน' }, { title: 'เว็บไซต์', text: 'เว็บเร็ว ชัด และอัปเดตง่าย' }, { title: 'แคมเปญ', text: 'ไอเดียที่ใช้ได้ทั้งโปสเตอร์ โซเชียล และวิดีโอ' }, { title: 'คอนเทนต์', text: 'ภาพ คำ และหนังสั้นที่เล่าเรื่องของคุณ' }] },
        { type: 'collection', id: 'work', collection: 'projects', heading: 'ผลงานที่คัดมา', intro: 'โปรเจกต์ตัวอย่าง เปลี่ยนเป็นผลงานจริงของคุณ', filters: true, tone: 'tint' },
        { type: 'split', heading: 'ทีมเล็ก ทำงานใกล้ชิด', body: 'บอกว่าทำงานกับลูกค้าอย่างไร โปรเจกต์ปกติใช้เวลานานเท่าไร และอะไรทำให้วิธีทำงานของคุณต่าง\n\nข้อความนี้เป็นตัวอย่าง', imageUrl: '/templates/agency-sketch.jpg', imageAlt: 'สมุดที่มีภาพร่างหน้าเว็บและปากกา', imageSide: 'left', buttonLabel: 'เริ่มโปรเจกต์', buttonHref: '/contact' },
        { type: 'steps', heading: 'ขั้นตอนโปรเจกต์', items: [{ title: 'บรีฟ', text: 'ฟังและตกลงเป้าหมายด้วยกัน' }, { title: 'ไอเดีย', text: 'เสนอสองสามทางให้เลือก' }, { title: 'ลงมือทำ', text: 'สร้าง ทดสอบ และเปิดตัวไปด้วยกัน' }] },
        { type: 'cta', heading: 'มีอะไรในใจไหม', text: 'ส่งบรีฟสั้น ๆ ปุ่มตัวอย่างนี้พาไปที่ฟอร์ม', buttonLabel: 'เริ่มโปรเจกต์', buttonHref: '/contact', tone: 'dark' },
      ] },
      { slug: 'contact', title: 'เริ่มโปรเจกต์', description: 'ฟอร์มส่งบรีฟตัวอย่างสำหรับเอเจนซี่ บอกสตูดิโอว่าต้องการอะไร แล้วรอคำตอบกลับทางอีเมล', blocks: [
        { type: 'hero', layout: 'centered', heading: 'เริ่มโปรเจกต์', text: 'บอกเราว่าคุณต้องการอะไร เราจะตอบกลับทางอีเมลภายในไม่กี่วัน หน้านี้เป็นตัวอย่าง' },
        { type: 'form', name: 'brief', heading: 'บรีฟโปรเจกต์', buttonLabel: 'ส่งบรีฟ', sentMessage: 'ขอบคุณ ได้รับบรีฟแล้ว', tone: 'tint', fields: [{ name: 'name', label: 'ชื่อของคุณ', type: 'text', required: true }, { name: 'email', label: 'อีเมล', type: 'email', required: true }, { name: 'service', label: 'ต้องการอะไร', type: 'select', options: ['อัตลักษณ์แบรนด์', 'เว็บไซต์', 'แคมเปญ', 'คอนเทนต์', 'อย่างอื่น'] }, { name: 'message', label: 'เล่าเกี่ยวกับโปรเจกต์', type: 'textarea', required: true }] },
      ] },
    ],
    items: items('projects', [['แบรนด์ร้านเบเกอรี่ (ตัวอย่าง)', 'อัตลักษณ์แบรนด์', 'โปรเจกต์ตัวอย่าง อัตลักษณ์อบอุ่นแบบวาดมือสำหรับร้านเบเกอรี่ในชุมชน'], ['เว็บไซต์สตูดิโอ (ตัวอย่าง)', 'เว็บไซต์', 'โปรเจกต์ตัวอย่าง เว็บเรียบ เร็ว สำหรับสตูดิโอออกแบบ'], ['แคมเปญหน้าร้อน (ตัวอย่าง)', 'แคมเปญ', 'โปรเจกต์ตัวอย่าง โปสเตอร์และวิดีโอสั้นสำหรับเปิดตัวสินค้าตามฤดูกาล'], ['ชุดภาพถ่าย (ตัวอย่าง)', 'คอนเทนต์', 'โปรเจกต์ตัวอย่าง ภาพชุดสำหรับสินค้าใหม่']], ['agency-desk', 'agency-sketch', 'agency-hero'], 'รูปโปรเจกต์ตัวอย่าง'),
    tables: [], records: {}, automations: [],
  },
}

// A magazine or blog: dark and news-like, a lead story over a full photo, the latest stories as cards with
// photos, sections, and a newsletter sign-up.
export const magazine: Record<StarterLanguage, StarterContent> = {
  en: {
    label: 'Magazine or blog',
    description: 'A modern magazine or blog: a lead story, the latest articles with photos, sections and a newsletter form.',
    includes: ['Home page with a lead story, latest articles and sections', 'Five sample articles with photos', 'A working newsletter sign-up form'],
    settings: { name: 'Sample Magazine', tagline: 'Stories about cities, culture and what comes next', style: 'bold', headingFont: 'Bricolage Grotesque', bodyFont: 'Source Serif 4', accent: '#3cffd0', background: '#131313', text: '#f2f2f2', cart: false, nav: [{ label: 'Latest', href: '/#latest' }, { label: 'Sections', href: '/#sections' }, { label: 'Newsletter', href: '/#newsletter' }], headerButtonLabel: 'Subscribe', headerButtonHref: '/#newsletter', footerText: footer.en },
    pages: [
      { slug: 'home', title: 'Sample Magazine', description: 'A sample magazine with the latest stories, sections and a newsletter sign-up.', blocks: [
        { type: 'hero', layout: 'cover', eyebrow: 'Sample lead story', heading: 'The city after dark: who keeps it running at night?', text: 'A sample lead story. Replace it with your most important article of the week.', buttonLabel: 'Read the latest', buttonHref: '/#latest', imageUrl: '/templates/magazine-hero.jpg', imageAlt: 'Light trails of traffic between tall buildings at night' },
        { type: 'collection', id: 'latest', collection: 'articles', heading: 'Latest stories', intro: 'Sample articles. Each one can have its own photo, section and text.', filters: true },
        { type: 'links', id: 'sections', heading: 'Sections', items: [{ label: 'Cities', href: '/#latest', text: 'How places change, and the people who change them.' }, { label: 'Culture', href: '/#latest', text: 'Music, film and the scenes around them.' }, { label: 'Tech', href: '/#latest', text: 'Tools we use, explained without jargon.' }], tone: 'tint' },
        { type: 'form', name: 'newsletter', id: 'newsletter', heading: 'The weekly letter', intro: 'One email a week with the best stories. This sample form sends sign-ups to the back office.', buttonLabel: 'Subscribe', sentMessage: 'Thank you. You are subscribed.', fields: [{ name: 'email', label: 'Email', type: 'email', required: true }] },
      ] },
    ],
    items: items('articles', [['Night shift: a sample story', 'Cities', 'A sample article. Write your own story here.'], ['The last taxi rank: a sample story', 'Cities', 'A sample article about how people get home late at night.'], ['Small shops, late hours: a sample story', 'Culture', 'A sample article about the places that stay open.'], ['Streets in motion: a sample story', 'Tech', 'A sample article about the tools behind traffic.'], ['Empty roads: a sample photo essay', 'Culture', 'A sample photo essay. Replace the photos and words.']], ['magazine-1', 'magazine-2', 'magazine-3', 'magazine-4', 'magazine-hero'], 'Sample article photo'),
    tables: [], records: {}, automations: [],
  },
  th: {
    label: 'นิตยสารหรือบล็อก',
    description: 'นิตยสารหรือบล็อกทันสมัย มีเรื่องเด่น บทความล่าสุดพร้อมรูป หมวดหมู่ และฟอร์มรับจดหมายข่าว',
    includes: ['หน้าแรกมีเรื่องเด่น บทความล่าสุด และหมวดหมู่', 'บทความตัวอย่าง 5 เรื่องพร้อมรูป', 'ฟอร์มสมัครรับจดหมายข่าวที่ใช้ได้จริง'],
    settings: { name: 'นิตยสารตัวอย่าง', tagline: 'เรื่องเมือง วัฒนธรรม และสิ่งที่กำลังจะมา', style: 'bold', headingFont: 'Bai Jamjuree', bodyFont: 'IBM Plex Sans Thai', accent: '#3cffd0', background: '#131313', text: '#f2f2f2', cart: false, nav: [{ label: 'ล่าสุด', href: '/#latest' }, { label: 'หมวดหมู่', href: '/#sections' }, { label: 'จดหมายข่าว', href: '/#newsletter' }], headerButtonLabel: 'สมัครรับข่าว', headerButtonHref: '/#newsletter', footerText: footer.th },
    pages: [
      { slug: 'home', title: 'นิตยสารตัวอย่าง', description: 'นิตยสารตัวอย่าง มีเรื่องล่าสุด หมวดหมู่ และการสมัครรับจดหมายข่าว', blocks: [
        { type: 'hero', layout: 'cover', eyebrow: 'เรื่องเด่นตัวอย่าง', heading: 'เมืองยามค่ำคืน ใครทำให้มันเดินต่อไป', text: 'เรื่องเด่นตัวอย่าง เปลี่ยนเป็นบทความสำคัญที่สุดของสัปดาห์', buttonLabel: 'อ่านเรื่องล่าสุด', buttonHref: '/#latest', imageUrl: '/templates/magazine-hero.jpg', imageAlt: 'แสงไฟรถยนต์ระหว่างตึกสูงตอนกลางคืน' },
        { type: 'collection', id: 'latest', collection: 'articles', heading: 'เรื่องล่าสุด', intro: 'บทความตัวอย่าง แต่ละเรื่องมีรูป หมวด และเนื้อหาของตัวเองได้', filters: true },
        { type: 'links', id: 'sections', heading: 'หมวดหมู่', items: [{ label: 'เมือง', href: '/#latest', text: 'เมืองเปลี่ยนไปอย่างไร และใครเป็นคนเปลี่ยน' }, { label: 'วัฒนธรรม', href: '/#latest', text: 'ดนตรี หนัง และผู้คนรอบ ๆ' }, { label: 'เทคโนโลยี', href: '/#latest', text: 'เครื่องมือที่เราใช้ อธิบายแบบไม่ใช้ศัพท์ยาก' }], tone: 'tint' },
        { type: 'form', name: 'newsletter', id: 'newsletter', heading: 'จดหมายประจำสัปดาห์', intro: 'อีเมลสัปดาห์ละครั้งพร้อมเรื่องที่ดีที่สุด ฟอร์มตัวอย่างนี้ส่งข้อมูลเข้าหลังบ้าน', buttonLabel: 'สมัครรับข่าว', sentMessage: 'ขอบคุณ สมัครเรียบร้อยแล้ว', fields: [{ name: 'email', label: 'อีเมล', type: 'email', required: true }] },
      ] },
    ],
    items: items('articles', [['กะกลางคืน (เรื่องตัวอย่าง)', 'เมือง', 'บทความตัวอย่าง เขียนเรื่องของคุณที่นี่'], ['คิวแท็กซี่คันสุดท้าย (เรื่องตัวอย่าง)', 'เมือง', 'บทความตัวอย่างเรื่องการกลับบ้านตอนดึก'], ['ร้านเล็กที่เปิดดึก (เรื่องตัวอย่าง)', 'วัฒนธรรม', 'บทความตัวอย่างเรื่องร้านที่ยังเปิดอยู่'], ['เส้นทางที่ไม่หยุดนิ่ง (เรื่องตัวอย่าง)', 'เทคโนโลยี', 'บทความตัวอย่างเรื่องเครื่องมือเบื้องหลังการจราจร'], ['ทางที่ว่างเปล่า (ภาพชุดตัวอย่าง)', 'วัฒนธรรม', 'ภาพชุดตัวอย่าง เปลี่ยนรูปและคำได้']], ['magazine-1', 'magazine-2', 'magazine-3', 'magazine-4', 'magazine-hero'], 'รูปบทความตัวอย่าง'),
    tables: [], records: {}, automations: [],
  },
}
