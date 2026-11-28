import type { StarterContent, StarterLanguage, StarterPage } from './starters'

// New looks for the starters, each laid out after the patterns of a well-made kind of site (see the patterns
// guide). Only the structure is learned: every word here is our own sample text, and every photo is CC0 and
// served from this site (/templates, with CREDITS.json beside them). No names, logos or colours of any brand.

const footer = { en: 'This is a sample site. Its words, prices and times are examples.', th: 'นี่คือเว็บตัวอย่าง ข้อความ ราคา และเวลาในเว็บนี้เป็นเพียงตัวอย่าง' }

// Business services: a confident split hero with a photo, sample figures, four strengths, work shown beside
// words, three plans and a dark closing band. Light, crisp and navy, with one strong accent.
export const services: Record<StarterLanguage, StarterContent> = {
  en: {
    label: 'Business services',
    description: 'A polished site for a consultancy or service business: services, sample figures, plans and a contact form.',
    includes: ['Home page with a photo hero, strengths, how you work and plans', 'About page', 'Contact page with a working form'],
    settings: { name: 'Sample Consulting', tagline: 'Clear plans that move a business forward', style: 'studio', headingFont: 'Manrope', bodyFont: 'Inter', accent: '#4f46e5', background: '#ffffff', text: '#0f1f3d', cart: false, nav: [{ label: 'Services', href: '/#services' }, { label: 'Plans', href: '/#plans' }, { label: 'About', href: '/about' }], headerButtonLabel: 'Book a call', headerButtonHref: '/contact', footerText: footer.en },
    pages: [
      {
        slug: 'home',
        title: 'Sample Consulting',
        description: 'A sample website for a consultancy or service business, with services, how it works, plans and a contact form.',
        blocks: [
          { type: 'hero', layout: 'split', eyebrow: 'Sample consulting studio', heading: 'Clear plans that help your business grow', text: 'We work beside owners to sort out the numbers, the offer and the next steps, then help put them in place. Everything on this sample site can be changed.', buttonLabel: 'Book a call', buttonHref: '/contact', secondLabel: 'See our services', secondHref: '/#services', imageUrl: '/templates/services-hero.jpg', imageAlt: 'Two people planning together at a desk with a laptop' },
          { type: 'features', id: 'services', heading: 'What we help with', intro: 'Four sample services. Keep the ones you offer and rewrite them in your words.', items: [{ title: 'Strategy', text: 'Decide where to focus next, with a plan that fits your time and budget.' }, { title: 'Pricing and offers', text: 'Shape packages your customers understand and that pay for your time.' }, { title: 'Operations', text: 'Simple routines and tools so the business runs without you in every detail.' }, { title: 'Growth', text: 'Find the channels that bring the right customers, and measure what works.' }] },
          { type: 'split', heading: 'Work that fits the way you already run', body: 'We start from how your business works today, not from a template. Short sessions, plain words and written next steps after every meeting.\n\nThis text is a sample. Tell your own story here.', imageUrl: '/templates/services-work.jpg', imageAlt: 'A person looking at a wall of sketches and notes', imageSide: 'left', buttonLabel: 'How we work', buttonHref: '/about' },
          { type: 'steps', heading: 'How it works', tone: 'tint', items: [{ title: 'A first call', text: 'Thirty minutes to understand where you are and what you need.' }, { title: 'A clear plan', text: 'Within a week you get a written plan with priorities and costs.' }, { title: 'Doing it together', text: 'We work through the plan with you and check the results each month.' }] },
          { type: 'pricing', id: 'plans', heading: 'Plans', intro: 'Sample plans and prices. Change them to your own before publishing.', plans: [{ name: 'Starter', price: '490', note: 'One-off, sample price', features: 'First call\nWritten plan\nOne follow-up', buttonLabel: 'Ask about it', buttonHref: '/contact' }, { name: 'Partner', price: '1,200', note: 'Per month, sample price', features: 'Everything in Starter\nTwo sessions a month\nEmail support', buttonLabel: 'Ask about it', buttonHref: '/contact', highlighted: true }, { name: 'Team', price: 'On request', note: 'Sample', features: 'Workshops for your team\nA plan for each department', buttonLabel: 'Talk to us', buttonHref: '/contact' }] },
          { type: 'cta', heading: 'Ready for a clearer plan?', text: 'Book a short call. This sample button leads to the contact form.', buttonLabel: 'Book a call', buttonHref: '/contact', tone: 'dark' },
        ],
      },
      {
        slug: 'about',
        title: 'About us',
        description: 'Sample about page for a consultancy: how we work and what we believe.',
        blocks: [
          { type: 'hero', layout: 'centered', eyebrow: 'About (sample)', heading: 'Small team, close work, clear results', text: 'This sample page tells visitors who you are. Replace it with your own story.' },
          { type: 'split', heading: 'Why we started', body: 'Many owners get advice that is hard to use. We wanted to give plans people can follow on a Monday morning.\n\nThis is sample text.', imageUrl: '/templates/services-meet.jpg', imageAlt: 'Hands resting on a table beside a notebook in a meeting', imageSide: 'right' },
          { type: 'features', heading: 'What we believe', tone: 'tint', items: [{ title: 'Plain words', text: 'No jargon. If it cannot be said simply, it is not ready.' }, { title: 'Written next steps', text: 'Every meeting ends with what happens next, on paper.' }, { title: 'Results you can see', text: 'We agree how success is measured before we start.' }] },
          { type: 'cta', heading: 'Let us talk', buttonLabel: 'Contact us', buttonHref: '/contact', tone: 'dark' },
        ],
      },
      {
        slug: 'contact',
        title: 'Contact',
        description: 'Sample contact page with a working form for a consultancy.',
        blocks: [
          { type: 'hero', layout: 'centered', heading: 'Book a call', text: 'Tell us a little about your business. This sample form sends your message to the back office.' },
          { type: 'form', name: 'contact', heading: 'Send a message', intro: 'We reply by email.', buttonLabel: 'Send message', sentMessage: 'Thank you. Your message has been sent.', tone: 'tint', fields: [{ name: 'name', label: 'Your name', type: 'text', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'message', label: 'What would you like help with?', type: 'textarea', required: true }] },
        ],
      },
    ],
    items: [], tables: [], records: {}, automations: [],
  },
  th: {
    label: 'ธุรกิจบริการ',
    description: 'เว็บดูโปรสำหรับที่ปรึกษาหรือธุรกิจบริการ มีบริการ ตัวเลขตัวอย่าง แพ็กเกจ และฟอร์มติดต่อ',
    includes: ['หน้าแรกมีภาพใหญ่ จุดเด่น วิธีทำงาน และแพ็กเกจ', 'หน้าเกี่ยวกับเรา', 'หน้าติดต่อพร้อมฟอร์มใช้งานได้'],
    settings: { name: 'ที่ปรึกษาตัวอย่าง', tagline: 'แผนชัดเจนที่พาธุรกิจไปข้างหน้า', style: 'studio', headingFont: 'IBM Plex Sans Thai', bodyFont: 'IBM Plex Sans Thai', accent: '#4f46e5', background: '#ffffff', text: '#0f1f3d', cart: false, nav: [{ label: 'บริการ', href: '/#services' }, { label: 'แพ็กเกจ', href: '/#plans' }, { label: 'เกี่ยวกับเรา', href: '/about' }], headerButtonLabel: 'นัดคุย', headerButtonHref: '/contact', footerText: footer.th },
    pages: [
      {
        slug: 'home',
        title: 'ที่ปรึกษาตัวอย่าง',
        description: 'เว็บตัวอย่างสำหรับที่ปรึกษาหรือธุรกิจบริการ มีบริการ วิธีทำงาน แพ็กเกจ และฟอร์มติดต่อ',
        blocks: [
          { type: 'hero', layout: 'split', eyebrow: 'สตูดิโอที่ปรึกษาตัวอย่าง', heading: 'แผนชัดเจนที่ช่วยให้ธุรกิจของคุณเติบโต', text: 'เราทำงานเคียงข้างเจ้าของกิจการ จัดการตัวเลข ข้อเสนอ และขั้นต่อไป แล้วช่วยลงมือทำ ทุกอย่างในเว็บตัวอย่างนี้แก้ไขได้', buttonLabel: 'นัดคุย', buttonHref: '/contact', secondLabel: 'ดูบริการ', secondHref: '/#services', imageUrl: '/templates/services-hero.jpg', imageAlt: 'สองคนกำลังวางแผนด้วยกันที่โต๊ะพร้อมแล็ปท็อป' },
          { type: 'features', id: 'services', heading: 'เราช่วยเรื่องอะไรได้บ้าง', intro: 'บริการตัวอย่าง 4 อย่าง เก็บเฉพาะที่คุณมี แล้วเขียนใหม่ด้วยคำของคุณ', items: [{ title: 'กลยุทธ์', text: 'ตัดสินใจว่าจะโฟกัสอะไรต่อ ด้วยแผนที่เข้ากับเวลาและงบของคุณ' }, { title: 'ราคาและแพ็กเกจ', text: 'จัดแพ็กเกจที่ลูกค้าเข้าใจง่าย และคุ้มกับเวลาของคุณ' }, { title: 'การทำงานในร้าน', text: 'ขั้นตอนและเครื่องมือง่าย ๆ ให้ธุรกิจเดินได้โดยไม่ต้องคุมทุกอย่างเอง' }, { title: 'การเติบโต', text: 'หาช่องทางที่ได้ลูกค้าที่ใช่ และวัดผลว่าอะไรได้ผล' }] },
          { type: 'split', heading: 'ทำงานแบบที่เข้ากับธุรกิจของคุณ', body: 'เราเริ่มจากวิธีที่ธุรกิจคุณทำอยู่วันนี้ ไม่ใช่สูตรสำเร็จ คุยสั้น ๆ ใช้คำง่าย ๆ และมีขั้นต่อไปเป็นลายลักษณ์อักษรทุกครั้ง\n\nข้อความนี้เป็นตัวอย่าง เล่าเรื่องของคุณเองที่นี่', imageUrl: '/templates/services-work.jpg', imageAlt: 'คนกำลังดูผนังที่ติดภาพร่างและโน้ต', imageSide: 'left', buttonLabel: 'วิธีทำงานของเรา', buttonHref: '/about' },
          { type: 'steps', heading: 'ขั้นตอน', tone: 'tint', items: [{ title: 'คุยครั้งแรก', text: '30 นาที เพื่อเข้าใจว่าคุณอยู่ตรงไหนและต้องการอะไร' }, { title: 'แผนที่ชัดเจน', text: 'ภายในหนึ่งสัปดาห์ ได้แผนเป็นเอกสาร พร้อมลำดับความสำคัญและค่าใช้จ่าย' }, { title: 'ลงมือด้วยกัน', text: 'ทำตามแผนไปด้วยกัน และดูผลทุกเดือน' }] },
          { type: 'pricing', id: 'plans', heading: 'แพ็กเกจ', intro: 'แพ็กเกจและราคาตัวอย่าง เปลี่ยนเป็นของคุณก่อนเผยแพร่', plans: [{ name: 'เริ่มต้น', price: '4,900', note: 'ครั้งเดียว ราคาตัวอย่าง', features: 'คุยครั้งแรก\nแผนเป็นเอกสาร\nติดตามผลหนึ่งครั้ง', buttonLabel: 'สอบถาม', buttonHref: '/contact' }, { name: 'คู่คิด', price: '12,000', note: 'ต่อเดือน ราคาตัวอย่าง', features: 'ทุกอย่างในแพ็กเริ่มต้น\nคุยเดือนละสองครั้ง\nตอบทางอีเมล', buttonLabel: 'สอบถาม', buttonHref: '/contact', highlighted: true }, { name: 'ทีม', price: 'สอบถาม', note: 'ตัวอย่าง', features: 'เวิร์กช็อปสำหรับทีม\nแผนสำหรับแต่ละแผนก', buttonLabel: 'คุยกับเรา', buttonHref: '/contact' }] },
          { type: 'cta', heading: 'พร้อมมีแผนที่ชัดขึ้นไหม', text: 'นัดคุยสั้น ๆ ปุ่มตัวอย่างนี้พาไปที่ฟอร์มติดต่อ', buttonLabel: 'นัดคุย', buttonHref: '/contact', tone: 'dark' },
        ],
      },
      {
        slug: 'about',
        title: 'เกี่ยวกับเรา',
        description: 'หน้าเกี่ยวกับเราตัวอย่างของที่ปรึกษา วิธีทำงานและสิ่งที่เราเชื่อ',
        blocks: [
          { type: 'hero', layout: 'centered', eyebrow: 'เกี่ยวกับเรา (ตัวอย่าง)', heading: 'ทีมเล็ก ทำงานใกล้ชิด ผลลัพธ์ชัดเจน', text: 'หน้าตัวอย่างนี้บอกผู้เข้าชมว่าคุณเป็นใคร เปลี่ยนเป็นเรื่องของคุณเอง' },
          { type: 'split', heading: 'ทำไมเราเริ่มทำ', body: 'เจ้าของกิจการหลายคนได้คำแนะนำที่เอาไปใช้ยาก เราอยากให้แผนที่ทำตามได้จริงตั้งแต่เช้าวันจันทร์\n\nข้อความนี้เป็นตัวอย่าง', imageUrl: '/templates/services-meet.jpg', imageAlt: 'มือวางบนโต๊ะข้างสมุดในห้องประชุม', imageSide: 'right' },
          { type: 'features', heading: 'สิ่งที่เราเชื่อ', tone: 'tint', items: [{ title: 'ใช้คำง่าย', text: 'ไม่ใช้ศัพท์ยาก ถ้าพูดให้ง่ายไม่ได้ แปลว่ายังไม่พร้อม' }, { title: 'ขั้นต่อไปเป็นเอกสาร', text: 'จบการคุยทุกครั้งด้วยสิ่งที่ต้องทำต่อ' }, { title: 'ผลที่มองเห็นได้', text: 'ตกลงกันก่อนเริ่มว่าจะวัดความสำเร็จอย่างไร' }] },
          { type: 'cta', heading: 'มาคุยกัน', buttonLabel: 'ติดต่อเรา', buttonHref: '/contact', tone: 'dark' },
        ],
      },
      {
        slug: 'contact',
        title: 'ติดต่อ',
        description: 'หน้าติดต่อตัวอย่างพร้อมฟอร์มที่ใช้งานได้สำหรับที่ปรึกษา',
        blocks: [
          { type: 'hero', layout: 'centered', heading: 'นัดคุย', text: 'เล่าเกี่ยวกับธุรกิจของคุณสักเล็กน้อย ฟอร์มตัวอย่างนี้ส่งข้อความเข้าหลังบ้าน' },
          { type: 'form', name: 'contact', heading: 'ส่งข้อความ', intro: 'เราจะตอบกลับทางอีเมล', buttonLabel: 'ส่งข้อความ', sentMessage: 'ขอบคุณ ส่งข้อความเรียบร้อยแล้ว', tone: 'tint', fields: [{ name: 'name', label: 'ชื่อของคุณ', type: 'text', required: true }, { name: 'email', label: 'อีเมล', type: 'email', required: true }, { name: 'message', label: 'อยากให้ช่วยเรื่องอะไร', type: 'textarea', required: true }] },
        ],
      },
    ],
    items: [], tables: [], records: {}, automations: [],
  },
}

