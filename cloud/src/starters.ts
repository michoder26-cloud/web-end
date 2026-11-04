import type { z } from 'zod'

import type { Automation } from './automations'
import type { tableBase } from './data'
import type { Block, Settings } from './types'

// Ready-made sample sites an owner can start from in one click, in English and Thai.
// Every word, price and time here is a sample and says so. Nothing imitates a real business:
// no reviews, no awards, no figures, no addresses, no phone numbers and no people's names.
// Each one must pass check_site with no problems, which the smoke tests prove.

export const starterIds = ['cafe', 'shop', 'classes', 'services', 'portfolio'] as const
export type StarterId = (typeof starterIds)[number]
export const starterLanguages = ['en', 'th'] as const
export type StarterLanguage = (typeof starterLanguages)[number]

export type StarterPage = { blocks: Block[]; description: string; slug: string; title: string }
export type StarterItem = { body: string; category?: string; collection: string; price?: string; sort: number; stock?: number; title: string; variants?: { name: string; stock: number }[] }
export type StarterTable = z.input<typeof tableBase>
export type StarterContent = {
  automations: Omit<Automation, 'enabled'>[]
  /** What the owner reads when choosing. */
  description: string
  includes: string[]
  items: StarterItem[]
  label: string
  pages: StarterPage[]
  /** Records added to a table only when the starter creates it, so samples are never added twice. */
  records: Record<string, Record<string, number | string>[]>
  settings: Partial<Settings> & { name: string }
  tables: StarterTable[]
}

const samples = (collection: string, rows: [string, string, string, string][]): StarterItem[] => rows.map(([title, price, category, body], index) => ({ body, category, collection, price: price || undefined, sort: index + 1, title }))

const footer = { en: 'This is a sample site. Its words, prices and times are examples.', th: 'นี่คือเว็บตัวอย่าง ข้อความ ราคา และเวลาในเว็บนี้เป็นเพียงตัวอย่าง' }

const cafe: Record<StarterLanguage, StarterContent> = {
  en: {
    label: 'Café or restaurant',
    description: 'A menu with prices and categories, opening hours and a contact form.',
    includes: ['Home page with menu and opening hours', 'Contact page with a working form', '6 sample menu items'],
    settings: { name: 'Sample Café', tagline: 'Coffee, tea and simple food', style: 'warm', accent: '#b4532a', cart: false, nav: [{ label: 'Menu', href: '/#menu' }, { label: 'Hours', href: '/#hours' }, { label: 'Contact', href: '/contact' }], headerButtonLabel: 'Contact us', headerButtonHref: '/contact', footerText: footer.en },
    pages: [
      {
        slug: 'home',
        title: 'Sample Café',
        description: 'A sample café website with a menu, opening hours and a contact form, ready for your own café details.',
        blocks: [
          { type: 'hero', layout: 'centered', eyebrow: 'Sample café', heading: 'Good coffee and simple food, every day', text: 'A friendly neighbourhood café. Everything on this site is a sample, ready for your own words, prices and photos.', buttonLabel: 'See the menu', buttonHref: '#menu' },
          { type: 'collection', id: 'menu', collection: 'menu', heading: 'Menu', intro: 'Sample dishes and prices.', filters: true, tone: 'tint' },
          { type: 'info', id: 'hours', heading: 'Opening hours (sample)', items: [{ label: 'Monday to Friday', value: '7:30 to 17:00' }, { label: 'Saturday and Sunday', value: '8:00 to 15:00' }, { label: 'Public holidays', value: 'Please check before you come' }], buttonLabel: 'Send us a message', buttonHref: '/contact' },
          { type: 'cta', heading: 'Coming with a group?', text: "Send us a message and we'll reply as soon as we can.", buttonLabel: 'Contact us', buttonHref: '/contact' },
        ],
      },
      {
        slug: 'contact',
        title: 'Contact us',
        description: 'Send the sample café a message about a visit, a group, an order in advance or anything else. We reply by email.',
        blocks: [
          { type: 'hero', heading: 'Contact us', text: "Questions, group visits or orders in advance: send a message and we'll reply by email." },
          { type: 'form', name: 'contact', heading: 'Send a message', intro: 'We reply by email.', buttonLabel: 'Send message', sentMessage: 'Thank you. Your message has been sent.', tone: 'tint', fields: [{ name: 'name', label: 'Your name', type: 'text', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'message', label: 'Message', type: 'textarea', required: true }] },
        ],
      },
    ],
    items: samples('menu', [
      ['Espresso', '3.00', 'Coffee', 'Sample item. A short, strong coffee.'],
      ['Flat white', '4.50', 'Coffee', 'Sample item. Espresso with smooth steamed milk.'],
      ['Iced latte', '5.00', 'Coffee', 'Sample item. Espresso, cold milk and ice.'],
      ['Jasmine tea', '3.50', 'Tea', 'Sample item. A pot of hot jasmine tea.'],
      ['Banana bread', '4.00', 'Food', 'Sample item. A thick slice, served warm.'],
      ['Toast and jam', '6.00', 'Food', 'Sample item. Thick toast with butter and jam.'],
    ]),
    tables: [],
    records: {},
    automations: [],
  },
  th: {
    label: 'ร้านกาแฟหรือร้านอาหาร',
    description: 'เมนูพร้อมราคาและหมวดหมู่ เวลาเปิดร้าน และแบบฟอร์มติดต่อ',
    includes: ['หน้าแรกพร้อมเมนูและเวลาเปิดร้าน', 'หน้าติดต่อพร้อมแบบฟอร์มที่ใช้งานได้จริง', 'เมนูตัวอย่าง 6 รายการ'],
    settings: { name: 'ร้านกาแฟตัวอย่าง', tagline: 'กาแฟ ชา และอาหารง่าย ๆ', style: 'warm', accent: '#b4532a', cart: false, nav: [{ label: 'เมนู', href: '/#menu' }, { label: 'เวลาเปิด', href: '/#hours' }, { label: 'ติดต่อ', href: '/contact' }], headerButtonLabel: 'ติดต่อเรา', headerButtonHref: '/contact', footerText: footer.th },
    pages: [
      {
        slug: 'home',
        title: 'ร้านกาแฟตัวอย่าง',
        description: 'เว็บไซต์ร้านกาแฟตัวอย่าง มีเมนู เวลาเปิดร้าน และแบบฟอร์มติดต่อ พร้อมให้เปลี่ยนเป็นข้อมูลร้านของคุณเอง',
        blocks: [
          { type: 'hero', layout: 'centered', eyebrow: 'ร้านกาแฟตัวอย่าง', heading: 'กาแฟดี อาหารง่าย ๆ ทุกวัน', text: 'ร้านกาแฟเล็ก ๆ ใกล้บ้าน ทุกอย่างในเว็บนี้เป็นตัวอย่าง พร้อมให้ใส่ข้อความ ราคา และรูปของคุณเอง', buttonLabel: 'ดูเมนู', buttonHref: '#menu' },
          { type: 'collection', id: 'menu', collection: 'menu', heading: 'เมนู', intro: 'เมนูและราคาตัวอย่าง', filters: true, tone: 'tint' },
          { type: 'info', id: 'hours', heading: 'เวลาเปิดร้าน (ตัวอย่าง)', items: [{ label: 'จันทร์ ถึง ศุกร์', value: '07:30 ถึง 17:00 น.' }, { label: 'เสาร์ และ อาทิตย์', value: '08:00 ถึง 15:00 น.' }, { label: 'วันหยุดนักขัตฤกษ์', value: 'โปรดสอบถามก่อนมา' }], buttonLabel: 'ส่งข้อความถึงเรา', buttonHref: '/contact' },
          { type: 'cta', heading: 'มากันเป็นกลุ่มใช่ไหม', text: 'ส่งข้อความถึงเรา แล้วเราจะตอบกลับโดยเร็ว', buttonLabel: 'ติดต่อเรา', buttonHref: '/contact' },
        ],
      },
      {
        slug: 'contact',
        title: 'ติดต่อเรา',
        description: 'ส่งข้อความถึงร้านกาแฟตัวอย่าง เรื่องการมาเป็นกลุ่ม การสั่งล่วงหน้า หรือเรื่องอื่น ๆ แล้วเราจะตอบกลับทางอีเมล',
        blocks: [
          { type: 'hero', heading: 'ติดต่อเรา', text: 'มีคำถาม มากันเป็นกลุ่ม หรืออยากสั่งล่วงหน้า ส่งข้อความมาได้เลย เราจะตอบกลับทางอีเมล' },
          { type: 'form', name: 'contact', heading: 'ส่งข้อความ', intro: 'เราจะตอบกลับทางอีเมล', buttonLabel: 'ส่งข้อความ', sentMessage: 'ขอบคุณ ส่งข้อความเรียบร้อยแล้ว', tone: 'tint', fields: [{ name: 'name', label: 'ชื่อของคุณ', type: 'text', required: true }, { name: 'email', label: 'อีเมล', type: 'email', required: true }, { name: 'message', label: 'ข้อความ', type: 'textarea', required: true }] },
        ],
      },
    ],
    items: samples('menu', [
      ['เอสเพรสโซ', '฿55', 'กาแฟ', 'ตัวอย่าง กาแฟเข้มข้นแก้วเล็ก'],
      ['แฟลตไวท์', '฿70', 'กาแฟ', 'ตัวอย่าง เอสเพรสโซกับนมสตีมเนื้อเนียน'],
      ['ลาเต้เย็น', '฿75', 'กาแฟ', 'ตัวอย่าง เอสเพรสโซ นมสด และน้ำแข็ง'],
      ['ชามะลิ', '฿60', 'ชา', 'ตัวอย่าง ชามะลิร้อนหนึ่งกา'],
      ['ขนมปังกล้วยหอม', '฿65', 'ของกิน', 'ตัวอย่าง ชิ้นหนา เสิร์ฟอุ่น ๆ'],
      ['ขนมปังปิ้งกับแยม', '฿80', 'ของกิน', 'ตัวอย่าง ขนมปังปิ้งหนานุ่ม เนย และแยม'],
    ]),
    tables: [],
    records: {},
    automations: [],
  },
}