// An app or startup landing page: dark, quiet and wide. A big left-aligned promise, the product on a desk,
// three strengths, how it works, questions, and a waitlist form at the end.
export const landing: Record<StarterLanguage, StarterContent> = {
  en: {
    label: 'App or startup landing page',
    description: 'A dark, modern one-page site for an app, a product or a launch, with a working waitlist form.',
    includes: ['One home page in a dark look', 'Strengths, steps and questions', 'A working waitlist form'],
    settings: { name: 'Sample App', tagline: 'Do the work that matters, faster', style: 'studio', headingFont: 'Inter', bodyFont: 'Inter', accent: '#8b8cf5', background: '#0b0c0f', text: '#eef0f4', cart: false, nav: [{ label: 'Features', href: '/#features' }, { label: 'How it works', href: '/#how' }, { label: 'Questions', href: '/#faq' }], headerButtonLabel: 'Join the waitlist', headerButtonHref: '/#waitlist', footerText: footer.en },
    pages: [
      {
        slug: 'home',
        title: 'Sample App',
        description: 'A sample landing page for an app or product launch, with features, how it works, questions and a waitlist form.',
        blocks: [
          { type: 'hero', layout: 'split', eyebrow: 'Sample product', heading: 'The calm way to plan and ship your work', text: 'A sample landing page for your app or product. Say in one line what it does and who it is for.', buttonLabel: 'Join the waitlist', buttonHref: '/#waitlist', secondLabel: 'See how it works', secondHref: '/#how', imageUrl: '/templates/landing-hero.jpg', imageAlt: 'A laptop on a dark desk showing the time' },
          { type: 'features', id: 'features', heading: 'Built for focus', intro: 'Three sample strengths. Replace them with what makes your product different.', items: [{ title: 'Fast by default', text: 'Everything opens at once, so nothing breaks your flow.' }, { title: 'Made for teams', text: 'Plans, notes and updates in one place everyone can see.' }, { title: 'Quietly smart', text: 'Small helpers that tidy up the busywork in the background.' }] },
          { type: 'split', heading: 'From idea to done, in one place', body: 'Write it down, plan it, share it and see it through, without jumping between tools.\n\nThis is sample text for your product story.', imageUrl: '/templates/landing-desk.jpg', imageAlt: 'A tidy desk with a laptop, a lamp and a clock on the wall', imageSide: 'right' },
          { type: 'steps', id: 'how', heading: 'How it works', items: [{ title: 'Sign up', text: 'Join with your email. No card needed for the sample.' }, { title: 'Invite your team', text: 'Bring people in with a link.' }, { title: 'Ship', text: 'Plan, track and finish, together.' }] },
          { type: 'faq', id: 'faq', heading: 'Questions', items: [{ question: 'When does it launch?', answer: 'This is a sample answer. Tell people when they can expect access.' }, { question: 'What will it cost?', answer: 'A sample answer. Say whether there is a free plan and what paid plans include.' }, { question: 'Is my data safe?', answer: 'A sample answer. Explain where data is kept and who can see it.' }] },
          { type: 'form', name: 'waitlist', id: 'waitlist', heading: 'Join the waitlist', intro: 'Leave your email and we will write when it is ready. This sample form sends entries to the back office.', buttonLabel: 'Join the waitlist', sentMessage: 'Thank you. You are on the list.', fields: [{ name: 'email', label: 'Email', type: 'email', required: true }, { name: 'name', label: 'Name (optional)', type: 'text' }] },
        ],
      },
    ],
    items: [], tables: [], records: {}, automations: [],
  },
  th: {
    label: 'หน้าเปิดตัวแอปหรือสตาร์ตอัป',
    description: 'เว็บหน้าเดียวโทนมืดดูทันสมัย สำหรับแอป สินค้า หรือการเปิดตัว พร้อมฟอร์มลงชื่อรอใช้งาน',
    includes: ['หน้าแรกหน้าเดียวโทนมืด', 'จุดเด่น ขั้นตอน และคำถามที่พบบ่อย', 'ฟอร์มลงชื่อรอใช้งานที่ใช้ได้จริง'],
    settings: { name: 'แอปตัวอย่าง', tagline: 'ทำงานที่สำคัญได้เร็วขึ้น', style: 'studio', headingFont: 'IBM Plex Sans Thai', bodyFont: 'IBM Plex Sans Thai', accent: '#8b8cf5', background: '#0b0c0f', text: '#eef0f4', cart: false, nav: [{ label: 'จุดเด่น', href: '/#features' }, { label: 'วิธีใช้', href: '/#how' }, { label: 'คำถาม', href: '/#faq' }], headerButtonLabel: 'ลงชื่อรอใช้งาน', headerButtonHref: '/#waitlist', footerText: footer.th },
    pages: [
      {
        slug: 'home',
        title: 'แอปตัวอย่าง',
        description: 'หน้าเปิดตัวตัวอย่างสำหรับแอปหรือสินค้า มีจุดเด่น วิธีใช้ คำถาม และฟอร์มลงชื่อรอใช้งาน',
        blocks: [
          { type: 'hero', layout: 'split', eyebrow: 'สินค้าตัวอย่าง', heading: 'วางแผนและส่งงานได้อย่างสบายใจ', text: 'หน้าเปิดตัวตัวอย่างสำหรับแอปหรือสินค้าของคุณ บอกในบรรทัดเดียวว่าทำอะไรได้และเหมาะกับใคร', buttonLabel: 'ลงชื่อรอใช้งาน', buttonHref: '/#waitlist', secondLabel: 'ดูวิธีใช้', secondHref: '/#how', imageUrl: '/templates/landing-hero.jpg', imageAlt: 'แล็ปท็อปบนโต๊ะสีเข้มแสดงเวลา' },
          { type: 'features', id: 'features', heading: 'ทำมาเพื่อการโฟกัส', intro: 'จุดเด่นตัวอย่าง 3 ข้อ เปลี่ยนเป็นสิ่งที่ทำให้สินค้าของคุณต่างจากคนอื่น', items: [{ title: 'เร็วตั้งแต่แรก', text: 'เปิดอะไรก็ขึ้นทันที ไม่มีอะไรมาขัดจังหวะ' }, { title: 'ทำมาเพื่อทีม', text: 'แผน โน้ต และอัปเดตอยู่ในที่เดียวที่ทุกคนเห็น' }, { title: 'ฉลาดแบบเงียบ ๆ', text: 'ตัวช่วยเล็ก ๆ จัดงานจุกจิกให้เบื้องหลัง' }] },
          { type: 'split', heading: 'จากไอเดียถึงงานเสร็จ ในที่เดียว', body: 'จด วางแผน แชร์ และทำให้เสร็จ โดยไม่ต้องสลับไปมาหลายโปรแกรม\n\nข้อความนี้เป็นตัวอย่างสำหรับเล่าเรื่องสินค้าของคุณ', imageUrl: '/templates/landing-desk.jpg', imageAlt: 'โต๊ะทำงานเรียบร้อยมีแล็ปท็อป โคมไฟ และนาฬิกาบนผนัง', imageSide: 'right' },
          { type: 'steps', id: 'how', heading: 'วิธีใช้', items: [{ title: 'สมัคร', text: 'ใช้อีเมลสมัคร ไม่ต้องใช้บัตรในตัวอย่างนี้' }, { title: 'ชวนทีม', text: 'ส่งลิงก์ชวนเพื่อนร่วมทีม' }, { title: 'ส่งงาน', text: 'วางแผน ติดตาม และทำให้เสร็จไปด้วยกัน' }] },
          { type: 'faq', id: 'faq', heading: 'คำถามที่พบบ่อย', items: [{ question: 'เปิดตัวเมื่อไร', answer: 'นี่คือคำตอบตัวอย่าง บอกผู้คนว่าจะเริ่มใช้ได้เมื่อไร' }, { question: 'ราคาเท่าไร', answer: 'คำตอบตัวอย่าง บอกว่ามีแบบฟรีไหม และแบบเสียเงินได้อะไรบ้าง' }, { question: 'ข้อมูลปลอดภัยไหม', answer: 'คำตอบตัวอย่าง อธิบายว่าเก็บข้อมูลไว้ที่ไหนและใครเห็นได้บ้าง' }] },
          { type: 'form', name: 'waitlist', id: 'waitlist', heading: 'ลงชื่อรอใช้งาน', intro: 'ฝากอีเมลไว้ แล้วเราจะแจ้งเมื่อพร้อม ฟอร์มตัวอย่างนี้ส่งข้อมูลเข้าหลังบ้าน', buttonLabel: 'ลงชื่อรอใช้งาน', sentMessage: 'ขอบคุณ คุณอยู่ในรายชื่อแล้ว', fields: [{ name: 'email', label: 'อีเมล', type: 'email', required: true }, { name: 'name', label: 'ชื่อ (ไม่บังคับ)', type: 'text' }] },
        ],
      },
    ],
    items: [], tables: [], records: {}, automations: [],
  },
}