const shopItems = (language: StarterLanguage): StarterItem[] => {
  const en = language === 'en'
  const body = en ? 'Sample product. Replace the photo, price and stock with your own.' : 'สินค้าตัวอย่าง เปลี่ยนรูป ราคา และจำนวนในสต็อกเป็นของคุณเอง'
  const rows: [string, string, string, string, number][] = en
    ? [
        ['Canvas tote bag (sample)', '24.00', 'Bags', 'A sturdy everyday bag.', 20],
        ['Small pouch (sample)', '12.00', 'Bags', 'For keys, cards and coins.', 30],
        ['Ceramic mug (sample)', '18.00', 'Home', 'A simple mug for coffee or tea.', 15],
        ['Linen tea towel (sample)', '14.00', 'Home', 'Soft, quick to dry, and gets better with washing.', 25],
        ['Greeting card (sample)', '4.00', 'Gifts', 'A blank card with an envelope.', 50],
      ]
    : [
        ['กระเป๋าผ้าแคนวาส (ตัวอย่าง)', '฿390', 'กระเป๋า', 'กระเป๋าทนทาน ใช้ได้ทุกวัน', 20],
        ['กระเป๋าใบเล็ก (ตัวอย่าง)', '฿190', 'กระเป๋า', 'ใส่กุญแจ บัตร และเหรียญ', 30],
        ['แก้วเซรามิก (ตัวอย่าง)', '฿290', 'ของใช้ในบ้าน', 'แก้วเรียบ ๆ สำหรับกาแฟหรือชา', 15],
        ['ผ้าเช็ดมือลินิน (ตัวอย่าง)', '฿220', 'ของใช้ในบ้าน', 'นุ่ม แห้งเร็ว ยิ่งซักยิ่งนุ่ม', 25],
        ['การ์ดอวยพร (ตัวอย่าง)', '฿59', 'ของขวัญ', 'การ์ดเปล่าพร้อมซอง', 50],
      ]
  const items: StarterItem[] = rows.map(([title, price, category, text, stock], index) => ({ body: `${text} ${body}`, category, collection: 'products', price, sort: index + 1, stock, title }))
  // One product with sizes, so the owner sees how options work.
  items.splice(4, 0, { body: `${en ? 'Soft cotton, in three sizes.' : 'ผ้าฝ้ายนุ่ม มีสามขนาด'} ${body}`, category: en ? 'Clothing' : 'เสื้อผ้า', collection: 'products', price: en ? '22.00' : '฿350', sort: 5, title: en ? 'Cotton T-shirt (sample)' : 'เสื้อยืดผ้าฝ้าย (ตัวอย่าง)', variants: ['S', 'M', 'L'].map((name) => ({ name, stock: 5 })) })
  return items.map((item, index) => ({ ...item, sort: index + 1 }))
}

const shop: Record<StarterLanguage, StarterContent> = {
  en: {
    label: 'Online shop',
    description: 'Products with categories and sizes, a cart, bank transfer and pay on delivery.',
    includes: ['Home page with products and category filters', 'How to order page with questions and a form', '6 sample products, clearly marked as samples', 'Cart with bank transfer and pay on delivery'],
    settings: { name: 'Sample Shop', tagline: 'Simple things, made to last', style: 'studio', accent: '#0f766e', cart: true, payTransfer: true, payCod: true, transferDetails: 'Sample: replace this with your bank, account name and account number before you take real orders.', nav: [{ label: 'Shop', href: '/#products' }, { label: 'How to order', href: '/how-to-order' }], headerButtonLabel: 'Shop now', headerButtonHref: '/#products', footerText: footer.en },
    pages: [
      {
        slug: 'home',
        title: 'Sample Shop',
        description: 'A sample online shop with products, categories, a cart, bank transfer and pay on delivery, ready for your own products.',
        blocks: [
          { type: 'hero', layout: 'centered', eyebrow: 'Sample shop', heading: 'Simple things, made to last', text: 'This is a starter shop. The products, prices and stock are samples, so change them before you take real orders.', buttonLabel: 'Shop now', buttonHref: '#products' },
          { type: 'collection', id: 'products', collection: 'products', heading: 'Products', intro: 'All products below are samples.', filters: true, tone: 'tint' },
          { type: 'steps', heading: 'How ordering works', items: [{ title: 'Add to your cart', text: 'Choose what you like and how many.' }, { title: 'Choose how to pay', text: 'Pay by bank transfer, or pay when your order arrives.' }, { title: 'We confirm', text: 'We check your order and payment, then send it to you.' }] },
          { type: 'cta', heading: 'Questions before you order?', text: 'Read how ordering, payment and delivery work.', buttonLabel: 'How to order', buttonHref: '/how-to-order' },
        ],
      },
      {
        slug: 'how-to-order',
        title: 'How to order',
        description: 'How to order from the sample shop: the cart, paying by bank transfer or on delivery, and asking us a question.',
        blocks: [
          { type: 'hero', heading: 'How to order', text: 'Everything about paying and getting your order, in one place.' },
          { type: 'faq', heading: 'Questions', tone: 'tint', items: [{ question: 'How do I pay?', answer: 'At checkout, choose bank transfer or pay on delivery. If you choose bank transfer, you see how to pay when you place your order.' }, { question: 'When is my order confirmed?', answer: 'We check every bank transfer ourselves, then confirm your order. You can follow it on your private order page.' }, { question: 'How much is delivery?', answer: 'Any delivery fee is shown in your cart before you order.' }] },
          { type: 'form', name: 'questions', heading: 'Ask a question', intro: 'We reply by email.', buttonLabel: 'Send question', sentMessage: 'Thank you. Your question has been sent.', fields: [{ name: 'name', label: 'Your name', type: 'text', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'message', label: 'Your question', type: 'textarea', required: true }] },
        ],
      },
    ],
    items: shopItems('en'),
    tables: [],
    records: {},
    automations: [],
  },
  th: {
    label: 'ร้านค้าออนไลน์',
    description: 'สินค้าพร้อมหมวดหมู่และขนาด ตะกร้าสินค้า โอนเงินผ่านธนาคาร และเก็บเงินปลายทาง',
    includes: ['หน้าแรกพร้อมสินค้าและตัวกรองหมวดหมู่', 'หน้าวิธีสั่งซื้อพร้อมคำถามที่พบบ่อยและแบบฟอร์ม', 'สินค้าตัวอย่าง 6 รายการ ระบุชัดว่าเป็นตัวอย่าง', 'ตะกร้าสินค้า โอนเงินผ่านธนาคาร และเก็บเงินปลายทาง'],
    settings: { name: 'ร้านค้าตัวอย่าง', tagline: 'ของใช้เรียบง่าย ใช้ได้นาน', style: 'studio', accent: '#0f766e', currency: 'thb', cart: true, payTransfer: true, payCod: true, transferDetails: 'ตัวอย่าง: เปลี่ยนข้อความนี้เป็นชื่อธนาคาร ชื่อบัญชี และเลขที่บัญชีของคุณ ก่อนรับคำสั่งซื้อจริง', nav: [{ label: 'สินค้า', href: '/#products' }, { label: 'วิธีสั่งซื้อ', href: '/how-to-order' }], headerButtonLabel: 'เลือกซื้อสินค้า', headerButtonHref: '/#products', footerText: footer.th },
    pages: [
      {
        slug: 'home',
        title: 'ร้านค้าตัวอย่าง',
        description: 'ร้านค้าออนไลน์ตัวอย่าง มีสินค้า หมวดหมู่ ตะกร้าสินค้า โอนเงินผ่านธนาคาร และเก็บเงินปลายทาง พร้อมให้ใส่สินค้าของคุณเอง',
        blocks: [
          { type: 'hero', layout: 'centered', eyebrow: 'ร้านค้าตัวอย่าง', heading: 'ของใช้เรียบง่าย ใช้ได้นาน', text: 'นี่คือร้านค้าตั้งต้น สินค้า ราคา และสต็อกเป็นตัวอย่างทั้งหมด เปลี่ยนเป็นของคุณก่อนรับคำสั่งซื้อจริง', buttonLabel: 'เลือกซื้อสินค้า', buttonHref: '#products' },
          { type: 'collection', id: 'products', collection: 'products', heading: 'สินค้า', intro: 'สินค้าทั้งหมดด้านล่างเป็นตัวอย่าง', filters: true, tone: 'tint' },
          { type: 'steps', heading: 'สั่งซื้ออย่างไร', items: [{ title: 'ใส่ตะกร้า', text: 'เลือกสินค้าที่ชอบและจำนวนที่ต้องการ' }, { title: 'เลือกวิธีชำระเงิน', text: 'โอนเงินผ่านธนาคาร หรือชำระเงินเมื่อได้รับสินค้า' }, { title: 'เรายืนยัน', text: 'เราตรวจคำสั่งซื้อและการชำระเงิน แล้วจัดส่งให้คุณ' }] },
          { type: 'cta', heading: 'มีคำถามก่อนสั่งซื้อไหม', text: 'อ่านวิธีสั่งซื้อ การชำระเงิน และการจัดส่ง', buttonLabel: 'วิธีสั่งซื้อ', buttonHref: '/how-to-order' },
        ],
      },
      {
        slug: 'how-to-order',
        title: 'วิธีสั่งซื้อ',
        description: 'วิธีสั่งซื้อจากร้านค้าตัวอย่าง ตั้งแต่ใส่ตะกร้า โอนเงินผ่านธนาคารหรือเก็บเงินปลายทาง ไปจนถึงการส่งคำถามถึงเรา',
        blocks: [
          { type: 'hero', heading: 'วิธีสั่งซื้อ', text: 'ทุกเรื่องเกี่ยวกับการชำระเงินและการรับสินค้า รวมไว้ที่นี่' },
          { type: 'faq', heading: 'คำถามที่พบบ่อย', tone: 'tint', items: [{ question: 'ชำระเงินอย่างไร', answer: 'ตอนสั่งซื้อ เลือกโอนเงินผ่านธนาคารหรือเก็บเงินปลายทาง ถ้าเลือกโอนเงิน คุณจะเห็นวิธีโอนหลังจากสั่งซื้อ' }, { question: 'คำสั่งซื้อได้รับการยืนยันเมื่อไร', answer: 'เราตรวจยอดโอนทุกรายการด้วยตัวเอง แล้วจึงยืนยันคำสั่งซื้อ คุณติดตามสถานะได้ที่หน้าคำสั่งซื้อส่วนตัวของคุณ' }, { question: 'ค่าจัดส่งเท่าไร', answer: 'ถ้ามีค่าจัดส่ง จะแสดงในตะกร้าก่อนคุณสั่งซื้อ' }] },
          { type: 'form', name: 'questions', heading: 'ส่งคำถามถึงเรา', intro: 'เราจะตอบกลับทางอีเมล', buttonLabel: 'ส่งคำถาม', sentMessage: 'ขอบคุณ ส่งคำถามเรียบร้อยแล้ว', fields: [{ name: 'name', label: 'ชื่อของคุณ', type: 'text', required: true }, { name: 'email', label: 'อีเมล', type: 'email', required: true }, { name: 'message', label: 'คำถามของคุณ', type: 'textarea', required: true }] },
        ],
      },
    ],
    items: shopItems('th'),
    tables: [],
    records: {},
    automations: [],
  },
}