// Appointment booking: a bright, centred promise, the open times right below, four friendly steps, a photo of
// the service, questions and a soft closing band. The booking tables come from the starter itself.
export const appointmentPages = (language: StarterLanguage): { pages: StarterPage[]; settings: StarterContent['settings'] } => language === 'th'
  ? {
      settings: { name: 'ร้านบริการตัวอย่าง', tagline: 'เลือกเวลาที่สะดวก', style: 'calm', headingFont: 'IBM Plex Sans Thai', bodyFont: 'IBM Plex Sans Thai', accent: '#1a5cff', background: '#ffffff', text: '#0b1f3a', cart: false, nav: [{ label: 'เวลาที่ว่าง', href: '/#slots' }, { label: 'วิธีจอง', href: '/#how' }, { label: 'จองคิว', href: '/book' }], headerButtonLabel: 'จองคิว', headerButtonHref: '/book', footerText: footer.th },
      pages: [
        { slug: 'home', title: 'ร้านบริการตัวอย่าง', description: 'เว็บบริการตัวอย่างที่มีเวลาว่างและแบบฟอร์มจองคิวออนไลน์', blocks: [
          { type: 'hero', layout: 'centered', eyebrow: 'บริการตัวอย่าง', heading: 'จองคิวได้ในหนึ่งนาที ไม่ต้องโทร', text: 'เลือกเวลาที่ว่างด้านล่าง แล้วส่งคำขอจองได้เลย เวลาทั้งหมดเป็นตัวอย่าง เปลี่ยนเป็นบริการและเวลาเปิดจริงก่อนเผยแพร่', buttonLabel: 'ดูเวลาที่ว่าง', buttonHref: '/#slots', secondLabel: 'จองคิว', secondHref: '/book', tone: 'tint' },
          { type: 'records', id: 'slots', table: 'appointment_slots', heading: 'เวลาที่เปิดให้จอง', intro: 'เวลาทั้งหมดเป็นตัวอย่าง เมื่อช่วงเวลาเต็มจะเลือกจองไม่ได้', fields: ['title', 'date', 'time'], newestFirst: false },
          { type: 'steps', id: 'how', heading: 'จองง่ายใน 3 ขั้น', tone: 'tint', items: [{ title: 'เลือกเวลา', text: 'เลือกช่วงเวลาที่ยังว่าง' }, { title: 'ส่งคำขอ', text: 'ใส่ชื่อและอีเมล ไม่ต้องสมัครสมาชิก' }, { title: 'รอยืนยัน', text: 'ร้านตรวจและยืนยันกลับทางอีเมล แล้วมาตามเวลานัดได้เลย' }] },
          { type: 'split', heading: 'ใส่ใจทุกนัด', body: 'เล่าว่าบริการของคุณพิเศษอย่างไร ใช้เวลานานเท่าไร และควรเตรียมตัวอย่างไร\n\nข้อความนี้เป็นตัวอย่าง', imageUrl: '/templates/booking-hero.jpg', imageAlt: 'ช่างกำลังตัดผมให้ลูกค้า', imageSide: 'left', buttonLabel: 'จองคิว', buttonHref: '/book' },
          { type: 'faq', heading: 'คำถามที่พบบ่อย', items: [{ question: 'ยกเลิกหรือเลื่อนนัดได้ไหม', answer: 'คำตอบตัวอย่าง บอกนโยบายการยกเลิกและเลื่อนนัดของคุณ' }, { question: 'ต้องจ่ายเงินก่อนไหม', answer: 'คำตอบตัวอย่าง บอกว่าจ่ายที่ร้านหรือโอนล่วงหน้า' }, { question: 'ถ้ามาสายจะเป็นอย่างไร', answer: 'คำตอบตัวอย่าง บอกว่ารอได้นานเท่าไร' }] },
          { type: 'cta', heading: 'พร้อมจองแล้วใช่ไหม', text: 'เลือกเวลาที่สะดวก แล้วส่งคำขอได้เลย', buttonLabel: 'จองคิว', buttonHref: '/book', tone: 'tint' },
        ] },
        { slug: 'book', title: 'จองคิว', description: 'หน้าจองตัวอย่าง เลือกเวลาที่ว่างและส่งคำขอจองคิว ร้านจะตรวจคำขอและยืนยันกลับ', blocks: [
          { type: 'hero', layout: 'centered', heading: 'จองคิว', text: 'เลือกเวลาที่ยังว่าง ร้านจะติดต่อกลับเพื่อยืนยันคำขอ หน้านี้เป็นตัวอย่าง', tone: 'tint' },
          { type: 'record-form', table: 'appointment_bookings', heading: 'ข้อมูลการจอง', intro: 'ช่วงเวลาที่เต็มแล้วจะเลือกไม่ได้', fields: ['slot', 'name', 'email', 'phone', 'note'], buttonLabel: 'ส่งคำขอจอง', sentMessage: 'ส่งคำขอจองแล้ว ร้านจะยืนยันกลับทางอีเมล' },
        ] },
      ],
    }
  : {
      settings: { name: 'Sample Appointments', tagline: 'Choose a time that works for you', style: 'calm', headingFont: 'Manrope', bodyFont: 'Inter', accent: '#1a5cff', background: '#ffffff', text: '#0b1f3a', cart: false, nav: [{ label: 'Open times', href: '/#slots' }, { label: 'How it works', href: '/#how' }, { label: 'Book', href: '/book' }], headerButtonLabel: 'Book a time', headerButtonHref: '/book', footerText: footer.en },
      pages: [
        { slug: 'home', title: 'Sample Appointments', description: 'A sample local service website with available appointments and online booking.', blocks: [
          { type: 'hero', layout: 'centered', eyebrow: 'Sample service', heading: 'Book your appointment in a minute, no calls', text: 'Pick an open time below and send your request. These times are samples: replace them with your real services and opening hours before publishing.', buttonLabel: 'See open times', buttonHref: '/#slots', secondLabel: 'Book now', secondHref: '/book', tone: 'tint' },
          { type: 'records', id: 'slots', table: 'appointment_slots', heading: 'Open times', intro: 'These are sample times. A time disappears from the booking choices when it is full.', fields: ['title', 'date', 'time'], newestFirst: false },
          { type: 'steps', id: 'how', heading: 'Three easy steps', tone: 'tint', items: [{ title: 'Choose a time', text: 'Pick one of the open appointments.' }, { title: 'Send your request', text: 'Leave your name and email. No account is needed.' }, { title: 'Get a confirmation', text: 'We check and confirm by email. Then just come by on time.' }] },
          { type: 'split', heading: 'Care in every appointment', body: 'Say what makes your service special, how long it takes and how to prepare.\n\nThis is sample text.', imageUrl: '/templates/booking-hero.jpg', imageAlt: 'A hairdresser cutting a client’s hair', imageSide: 'left', buttonLabel: 'Book a time', buttonHref: '/book' },
          { type: 'faq', heading: 'Questions', items: [{ question: 'Can I cancel or move my appointment?', answer: 'A sample answer. Explain your cancellation and rescheduling rules.' }, { question: 'Do I pay in advance?', answer: 'A sample answer. Say whether people pay on site or beforehand.' }, { question: 'What if I am late?', answer: 'A sample answer. Say how long you can wait.' }] },
          { type: 'cta', heading: 'Ready to book?', text: 'Choose a time that suits you and send your request.', buttonLabel: 'Book a time', buttonHref: '/book', tone: 'tint' },
        ] },
        { slug: 'book', title: 'Book an appointment', description: 'Sample booking page. Choose an available appointment and send a booking request.', blocks: [
          { type: 'hero', layout: 'centered', heading: 'Book an appointment', text: 'Choose an open time. The business will contact you to confirm your request. This page is a sample.', tone: 'tint' },
          { type: 'record-form', table: 'appointment_bookings', heading: 'Your booking request', intro: 'A full time cannot be chosen.', fields: ['slot', 'name', 'email', 'phone', 'note'], buttonLabel: 'Send booking request', sentMessage: 'Your booking request was sent. We will confirm by email.' },
        ] },
      ],
    }