const classTables = (language: StarterLanguage): StarterTable[] => {
  const en = language === 'en'
  const statuses = en ? ['New', 'Confirmed', 'Cancelled'] : ['ใหม่', 'ยืนยันแล้ว', 'ยกเลิก']
  return [
    {
      name: 'classes',
      label: en ? 'Classes' : 'คลาส',
      readAccess: 'public',
      writeAccess: 'owner',
      fields: [
        { name: 'title', label: en ? 'Class' : 'คลาส', type: 'text', required: true },
        { name: 'when', label: en ? 'Day and time' : 'วันและเวลา', type: 'text', required: true },
        { name: 'seats', label: en ? 'Places' : 'จำนวนที่นั่ง', type: 'number', required: true },
        { name: 'details', label: en ? 'About this class' : 'รายละเอียดคลาส', type: 'textarea' },
      ],
    },
    {
      // Anyone can book without an account, and only the owner reads bookings, so nobody sees another person's details.
      name: 'bookings',
      label: en ? 'Bookings' : 'การจอง',
      readAccess: 'owner',
      writeAccess: 'public',
      fields: [
        // The database counts bookings against the class's places, so the last place can't be taken twice. Cancelled ones free their place.
        { name: 'class', label: en ? 'Class' : 'คลาส', type: 'reference', table: 'classes', required: true, capacityField: 'seats', ignoreField: 'status', ignoreValues: [statuses[2]] },
        { name: 'name', label: en ? 'Your name' : 'ชื่อของคุณ', type: 'text', required: true },
        { name: 'email', label: en ? 'Email' : 'อีเมล', type: 'email', required: true },
        { name: 'phone', label: en ? 'Phone (optional)' : 'เบอร์โทร (ไม่บังคับ)', type: 'phone' },
        { name: 'note', label: en ? 'Anything we should know?' : 'มีอะไรที่เราควรรู้ไหม', type: 'textarea' },
        { name: 'status', label: en ? 'Status' : 'สถานะ', type: 'select', options: statuses, default: statuses[0], readOnly: true },
        { name: 'ref', label: en ? 'Booking number' : 'เลขที่การจอง', type: 'text', readOnly: true },
      ],
    },
  ]
}

const classes: Record<StarterLanguage, StarterContent> = {
  en: {
    label: 'Classes and bookings',
    description: 'A class list with places left, online booking that can never be overbooked, and booking numbers.',
    includes: ['Home page with classes and places left', 'Booking page with a working form', '3 sample classes', 'An automation that gives each booking a number'],
    settings: { name: 'Sample Studio', tagline: 'Small classes, easy booking', style: 'bold', accent: '#c2410c', cart: false, nav: [{ label: 'Classes', href: '/#classes' }, { label: 'Book', href: '/book' }], headerButtonLabel: 'Book a place', headerButtonHref: '/book', footerText: footer.en },
    pages: [
      {
        slug: 'home',
        title: 'Sample Studio',
        description: 'A sample class studio website with a class list, places left and online booking, ready for your own classes and times.',
        blocks: [
          { type: 'hero', layout: 'centered', eyebrow: 'Sample studio', heading: 'Small classes. Book your place in a minute.', text: 'Choose a class, see how many places are left, and book online. The classes on this site are samples.', buttonLabel: 'See classes', buttonHref: '#classes' },
          { type: 'records', id: 'classes', table: 'classes', heading: 'Classes', intro: 'Sample classes. Places left update as people book.', fields: ['title', 'when', 'details'], newestFirst: false, tone: 'tint' },
          { type: 'steps', heading: 'How booking works', items: [{ title: 'Pick a class', text: 'Check the day, the time and the places left.' }, { title: 'Send your booking', text: 'Add your name and email. No account needed.' }, { title: 'Get your booking number', text: 'We confirm your place and keep it for you.' }] },
          { type: 'cta', heading: 'Ready to join a class?', text: 'Booking takes a minute, and full classes are closed automatically.', buttonLabel: 'Book a place', buttonHref: '/book' },
        ],
      },
      {
        slug: 'book',
        title: 'Book a class',
        description: 'Book a place in a class at the sample studio. Choose a class, add your name and email, and we confirm your place.',
        blocks: [
          { type: 'hero', heading: 'Book a class', text: 'Full classes cannot be chosen, so your place is always a real one.' },
          { type: 'record-form', table: 'bookings', heading: 'Your booking', intro: 'Choose a class and tell us how to reach you.', fields: ['class', 'name', 'email', 'phone', 'note'], buttonLabel: 'Book my place', sentMessage: 'Thank you. Your booking has arrived, and we will confirm it soon.', tone: 'tint' },
          { type: 'faq', heading: 'Questions', items: [{ question: 'Do I need an account?', answer: 'No. Your name and email are enough.' }, { question: 'Can a class be overbooked?', answer: 'No. When a class is full, it can no longer be chosen.' }, { question: 'How do I cancel?', answer: 'Reply to our confirmation, and we free your place for someone else.' }] },
        ],
      },
    ],
    items: [],
    tables: classTables('en'),
    records: {
      classes: [
        { title: 'Morning stretch (sample)', when: 'Mondays, 7:00 to 8:00', seats: 8, details: 'Sample class. A gentle start to the week, for all levels.' },
        { title: "Beginners' workshop (sample)", when: 'Wednesdays, 18:30 to 20:00', seats: 10, details: 'Sample class. Learn the basics in a small group.' },
        { title: 'Weekend session (sample)', when: 'Saturdays, 10:00 to 11:30', seats: 6, details: 'Sample class. A longer session with time for questions.' },
      ],
    },
    automations: [{ name: 'Booking number', trigger: { on: 'record_added', table: 'bookings' }, actions: [{ do: 'set_fields', values: { ref: 'BK-{{number}}' } }] }],
  },
  th: {
    label: 'คลาสและการจอง',
    description: 'รายการคลาสพร้อมจำนวนที่นั่งว่าง จองออนไลน์ได้โดยไม่มีวันจองเกิน และเลขที่การจองอัตโนมัติ',
    includes: ['หน้าแรกพร้อมรายการคลาสและที่นั่งว่าง', 'หน้าจองพร้อมแบบฟอร์มที่ใช้งานได้จริง', 'คลาสตัวอย่าง 3 คลาส', 'ระบบอัตโนมัติที่ใส่เลขที่ให้ทุกการจอง'],
    settings: { name: 'สตูดิโอตัวอย่าง', tagline: 'คลาสเล็ก จองง่าย', style: 'bold', accent: '#c2410c', cart: false, nav: [{ label: 'คลาส', href: '/#classes' }, { label: 'จอง', href: '/book' }], headerButtonLabel: 'จองที่นั่ง', headerButtonHref: '/book', footerText: footer.th },
    pages: [
      {
        slug: 'home',
        title: 'สตูดิโอตัวอย่าง',
        description: 'เว็บไซต์สตูดิโอตัวอย่าง มีรายการคลาส จำนวนที่นั่งว่าง และการจองออนไลน์ พร้อมให้ใส่คลาสและเวลาของคุณเอง',
        blocks: [
          { type: 'hero', layout: 'centered', eyebrow: 'สตูดิโอตัวอย่าง', heading: 'คลาสเล็ก จองง่าย', text: 'เลือกคลาส ดูจำนวนที่นั่งว่าง แล้วจองออนไลน์ได้เลย คลาสในเว็บนี้เป็นตัวอย่าง', buttonLabel: 'ดูคลาส', buttonHref: '#classes' },
          { type: 'records', id: 'classes', table: 'classes', heading: 'คลาส', intro: 'คลาสตัวอย่าง จำนวนที่นั่งว่างจะลดลงเมื่อมีคนจอง', fields: ['title', 'when', 'details'], newestFirst: false, tone: 'tint' },
          { type: 'steps', heading: 'จองอย่างไร', items: [{ title: 'เลือกคลาส', text: 'ดูวัน เวลา และจำนวนที่นั่งว่าง' }, { title: 'ส่งการจอง', text: 'ใส่ชื่อและอีเมล ไม่ต้องสมัครสมาชิก' }, { title: 'รับเลขที่การจอง', text: 'เรายืนยันและเก็บที่นั่งไว้ให้คุณ' }] },
          { type: 'cta', heading: 'พร้อมเข้าคลาสแล้วใช่ไหม', text: 'จองได้ในหนึ่งนาที คลาสที่เต็มแล้วจะปิดรับจองเอง', buttonLabel: 'จองที่นั่ง', buttonHref: '/book' },
        ],
      },
      {
        slug: 'book',
        title: 'จองคลาส',
        description: 'จองที่นั่งในคลาสของสตูดิโอตัวอย่าง เลือกคลาส ใส่ชื่อและอีเมล แล้วเราจะยืนยันที่นั่งให้คุณ',
        blocks: [
          { type: 'hero', heading: 'จองคลาส', text: 'คลาสที่เต็มแล้วจะเลือกไม่ได้ ที่นั่งที่คุณจองจึงมีอยู่จริงเสมอ' },
          { type: 'record-form', table: 'bookings', heading: 'การจองของคุณ', intro: 'เลือกคลาส แล้วบอกช่องทางติดต่อคุณ', fields: ['class', 'name', 'email', 'phone', 'note'], buttonLabel: 'จองที่นั่ง', sentMessage: 'ขอบคุณ เราได้รับการจองของคุณแล้ว และจะยืนยันเร็ว ๆ นี้', tone: 'tint' },
          { type: 'faq', heading: 'คำถามที่พบบ่อย', items: [{ question: 'ต้องสมัครสมาชิกไหม', answer: 'ไม่ต้อง ใส่แค่ชื่อและอีเมลก็พอ' }, { question: 'คลาสจะถูกจองเกินได้ไหม', answer: 'ไม่ได้ เมื่อคลาสเต็มแล้ว จะเลือกคลาสนั้นไม่ได้อีก' }, { question: 'ยกเลิกอย่างไร', answer: 'ตอบกลับข้อความยืนยันของเรา แล้วเราจะคืนที่นั่งให้คนอื่น' }] },
        ],
      },
    ],
    items: [],
    tables: classTables('th'),
    records: {
      classes: [
        { title: 'ยืดเหยียดยามเช้า (ตัวอย่าง)', when: 'ทุกวันจันทร์ 07:00 ถึง 08:00 น.', seats: 8, details: 'คลาสตัวอย่าง เริ่มต้นสัปดาห์แบบสบาย ๆ เหมาะกับทุกระดับ' },
        { title: 'เวิร์กช็อปสำหรับมือใหม่ (ตัวอย่าง)', when: 'ทุกวันพุธ 18:30 ถึง 20:00 น.', seats: 10, details: 'คลาสตัวอย่าง เรียนพื้นฐานในกลุ่มเล็ก' },
        { title: 'คลาสวันหยุด (ตัวอย่าง)', when: 'ทุกวันเสาร์ 10:00 ถึง 11:30 น.', seats: 6, details: 'คลาสตัวอย่าง คลาสยาวขึ้น มีเวลาถามตอบ' },
      ],
    },
    automations: [{ name: 'เลขที่การจอง', trigger: { on: 'record_added', table: 'bookings' }, actions: [{ do: 'set_fields', values: { ref: 'BK-{{number}}' } }] }],
  },
}

const services: Record<StarterLanguage, StarterContent> = {
  en: {
    label: 'Services or coaching',
    description: 'Your services, sample prices, how it works, an about page and a contact form.',
    includes: ['Home page with services, prices and steps', 'About page', 'Contact page with a working form'],
    settings: { name: 'Sample Coaching', tagline: 'Clear advice for your next step', style: 'calm', accent: '#2f5d50', cart: false, nav: [{ label: 'Home', href: '/' }, { label: 'About', href: '/about' }, { label: 'Contact', href: '/contact' }], headerButtonLabel: 'Get in touch', headerButtonHref: '/contact', footerText: footer.en },
    pages: [
      {
        slug: 'home',
        title: 'Sample Coaching',
        description: 'A sample website for a coach or service business, with services, prices, how it works and a contact form.',
        blocks: [
          { type: 'hero', layout: 'centered', eyebrow: 'Sample coaching', heading: 'Make your next step a clear one', text: 'One-to-one sessions for people who want a plan they can follow. The services and prices here are samples.', buttonLabel: 'Get in touch', buttonHref: '/contact' },
          { type: 'features', heading: 'How I can help', tone: 'tint', items: [{ title: 'One-to-one sessions', text: 'Focused time on the question that matters most to you right now.' }, { title: 'Plans you can follow', text: 'Leave each session with clear next steps, written down.' }, { title: 'Online or in person', text: 'Meet where it suits you.' }] },
          { type: 'pricing', heading: 'Prices', intro: 'These prices are samples.', plans: [{ name: 'Single session', price: '60', note: 'Sample price', features: '60 minutes\nWritten next steps', buttonLabel: 'Ask about it', buttonHref: '/contact' }, { name: 'Four sessions', price: '220', note: 'Sample price', features: 'Four sessions of 60 minutes\nNotes after each session', buttonLabel: 'Ask about it', buttonHref: '/contact', highlighted: true }, { name: 'Team workshop', price: 'Ask us', note: 'For small groups', features: 'Half a day\nPlanned around your team', buttonLabel: 'Ask about it', buttonHref: '/contact' }] },
          { type: 'steps', heading: 'How it works', tone: 'tint', items: [{ title: 'Get in touch', text: 'Tell me a little about what you need.' }, { title: 'A first conversation', text: 'We agree on what a good result looks like for you.' }, { title: 'Sessions', text: 'We meet, and you leave with clear next steps.' }] },
          { type: 'cta', heading: 'Not sure where to start?', text: 'Send a short message, and I will suggest the option that fits.', buttonLabel: 'Get in touch', buttonHref: '/contact' },
        ],
      },
      {
        slug: 'about',
        title: 'About',
        description: 'About the sample coaching business: who it is for, how sessions work, and answers to common questions.',
        blocks: [
          { type: 'hero', heading: 'About', text: 'A few words about who I am, who I help and how I work.' },
          { type: 'text', heading: 'Who I work with', body: 'This is sample text. Write two or three short paragraphs about the people you help and what changes for them.\n\nKeep it simple and specific, in your own words.' },
          { type: 'faq', heading: 'Questions', tone: 'tint', items: [{ question: 'Where do sessions take place?', answer: 'Online by video call, or in person when we agree on a place.' }, { question: 'How do I book?', answer: 'Send a message from the contact page, and we find a time that suits you.' }] },
          { type: 'cta', heading: 'Ready to talk?', buttonLabel: 'Get in touch', buttonHref: '/contact' },
        ],
      },
      {
        slug: 'contact',
        title: 'Contact',
        description: 'Send a message to ask a question or to book a session with the sample coaching business. Replies come by email.',
        blocks: [
          { type: 'hero', heading: 'Get in touch', text: 'Tell me a little about what you need, and I will reply by email.' },
          { type: 'form', name: 'contact', heading: 'Send a message', buttonLabel: 'Send message', sentMessage: 'Thank you. Your message has been sent.', tone: 'tint', fields: [{ name: 'name', label: 'Your name', type: 'text', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'phone', label: 'Phone (optional)', type: 'phone' }, { name: 'topic', label: 'What is it about?', type: 'select', options: ['A single session', 'Four sessions', 'A team workshop', 'Something else'] }, { name: 'message', label: 'Message', type: 'textarea', required: true }] },
        ],
      },
    ],
    items: [],
    tables: [],
    records: {},
    automations: [],
  },
  th: {
    label: 'บริการหรือโค้ช',
    description: 'บริการของคุณ ราคาตัวอย่าง ขั้นตอนการทำงาน หน้าเกี่ยวกับ และแบบฟอร์มติดต่อ',
    includes: ['หน้าแรกพร้อมบริการ ราคา และขั้นตอน', 'หน้าเกี่ยวกับ', 'หน้าติดต่อพร้อมแบบฟอร์มที่ใช้งานได้จริง'],
    settings: { name: 'โค้ชตัวอย่าง', tagline: 'คำแนะนำที่ชัดเจนสำหรับก้าวต่อไป', style: 'calm', accent: '#2f5d50', cart: false, nav: [{ label: 'หน้าแรก', href: '/' }, { label: 'เกี่ยวกับ', href: '/about' }, { label: 'ติดต่อ', href: '/contact' }], headerButtonLabel: 'ติดต่อ', headerButtonHref: '/contact', footerText: footer.th },
    pages: [
      {
        slug: 'home',
        title: 'โค้ชตัวอย่าง',
        description: 'เว็บไซต์ตัวอย่างสำหรับโค้ชหรือธุรกิจบริการ มีบริการ ราคา ขั้นตอนการทำงาน และแบบฟอร์มติดต่อ',
        blocks: [
          { type: 'hero', layout: 'centered', eyebrow: 'โค้ชตัวอย่าง', heading: 'ให้ก้าวต่อไปของคุณชัดเจน', text: 'โค้ชแบบตัวต่อตัว สำหรับคนที่อยากได้แผนที่ทำตามได้จริง บริการและราคาในเว็บนี้เป็นตัวอย่าง', buttonLabel: 'ติดต่อ', buttonHref: '/contact' },
          { type: 'features', heading: 'ช่วยอะไรคุณได้บ้าง', tone: 'tint', items: [{ title: 'โค้ชตัวต่อตัว', text: 'ใช้เวลาเต็มที่กับเรื่องที่สำคัญที่สุดของคุณตอนนี้' }, { title: 'แผนที่ทำตามได้', text: 'ทุกครั้งจบด้วยขั้นตอนถัดไปที่ชัดเจน เป็นลายลักษณ์อักษร' }, { title: 'ออนไลน์หรือพบกัน', text: 'เลือกแบบที่สะดวกสำหรับคุณ' }] },
          { type: 'pricing', heading: 'ราคา', intro: 'ราคาเหล่านี้เป็นตัวอย่าง', plans: [{ name: 'ครั้งเดียว', price: '฿1,500', note: 'ราคาตัวอย่าง', features: '60 นาที\nสรุปขั้นตอนถัดไป', buttonLabel: 'สอบถาม', buttonHref: '/contact' }, { name: 'สี่ครั้ง', price: '฿5,500', note: 'ราคาตัวอย่าง', features: 'สี่ครั้ง ครั้งละ 60 นาที\nบันทึกสรุปหลังทุกครั้ง', buttonLabel: 'สอบถาม', buttonHref: '/contact', highlighted: true }, { name: 'เวิร์กช็อปสำหรับทีม', price: 'สอบถาม', note: 'สำหรับกลุ่มเล็ก', features: 'ครึ่งวัน\nวางแผนตามทีมของคุณ', buttonLabel: 'สอบถาม', buttonHref: '/contact' }] },
          { type: 'steps', heading: 'ขั้นตอนการทำงาน', tone: 'tint', items: [{ title: 'ติดต่อมา', text: 'เล่าสั้น ๆ ว่าคุณต้องการอะไร' }, { title: 'คุยกันครั้งแรก', text: 'ตกลงกันว่าผลลัพธ์ที่ดีของคุณคืออะไร' }, { title: 'เริ่มโค้ช', text: 'พบกัน แล้วกลับไปพร้อมขั้นตอนถัดไปที่ชัดเจน' }] },
          { type: 'cta', heading: 'ยังไม่แน่ใจว่าจะเริ่มตรงไหน', text: 'ส่งข้อความสั้น ๆ มา แล้วจะแนะนำแบบที่เหมาะกับคุณ', buttonLabel: 'ติดต่อ', buttonHref: '/contact' },
        ],
      },
      {
        slug: 'about',
        title: 'เกี่ยวกับ',
        description: 'เกี่ยวกับโค้ชตัวอย่าง เหมาะกับใคร การโค้ชเป็นอย่างไร และคำตอบของคำถามที่พบบ่อย',
        blocks: [
          { type: 'hero', heading: 'เกี่ยวกับ', text: 'เล่าสั้น ๆ ว่าคุณเป็นใคร ช่วยใคร และทำงานอย่างไร' },
          { type: 'text', heading: 'ทำงานกับใคร', body: 'นี่คือข้อความตัวอย่าง เขียนสองถึงสามย่อหน้าสั้น ๆ ว่าคุณช่วยใคร และเขาได้อะไรจากการทำงานกับคุณ\n\nเขียนให้เรียบง่าย ชัดเจน ด้วยคำพูดของคุณเอง' },
          { type: 'faq', heading: 'คำถามที่พบบ่อย', tone: 'tint', items: [{ question: 'พบกันที่ไหน', answer: 'ออนไลน์ผ่านวิดีโอคอล หรือพบกันในสถานที่ที่ตกลงกัน' }, { question: 'จองอย่างไร', answer: 'ส่งข้อความจากหน้าติดต่อ แล้วเราจะนัดเวลาที่สะดวกสำหรับคุณ' }] },
          { type: 'cta', heading: 'พร้อมคุยกันแล้วใช่ไหม', buttonLabel: 'ติดต่อ', buttonHref: '/contact' },
        ],
      },
      {
        slug: 'contact',
        title: 'ติดต่อ',
        description: 'ส่งข้อความถึงโค้ชตัวอย่าง เพื่อสอบถามหรือนัดเวลาโค้ช แล้วเราจะตอบกลับทางอีเมล',
        blocks: [
          { type: 'hero', heading: 'ติดต่อ', text: 'เล่าสั้น ๆ ว่าคุณต้องการอะไร แล้วเราจะตอบกลับทางอีเมล' },
          { type: 'form', name: 'contact', heading: 'ส่งข้อความ', buttonLabel: 'ส่งข้อความ', sentMessage: 'ขอบคุณ ส่งข้อความเรียบร้อยแล้ว', tone: 'tint', fields: [{ name: 'name', label: 'ชื่อของคุณ', type: 'text', required: true }, { name: 'email', label: 'อีเมล', type: 'email', required: true }, { name: 'phone', label: 'เบอร์โทร (ไม่บังคับ)', type: 'phone' }, { name: 'topic', label: 'เรื่องอะไร', type: 'select', options: ['ครั้งเดียว', 'สี่ครั้ง', 'เวิร์กช็อปสำหรับทีม', 'เรื่องอื่น'] }, { name: 'message', label: 'ข้อความ', type: 'textarea', required: true }] },
        ],
      },
    ],
    items: [],
    tables: [],
    records: {},
    automations: [],
  },
}

const portfolio: Record<StarterLanguage, StarterContent> = {
  en: {
    label: 'Portfolio',
    description: 'Your work with categories, what you do, an about page and a contact form.',
    includes: ['Home page with work and category filters', 'About page', 'Contact page with a working form', '6 sample projects to replace with your own'],
    settings: { name: 'Sample Portfolio', tagline: 'Design and illustration', style: 'editorial', accent: '#9d2f4f', cart: false, nav: [{ label: 'Work', href: '/#work' }, { label: 'About', href: '/about' }, { label: 'Contact', href: '/contact' }], headerButtonLabel: 'Get in touch', headerButtonHref: '/contact', footerText: footer.en },
    pages: [
      {
        slug: 'home',
        title: 'Sample Portfolio',
        description: 'A sample portfolio website with selected work, what I do and a contact form, ready for your own projects and photos.',
        blocks: [
          { type: 'hero', layout: 'centered', eyebrow: 'Sample portfolio', heading: 'Design and illustration for small brands', text: 'Selected work, how I work, and how to get in touch. Every project here is a sample.', buttonLabel: 'See my work', buttonHref: '#work' },
          { type: 'collection', id: 'work', collection: 'work', heading: 'Selected work', intro: 'Sample projects, ready for your own work and photos.', filters: true, tone: 'tint' },
          { type: 'features', heading: 'What I do', items: [{ title: 'Branding', text: 'Logos, colours and simple brand guides.' }, { title: 'Illustration', text: 'Drawings for menus, posters and packaging.' }, { title: 'Websites', text: 'Clear, simple websites that work well on phones.' }] },
          { type: 'cta', heading: 'Have a project in mind?', text: "Tell me about it, and I'll reply with ideas and a price.", buttonLabel: 'Get in touch', buttonHref: '/contact' },
        ],
      },
      {
        slug: 'about',
        title: 'About me',
        description: 'About the designer behind this sample portfolio: the way of working, and the kinds of projects taken on.',
        blocks: [
          { type: 'hero', heading: 'About me', text: 'A few lines about you and your work.' },
          { type: 'text', heading: 'How I work', body: 'This is sample text. Describe how a project with you goes, from the first message to the final files.\n\nMention the kinds of clients and projects you like best.' },
          { type: 'steps', heading: 'Working together', tone: 'tint', items: [{ title: 'Brief', text: 'We talk about what you need.' }, { title: 'Ideas', text: 'I share first ideas for your feedback.' }, { title: 'Final files', text: 'You get everything ready to use.' }] },
          { type: 'cta', heading: 'Want to work together?', buttonLabel: 'Get in touch', buttonHref: '/contact' },
        ],
      },
      {
        slug: 'contact',
        title: 'Contact',
        description: 'Send the designer of this sample portfolio a message about a new project, a question or working together.',
        blocks: [
          { type: 'hero', heading: 'Get in touch', text: "Tell me about your project, and I'll reply by email." },
          { type: 'form', name: 'contact', heading: 'Send a message', buttonLabel: 'Send message', sentMessage: 'Thank you. Your message has been sent.', tone: 'tint', fields: [{ name: 'name', label: 'Your name', type: 'text', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'message', label: 'About your project', type: 'textarea', required: true }] },
        ],
      },
    ],
    items: samples('work', [
      ['Brand identity for a bakery (sample)', '', 'Branding', 'Sample project. Logo, colours and packaging. Replace it with your own work and photos.'],
      ['Illustrated menu (sample)', '', 'Illustration', 'Sample project. A hand-drawn menu for a small restaurant.'],
      ['Website for a local studio (sample)', '', 'Websites', 'Sample project. A simple site with a booking page.'],
      ['Poster series (sample)', '', 'Illustration', 'Sample project. Three posters for a summer event.'],
      ['Shop signs (sample)', '', 'Branding', 'Sample project. Signs and labels for a corner shop.'],
      ['Event invitation (sample)', '', 'Illustration', 'Sample project. A printed invitation and its matching web page.'],
    ]),
    tables: [],
    records: {},
    automations: [],
  },
  th: {
    label: 'พอร์ตโฟลิโอ',
    description: 'ผลงานของคุณพร้อมหมวดหมู่ สิ่งที่คุณทำ หน้าเกี่ยวกับ และแบบฟอร์มติดต่อ',
    includes: ['หน้าแรกพร้อมผลงานและตัวกรองหมวดหมู่', 'หน้าเกี่ยวกับ', 'หน้าติดต่อพร้อมแบบฟอร์มที่ใช้งานได้จริง', 'ผลงานตัวอย่าง 6 ชิ้น ให้เปลี่ยนเป็นของคุณ'],
    settings: { name: 'พอร์ตโฟลิโอตัวอย่าง', tagline: 'งานออกแบบและภาพประกอบ', style: 'editorial', accent: '#9d2f4f', cart: false, nav: [{ label: 'ผลงาน', href: '/#work' }, { label: 'เกี่ยวกับ', href: '/about' }, { label: 'ติดต่อ', href: '/contact' }], headerButtonLabel: 'ติดต่อ', headerButtonHref: '/contact', footerText: footer.th },
    pages: [
      {
        slug: 'home',
        title: 'พอร์ตโฟลิโอตัวอย่าง',
        description: 'เว็บไซต์พอร์ตโฟลิโอตัวอย่าง มีผลงานที่คัดมา สิ่งที่ทำ และแบบฟอร์มติดต่อ พร้อมให้ใส่ผลงานและรูปของคุณเอง',
        blocks: [
          { type: 'hero', layout: 'centered', eyebrow: 'พอร์ตโฟลิโอตัวอย่าง', heading: 'ออกแบบให้แบรนด์เล็ก ๆ', text: 'ผลงานที่คัดมา วิธีทำงาน และช่องทางติดต่อ ผลงานทุกชิ้นในเว็บนี้เป็นตัวอย่าง', buttonLabel: 'ดูผลงาน', buttonHref: '#work' },
          { type: 'collection', id: 'work', collection: 'work', heading: 'ผลงานที่คัดมา', intro: 'ผลงานตัวอย่าง พร้อมให้ใส่ผลงานและรูปของคุณเอง', filters: true, tone: 'tint' },
          { type: 'features', heading: 'สิ่งที่ทำ', items: [{ title: 'สร้างแบรนด์', text: 'โลโก้ สีประจำแบรนด์ และคู่มือแบรนด์แบบง่าย' }, { title: 'ภาพประกอบ', text: 'ภาพวาดสำหรับเมนู โปสเตอร์ และบรรจุภัณฑ์' }, { title: 'เว็บไซต์', text: 'เว็บไซต์เรียบง่าย ชัดเจน ใช้งานบนมือถือได้ดี' }] },
          { type: 'cta', heading: 'มีงานที่อยากทำไหม', text: 'เล่าให้ฟังได้เลย แล้วจะตอบกลับพร้อมไอเดียและราคา', buttonLabel: 'ติดต่อ', buttonHref: '/contact' },
        ],
      },
      {
        slug: 'about',
        title: 'เกี่ยวกับ',
        description: 'เกี่ยวกับนักออกแบบเจ้าของพอร์ตโฟลิโอตัวอย่างนี้ วิธีทำงาน และประเภทงานที่รับทำ',
        blocks: [
          { type: 'hero', heading: 'เกี่ยวกับ', text: 'เล่าสั้น ๆ เกี่ยวกับตัวคุณและงานของคุณ' },
          { type: 'text', heading: 'วิธีทำงาน', body: 'นี่คือข้อความตัวอย่าง เล่าว่างานกับคุณเป็นอย่างไร ตั้งแต่ข้อความแรกจนถึงไฟล์งานสุดท้าย\n\nบอกด้วยว่าชอบทำงานกับลูกค้าและงานแบบไหนที่สุด' },
          { type: 'steps', heading: 'ทำงานด้วยกัน', tone: 'tint', items: [{ title: 'คุยโจทย์', text: 'คุยกันว่าคุณต้องการอะไร' }, { title: 'ไอเดีย', text: 'ส่งไอเดียแรกให้คุณดูและให้ความเห็น' }, { title: 'ไฟล์งาน', text: 'คุณได้ไฟล์ที่พร้อมใช้งานทั้งหมด' }] },
          { type: 'cta', heading: 'อยากทำงานด้วยกันไหม', buttonLabel: 'ติดต่อ', buttonHref: '/contact' },
        ],
      },
      {
        slug: 'contact',
        title: 'ติดต่อ',
        description: 'ส่งข้อความถึงนักออกแบบเจ้าของพอร์ตโฟลิโอตัวอย่างนี้ เรื่องงานใหม่ คำถาม หรือการทำงานร่วมกัน',
        blocks: [
          { type: 'hero', heading: 'ติดต่อ', text: 'เล่าเกี่ยวกับงานของคุณ แล้วจะตอบกลับทางอีเมล' },
          { type: 'form', name: 'contact', heading: 'ส่งข้อความ', buttonLabel: 'ส่งข้อความ', sentMessage: 'ขอบคุณ ส่งข้อความเรียบร้อยแล้ว', tone: 'tint', fields: [{ name: 'name', label: 'ชื่อของคุณ', type: 'text', required: true }, { name: 'email', label: 'อีเมล', type: 'email', required: true }, { name: 'message', label: 'เกี่ยวกับงานของคุณ', type: 'textarea', required: true }] },
        ],
      },
    ],
    items: samples('work', [
      ['อัตลักษณ์แบรนด์ร้านเบเกอรี่ (ตัวอย่าง)', '', 'สร้างแบรนด์', 'ผลงานตัวอย่าง โลโก้ สี และบรรจุภัณฑ์ เปลี่ยนเป็นผลงานและรูปของคุณเอง'],
      ['เมนูภาพวาด (ตัวอย่าง)', '', 'ภาพประกอบ', 'ผลงานตัวอย่าง เมนูวาดมือสำหรับร้านอาหารเล็ก ๆ'],
      ['เว็บไซต์สตูดิโอ (ตัวอย่าง)', '', 'เว็บไซต์', 'ผลงานตัวอย่าง เว็บเรียบง่ายพร้อมหน้าจอง'],
      ['ชุดโปสเตอร์ (ตัวอย่าง)', '', 'ภาพประกอบ', 'ผลงานตัวอย่าง โปสเตอร์สามแบบสำหรับงานหน้าร้อน'],
      ['ป้ายร้าน (ตัวอย่าง)', '', 'สร้างแบรนด์', 'ผลงานตัวอย่าง ป้ายและฉลากสำหรับร้านหัวมุม'],
      ['การ์ดเชิญ (ตัวอย่าง)', '', 'ภาพประกอบ', 'ผลงานตัวอย่าง การ์ดเชิญแบบพิมพ์และหน้าเว็บที่เข้าชุดกัน'],
    ]),
    tables: [],
    records: {},
    automations: [],
  },
}

export const starterSites: Record<StarterId, Record<StarterLanguage, StarterContent>> = { cafe, shop, classes, services, portfolio }
